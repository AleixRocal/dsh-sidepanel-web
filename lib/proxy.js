/**
 * Rewriting reverse proxy for local/dev pages.
 *
 * The panel's iframe loads `/api/sidepanel-web/p/<originB64>/<path>`; this
 * module fetches the same path from the target, rewrites HTML/CSS URLs back
 * through the proxy, and injects a small shim so the app's fetch/XHR and
 * history calls also stay on the proxy. That makes the page same-origin with
 * DSH, so it renders natively, stays interactive, and the annotation overlay
 * can read its DOM.
 *
 * Scope is deliberately local/dev: localhost, *.local and private IPs. Public
 * sites are refused unless the user explicitly forced the native carrier for
 * one of them; that override travels as the `f.` prefix on the proxy token.
 */
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

export const PROXY_PREFIX = "/api/sidepanel-web/p";
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_CSS_BYTES = 4 * 1024 * 1024;
const MAX_JS_BYTES = 8 * 1024 * 1024;

/** Cookies learned from target responses, per target origin. */
const cookieJar = new Map();

/**
 * Forced-origin marker. Base64url never contains a dot, so a leading `f.` is
 * unambiguous: the user explicitly chose the native carrier for a non-local
 * page. The bit is client-controlled and therefore a UX override, not a
 * security boundary; the DSH Host/Origin fence still decides who reaches us.
 */
const FORCE_PREFIX = "f.";

/** Base64url without Node's Buffer padding surprises. */
export function encodeOrigin(origin, forced = false) {
  const token = Buffer.from(origin, "utf8").toString("base64url");
  return forced ? FORCE_PREFIX + token : token;
}

/** Whether a proxy token carries the explicit native-view override. */
export function isForcedToken(token) {
  return String(token || "").startsWith(FORCE_PREFIX);
}

export function decodeOrigin(token) {
  try {
    const raw = String(token || "");
    return Buffer.from(isForcedToken(raw) ? raw.slice(FORCE_PREFIX.length) : raw, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

/**
 * The proxy's target fence: local/dev hosts always, public hosts only when the
 * user forced the native carrier for the page. `handleProxy` is the only caller.
 */
export function isProxyTargetAllowed(hostname, forced = false) {
  return forced === true || isPrivateHost(hostname);
}

/** Same site for the forced override: host equal or differing only by a leading "www.", any scheme/port. */
function sameForcedHost(a, b) {
  const bare = (h) => String(h).toLowerCase().replace(/^www\./, "");
  return bare(a) === bare(b);
}

/** Proxy URL for one absolute target URL. */
export function proxyUrlFor(targetUrl, originToken) {
  const u = new URL(targetUrl);
  const path = u.pathname.replace(/^\//, "");
  return `${PROXY_PREFIX}/${originToken}/${path}${u.search}${u.hash}`;
}

/** True for loopback, *.local and RFC1918/link-local hosts. */
export function isPrivateHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || /^(fe80|f[cd][0-9a-f]{2}):/.test(host)) return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function jarFor(origin) {
  if (!cookieJar.has(origin)) cookieJar.set(origin, new Map());
  return cookieJar.get(origin);
}

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const BRIDGE_PREFIX = "__spw_";

/** Parse one Set-Cookie line: name, value, lowercase attributes. */
function parseSetCookie(raw) {
  const [pair, ...parts] = String(raw).split(";");
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const attrs = {};
  for (const part of parts) {
    const i = part.indexOf("=");
    attrs[(i === -1 ? part : part.slice(0, i)).trim().toLowerCase()] = i === -1 ? "" : part.slice(i + 1).trim();
  }
  const maxAge = attrs["max-age"] !== undefined ? Number(attrs["max-age"]) : NaN;
  const expires = attrs.expires ? Date.parse(attrs.expires) : NaN;
  const expired = maxAge <= 0 || (Number.isNaN(maxAge) && expires < Date.now());
  return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), attrs, expired };
}

// shortcut: the jar is keyed per target origin globally (not per DSH session or cookie path/domain); upgrade if multi-user.
function rememberCookies(origin, setCookie) {
  if (!setCookie) return;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  const jar = jarFor(origin);
  for (const raw of list) {
    const c = parseSetCookie(raw);
    if (!c) continue;
    if (c.expired) jar.delete(c.name);
    else jar.set(c.name, c.value);
  }
}

/** Only `__spw_*` browser cookies cross to the target (document.cookie bridge); DSH's own cookies never do. */
function bridgeCookies(header) {
  const out = new Map();
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    const name = part.slice(0, i).trim();
    if (i > 0 && name.startsWith(BRIDGE_PREFIX) && name.length > BRIDGE_PREFIX.length) out.set(name.slice(BRIDGE_PREFIX.length), part.slice(i + 1).trim());
  }
  return out;
}

/** Browser-side Set-Cookie for a non-HttpOnly upstream cookie, namespaced and scoped to the proxy token path. */
function bridgeSetCookie(raw, token) {
  const c = parseSetCookie(raw);
  if (!c || "httponly" in c.attrs) return null;
  let out = `${BRIDGE_PREFIX}${c.name}=${c.value}; Path=${PROXY_PREFIX}/${token}/`;
  if (c.attrs["max-age"] !== undefined) out += `; Max-Age=${c.attrs["max-age"]}`;
  if (c.attrs.expires) out += `; Expires=${c.attrs.expires}`;
  return out;
}

function cookieHeader(origin, extra) {
  const merged = new Map([...jarFor(origin), ...(extra || [])]);
  if (merged.size === 0) return "";
  return [...merged.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Fetch one target URL, following redirects and ignoring self-signed certs.
 * @param {string} targetUrl
 * @param {{ method?: string, headers?: Record<string, string>, cookie?: string, body?: import("node:stream").Readable, isAllowed?: (url: URL) => boolean }} options
 * @returns {Promise<{ status: number, headers: Record<string, string|string[]|undefined>, stream: import("node:stream").Readable, finalUrl: string }>}
 */
export async function fetchTarget(targetUrl, options = {}) {
  let current = targetUrl;
  const firstOrigin = new URL(targetUrl).origin;
  const bridge = bridgeCookies(options.headers?.cookie);
  const setCookies = [];
  // A 307/308 must replay the body, and the request stream cannot be re-read.
  if (options.body && options.method && options.method !== "GET" && options.method !== "HEAD") {
    const parts = [];
    let size = 0;
    for await (const chunk of options.body) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body too large"), { status: 413 });
      parts.push(chunk);
    }
    options = { ...options, body: Buffer.concat(parts) };
  }
  const allow = typeof options.isAllowed === "function" ? options.isAllowed : null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const u = new URL(current);
    // A redirect can point anywhere, including a public host or a port the user
    // never chose. Re-check the fence on every hop, not only on the first URL
    // the panel built.
    if (allow && !allow(u)) throw new Error(`Redirect target is not allowed: ${u.origin}`);
    const origin = u.origin;
    const method = options.method || "GET";
    const headers = { ...(options.headers || {}) };
    // `cookie` is dropped on purpose: the browser asks DSH, so the request
    // carries DSH's own session cookie. Forwarding it would leak it to the
    // target and confuse the target's own session; the jar below is the only
    // cookie source, plus the `__spw_` bridge cookies (document.cookie), which belong to the target.
    for (const key of ["host", "connection", "accept-encoding", "content-length", "origin", "referer", "cookie", "authorization", "proxy-authorization"]) delete headers[key];
    headers.host = u.host;
    headers.origin = origin;
    headers.referer = current;
    headers["accept-encoding"] = "identity";
    // `options.cookie` is the renderer's explicit credential (it targets DSH,
    // not the proxied site); everything else comes from the per-origin jar.
    const cookie = options.cookie || cookieHeader(origin, origin === firstOrigin ? bridge : null);
    if (cookie) headers.cookie = cookie;

    const result = await new Promise((resolve, reject) => {
      const lib = u.protocol === "https:" ? https : http;
      const request = lib.request(current, {
        method,
        headers,
        rejectUnauthorized: false,
      }, (response) => {
        rememberCookies(origin, response.headers["set-cookie"]);
        setCookies.push(...[].concat(response.headers["set-cookie"] || []));
        const status = response.statusCode || 502;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ redirect: new URL(response.headers.location, current).href, status });
          return;
        }
        request.setTimeout(0);
        const enc = String(response.headers["content-encoding"] || "").toLowerCase().trim();
        const inflate = { gzip: zlib.createGunzip, "x-gzip": zlib.createGunzip, deflate: zlib.createInflate, br: zlib.createBrotliDecompress }[enc];
        if (!inflate) return resolve({ status, headers: response.headers, stream: response });
        const stream = inflate();
        stream.on("error", () => stream.destroy()); // a corrupt body must not crash the process
        response.on("error", () => stream.destroy());
        response.pipe(stream);
        const headers = { ...response.headers };
        delete headers["content-encoding"];
        delete headers["content-length"];
        resolve({ status, headers, stream });
      });
      request.on("error", reject);
      // Header-wait only: cleared once headers arrive so streams stay open.
      request.setTimeout(30000, () => request.destroy(new Error("Upstream timed out waiting for response headers.")));
      if (options.body && method !== "GET" && method !== "HEAD") request.end(options.body);
      else request.end();
    });

    if (result.redirect) {
      current = result.redirect;
      // Fetch spec: 303 -> GET; 301/302 only downgrade POST; 307/308 keep method and body.
      const st = result.status;
      if (st === 303 || ((st === 301 || st === 302) && method === "POST")) options = { ...options, method: method === "HEAD" ? "HEAD" : "GET", body: undefined };
      continue;
    }
    return { ...result, finalUrl: current, setCookies };
  }
  throw new Error("Too many redirects");
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * True when an upstream HTML response is a bot-challenge interstitial (AWS WAF,
 * Cloudflare, DataDome, PerimeterX) that cannot run through the proxy. Detection
 * only: needs a challenge header or a marker in a short document, so a normal
 * page that merely loads a CDN script never matches.
 */
export function isBotChallenge(status, headers = {}, bodySnippet = "") {
  if (headers["x-amzn-waf-action"] || headers["x-datadome"]) return true;
  if (/challenge/i.test(String(headers["cf-mitigated"] || ""))) return true;
  const body = String(bodySnippet);
  if (body.length > 30000) return false; // challenge pages are tiny; real pages are not
  if (/^cloudflare/i.test(String(headers.server || "")) && (status === 403 || status === 503)) {
    return /challenge-platform|cf-chl|Just a moment\.\.\./i.test(body);
  }
  return /awswaf\.com[\s\S]*challenge\.js|AwsWafIntegration|captcha-delivery\.com|_pxCaptcha|px-captcha/i.test(body);
}

function challengeNoticePage(url, nonce) {
  const safe = String(url).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // JSON in a script block: escape "<" so a value can't close the tag.
  const js = (v) => JSON.stringify(String(v ?? "")).replace(/</g, "\\u003c");
  const css = ":root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fff;--btn:#1a56db;--btnfg:#fff}@media(prefers-color-scheme:dark){:root{--fg:#f2f2f2;--bg:#161616;--btn:#6ea0ff;--btnfg:#0b1220}}body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;min-height:100vh;box-sizing:border-box;text-align:center;color:var(--fg);background:var(--bg)}h1{font-size:1.4em;margin:0}button{font:600 18px/1.2 system-ui,sans-serif;min-height:48px;padding:14px 32px;border:0;border-radius:10px;background:var(--btn);color:var(--btnfg);cursor:pointer}button:focus-visible{outline:3px solid var(--fg);outline-offset:3px}p{margin:0;max-width:36em;opacity:.75}code{font-size:12px;word-break:break-all;opacity:.7}";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anti-bot check</title><style>${css}</style></head><body><h1>This site blocks the native view</h1><button id="remote" type="button" autofocus>Open in Remote view</button><p>It runs an anti-bot check that can't run through the native view; Remote view uses the real browser.</p><p><code>${safe}</code></p><script>document.getElementById("remote").onclick=function(){if(parent!==window)parent.postMessage({source:"sidepanel-web",nonce:${js(nonce)},kind:"remote",url:${js(url)}},location.origin)}</script></body></html>`;
}

/** Resolve a possibly relative URL against a base; undefined when invalid. */
function absolute(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return undefined;
  }
}

/** Rewrite one URL attribute through the proxy when it targets the same site. */
function rewriteUrlValue(value, baseUrl, targetOrigin, token) {
  if (!value) return value;
  const raw = String(value).trim();
  if (!raw || raw.startsWith("#")) return value;
  if (/^(mailto|tel|javascript|data|blob|about):/i.test(raw)) return value;
  const abs = absolute(raw, baseUrl);
  if (!abs) return value;
  try {
    if (new URL(abs).origin !== targetOrigin) return value;
  } catch {
    return value;
  }
  return proxyUrlFor(abs, token);
}

function rewriteSrcset(value, baseUrl, targetOrigin, token) {
  return String(value).split(",").map((part) => {
    const bits = part.trim().split(/\s+/);
    if (bits[0]) bits[0] = rewriteUrlValue(bits[0], baseUrl, targetOrigin, token);
    return bits.join(" ");
  }).join(", ");
}

function rewriteCss(css, cssUrl, targetOrigin, token) {
  return String(css).replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (match, quote, value) => {
    const next = rewriteUrlValue(value, cssUrl, targetOrigin, token);
    return next === value ? match : `url(${quote}${next}${quote})`;
  // `@import "x.css"` has no url(); it escaped the rule above.
  }).replace(/@import\s+(['"])([^'"]+)\1/gi, (match, quote, value) => {
    const next = rewriteUrlValue(value, cssUrl, targetOrigin, token);
    return next === value ? match : `@import ${quote}${next}${quote}`;
  });
}

/** Root-absolute module specifiers in JS bodies (Vite dev serves `/src/main.tsx`, `/@vite/client`). */
export function rewriteJs(js, token) {
  const to = (path) => (`/${path}`.startsWith(`${PROXY_PREFIX}/`) ? `/${path}` : `${PROXY_PREFIX}/${token}/${path}`);
  return String(js)
    .replace(/((?<![.\w$])from\s*|\bimport\s*\(?\s*)(["'])\/(?!\/)([^"'\n]*)\2/g,
      (_m, pre, quote, path) => `${pre}${quote}${to(path)}${quote}`)
    // new URL("/x", import.meta.url) resolves against the proxied module, so it escapes too.
    .replace(/(new\s+URL\(\s*)(["'])\/(?!\/)([^"'\n]*)\2(\s*,\s*import\.meta\.url)/g,
      (_m, pre, quote, path, post) => `${pre}${quote}${to(path)}${quote}${post}`);
}

/**
 * Map one URL onto the proxy. Exported (and injected into the page shim) so the
 * browser-side rule and the tests are the same code.
 *
 * Three shapes are handled:
 *  - already proxied (`/api/sidepanel-web/p/<token>/…`) → untouched;
 *  - absolute URL of the target site → prefixed;
 *  - root-relative path (`/producte/…`), which the browser resolves against the
 *    DSH origin but the page means as a target path → prefixed. Missing this
 *    case sent the compare fragment fetch to DSH and broke the page.
 */
export function proxifyUrl(value, target, prefix, base) {
  try {
    const raw = String(value);
    const abs = new URL(raw, base || undefined);
    if (prefix && abs.pathname.indexOf(prefix) === 0) return raw;
    if (target && abs.origin === target) return prefix + abs.pathname + abs.search + abs.hash;
    // Host-origin URLs (location.origin + "/x", new URL("/x", location.href)) mean target paths too.
    if (prefix && base && abs.origin === new URL(base).origin && raw.slice(0, 2) !== "//") {
      return prefix + abs.pathname + abs.search + abs.hash;
    }
    return raw;
  } catch {
    return value;
  }
}

function shimScript(targetOrigin, token) {
  return `<script>(function(){
var TARGET=${JSON.stringify(targetOrigin)},PREFIX=${JSON.stringify(`${PROXY_PREFIX}/${token}`)};
var proxifyUrl=__PROXIFY__;
function proxify(u){return proxifyUrl(u,TARGET,PREFIX,location.href)}
var of=window.fetch;
if(of)window.fetch=function(input,init){
  try{
    if(typeof input==="string"||input instanceof URL)input=proxify(input);
    else if(input instanceof Request){var u=proxify(input.url);if(u!==input.url)input=new Request(u,input)}
  }catch(e){}
  return of.call(this,input,init);
};
var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url){try{arguments[1]=proxify(url)}catch(e){}return xo.apply(this,arguments)};
var ps=history.pushState,rs=history.replaceState;
history.pushState=function(s,t,u){try{if(u)u=proxify(u)}catch(e){}return ps.call(this,s,t,u)};
history.replaceState=function(s,t,u){try{if(u)u=proxify(u)}catch(e){}return rs.call(this,s,t,u)};
function srcset(v){return v.split(",").map(function(p){var b=p.trim().split(" ");b[0]=proxify(b[0]);return b.join(" ")}).join(", ")}
// webpack assigns a TrustedScriptURL object (script.src = __webpack_require__.tu(url)); stringify objects so they get rewritten.
function S(v){return v&&typeof v==="object"?String(v):v}
function hook(C,prop,fn){try{var d=Object.getOwnPropertyDescriptor(C.prototype,prop);if(d&&d.set)Object.defineProperty(C.prototype,prop,{get:d.get,enumerable:d.enumerable,configurable:true,set:function(v){v=S(v);d.set.call(this,typeof v==="string"?(fn||proxify)(v):v)}})}catch(e){}}
hook(HTMLScriptElement,"src");hook(HTMLImageElement,"src");hook(HTMLImageElement,"srcset",srcset);
hook(HTMLLinkElement,"href");hook(HTMLIFrameElement,"src");hook(HTMLSourceElement,"src");hook(HTMLSourceElement,"srcset",srcset);
hook(HTMLFormElement,"action");
try{var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){
  try{var k=String(n).toLowerCase();v=S(v);if(typeof v==="string"){if(k==="srcset")v=srcset(v);else if(/^(src|href|action|poster|data)$/.test(k))v=proxify(v)}}catch(e){}
  return sa.call(this,n,v)}}catch(e){}
["Worker","SharedWorker","EventSource"].forEach(function(n){try{if(window[n])window[n]=new Proxy(window[n],{construct:function(t,a){a[0]=proxify(a[0]);return Reflect.construct(t,a)}})}catch(e){}});
try{var sb=navigator.sendBeacon;if(sb)navigator.sendBeacon=function(u,d){try{u=proxify(u)}catch(e){}return sb.call(this,u,d)}}catch(e){}
try{var sw=navigator.serviceWorker,rg=sw&&sw.register;if(rg)sw.register=function(u,o){
  try{u=proxify(u);if(o&&o.scope)o=Object.assign({},o,{scope:proxify(o.scope)})}catch(e){}
  return rg.call(this,u,o)}}catch(e){}
// Cookies live on the proxy path as __spw_<name>; the page sees plain names.
try{var cd=Object.getOwnPropertyDescriptor(Document.prototype,"cookie"),CP="__spw_";if(cd)Object.defineProperty(Document.prototype,"cookie",{configurable:true,enumerable:cd.enumerable,
  get:function(){return cd.get.call(this).split(";").map(function(c){return c.trim()}).filter(function(c){return c.indexOf(CP)===0}).map(function(c){return c.slice(CP.length)}).join("; ")},
  set:function(v){var p=String(v).split(";"),out=[CP+p[0].trim()];
    for(var i=1;i<p.length;i++){var k=p[i].trim().toLowerCase();if(k.indexOf("max-age")===0||k.indexOf("expires")===0)out.push(p[i].trim())}
    out.push("Path="+PREFIX+"/");cd.set.call(this,out.join("; "))}})}catch(e){}
window.__AB_TARGET__=TARGET;window.__AB_PREFIX__=PREFIX;
})();</script>`.replace("__PROXIFY__", () => proxifyUrl.toString());
}

/** Attributes and CSS in markup. Script blocks never pass through here. */
function rewriteMarkup(chunk, finalUrl, targetOrigin, token) {
  let out = chunk;
  // The negative lookbehind is load-bearing: `data-action` is a *name*, not a
  // URL (Stimulus and this catalog's own action registry key on it), so only a
  // real `action=` attribute may be rewritten. `data-src` stays in the list
  // because lazy-image loaders do store URLs there.
  // The unquoted branch ([^"'\s>]+) covers `<script src=/s.js>`.
  out = out.replace(/(?<![\w-])(href|src|action|poster|data-src)=(?:("|')([^"']*)\2|([^"'\s>]+))/gi,
    (match, name, quote, qv, uv) => {
      const value = qv ?? uv;
      const next = rewriteUrlValue(value, finalUrl, targetOrigin, token);
      return next === value ? match : `${name}=${quote || '"'}${escapeAttr(next)}${quote || '"'}`;
    });
  out = out.replace(/(?<![\w-])srcset=(?:("|')([^"']*)\1|([^"'\s>]+))/gi, (match, quote, qv, uv) => {
    const value = qv ?? uv;
    const next = rewriteSrcset(value, finalUrl, targetOrigin, token);
    return next === value ? match : `srcset=${quote || '"'}${escapeAttr(next)}${quote || '"'}`;
  });
  // <meta> URLs are read by JS (an icon sprite path, for example) and then used
  // in dynamically built elements, where no attribute rewrite can reach them.
  // Only root-relative content is touched: descriptions never start with "/".
  out = out.replace(/<meta\b[^>]*>/gi, (tag) =>
    tag.replace(/(?<![\w-])content=(?:("|')([^"']*)\1|([^"'\s>]+))/gi, (match, quote, qv, uv) => {
      const raw = String(qv ?? uv).trim();
      if (!raw.startsWith("/") || raw.startsWith("//")) return match;
      const next = rewriteUrlValue(raw, finalUrl, targetOrigin, token);
      return next === raw ? match : `content=${quote || '"'}${escapeAttr(next)}${quote || '"'}`;
    }));
  // CSS `url()` is only meaningful inside <style> bodies and style attributes.
  // Applying it to the whole document used to rewrite `URL.createObjectURL(blob)`
  // (case-insensitive match) into `createObjecturl(/api/…/blob)`, which the
  // browser then parsed as a regex literal: "Invalid regular expression flags".
  out = out.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_m, attrs, css) => `<style${attrs}>${rewriteCss(css, finalUrl, targetOrigin, token)}</style>`);
  // Double- and single-quoted attributes are handled separately: CSS values
  // routinely contain the *other* quote (url('/x.png')), which a [^"']* body
  // would cut in half.
  out = out.replace(/(\sstyle=)"([^"]*)"/gi,
    (_m, pre, css) => pre + '"' + rewriteCss(css, finalUrl, targetOrigin, token) + '"');
  out = out.replace(/(\sstyle=)'([^']*)'/gi,
    (_m, pre, css) => pre + "'" + rewriteCss(css, finalUrl, targetOrigin, token) + "'");
  return out;
}

/** Inside <script> blocks: the opening tag's src, import maps and Next.js chunks. */
function rewriteScriptBlock(block, finalUrl, targetOrigin, token) {
  let out = block;
  // Scripts bypass the markup pass, so their own `src` must be rewritten here:
  // `<script type="module" src="/static/js/app.js">` is a URL like any other.
  out = out.replace(/^<script\b[^>]*>/i, (openTag) =>
    openTag.replace(/(?<![\w-])(src)=(?:("|')([^"']*)\2|([^"'\s>]+))/gi, (match, name, quote, qv, uv) => {
      const value = qv ?? uv;
      const next = rewriteUrlValue(value, finalUrl, targetOrigin, token);
      return next === value ? match : `${name}=${quote || '"'}${escapeAttr(next)}${quote || '"'}`;
    }));
  // <script type="importmap"> is JSON, not markup: its paths never match the
  // attribute rules. Left alone, `import { x } from "app-ui"` resolves to the
  // DSH origin and 404s, so module entry points silently never run.
  out = out.replace(/<script\b([^>]*\btype\s*=\s*(["'])importmap\2[^>]*)>([\s\S]*?)<\/script>/gi,
    (match, attrs, _quote, json) => {
      try {
        const map = JSON.parse(json);
        const rewriteMap = (entries) => {
          if (!entries || typeof entries !== "object") return entries;
          for (const key of Object.keys(entries)) {
            if (typeof entries[key] === "string") {
              entries[key] = rewriteUrlValue(entries[key], finalUrl, targetOrigin, token);
            }
          }
          return entries;
        };
        rewriteMap(map.imports);
        if (map.scopes && typeof map.scopes === "object") {
          const nextScopes = {};
          for (const scope of Object.keys(map.scopes)) {
            rewriteMap(map.scopes[scope]);
            nextScopes[rewriteUrlValue(scope, finalUrl, targetOrigin, token)] = map.scopes[scope];
          }
          map.scopes = nextScopes;
        }
        return `<script${attrs}>${JSON.stringify(map)}</script>`;
      } catch {
        return match;
      }
    });
  // Next.js flight data and inline chunks still carry root-relative paths.
  out = out.replace(/(["'])\/(_next\/[^"']*)\1/g, (_m, quote, path) =>
    `${quote}${PROXY_PREFIX}/${token}/${path}${quote}`);
  return out;
}

/**
 * Rewrite an HTML document so every same-site URL and API call goes through
 * the proxy. `overlay` is the annotation script from page.js.
 *
 * Markup and script blocks are rewritten separately on purpose: a blanket
 * attribute/CSS pass over inline JavaScript corrupts code that merely looks
 * like markup (see the createObjectURL case above).
 */
export function rewriteHtml(html, finalUrl, token, overlay) {
  const targetOrigin = new URL(finalUrl).origin;
  // <base href> stays: the markup pass below rewrites it like any other href.
  const source = String(html);
  const scriptRe = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
  const parts = [];
  let last = 0;
  let match;
  while ((match = scriptRe.exec(source)) !== null) {
    parts.push(rewriteMarkup(source.slice(last, match.index), finalUrl, targetOrigin, token));
    parts.push(rewriteScriptBlock(match[0], finalUrl, targetOrigin, token));
    last = match.index + match[0].length;
  }
  parts.push(rewriteMarkup(source.slice(last), finalUrl, targetOrigin, token));
  let out = parts.join("");
  const inject = `${shimScript(targetOrigin, token)}${overlay || ""}`;
  out = /<head[^>]*>/i.test(out)
    ? out.replace(/<head[^>]*>/i, (m) => m + inject)
    : inject + out;
  return out;
}

function contentType(headers) {
  const raw = headers["content-type"];
  return Array.isArray(raw) ? raw[0] || "" : raw || "";
}

function typeIncludes(headers, needle) {
  return contentType(headers).toLowerCase().includes(needle);
}

/** True when two URLs address the same document (hash excluded, as HTTP does). */
function sameTarget(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname && x.search === y.search;
  } catch {
    return false;
  }
}

/**
 * Proxy URL for the page a redirect ended at, keeping the per-load nonce that
 * the overlay handshake depends on.
 */
function canonicalProxyLocation(finalUrl, token, requestUrl) {
  const proxied = new URL(proxyUrlFor(finalUrl, token), "http://proxy.local");
  const nonce = requestUrl.searchParams.get("nonce");
  if (nonce) proxied.searchParams.set("nonce", nonce);
  return proxied.pathname + proxied.search;
}

/**
 * Handle one proxied request.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} overlay - annotation script
 */
export async function handleProxy(req, res, overlay) {
  const requestUrl = new URL(req.url || "/", "http://x");
  const rest = requestUrl.pathname.slice(`${PROXY_PREFIX}/`.length);
  const slash = rest.indexOf("/");
  const token = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? "" : rest.slice(slash + 1);
  const forced = isForcedToken(token);
  const origin = decodeOrigin(token);
  if (!origin) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad proxy token");
    return;
  }
  let target;
  try {
    const search = new URLSearchParams(requestUrl.search);
    search.delete("nonce");
    const qs = search.toString();
    target = new URL(origin + "/" + path + (qs ? "?" + qs : ""));
    if (!isProxyTargetAllowed(target.hostname, forced)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Only local/dev hosts are proxied (use Force native view for a public page)");
      return;
    }
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad target URL");
    return;
  }

  let upstream;
  try {
    upstream = await fetchTarget(target.href, {
      method: req.method,
      headers: req.headers,
      body: req,
      // The forced flag unlocks the host the user chose (plus its www./scheme
      // twin). A redirect to a different public host stays refused.
      isAllowed: (url) => isProxyTargetAllowed(url.hostname, forced && sameForcedHost(url.hostname, target.hostname)),
    });
  } catch (error) {
    res.writeHead(error?.status || 502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Proxy error: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  // A dev server often answers / with a redirect to /app/ or to another port
  // (an internal port forward). fetchTarget follows it, but the browser still
  // holds the *original* proxy URL, so every relative asset and every
  // history.pushState would resolve against the wrong path or token. Move the
  // browser to the canonical proxy URL of the final target instead: one
  // redirect, then the document URL, the shim prefix and the overlay origin all
  // agree with the page that actually rendered.
  const finalUrl = upstream.finalUrl || target.href;
  const finalOrigin = new URL(finalUrl).origin;
  const finalForced = forced && sameForcedHost(new URL(finalUrl).hostname, target.hostname);
  const finalToken = encodeOrigin(finalOrigin, finalForced);
  // Non-HttpOnly upstream cookies, mirrored for document.cookie under the page's token path.
  const bridged = (upstream.setCookies || []).map((raw) => bridgeSetCookie(raw, finalToken)).filter(Boolean);
  if (typeIncludes(upstream.headers, "text/html") && !sameTarget(finalUrl, target.href)) {
    upstream.stream.resume();
    res.writeHead(302, {
      ...(bridged.length ? { "set-cookie": bridged } : {}),
      location: canonicalProxyLocation(finalUrl, finalToken, requestUrl),
      "cache-control": "no-store",
    });
    res.end();
    return;
  }

  const type = contentType(upstream.headers).toLowerCase();
  const headers = { ...upstream.headers };
  for (const key of ["content-length", "content-encoding", "transfer-encoding", "connection", "set-cookie", "content-security-policy", "x-frame-options", "strict-transport-security"]) {
    delete headers[key];
  }
  if (bridged.length) headers["set-cookie"] = bridged;
  if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.location) {
    const location = new URL(upstream.headers.location, finalUrl).href;
    res.writeHead(upstream.status, { location: proxyUrlFor(location, finalToken) });
    res.end();
    return;
  }

  if (type.includes("text/html")) {
    const chunks = [];
    let size = 0;
    for await (const chunk of upstream.stream) {
      size += chunk.length;
      if (size > MAX_HTML_BYTES) break;
      chunks.push(chunk);
    }
    const html = Buffer.concat(chunks).toString("utf8");
    const dest = req.headers["sec-fetch-dest"];
    // Only the iframe navigation gets the notice; subresource fetches keep the real response.
    if ((!dest || dest === "iframe" || dest === "document") && isBotChallenge(upstream.status, upstream.headers, html)) {
      const notice = Buffer.from(challengeNoticePage(finalUrl, requestUrl.searchParams.get("nonce")), "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": String(notice.length), "cache-control": "no-store" });
      res.end(notice);
      return;
    }
    const body = Buffer.from(rewriteHtml(html, finalUrl, finalToken, overlay), "utf8");
    res.writeHead(upstream.status, { ...headers, "content-type": "text/html; charset=utf-8", "content-length": String(body.length), "cache-control": "no-store" });
    res.end(body);
    return;
  }

  if (/javascript|ecmascript/.test(type)) {
    const chunks = [];
    let size = 0;
    for await (const chunk of upstream.stream) {
      size += chunk.length;
      if (size > MAX_JS_BYTES) break;
      chunks.push(chunk);
    }
    const body = Buffer.from(rewriteJs(Buffer.concat(chunks).toString("utf8"), finalToken), "utf8");
    res.writeHead(upstream.status, { ...headers, "content-length": String(body.length) });
    res.end(body);
    return;
  }

  if (type.includes("text/css")) {
    const chunks = [];
    let size = 0;
    for await (const chunk of upstream.stream) {
      size += chunk.length;
      if (size > MAX_CSS_BYTES) break;
      chunks.push(chunk);
    }
    const css = Buffer.concat(chunks).toString("utf8");
    const body = Buffer.from(rewriteCss(css, finalUrl, finalOrigin, finalToken), "utf8");
    res.writeHead(upstream.status, { ...headers, "content-type": "text/css; charset=utf-8", "content-length": String(body.length), "cache-control": "no-store" });
    res.end(body);
    return;
  }

  res.writeHead(upstream.status, headers);
  res.on("close", () => upstream.stream.destroy());
  upstream.stream.pipe(res);
}
