/**
 * Composite screenshot smoke test: a real Chromium renders a local page and the
 * service returns one PNG with the pick pins, grown to fit picks spread over a
 * taller section.
 *
 *   node test/composite-smoke.mjs
 *   CHROME_PATH=/path/to/chrome node test/composite-smoke.mjs
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_PATH ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    join(homedir(), ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome")
  ].find((p) => existsSync(p)) ||
  "google-chrome";

// Isolate the launcher's profile, attach file and crop output from the real
// profile: the service resolves them from $HOME at module load.
const HOME = mkdtempSync(join(tmpdir(), "ab-composite-smoke-"));
process.env.HOME = HOME;
mkdirSync(join(HOME, ".dsh/data/dsh-sidepanel-web/shots"), { recursive: true });

const page = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Composite</title>
<style>body{margin:0;font:16px system-ui} .pad{height:900px} button{padding:18px 28px;font:inherit}</style>
</head><body>
<h1 id="title" style="margin:40px">Composite test</h1>
<div class="pad">tall section</div>
<button id="cta">Buy now</button>
</body></html>`);
});
await new Promise((resolve) => page.listen(0, "127.0.0.1", resolve));
const pageUrl = `http://127.0.0.1:${page.address().port}/`;

// A stand-in for DSH's proxy route. It refuses the render unless the
// short-lived cookie is present and redirects once, so the service has to
// follow the redirect (the "internal port" case) before capturing.
let proxyHits = 0;
let proxyAuthMisses = 0;
const proxyFixture = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://x");
  if (!url.pathname.startsWith("/api/sidepanel-web/p/tok/")) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not the proxy");
    return;
  }
  const authed = /(?:^|;\s*)sidepanel_render=test-secret(?:;|$)/.test(req.headers.cookie || "");
  if (!authed) {
    proxyAuthMisses += 1;
    res.writeHead(401, { "content-type": "text/plain" });
    res.end("unauthorized");
    return;
  }
  if (url.pathname === "/api/sidepanel-web/p/tok/") {
    res.writeHead(302, { location: "/api/sidepanel-web/p/tok/app" });
    res.end();
    return;
  }
  if (url.pathname === "/api/sidepanel-web/p/tok/app") {
    proxyHits += 1;
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Proxy render</title>
<style>body{margin:0;font:16px system-ui;padding:40px} button{padding:16px 24px}</style></head>
<body><h1 id="title">Proxy render</h1><button id="cta">Buy now</button></body></html>`);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});
await new Promise((resolve) => proxyFixture.listen(0, "127.0.0.1", resolve));
const proxyBase = `http://127.0.0.1:${proxyFixture.address().port}`;

const denying = http.createServer((req, res) => {
  res.writeHead(401, { "content-type": "text/plain" });
  res.end("unauthorized");
});
await new Promise((resolve) => denying.listen(0, "127.0.0.1", resolve));
const denyingBase = `http://127.0.0.1:${denying.address().port}`;

const { AnnotateBrowserService } = await import("../lib/service.js");
const svc = new AnnotateBrowserService({
  getConfig: () => ({
    chromePath: CHROME,
    headless: true,
    profileDir: join(HOME, "profile"),
    homeUrl: pageUrl
  })
});

try {
  const status = await svc.status();
  assert.ok(status.ok, `browser did not start: ${status.lastError || JSON.stringify(status)}`);

  const out = await svc.compositeShot({
    url: pageUrl,
    marks: [
      { selector: "#title", n: 1 },
      { selector: "#cta", n: 2 }
    ]
  });

  assert.equal(out.ok, true, "compositeShot did not report ok");
  assert.ok(out.file && existsSync(out.file), "composite PNG was not written");
  const buf = Buffer.from(out.data, "base64");
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "composite is not a PNG");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.ok(width > 0 && height > 0, "composite PNG has no dimensions");
  assert.equal(out.size.w, width, "reported width differs from the PNG");
  assert.equal(out.size.h, height, "reported height differs from the PNG");
  // The two picks are ~980px apart; the capture must have grown past the
  // default 800px viewport to fit them on the same surface.
  assert.ok(height > 900, `composite viewport did not grow for both picks (${height})`);
  assert.ok(height <= 1200, `composite viewport exceeded the growth cap (${height})`);

  // Capture through the proxy: the service must present the render cookie,
  // follow the proxy's 302 and draw the pin on the proxied document.
  const through = await svc.compositeShot({
    proxyPath: "/api/sidepanel-web/p/tok/",
    proxyBase,
    renderCookie: { name: "sidepanel_render", value: "test-secret" },
    marks: [{ selector: "#cta", n: 1 }]
  });
  assert.equal(through.ok, true, "proxy compositeShot did not report ok");
  assert.ok(through.size.w > 0 && through.size.h > 0, "proxy composite has no dimensions");
  assert.ok(proxyHits > 0, "the composite never loaded the proxied page");
  assert.equal(proxyAuthMisses, 0, "the render cookie was not sent to the proxy");

  // The proxy refusing the render must fall back to the direct URL, not fail
  // the whole Insert: the annotation text still goes out.
  const fallback = await svc.compositeShot({
    url: pageUrl,
    proxyPath: "/api/sidepanel-web/p/denied/",
    proxyBase: denyingBase,
    renderCookie: { name: "sidepanel_render", value: "test-secret" },
    marks: [{ selector: "#title", n: 1 }]
  });
  assert.equal(fallback.ok, true, "the direct render fallback failed");
  assert.ok(fallback.size.w > 0, "the fallback composite has no dimensions");

  console.log(JSON.stringify({
    ok: true,
    bytes: buf.length,
    width,
    height,
    proxyWidth: through.size.w,
    proxyHeight: through.size.h,
    file: out.file,
    browser: status.wsUrl || status.info?.wsUrl || "launched"
  }, null, 1));
  if (process.env.KEEP === "1") {
    try {
      mkdirSync(join(process.cwd(), ".cache"), { recursive: true });
      writeFileSync(join(process.cwd(), ".cache/composite.png"), buf);
      console.error("kept:", join(process.cwd(), ".cache/composite.png"));
    } catch {}
  }
} finally {
  try { svc.close(); } catch {}
  // Chromium may keep a keep-alive socket to these fixtures; close it or the
  // test hangs even though every assertion passed.
  for (const server of [page, proxyFixture, denying]) {
    try { server.closeAllConnections(); } catch {}
  }
  await new Promise((resolve) => page.close(resolve));
  await new Promise((resolve) => proxyFixture.close(resolve));
  await new Promise((resolve) => denying.close(resolve));
  if (process.env.KEEP !== "1") { try { rmSync(HOME, { recursive: true, force: true }); } catch {} }
}
