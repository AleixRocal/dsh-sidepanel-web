/**
 * 面板预览台：mock 后端 + 静态服务。
 *
 * 目的：不启动 DSH、不驱动真实浏览器，也能看到 lib/client.js 的完整界面
 * （五种状态 / 两种宽度 / 浮卡 / 插入后反馈），用于改样式前后对比。
 *
 *   node test/preview/server.mjs          # http://127.0.0.1:7788/harness.html
 *   node test/preview/shoot.mjs           # 用 CDP 批量截图到 test/preview/shots/
 *
 * vendor/ 里需要 React 18 的 UMD（未入库，见 README）。
 */
import http from "node:http";
import { readFileSync, createReadStream, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const VENDOR = join(HERE, "vendor");
const PORT = Number(process.env.PORT || 7788);

const CLIENT = join(REPO, "lib/client.js");
const SHOT = join(HERE, "fixture-page.svg");
const MOBILE = join(HERE, "fixture-page-mobile.svg");
const TALL = join(HERE, "fixture-page-tall.svg");

let state = "ready";
let shotCount = 0;
let devicePreset = "responsive";
let lastNavigate = "";
let lastViewport = null;

const DEVICE = {
  responsive: { preset: "responsive", label: "Adaptive (fits the panel)", width: 0, height: 0, dpr: 1, mobile: false, touch: false },
  desktop: { preset: "desktop", label: "Desktop 1280×800", width: 1280, height: 800, dpr: 1, mobile: false, touch: false },
  laptop: { preset: "laptop", label: "Laptop 1440×900", width: 1440, height: 900, dpr: 1, mobile: false, touch: false },
  tablet: { preset: "tablet", label: "Tablet 768×1024 (iPad)", width: 768, height: 1024, dpr: 2, mobile: true, touch: true },
  mobile: { preset: "mobile", label: "Phone 390×844 (iPhone)", width: 390, height: 844, dpr: 3, mobile: true, touch: true },
  android: { preset: "android", label: "Phone 412×915 (Android)", width: 412, height: 915, dpr: 2.625, mobile: true, touch: true }
};

function deviceState() {
  return DEVICE[devicePreset] || DEVICE.responsive;
}

// Fictional page and element. `example.com` is reserved by the IETF for
// documentation, so nothing here can point at a real account or customer.
const PAGE = {
  url: "https://shop.example.com/checkout",
  title: "Checkout · Northwind Supply"
};

const ELEMENT = {
  tag: "BUTTON",
  id: "place-order",
  cls: "btn btn-primary btn-block",
  text: "Place order · €152.00",
  rect: { x: 152, y: 536, w: 576, h: 44 },
  pageUrl: PAGE.url,
  pageTitle: PAGE.title,
  backendNodeId: 42
};

function json(res, code, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": buf.length
  });
  res.end(buf);
}

function sendImage(res, file) {
  const src = file || SHOT;
  const stat = statSync(src);
  res.writeHead(200, {
    "content-type": "image/svg+xml",
    "cache-control": "no-store",
    "content-length": stat.size
  });
  createReadStream(src).pipe(res);
}

function sendFile(res, path, type) {
  if (!existsSync(path)) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`missing ${path}\nsee test/preview/README.md for the vendor setup\n`);
    return;
  }
  const body = readFileSync(path);
  res.writeHead(200, { "content-type": type, "cache-control": "no-store", "content-length": body.length });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  const p = u.pathname;

  if (p === "/__state") {
    state = u.searchParams.get("value") || "ready";
    shotCount = 0;
    // Each harness load starts from a clean session: device emulation is
    // session-scoped in the real host, and a leftover preset would leak from
    // one screenshot into the next.
    devicePreset = "responsive";
    lastViewport = null;
    return json(res, 200, { ok: true, state });
  }

  if (p === "/api/sidepanel-web/status") {
    const config = { pollMs: 1200, quality: 82, headless: true };
    const base = {
      wsUrl: "ws://127.0.0.1:9222/devtools/browser/preview",
      info: { endpoint: "ws://127.0.0.1:9222/devtools/browser/preview", launched: null, lastError: "" },
      device: deviceState(),
      viewport: lastViewport || { w: 360, h: 700, dpr: 1 },
      config
    };
    if (state === "loading") return; // 永不返回：模拟首次拉起 Chrome
    if (state === "error") {
      return json(res, 200, {
        ...base,
        ok: false,
        page: null,
        lastError: "CDP connect failed: ws://127.0.0.1:9222/devtools/browser/preview (ECONNREFUSED)"
      });
    }
    if (state === "blank") {
      return json(res, 200, { ...base, ok: true, page: { url: "about:blank", title: "" }, lastError: "" });
    }
    return json(res, 200, { ...base, ok: true, page: PAGE, lastError: "" });
  }

  if (p === "/api/sidepanel-web/shot") {
    shotCount += 1;
    if (state === "shoterr" && shotCount > 1) {
      return json(res, 503, { ok: false, error: "CDP timeout: Page.captureScreenshot" });
    }
    if (state === "loading" || state === "error") {
      return json(res, 503, { ok: false, error: "No page available" });
    }
    if (state === "tall" || state === "tallpicked") return sendImage(res, TALL);
    // Device emulation changes the viewport; serve the matching page size so
    // the preview shows what the preset actually renders.
    if (devicePreset === "mobile" || devicePreset === "android" || devicePreset === "tablet") {
      return sendImage(res, MOBILE);
    }
    return sendImage(res);
  }

  if (p === "/api/sidepanel-web/element" && req.method === "POST") {
    return json(res, 200, { ok: true, element: ELEMENT });
  }
  if (p === "/api/sidepanel-web/navigate" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try { lastNavigate = JSON.parse(body || "{}").url || ""; } catch {}
    return json(res, 200, { ok: true, page: PAGE });
  }
  if (p === "/__last") return json(res, 200, { navigate: lastNavigate, device: deviceState() });
  if (p === "/api/sidepanel-web/device" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const next = JSON.parse(body || "{}").preset || "responsive";
    if (!DEVICE[next]) return json(res, 400, { ok: false, error: "unknown preset: " + next });
    devicePreset = next;
    return json(res, 200, { ok: true, device: deviceState() });
  }
  if (p === "/api/sidepanel-web/viewport" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body || "{}");
    // Mirror the emulated viewport into the status reply, otherwise the panel
    // keeps reporting the old size and the stage aspect drifts.
    const w = Number(parsed.width || parsed.w || 0);
    const h = Number(parsed.height || parsed.h || 0);
    if (w > 0 && h > 0) {
      lastViewport = { w, h, dpr: Number(parsed.deviceScaleFactor || parsed.dpr || 1) };
    }
    return json(res, 200, { ok: true, ...parsed });
  }
  if (p === "/api/sidepanel-web/nav" && req.method === "POST") {
    return json(res, 200, { ok: true, moved: true, url: PAGE.url });
  }
  if (p === "/api/sidepanel-web/start" && req.method === "POST") {
    return json(res, 200, { ok: true, ...PAGE, lastError: "" });
  }

  if (p === "/harness.html") return sendFile(res, join(HERE, "harness.html"), "text/html; charset=utf-8");
  if (p === "/shell.html") return sendFile(res, join(HERE, "shell.html"), "text/html; charset=utf-8");
  if (p === "/diagram.html") return sendFile(res, join(HERE, "diagram.html"), "text/html; charset=utf-8");
  if (p === "/fixture-page.svg") return sendFile(res, SHOT, "image/svg+xml");
  if (p === "/fixture-page-mobile.svg") return sendFile(res, MOBILE, "image/svg+xml");
  if (p === "/client.js") return sendFile(res, CLIENT, "application/javascript; charset=utf-8");
  if (p === "/vendor/react.js") {
    return sendFile(res, join(VENDOR, "react.development.js"), "application/javascript; charset=utf-8");
  }
  if (p === "/vendor/react-dom.js") {
    return sendFile(res, join(VENDOR, "react-dom.development.js"), "application/javascript; charset=utf-8");
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found: " + p);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[preview] http://127.0.0.1:${PORT}/harness.html`);
  console.log(`[preview] client = ${CLIENT}`);
});
