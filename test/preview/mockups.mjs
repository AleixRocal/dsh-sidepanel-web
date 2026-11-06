/**
 * Render the documentation/marketing screenshots into assets/screenshots/.
 *
 * Every image is a mockup: the panel is the real lib/client.js running against
 * the preview mock backend, and the DSH shell around it is static HTML with an
 * invented conversation. The page shown inside the panel is the fictional
 * Northwind Supply storefront on the reserved example.com domain. No real
 * account, customer, address or screenshot of the live GUI is involved.
 *
 *   node test/preview/mockups.mjs
 *
 * Needs the preview server (started automatically if it is not running) and a
 * Chromium/Chrome binary (CHROME_PATH, common paths, or the Playwright cache).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CdpClient } from "../../lib/cdp.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const OUT = join(REPO, "assets/screenshots");
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

const SHOTS = [
  {
    name: "banner",
    url: `${BASE}/banner.html`,
    title: "Repository banner",
    width: 1600,
    height: 420,
    out: join(REPO, "assets/banner.png")
  },
  {
    name: "01-browser-panel",
    url: `${BASE}/shell.html?shot=hero&w=760`,
    title: "A browser next to the chat"
  },
  {
    name: "02-annotate",
    url: `${BASE}/shell.html?shot=annotate&w=760&note=${encodeURIComponent("Make the primary action sticky on mobile")}`,
    title: "Pick an element, write the note"
  },
  {
    name: "03-devices",
    url: `${BASE}/shell.html?shot=devices&w=560`,
    title: "Desktop, tablet and phone emulation"
  },
  {
    name: "04-how-it-works",
    url: `${BASE}/diagram.html`,
    title: "Local proxy and CDP carriers"
  }
];

async function serverUp() {
  try {
    const r = await fetch(`${BASE}/harness.html`, { method: "HEAD" });
    return r.ok;
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

async function launchChrome() {
  const port = 9336;
  const child = spawn(CHROME, [
    "--headless=new",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${join(HERE, ".chrome-profile")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--disable-gpu",
    "--force-device-scale-factor=1",
    "about:blank"
  ], { stdio: "ignore" });

  let version = null;
  for (let i = 0; i < 80; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      version = await r.json();
      break;
    } catch {
      await sleep(200);
    }
  }
  if (!version) {
    child.kill();
    throw new Error(`Chrome did not start (${CHROME})`);
  }
  return { child, version };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await ensureServer();
  const { child: chrome, version } = await launchChrome();
  console.log("chrome:", version.Browser);

  const client = new CdpClient(version.webSocketDebuggerUrl, { timeoutMs: 25000 });
  await client.connect();
  const page = await client.attachPage({ createUrl: "about:blank" });
  const sid = page.sessionId;
  await client.send("Page.enable", {}, sid);
  await client.send("Runtime.enable", {}, sid);

  for (const shot of SHOTS.filter((s) => !process.env.ONLY || s.name.includes(process.env.ONLY))) {
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: shot.width || 1600,
        height: shot.height || 1000,
        deviceScaleFactor: 2,
        mobile: false
      },
      sid
    );
    await client.send("Page.navigate", { url: shot.url }, sid);
    let ready = false;
    for (let i = 0; i < 160; i += 1) {
      await sleep(120);
      try {
        const r = await client.send(
          "Runtime.evaluate",
          {
            expression: "document.body && document.body.getAttribute('data-ready') === '1'",
            returnByValue: true
          },
          sid
        );
        if (r.result && r.result.value === true) {
          ready = true;
          break;
        }
      } catch {
        /* context destroyed while navigating */
      }
    }
    if (!ready) console.warn(`  ! ${shot.name}: page never signalled ready`);
    await sleep(500);

    const png = await client.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sid
    );
    const file = shot.out || join(OUT, `${shot.name}.png`);
    writeFileSync(file, Buffer.from(png.data, "base64"));
    console.log(`  ✓ ${file.replace(REPO + "/", "")}  — ${shot.title}`);
  }

  client.close();
  chrome.kill("SIGTERM");
  if (server) server.kill("SIGTERM");
  await sleep(250);
  console.log("done →", OUT);
}

main().catch((error) => {
  console.error("mockups failed:", error);
  process.exit(1);
});
