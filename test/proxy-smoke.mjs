/**
 * Proxy rewrite rules — the three bugs that made real apps fail in the native
 * carrier, pinned as assertions:
 *   1. <script type="importmap"> URLs must go through the proxy (ES modules);
 *   2. `data-action` is an action name, never a URL (Stimulus-style registries);
 *   3. real `action=` on forms still is a URL.
 *
 *   node test/proxy-smoke.mjs
 */
import assert from "node:assert/strict";
import http from "node:http";
import { rewriteHtml, encodeOrigin, decodeOrigin, isForcedToken, isPrivateHost, isProxyTargetAllowed, handleProxy, PROXY_PREFIX } from "../lib/proxy.js";
import { targetUrlFrom } from "../lib/page.js";

const origin = "https://app.local";
const token = encodeOrigin(origin);
const prefix = `${PROXY_PREFIX}/${token}`;
const html = `<!doctype html><html><head>
<link rel="stylesheet" href="/static/app.css">
<script type="importmap">{"imports":{"rc-ui":"/static/js/rc-ui.js?v=1"},"scopes":{"/pages/":{"ui":"/static/ui.js"}}}</script>
</head><body>
<img src="/media/a.png" data-src="/media/b.png">
<button type="button" data-action="family" data-family="ARC">ARC</button>
<form method="post" action="/submit"><button>ok</button></form>
<a href="/catalog?x=1">cat</a>
<style>.hero{background:url(/media/bg.png)}</style>
<div style="background-image:url('/media/bg2.png')"></div>
<meta name="rc-icon-sprite" content="/static/icons/sprite.svg?v=9">
<meta name="description" content="Un catàleg que no comença amb barra">
<script type="module" src="/static/js/app.js?v=1"></script>
<script>const u = URL.createObjectURL(blob); const s = 'src="/not-a-url.png"';</script>
</body></html>`;

const out = rewriteHtml(html, origin + "/", token, "");

assert.ok(out.includes(`href="${prefix}/static/app.css"`), "stylesheet href rewritten");
assert.ok(out.includes(`src="${prefix}/media/a.png"`), "img src rewritten");
assert.ok(out.includes(`data-src="${prefix}/media/b.png"`), "data-src rewritten");
assert.ok(out.includes(`action="${prefix}/submit"`), "form action rewritten");
assert.ok(out.includes(`href="${prefix}/catalog?x=1"`), "link href rewritten");
assert.ok(out.includes('data-action="family"'), "data-action must stay an action name");
assert.ok(out.includes(`url(${prefix}/media/bg.png)`), "<style> url() rewritten");
assert.ok(out.includes(`${prefix}/media/bg2.png`), "style attribute url() rewritten");
assert.ok(out.includes(`<script type="module" src="${prefix}/static/js/app.js?v=1">`), "module script src rewritten");
assert.ok(out.includes(`content="${prefix}/static/icons/sprite.svg?v=9"`), "meta URL content rewritten");
assert.ok(out.includes('content="Un catàleg que no comença amb barra"'), "plain meta content untouched");
assert.ok(out.includes("URL.createObjectURL(blob)"), "inline JS must not be treated as markup");
assert.ok(out.includes('src="/not-a-url.png"'), "URL-looking strings inside <script> stay untouched");
assert.ok(!out.includes('data-action="' + prefix), "data-action must not be proxied");

const importmap = JSON.parse(out.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
assert.equal(importmap.imports["rc-ui"], `${prefix}/static/js/rc-ui.js?v=1`);
// The scope key is a URL prefix too: modules now load from the proxy path, so
// the scope has to be rewritten with them or it never matches.
assert.equal(importmap.scopes[`${prefix}/pages/`]["ui"], `${prefix}/static/ui.js`);
assert.equal(importmap.scopes["/pages/"], undefined);

// Link interception: a proxied href must map back to the full target path.
const P = `${prefix}`;
assert.equal(
  targetUrlFrom(`${P}/producte/A2082`, "", "", P, "https://app.local"),
  "https://app.local/producte/A2082"
);
assert.equal(targetUrlFrom(`${P}/`, "?x=1", "#h", P, "https://app.local"), "https://app.local/?x=1#h");
assert.equal(targetUrlFrom(P, "", "", P, "https://app.local"), "https://app.local/");
assert.equal(targetUrlFrom("/producte/A2082", "", "", P, "https://app.local"), "");

// Forced native view: the `f.` prefix marks a public origin the user chose to
// proxy. It must survive decode and unlock the target fence, while a normal
// token stays unforced and public hosts stay refused.
const publicOrigin = "https://shop.example.com";
const forcedToken = encodeOrigin(publicOrigin, true);
assert.equal(decodeOrigin(forcedToken), publicOrigin, "forced token must decode to the origin");
assert.ok(isForcedToken(forcedToken), "forced token must be recognised");
assert.ok(!isForcedToken(encodeOrigin(publicOrigin)), "a normal token must not be forced");
assert.equal(decodeOrigin(encodeOrigin("https://app.local")), "https://app.local", "normal token must still decode");
assert.equal(isProxyTargetAllowed("shop.example.com", false), false, "public hosts stay refused by default");
assert.equal(isProxyTargetAllowed("shop.example.com", true), true, "forced public hosts are allowed");
assert.equal(isProxyTargetAllowed("app.local", false), true, "local hosts need no override");
const forcedHtml = rewriteHtml('<a href="/checkout">x</a>', "https://shop.example.com/", forcedToken, "");
assert.ok(
  forcedHtml.includes(`href="${PROXY_PREFIX}/${forcedToken}/checkout"`),
  "rewritten links must keep the forced token"
);

// End-to-end guard: a target that looks public to isPrivateHost but resolves to
// the loopback ("localhost." with the DNS root dot) must be refused without the
// forced token and served with it. The servers bind the dual stack, so the test
// is independent of whether localhost. resolves to ::1 or 127.0.0.1.
const target = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<html><body>forced target</body></html>");
});
await new Promise((resolve) => target.listen(0, resolve));
const targetPort = target.address().port;
const proxy = http.createServer((req, res) => {
  handleProxy(req, res, "").catch(() => { try { res.destroy(); } catch {} });
});
await new Promise((resolve) => proxy.listen(0, resolve));
const proxyPort = proxy.address().port;
const nearLocalOrigin = `http://localhost.:${targetPort}`;
assert.equal(isPrivateHost(new URL(nearLocalOrigin).hostname), false, "the fixture host must look public to the fence");
const fetchProxy = async (token) => {
  const res = await fetch(`http://127.0.0.1:${proxyPort}${PROXY_PREFIX}/${token}/`);
  return { status: res.status, body: await res.text() };
};
const refused = await fetchProxy(encodeOrigin(nearLocalOrigin));
assert.equal(refused.status, 403, "a public-looking host must be refused without the forced token");
const served = await fetchProxy(encodeOrigin(nearLocalOrigin, true));
assert.equal(served.status, 200, "the forced token must unlock the same host");
assert.match(served.body, /forced target/, "the forced token must stream the target body");
await new Promise((resolve) => proxy.close(resolve));
await new Promise((resolve) => target.close(resolve));

console.log("proxy-smoke: ok");
console.log("  importmap:", importmap.imports["rc-ui"]);
console.log("  data-action kept, form action proxied");
console.log("  proxy link → target path keeps every segment");
console.log("  inline JS untouched (URL.createObjectURL survives)");
console.log("  forced token:", forcedToken.slice(0, 12) + "… unlocks a public host");
