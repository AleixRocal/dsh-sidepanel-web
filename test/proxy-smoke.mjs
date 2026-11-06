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
import { rewriteHtml, encodeOrigin, PROXY_PREFIX } from "../lib/proxy.js";
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

console.log("proxy-smoke: ok");
console.log("  importmap:", importmap.imports["rc-ui"]);
console.log("  data-action kept, form action proxied");
console.log("  proxy link → target path keeps every segment");
console.log("  inline JS untouched (URL.createObjectURL survives)");
