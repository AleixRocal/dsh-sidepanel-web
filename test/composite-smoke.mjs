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
  console.log(JSON.stringify({
    ok: true,
    bytes: buf.length,
    width,
    height,
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
  await new Promise((resolve) => page.close(resolve));
  if (process.env.KEEP !== "1") { try { rmSync(HOME, { recursive: true, force: true }); } catch {} }
}
