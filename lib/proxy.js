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
 * sites are refused; they belong to the live iframe or the system browser.
 */
import http from "node:http";
import https from "node:https";

export const PROXY_PREFIX = "/api/sidepanel-web/p";
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_CSS_BYTES = 4 * 1024 * 1024;

/** Cookies learned from target responses, per target origin. */
const cookieJar = new Map();

/** Base64url without Node's Buffer padding surprises. */
export function encodeOrigin(origin) {
  return Buffer.from(origin, "utf8").toString("base64url");
}

export function decodeOrigin(token) {
  try {
    return Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return "";
  }
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
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
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

function rememberCookies(origin, setCookie) {
  if (!setCookie) return;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  const jar = jarFor(origin);
  for (const raw of list) {
    const pair = String(raw).split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(origin) {
  const jar = jarFor(origin);
  if (jar.size === 0) return "";
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Fetch one target URL, following redirects and ignoring self-signed certs.
 * @param {string} targetUrl
 * @param {{ method?: string, headers?: Record<string, string>, body?: import("node:stream").Readable }} options
 * @returns {Promise<{ status: number, headers: Record<string, string|string[]|undefined>, stream: import("node:stream").Readable }>}
 */
export async function fetchTarget(targetUrl, options = {}) {
  let current = targetUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const u = new URL(current);
    const origin = u.origin;
    const method = options.method || "GET";
    const headers = { ...(options.headers || {}) };
    for (const key of ["host", "connection", "accept-encoding", "content-length", "origin", "referer"]) delete headers[key];
    headers.host = u.host;
    headers.origin = origin;
    headers.referer = current;
    headers["accept-encoding"] = "identity";
    const cookie = cookieHeader(origin);
    if (cookie) headers.cookie = cookie;

    const result = await new Promise((resolve, reject) => {
      const lib = u.protocol === "https:" ? https : http;
      const request = lib.request(current, {
        method,
        headers,
        rejectUnauthorized: false,
      }, (response) => {
        rememberCookies(origin, response.headers["set-cookie"]);
        const status = response.statusCode || 502;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ redirect: new URL(response.headers.location, current).href });
          return;
        }
        resolve({ status, headers: response.headers, stream: response });
      });
      request.on("error", reject);
      if (options.body && method !== "GET" && method !== "HEAD") options.body.pipe(request);
      else request.end();
    });

    if (result.redirect) {
      current = result.redirect;
      options = { ...options, method: "GET", body: undefined };
      continue;
    }
    return { ...result, finalUrl: current };
  }
  throw new Error("Too many redirects");
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
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
  });
}

function shimScript(targetOrigin, token) {
  return `<script>(function(){
var TARGET=${JSON.stringify(targetOrigin)},PREFIX=${JSON.stringify(`${PROXY_PREFIX}/${token}`)};
function proxify(u){
  try{
    var abs=new URL(u,location.href);
    if(abs.pathname.indexOf(PREFIX)===0)return u;
    if(abs.origin!==TARGET)return u;
    return PREFIX+abs.pathname+abs.search+abs.hash;
  }catch(e){return u}
}
var of=window.fetch;
if(of)window.fetch=function(input,init){
  try{
    if(typeof input==="string")input=proxify(input);
    else if(input&&input.url){var u=proxify(input.url);if(u!==input.url)input=new Request(u,input)}
  }catch(e){}
  return of.call(this,input,init);
};
var xo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url){try{arguments[1]=proxify(url)}catch(e){}return xo.apply(this,arguments)};
var ps=history.pushState,rs=history.replaceState;
history.pushState=function(s,t,u){try{if(u)u=proxify(u)}catch(e){}return ps.call(this,s,t,u)};
history.replaceState=function(s,t,u){try{if(u)u=proxify(u)}catch(e){}return rs.call(this,s,t,u)};
window.__AB_TARGET__=TARGET;window.__AB_PREFIX__=PREFIX;
})();</script>`;
}

/**
 * Rewrite an HTML document so every same-site URL and API call goes through
 * the proxy. `overlay` is the annotation script from page.js.
 */
export function rewriteHtml(html, finalUrl, token, overlay) {
  const targetOrigin = new URL(finalUrl).origin;
  let out = String(html);
  // Drop base tags: relative URLs now resolve against the proxy path, which
  // maps back to the same target path.
  out = out.replace(/<base\b[^>]*>/gi, "");
  out = out.replace(/\b(href|src|action|poster|data-src)=("|')([^"']*)\2/gi,
    (match, name, quote, value) => {
      const next = rewriteUrlValue(value, finalUrl, targetOrigin, token);
      return next === value ? match : `${name}=${quote}${escapeAttr(next)}${quote}`;
    });
  out = out.replace(/\bsrcset=("|')([^"']*)\1/gi, (match, quote, value) => {
    const next = rewriteSrcset(value, finalUrl, targetOrigin, token);
    return next === value ? match : `srcset=${quote}${escapeAttr(next)}${quote}`;
  });
  out = out.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (match, quote, value) => {
    const next = rewriteUrlValue(value, finalUrl, targetOrigin, token);
    return next === value ? match : `url(${quote}${next}${quote})`;
  });
  // Next.js flight data and inline chunks still carry root-relative paths.
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) =>
    block.replace(/(["'])\/(_next\/[^"']*)\1/g, (_m, quote, path) =>
      `${quote}${PROXY_PREFIX}/${token}/${path}${quote}`));
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
    if (!isPrivateHost(target.hostname)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Only local/dev hosts are proxied");
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
    });
  } catch (error) {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Proxy error: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const type = contentType(upstream.headers).toLowerCase();
  const headers = { ...upstream.headers };
  for (const key of ["content-length", "content-encoding", "transfer-encoding", "connection", "set-cookie", "content-security-policy", "x-frame-options", "strict-transport-security"]) {
    delete headers[key];
  }
  if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.location) {
    const location = new URL(upstream.headers.location, upstream.finalUrl).href;
    res.writeHead(upstream.status, { location: proxyUrlFor(location, token) });
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
    const body = Buffer.from(rewriteHtml(html, upstream.finalUrl, token, overlay), "utf8");
    res.writeHead(upstream.status, { ...headers, "content-type": "text/html; charset=utf-8", "content-length": String(body.length), "cache-control": "no-store" });
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
    const body = Buffer.from(rewriteCss(css, upstream.finalUrl, new URL(upstream.finalUrl).origin, token), "utf8");
    res.writeHead(upstream.status, { ...headers, "content-type": "text/css; charset=utf-8", "content-length": String(body.length), "cache-control": "no-store" });
    res.end(body);
    return;
  }

  res.writeHead(upstream.status, headers);
  upstream.stream.pipe(res);
}
