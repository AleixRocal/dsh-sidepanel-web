/**
 * UI behaviour smoke test for the two regressions that are easy to reintroduce:
 *   1. Esc must leave annotate mode (focus is not on the panel root).
 *   2. An inserted annotation must attach its crop as an image preview, not
 *      only a path in the text.
 *
 * Runs the real lib/client.js against the preview mock backend.
 *
 *   node test/preview/behavior.mjs
 *
 * Needs Node 22+ and Chromium (CHROME_PATH or a common path). The preview
 * server is started on port 7788 when it is not already running.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CdpClient } from "../../lib/cdp.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 7788);
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME =
  process.env.CHROME_PATH ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`
  ].find((p) => existsSync(p)) ||
  "google-chrome";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function serverUp() {
  try {
    return (await fetch(`${BASE}/harness.html`, { method: "HEAD" })).ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverUp()) return null;
  const child = spawn(process.execPath, [join(HERE, "server.mjs")], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore"
  });
  for (let i = 0; i < 60; i += 1) {
    await sleep(120);
    if (await serverUp()) return child;
  }
  child.kill();
  throw new Error(`preview server did not start on ${BASE}`);
}

async function main() {
  const server = await ensureServer();
  const port = 9341;
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${join(HERE, ".chrome-profile")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--disable-gpu",
    "about:blank"
  ], { stdio: "ignore" });

  let version = null;
  for (let i = 0; i < 80; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      break;
    } catch {
      await sleep(200);
    }
  }
  if (!version) {
    chrome.kill();
    throw new Error(`Chrome did not start (${CHROME})`);
  }

  const client = new CdpClient(version.webSocketDebuggerUrl, { timeoutMs: 25000 });
  await client.connect();
  const page = await client.attachPage({ createUrl: "about:blank" });
  const sid = page.sessionId;
  await client.send("Page.enable", {}, sid);
  await client.send("Runtime.enable", {}, sid);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 900, deviceScaleFactor: 1, mobile: false }, sid);

  const states = [
    { state: "esc", extra: "" },
    { state: "insert", extra: "" },
    // Native carrier: local URL -> iframe proxy -> overlay forwards Esc.
    { state: "esc-native", extra: `&url=${encodeURIComponent("http://shop.local/checkout")}` },
    // Explicit override: a public URL with the per-origin "native" preference
    // saved must still mount the proxy iframe, with the f. token and warning.
    { state: "force-native", extra: `&url=${encodeURIComponent("https://shop.example.com/checkout")}&force-native=1` },
    // The same override through the real UI: open ⋯ and click the menu item.
    { state: "force-native-menu", extra: `&url=${encodeURIComponent("https://shop.example.com/checkout")}` },
    // Native Insert path: pick, note, add to list, Insert -> one composite.
    { state: "insert-native", extra: `&url=${encodeURIComponent("http://shop.local/checkout")}` }
  ];
  const results = {};
  for (const { state, extra } of states) {
    await client.send("Page.navigate", {
      url: `${BASE}/harness.html?state=${state}&w=760&h=900&chrome=0&lang=en${extra}`
    }, sid);
    let ready = false;
    for (let i = 0; i < 160; i += 1) {
      await sleep(120);
      try {
        const r = await client.send("Runtime.evaluate", { expression: "window.__ready === true", returnByValue: true }, sid);
        if (r.result && r.result.value) { ready = true; break; }
      } catch {
        /* navigating */
      }
    }
    assert.ok(ready, `${state}: harness never became ready`);
    const out = await client.send(
      "Runtime.evaluate",
      { expression: "JSON.stringify(window.__esc || window.__insert || window.__escNative || window.__forceNative || window.__insertNative || null)", returnByValue: true },
      sid
    );
    results[state] = JSON.parse(out.result.value);
  }

  assert.ok(results.esc, "esc: no result");
  assert.equal(results.esc.before, "true", "esc: annotate mode was not armed first");
  assert.equal(results.esc.after, "false", "esc: Escape did not leave annotate mode");

  assert.ok(results["esc-native"], "esc-native: no result");
  assert.equal(results["esc-native"].error, null, "esc-native: overlay dispatch failed");
  assert.equal(results["esc-native"].before, true, "esc-native: annotate mode was not armed first");
  assert.equal(results["esc-native"].after, false, "esc-native: Escape inside the iframe did not leave annotate mode");

  assert.ok(results["force-native"], "force-native: no result");
  assert.equal(results["force-native"].root, true, "force-native: the native panel did not mount");
  assert.equal(results["force-native"].frame, true, "force-native: the proxy iframe did not mount");
  assert.equal(results["force-native"].warn, true, "force-native: the same-origin warning is missing");
  assert.ok(
    results["force-native"].src.startsWith("/api/sidepanel-web/p/f."),
    `force-native: proxy token is not forced (${results["force-native"].src})`
  );

  assert.ok(results["force-native-menu"], "force-native-menu: no result");
  assert.equal(results["force-native-menu"].found, true, "force-native-menu: the Force native view item was not rendered");
  assert.equal(results["force-native-menu"].frame, true, "force-native-menu: the proxy iframe did not mount");
  assert.equal(results["force-native-menu"].warn, true, "force-native-menu: the same-origin warning is missing");
  assert.ok(
    results["force-native-menu"].src.startsWith("/api/sidepanel-web/p/f."),
    `force-native-menu: proxy token is not forced (${results["force-native-menu"].src})`
  );

  assert.ok(results.insert, "insert: no result");
  assert.ok(results.insert.draft && results.insert.draft.includes("Screenshot:"), "insert: crop path missing from the text");
  assert.ok(Array.isArray(results.insert.attached) && results.insert.attached.length > 0, "insert: no attachment id reached the composer");
  assert.ok(results.insert.draftFiles && results.insert.draftFiles.length > 0, "insert: conversation.createDrafts received no file");
  assert.equal(results.insert.draftFiles.length, 1, "insert: expected exactly one annotated image, not one per pick");
  assert.equal(results.insert.draftFiles[0].name, "annotations.png", "insert: the attached image is not the composite");
  assert.equal(results.insert.draftFiles[0].type, "image/png", "insert: composite is not an image/png File");
  assert.ok(results.insert.draftFiles[0].size > 0, "insert: composite File is empty");
  assert.ok(results["insert-native"], "insert-native: no result");
  assert.equal(results["insert-native"].error, null, "insert-native: picking inside the iframe failed");
  assert.equal(results["insert-native"].picked, true, "insert-native: the fixture button was not picked");
  assert.equal(results["insert-native"].files.length, 1, "insert-native: expected exactly one annotated image");
  assert.equal(results["insert-native"].files[0].name, "annotations.png", "insert-native: the image is not the composite");
  assert.equal(results["insert-native"].files[0].type, "image/png", "insert-native: composite is not a PNG");
  assert.ok(results["insert-native"].attached.length > 0, "insert-native: no attachment reached the composer");

  console.log("behavior: ok");
  console.log("  Esc leaves annotate mode (CDP):", results.esc.before, "->", results.esc.after);
  console.log("  Esc leaves annotate mode (native iframe):", results["esc-native"].before, "->", results["esc-native"].after);
  console.log("  forced native on a public URL:", results["force-native"].src.split("?")[0], "warn:", results["force-native"].warn);
  console.log("  forced native via the ⋯ menu:", results["force-native-menu"].src.split("?")[0], "item:", results["force-native-menu"].found);
  console.log("  crop attached:", results.insert.draftFiles[0], "ids:", results.insert.attached.join(","));

  client.close();
  chrome.kill("SIGTERM");
  if (server) server.kill("SIGTERM");
  await sleep(250);
}

main().catch((error) => {
  console.error("behavior failed:", error);
  process.exit(1);
});
