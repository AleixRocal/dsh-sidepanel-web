/**
 * 标注浏览器的服务层：只管「连哪台 Chrome、怎么截图、坐标落到哪个元素」。
 * 不依赖任何第三方浏览器插件；默认从 ego 的 browser.json 里取 wsUrl，
 * 也可以显式给一个 CDP 端点（比如自己启动的 Chrome --remote-debugging-port）。
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CdpClient } from "./cdp.js";
import { launchChrome, stopChrome, defaultProfileDir } from "./launcher.js";

export const DEFAULT_HOME = "https://www.deepseek.com";

/**
 * Where to look for a browser somebody else already started, in order:
 * our own attach file first, then the ego bridge's file (same shape, kept for
 * compatibility with dsh-annotate-browser), then a short localhost port scan.
 * All of them are optional: without any hit we launch a Chrome ourselves.
 */
const ATTACH_STATE = join(homedir(), ".local/state/dsh-sidepanel-web/browser.json");
const LEGACY_BROWSER_STATE = join(homedir(), ".local/state/ego-lite-linux/browser.json");
const PROBE_PORTS = [9222, 9223, 9224, 9225, 9333];
const PROBE_TTL_MS = 20000;

function readEndpointFile(file) {
  if (!existsSync(file)) return "";
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const ws = typeof raw.wsUrl === "string" ? raw.wsUrl.trim() : "";
    if (ws) return ws;
    const http = typeof raw.httpUrl === "string" ? raw.httpUrl.trim() : "";
    if (http) return http;
    return "";
  } catch {
    return "";
  }
}

export function readDefaultEndpoint() {
  return readEndpointFile(ATTACH_STATE) || readEndpointFile(LEGACY_BROWSER_STATE);
}

/** Turn an http debug endpoint (http://127.0.0.1:9222) into its ws URL via /json/version. */
export async function resolveHttpEndpoint(httpUrl) {
  const base = String(httpUrl || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  try {
    const res = await fetch(`${base}/json/version`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return "";
    const data = await res.json();
    return typeof data.webSocketDebuggerUrl === "string" ? data.webSocketDebuggerUrl : "";
  } catch {
    return "";
  }
}

/** First Chrome on this machine that exposes remote debugging, if any. */
async function probeLocalPorts() {
  for (const port of PROBE_PORTS) {
    const ws = await resolveHttpEndpoint(`http://127.0.0.1:${port}`);
    if (ws) return ws;
  }
  return "";
}

/**
 * Device emulation presets. `responsive` is the default and means "the remote
 * viewport follows the panel": no emulation override is installed at all.
 * Every other preset pins a CSS viewport plus the matching touch/UA surface, so
 * `window.innerWidth`, `navigator.userAgent`, `devicePixelRatio` and touch all
 * agree with a real device.
 */
export const DEVICE_PRESETS = {
  responsive: { label: "Adaptive (fits the panel)", fit: true },
  desktop: {
    label: "Desktop 1280×800", width: 1280, height: 800, dpr: 1,
    mobile: false, touch: false
  },
  laptop: {
    label: "Laptop 1440×900", width: 1440, height: 900, dpr: 1,
    mobile: false, touch: false
  },
  tablet: {
    label: "Tablet 768×1024 (iPad)", width: 768, height: 1024, dpr: 2,
    mobile: true, touch: true, platform: "iPad",
    ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  },
  mobile: {
    label: "Phone 390×844 (iPhone)", width: 390, height: 844, dpr: 3,
    mobile: true, touch: true, platform: "iPhone",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  },
  android: {
    label: "Phone 412×915 (Android)", width: 412, height: 915, dpr: 2.625,
    mobile: true, touch: true, platform: "Linux armv8l",
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
  }
};

export class AnnotateBrowserService {
  constructor({ getConfig = () => ({}), log = null } = {}) {
    this.getConfig = getConfig;
    this.log = log;
    this.cdp = null;
    this.page = null;
    this.launched = null; // 我们自己拉起的 Chrome（wsUrl / pid / profileDir）
    this.lastError = "";
    this.wsUrl = ""; // 实际连上的端点（status 用，避免每次重新探测）
    this.device = { ...DEVICE_PRESETS.responsive, preset: "responsive" };
    this._probe = null; // { at, wsUrl } 端口探测结果缓存
  }

  homeUrl() {
    const cfg = this.getConfig() || {};
    const home = typeof cfg.homeUrl === "string" ? cfg.homeUrl.trim() : "";
    return /^https?:\/\//i.test(home) ? home : DEFAULT_HOME;
  }

  /** 记住当前页 targetId（重载后能接着用同一页，而不是随便认领一个）。 */
  savePageState() {
    try {
      const dir = join(homedir(), ".local/state/dsh-sidepanel-web");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "last-target.json"), JSON.stringify({
        wsUrl: this.cdp ? this.cdp.wsUrl : "",
        targetId: this.page ? this.page.targetId : ""
      }), "utf8");
    } catch {}
  }

  readPageState() {
    try {
      const f = join(homedir(), ".local/state/dsh-sidepanel-web/last-target.json");
      if (!existsSync(f)) return null;
      return JSON.parse(readFileSync(f, "utf8"));
    } catch {
      return null;
    }
  }

  endpoint() {
    const cfg = this.getConfig() || {};
    const configured = typeof cfg.wsUrl === "string" ? cfg.wsUrl.trim() : "";
    if (configured) return configured;
    return readDefaultEndpoint() || (this.cdp ? this.cdp.wsUrl : "");
  }

  /**
   * Resolve the CDP endpoint, in order:
   *   1. settings `wsUrl` (a full ws:// URL);
   *   2. `DSH_SIDEPANEL_WS_URL`;
   *   3. settings `cdpUrl` (http://127.0.0.1:9222 → /json/version);
   *   4. `~/.local/state/dsh-sidepanel-web/browser.json` ({"wsUrl"|"httpUrl"});
   *   5. `~/.local/state/ego-lite-linux/browser.json` (ego bridge, same shape);
   *   6. a quick scan of the usual localhost debugging ports;
   *   7. launch a Chrome ourselves (unless autoLaunch=false).
   * Steps 1–3 and 6 are exactly how you keep using a browser you already have:
   * point the settings at it and the panel drives that same browser.
   */
  async resolveEndpoint() {
    const cfg = this.getConfig() || {};
    const configured = typeof cfg.wsUrl === "string" ? cfg.wsUrl.trim() : "";
    if (configured) return configured;
    const fromEnv = typeof process.env.DSH_SIDEPANEL_WS_URL === "string" ? process.env.DSH_SIDEPANEL_WS_URL.trim() : "";
    if (fromEnv) return fromEnv;
    const cdpUrl = typeof cfg.cdpUrl === "string" ? cfg.cdpUrl.trim() : "";
    if (cdpUrl) {
      const ws = /^wss?:\/\//i.test(cdpUrl) ? cdpUrl : await resolveHttpEndpoint(cdpUrl);
      if (ws) return ws;
    }
    const fromFile = readDefaultEndpoint();
    if (fromFile) {
      if (/^wss?:\/\//i.test(fromFile)) return fromFile;
      const resolved = await resolveHttpEndpoint(fromFile);
      if (resolved) return resolved;
    }
    const now = Date.now();
    if (this._probe && now - this._probe.at < PROBE_TTL_MS) {
      if (this._probe.wsUrl) return this._probe.wsUrl;
    } else {
      const probed = await probeLocalPorts();
      this._probe = { at: now, wsUrl: probed };
      if (probed) {
        if (this.log && typeof this.log.info === "function") this.log.info(`[sidepanel-web] attached to ${probed}`);
        return probed;
      }
    }
    if (cfg.autoLaunch === false) throw new Error("No CDP endpoint available and autoLaunch is disabled (autoLaunch=false).");
    if (this.launched) return this.launched.wsUrl;
    const launched = await launchChrome({
      chromePath: typeof cfg.chromePath === "string" ? cfg.chromePath : "",
      profileDir: typeof cfg.profileDir === "string" && cfg.profileDir.trim() ? cfg.profileDir.trim() : defaultProfileDir(),
      headless: cfg.headless !== false
    });
    this.launched = launched;
    if (this.log && typeof this.log.info === "function") this.log.info(`[sidepanel-web] launched chrome ${launched.wsUrl}`);
    return launched.wsUrl;
  }

  /** Backwards-compatible name; always async now that discovery can probe ports. */
  async ensureEndpoint() {
    return this.resolveEndpoint();
  }

  async ensure() {
    const wsUrl = await this.resolveEndpoint();
    this.wsUrl = wsUrl;
    // 同一个端点：优先复用「我们自己那一页」——绝不去抢别人的标签页
    if (this.cdp && this.cdp.wsUrl === wsUrl && this.page) {
      try {
        const pages = await this.cdp.listPages();
        const cur = pages.find((p) => p.targetId === this.page.targetId);
        if (cur) {
          this.page = { ...this.page, url: cur.url, title: cur.title };
          if (!cur.url || cur.url === "about:blank") await this.openHome();
          await this.reapplyDevice().catch(() => {});
          return this.page;
        }
      } catch {}
    }
    if (!this.cdp || this.cdp.wsUrl !== wsUrl) {
      this.close();
      const cdp = new CdpClient(wsUrl, { timeoutMs: 8000 });
      await cdp.connect();
      this.cdp = cdp;
    }
    // 页面没了（重载/被关）：只恢复「上次那一页」。绝不去认领别人的标签页：
    // 连的是用户自己的 Chrome 时，随便 adopt 一个 homeHost 匹配页会把他正在
    // 用的 tab 抢过来，症状是「我点了一下侧栏，我的标签页跳走了」。
    try {
      const pages = await this.cdp.listPages();
      const saved = this.readPageState();
      const adopt = saved && saved.targetId && (!saved.wsUrl || saved.wsUrl === wsUrl)
        ? pages.find((p) => p.targetId === saved.targetId)
        : null;
      if (adopt) {
        const attached = await this.cdp.attachTarget(adopt.targetId);
        this.page = { ...attached, url: adopt.url, title: adopt.title };
        if (!adopt.url || adopt.url === "about:blank") await this.openHome();
        await this.applySameTab(this.page).catch(() => {});
        await this.reapplyDevice().catch(() => {});
        this.savePageState();
        return this.page;
      }
    } catch {}
    this.page = await this.cdp.createPage("about:blank");
    await this.reapplyDevice().catch(() => {});
    await this.openHome();
    await this.applySameTab(this.page).catch(() => {});
    this.savePageState();
    return this.page;
  }

  /** 把当前页导航到配置的首页（默认 DeepSeek 官网）。 */
  async openHome() {
    const page = this.page;
    if (!page) return;
    try {
      await this.cdp.send("Page.enable", {}, page.sessionId);
      await this.cdp.send("Page.navigate", { url: this.homeUrl() }, page.sessionId);
      await new Promise((r) => setTimeout(r, 1500));
      const info = await this.cdp.send("Runtime.evaluate", {
        expression: "JSON.stringify({u:location.href,t:document.title})",
        returnByValue: true
      }, page.sessionId);
      const parsed = JSON.parse(info.result.value || "{}");
      this.page = { ...page, url: parsed.u || this.homeUrl(), title: parsed.t || "" };
    } catch {}
  }

  async status() {
    try {
      const page = await this.ensure();
      let viewport = null;
      try {
        const r = await this.cdp.send("Runtime.evaluate", {
          expression: "JSON.stringify({w:innerWidth,h:innerHeight,dpr:devicePixelRatio||1})",
          returnByValue: true
        }, page.sessionId);
        viewport = JSON.parse((r && r.result && r.result.value) || "null");
      } catch {}
      return {
        ok: true,
        wsUrl: this.wsUrl || this.endpoint(),
        attached: !this.launched,
        page: { url: page.url, title: page.title, targetId: page.targetId || "" },
        viewport,
        device: this.deviceState(),
        devices: DEVICE_PRESETS,
        streamTarget: this._streamPageId || "",
        streamWatching: (this._watchers || 0) > 0,
        lastError: ""
      };
    } catch (error) {
      this.lastError = String(error?.message || error);
      return {
        ok: false,
        wsUrl: this.wsUrl || this.endpoint(),
        attached: !this.launched,
        page: null,
        viewport: null,
        device: this.deviceState(),
        devices: DEVICE_PRESETS,
        lastError: this.lastError
      };
    }
  }

  async shot({ format = "jpeg", quality = 80 } = {}) {
    const page = await this.ensure();
    return { page, data: await this.cdp.screenshot(page.sessionId, { format, quality }) };
  }

  /**
   * Capture the whole page as PNG and keep it on disk. The annotation message
   * cites the path so the agent can inspect the same page with read_image.
   */
  async fullShot(url = "") {
    if (url) {
      try { await this.renderPage(url); } catch {}
    }
    const page = await this.ensure();
    let width = 1280;
    let height = 900;
    try {
      const metrics = await this.cdp.send("Page.getLayoutMetrics", {}, page.sessionId);
      const size = metrics?.cssContentSize || metrics?.contentSize || {};
      width = Math.max(320, Math.min(4000, Math.ceil(Number(size.width) || 1280)));
      height = Math.max(240, Math.min(12000, Math.ceil(Number(size.height) || 900)));
    } catch {}
    const { data } = await this.cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
      optimizeForSpeed: true,
    }, page.sessionId);
    const dir = join(homedir(), ".dsh/data/dsh-sidepanel-web/shots");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${Date.now()}-page.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    return { ok: true, file, size: { w: width, h: height } };
  }

  async goto(url) {
    const page = await this.ensure();
    try { await this.cdp.send("Page.enable", {}, page.sessionId); } catch {}
    await this.cdp.clearMarks(page.sessionId);
    await this.cdp.send("Page.navigate", { url }, page.sessionId);
    await new Promise((r) => setTimeout(r, 1200));
    let url2 = url;
    let title = "";
    try {
      const info = await this.cdp.send("Runtime.evaluate", { expression: "JSON.stringify({u:location.href,t:document.title})", returnByValue: true }, page.sessionId);
      const parsed = JSON.parse(info.result.value || "{}");
      url2 = parsed.u || url;
      title = parsed.t || "";
    } catch {}
    this.page = { ...page, url: url2, title };
    return this.page;
  }

  /**
   * Render a URL with the CDP browser and return the executed DOM plus the
   * final URL. Used by the same-origin iframe carrier: the HTML is served by
   * DSH with a <base> and an annotation overlay injected, so the page renders
   * natively in the sidebar while remaining scriptable.
   */
  async renderPage(url) {
    const page = await this.ensure();
    try { await this.cdp.send("Page.enable", {}, page.sessionId); } catch {}
    // Local dev servers commonly use self-signed certificates. Without this,
    // Chromium returns its privacy interstitial instead of the page, and the
    // "proceed" link is a browser UI action that cannot work in the iframe.
    try {
      await this.cdp.send("Security.enable", {}, page.sessionId);
      await this.cdp.send("Security.setIgnoreCertificateErrors", { ignore: true }, page.sessionId);
    } catch {}
    await this.cdp.send("Page.navigate", { url }, page.sessionId);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        const r = await this.cdp.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }, page.sessionId);
        if (r?.result?.value === "complete") break;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    await new Promise((r) => setTimeout(r, 500));
    let html = "";
    let finalUrl = url;
    try {
      const h = await this.cdp.send("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true }, page.sessionId);
      html = h?.result?.value || "";
      const l = await this.cdp.send("Runtime.evaluate", { expression: "location.href", returnByValue: true }, page.sessionId);
      finalUrl = l?.result?.value || url;
    } catch {}
    this.page = { ...page, url: finalUrl };
    return { html, finalUrl };
  }

  /**
   * 开启 screencast：Chrome 只在画面变化时推帧，省掉每帧 53ms 的整帧截图。
   * 注意必须 Page.bringToFront —— 后台标签不合成，推 0 帧（实测）。
   */
  /** 多 watcher 引用计数：最后一个断开才真正停推流。 */
  async acquireStream(opts) {
    this._watchers = (this._watchers || 0) + 1;
    if (this._watchers === 1) await this.startStream(opts);
    return this._watchers;
  }

  async releaseStream() {
    this._watchers = Math.max(0, (this._watchers || 0) - 1);
    if (this._watchers === 0) await this.stopStream();
    return this._watchers;
  }

  get watchers() { return this._watchers || 0; }

  async startStream({ fps = 15, quality = 62, maxWidth = 1000 } = {}) {
    const page = await this.ensure();
    if (this._streaming && this._streamPageId === page.targetId) return { ok: true, already: true };
    await this.stopStream();
    try {
      await this.cdp.send("Page.enable", {}, page.sessionId);
      await this.cdp.send("Page.bringToFront", {}, page.sessionId).catch(() => {});
    } catch {}
    const minGap = Math.max(30, Math.round(1000 / Math.max(1, fps)));
    let lastAt = 0;
    this._latestFrame = null;
    this._frameSeq = 0;
    this._offFrame = this.cdp.on("Page.screencastFrame", (params, sessionId) => {
      if (sessionId !== page.sessionId) return;
      // 背压：立刻 ack 让 Chrome 继续画，但我们只在间隔够时替换“最新帧”（旧帧直接丢）
      this.cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }, page.sessionId).catch(() => {});
      const now = Date.now();
      if (now - lastAt < minGap) return;
      lastAt = now;
      this._latestFrame = params.data;
      this._frameSeq += 1;
      for (const fn of this._frameWaiters || []) { try { fn(params.data); } catch {} }
    });
    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality,
      maxWidth,
      maxHeight: 4000,
      everyNthFrame: 1
    }, page.sessionId);
    this._streaming = true;
    this._streamOpts = { fps, quality, maxWidth };
    this._streamPageId = page.targetId;
    return { ok: true };
  }

  async stopStream() {
    const page = this.page;
    try { this._offFrame && this._offFrame(); } catch {}
    this._offFrame = null;
    this._streaming = false;
    this._latestFrame = null;
    this._frameWaiters = [];
    if (page) { try { await this.cdp.send("Page.stopScreencast", {}, page.sessionId); } catch {} }
  }

  /** SSE 订阅：新帧到了就回调。 */
  onFrame(fn) {
    if (!this._frameWaiters) this._frameWaiters = [];
    this._frameWaiters.push(fn);
    return () => { this._frameWaiters = (this._frameWaiters || []).filter((f) => f !== fn); };
  }

  get frame() { return this._latestFrame; }

  /** 当前页面 host 当天已有多少条标注（用来续编号，避免刷新后从 1 重新开始）。 */
  annotationCount() {
    try {
      const page = this.page;
      let host = "page";
      try { host = new URL(page?.url || "").host || "page"; } catch {}
      const day = new Date().toISOString().slice(0, 10);
      const file = join(homedir(), ".dsh/data/dsh-sidepanel-web/annotations", `${day}-${host.replace(/[^a-z0-9.-]/gi, "_")}.json`);
      if (!existsSync(file)) return 0;
      const doc = JSON.parse(readFileSync(file, "utf8"));
      return Array.isArray(doc.annotations) ? doc.annotations.length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * 把一条标注落成 JSON 文件（输入框里只放一行摘要 + 文件路径，模型读结构化文件更准）。
   * 目录：~/.dsh/data/dsh-sidepanel-web/annotations/，按 日期-host 分文件，追加写。
   */
  async appendAnnotation({ element, note = "", n = 1 }) {
    const dir = join(homedir(), ".dsh/data/dsh-sidepanel-web/annotations");
    mkdirSync(dir, { recursive: true });
    let host = "page";
    try { host = new URL(element?.page?.url || "").host || "page"; } catch {}
    const day = new Date().toISOString().slice(0, 10);
    const file = join(dir, `${day}-${host.replace(/[^a-z0-9.-]/gi, "_")}.json`);
    let doc = { file, host, page: element?.page || null, annotations: [] };
    if (existsSync(file)) {
      try { doc = { ...doc, ...JSON.parse(readFileSync(file, "utf8")) }; } catch {}
    }
    doc.annotations = Array.isArray(doc.annotations) ? doc.annotations : [];
    doc.annotations.push({
      n,
      note,
      at: new Date().toISOString(),
      element: {
        tag: element?.tag,
        id: element?.id,
        testId: element?.testId || "",
        abId: element?.abId || "",
        selector: element?.selector,
        classes: element?.classes,
        role: element?.role,
        ariaLabel: element?.ariaLabel,
        attrs: element?.attrs,
        text: element?.text,
        context: element?.context,
        parents: element?.parents,
        html: element?.html,
        rect: element?.rect,
        viewport: element?.viewport,
        styles: element?.styles,
        framework: element?.framework,
        page: element?.page
      }
    });
    writeFileSync(file, JSON.stringify(doc, null, 2), "utf8");
    // 保留 7 天，避免目录无限长
    try {
      const keep = Date.now() - 7 * 24 * 3600 * 1000;
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".json")) continue;
        const p2 = join(dir, name);
        try { if (statSync(p2).mtimeMs < keep) unlinkSync(p2); } catch {}
      }
    } catch {}
    return { ok: true, file, count: doc.annotations.length };
  }

  /** 取消一条页面标注（按编号）；不传编号则撤销最后一条。 */
  async removeMark(n) {
    try {
      const page = await this.ensure();
      const expr = n == null || n === ""
        ? "(window.__abMarks ? window.__abMarks.removeLast() : 0)"
        : `(window.__abMarks ? window.__abMarks.remove(${Number(n)}) : 0)`;
      const res = await this.cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true }, page.sessionId);
      return { ok: true, remaining: (res && res.result && res.result.value) || 0 };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }

  /** 在坐标处留一条持久标注（页面内绘制，滚动/重排后仍贴住元素）。 */
  async addMark({ x, y, n, note }) {
    const page = await this.ensure();
    // 编号避撞：页面已有钉子时，取 max(n)+1，避免出现两个「1」
    let useN = Number(n) || 0;
    try {
      const cur = await this.cdp.send("Runtime.evaluate", {
        expression: "(window.__abMarks && window.__abMarks.maxN) ? window.__abMarks.maxN() : 0",
        returnByValue: true
      }, page.sessionId);
      const maxN = Number((cur && cur.result && cur.result.value) || 0);
      if (!useN || useN <= maxN) useN = maxN + 1;
    } catch {}
    const out = await this.cdp.addMark(page.sessionId, { x: Number(x), y: Number(y), n: useN, note: note || "" });
    return { ok: !!out.ok, ...out, n: useN };
  }

  async clearMarks() {
    try {
      const page = await this.ensure();
      await this.cdp.clearMarks(page.sessionId);
    } catch {}
    return { ok: true };
  }

  /**
   * 直接操作页面：点击 / 双击 / 右键 / 拖拽 / 滚轮 / 按键 / 文本，全部转发成 CDP Input。
   * 关键点：按键必须带 windowsVirtualKeyCode，否则 Chrome 会忽略（Backspace/Delete 删不掉就是这个原因）。
   */
  async input({ kind, x = 0, y = 0, toX = 0, toY = 0, deltaX = 0, deltaY = 0,
                key = "", code = "", text = "", button = "left", modifiers = 0, clickCount = 1 } = {}) {
    const page = await this.ensure();
    const sid = page.sessionId;
    const px = Math.round(Number(x) || 0);
    const py = Math.round(Number(y) || 0);
    const VK = {
      Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Delete: 46,
      ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
      Home: 36, End: 35, PageUp: 33, PageDown: 34, " ": 32
    };
    const mouse = (type, mx, my, extra = {}) =>
      this.cdp.send("Input.dispatchMouseEvent", { type, x: mx, y: my, modifiers, ...extra }, sid);
    try {
      if (kind === "move") {
        await mouse("mouseMoved", px, py);
      } else if (kind === "click" || kind === "dblclick" || kind === "rightclick") {
        const btn = kind === "rightclick" ? "right" : button;
        const count = kind === "dblclick" ? 2 : Math.max(1, Number(clickCount) || 1);
        await mouse("mouseMoved", px, py);
        await mouse("mousePressed", px, py, { button: btn, buttons: btn === "right" ? 2 : 1, clickCount: count });
        await mouse("mouseReleased", px, py, { button: btn, buttons: 0, clickCount: count });
        // 页面若绕过垫片开了新标签，并回当前页并关掉（不等到前端发现）
        if (kind === "click") {
          this.absorbNewTabs(page.targetId, 1100).then((r) => {
            if (r && r.absorbed) this.page = { ...this.page, url: r.navigatedTo || this.page.url };
          }).catch(() => {});
        }
      } else if (kind === "drag") {
        const sx = px, sy = py, ex = Math.round(Number(toX) || 0), ey = Math.round(Number(toY) || 0);
        await mouse("mouseMoved", sx, sy);
        await mouse("mousePressed", sx, sy, { button: "left", buttons: 1, clickCount: 1 });
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          await mouse("mouseMoved", Math.round(sx + ((ex - sx) * i) / steps), Math.round(sy + ((ey - sy) * i) / steps), { button: "left", buttons: 1 });
        }
        await mouse("mouseReleased", ex, ey, { button: "left", buttons: 0, clickCount: 1 });
      } else if (kind === "wheel") {
        await mouse("mouseWheel", px, py, { deltaX: Number(deltaX) || 0, deltaY: Number(deltaY) || 0 });
      } else if (kind === "text" && text) {
        await this.cdp.send("Input.insertText", { text: String(text).slice(0, 500) }, sid);
      } else if (kind === "key" && key) {
        const vk = VK[key] || 0;
        const base = { key, code: code || key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
        const isEnter = key === "Enter";
        await this.cdp.send("Input.dispatchKeyEvent", {
          type: vk ? "rawKeyDown" : "keyDown",
          ...base,
          ...(isEnter ? { text: "\r", unmodifiedText: "\r" } : {})
        }, sid);
        await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base }, sid);
      } else {
        return { ok: false, error: "Unknown input kind: " + kind };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }

  /**
   * 冻结/解冻页面动效（借鉴 stagewise / react-grab 的 page freeze）：
   * 标注时元素在跑动画会导致高亮与点击错位，先暂停动画、禁用过渡。
   */
  async freeze(on) {
    const page = await this.ensure();
    const sid = page.sessionId;
    const css = '*{animation-play-state:paused !important;transition:none !important;caret-color:transparent !important}';
    const expr = on
      ? `(() => { if (!document.getElementById('__ab-freeze')) { const st=document.createElement('style'); st.id='__ab-freeze'; st.textContent=${JSON.stringify(css)}; document.documentElement.appendChild(st);} return 'frozen'; })()`
      : `(() => { const el=document.getElementById('__ab-freeze'); if (el) el.remove(); return 'thawed'; })()`;
    const res = await this.cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true }, sid);
    return { ok: true, state: (res && res.result && res.result.value) || "" };
  }

  /**
   * 元素裁图：按元素 bounding box 用 captureScreenshot 的 clip 截一张 PNG 落盘。
   * 视觉类改动时，模型能直接“看到”要改的东西长什么样。
   */
  async crop({ x, y, n = 0, selector = "" }) {
    const page = await this.ensure();
    let el;
    if (selector) {
      const expr = `(() => {
        var node = document.querySelector(${JSON.stringify(selector)});
        if (!node) return "";
        var r = node.getBoundingClientRect();
        return JSON.stringify({ tag: node.tagName.toLowerCase(), rect: { x: r.x, y: r.y, w: r.width, h: r.height }, viewport: { w: innerWidth, h: innerHeight } });
      })()`;
      const res = await this.cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true }, page.sessionId);
      el = JSON.parse(res.result.value || "null");
      if (!el) throw new Error("Element not found: " + selector);
    } else {
      el = await this.cdp.elementAt(page.sessionId, Number(x), Number(y));
    }
    const r = el.rect || {};
    const vw = el.viewport?.w || 1280;
    const vh = el.viewport?.h || 800;
    const left = Math.max(0, Math.min(r.x, vw - 1));
    const top = Math.max(0, Math.min(r.y, vh - 1));
    const width = Math.max(8, Math.min(r.w || 8, vw - left));
    const height = Math.max(8, Math.min(r.h || 8, vh - top));
    const { data } = await this.cdp.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: left, y: top, width, height, scale: 1 },
      captureBeyondViewport: false,
      optimizeForSpeed: true
    }, page.sessionId);
    const dir = join(homedir(), ".dsh/data/dsh-sidepanel-web/crops");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${Date.now()}-${n || 1}-${el.tag || "el"}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    return { ok: true, file, data, size: { w: Math.round(width), h: Math.round(height) }, tag: el.tag };
  }

  /** 读当前页面里被选中的文字（拖拽选中后调用）。 */
  async readSelection() {
    const page = await this.ensure();
    const expr = `(() => {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) return JSON.stringify({ ok: false, text: "" });
      var text = String(sel.toString() || "").trim();
      if (!text) return JSON.stringify({ ok: false, text: "" });
      var node = sel.anchorNode;
      var el = node && node.nodeType === 3 ? node.parentElement : node;
      while (el && el.nodeType !== 1) el = el.parentElement;
      if (!el) return JSON.stringify({ ok: true, text: text });
      var r = el.getBoundingClientRect();
      var pick = function (a, n) { return a ? String(a).trim().slice(0, n) : ""; };
      var testId = el.getAttribute("data-testid") || "";
      if (!el.getAttribute("data-ab-id")) el.setAttribute("data-ab-id", "ab-" + Math.random().toString(36).slice(2, 9));
      var cls = typeof el.className === "string" ? el.className : "";
      return JSON.stringify({
        ok: true,
        text: text.slice(0, 500),
        element: {
          tag: el.tagName.toLowerCase(), id: el.id || "", classes: pick(cls, 120),
          testId: testId, abId: el.getAttribute("data-ab-id"),
          selector: '[data-ab-id="' + el.getAttribute("data-ab-id") + '"]',
          text: pick(el.innerText, 120),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          page: { url: location.href, title: document.title, route: location.pathname + location.search }
        }
      });
    })()`;
    const res = await this.cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true }, page.sessionId);
    const value = res && res.result && res.result.value;
    return value ? JSON.parse(value) : { ok: false, text: "" };
  }

  /** 标签页：列表 / 新建 / 切换 / 关闭。 */
  async tabs(action = "list", targetId = "") {
    if (action === "new") {
      const page = await this.cdp.createPage(this.homeUrl());
      this.page = page;
      await new Promise((r) => setTimeout(r, 900));
      await this.reapplyDevice({ reload: true }).catch(() => {});
      await this.restartStreamIfActive();
      this.savePageState();
      return { ok: true, tabs: await this.tabList(), active: page.targetId };
    }
    if (action === "activate" && targetId) {
      await this.cdp.send("Target.activateTarget", { targetId }).catch(() => {});
      const attached = await this.cdp.attachTarget(targetId);
      const cur = (await this.cdp.listPages()).find((p) => p.targetId === targetId);
      this.page = { ...attached, url: cur?.url || "", title: cur?.title || "" };
      await this.reapplyDevice().catch(() => {});
      await this.restartStreamIfActive();
      this.savePageState();
      return { ok: true, tabs: await this.tabList(), active: targetId };
    }
    if (action === "close" && targetId) {
      await this.cdp.send("Target.closeTarget", { targetId }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      const pages = await this.cdp.listPages();
      const next = pages.find((p) => p.targetId !== targetId) || null;
      if (next && this.page?.targetId === targetId) {
        const attached = await this.cdp.attachTarget(next.targetId);
        this.page = { ...attached, url: next.url, title: next.title };
      } else if (!next) {
        this.page = await this.cdp.createPage(this.homeUrl());
      }
      await this.restartStreamIfActive();
      return { ok: true, tabs: await this.tabList(), active: this.page?.targetId || "" };
    }
    return { ok: true, tabs: await this.tabList(), active: this.page?.targetId || "" };
  }

  /** 页面换了就重启推流，保证画面跟当前页一致（不能只靠前端重连）。 */
  async restartStreamIfActive() {
    if (!this._streaming) return;
    const opts = this._streamOpts || { fps: 15 };
    await this.stopStream();
    await this.startStream(opts);
  }

  async tabList() {
    try {
      const pages = await this.cdp.listPages();
      return pages.map((p) => ({
        targetId: p.targetId,
        url: p.url,
        title: p.title || p.url,
        active: this.page ? p.targetId === this.page.targetId : false
      }));
    } catch {
      return [];
    }
  }

  /** DevTools 式高亮：白框 + 元素浮层，和点选共用穿透规则（跳过全屏遮罩）。 */
  async hover(x, y) {
    const page = await this.ensure();
    const out = await this.cdp.highlightAt(page.sessionId, Number(x), Number(y));
    return { ok: true, ...out };
  }

  async hideHover() {
    try {
      const page = await this.ensure();
      await this.cdp.hideHighlight(page.sessionId);
    } catch {}
    return { ok: true };
  }

  /**
   * Device emulation. `preset` is one of DEVICE_PRESETS; "responsive" removes
   * every override so the viewport follows the panel again (`setViewport`).
   * The override lives on the CDP session, so it is reapplied whenever we
   * attach a new page (see reapplyDevice()).
   */
  async setDevice(preset, { reload = true } = {}) {
    const key = String(preset || "").trim() || "responsive";
    const spec = DEVICE_PRESETS[key];
    if (!spec) return { ok: false, error: `Unknown device preset: ${key}` };
    const previous = this.deviceState().preset;
    this.device = { ...spec, preset: key };
    // Back to "the viewport follows the panel": drop every override, and
    // reload once if the page was rendered for a phone/tablet UA.
    if (spec.fit) {
      try {
        const page = await this.ensure();
        const sid = page.sessionId;
        await this.cdp.send("Emulation.clearDeviceMetricsOverride", {}, sid).catch(() => {});
        await this.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false }, sid).catch(() => {});
        await this.cdp.send("Emulation.setUserAgentOverride", { userAgent: "" }, sid).catch(() => {});
        this._deviceApplied = "";
        if (previous !== "responsive") {
          await this.cdp.send("Page.enable", {}, sid).catch(() => {});
          await this.cdp.send("Page.reload", {}, sid).catch(() => {});
          await new Promise((r) => setTimeout(r, 700));
        }
        return { ok: true, device: this.deviceState() };
      } catch (error) {
        return { ok: false, error: String(error?.message || error), device: this.deviceState() };
      }
    }
    return this.reapplyDevice({ reload });
  }

  deviceState() {
    const d = this.device || {};
    return {
      preset: d.preset || "responsive",
      label: d.label || "",
      width: d.width || 0,
      height: d.height || 0,
      dpr: d.dpr || 1,
      mobile: !!d.mobile,
      touch: !!d.touch
    };
  }

  /** Install the active device override on the current page (no-op for responsive). */
  async reapplyDevice({ reload = false } = {}) {
    const d = this.device || {};
    if (d.preset === "responsive" || d.fit) return { ok: true, device: this.deviceState() };
    if (!this.cdp || !this.page) return { ok: false, error: "no page" };
    const sid = this.page.sessionId;
    // Already installed on this CDP session: /status can call this often.
    const appliedKey = `${sid}:${d.preset}`;
    if (!reload && this._deviceApplied === appliedKey) return { ok: true, device: this.deviceState() };
    try {
      await this.cdp.send("Emulation.setDeviceMetricsOverride", {
        width: d.width,
        height: d.height,
        deviceScaleFactor: d.dpr || 1,
        mobile: !!d.mobile,
        screenOrientation: { type: d.width > d.height ? "landscapePrimary" : "portraitPrimary", angle: 0 }
      }, sid);
      await this.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: !!d.touch, maxTouchPoints: 5 }, sid);
      if (d.ua) {
        await this.cdp.send("Emulation.setUserAgentOverride", {
          userAgent: d.ua,
          platform: d.platform || ""
        }, sid);
      } else {
        await this.cdp.send("Emulation.setUserAgentOverride", { userAgent: "" }, sid).catch(() => {});
      }
      // Touch capability is only visible to the page after a reload (measured),
      // and mobile sites pick their layout from the UA on the first request.
      this._deviceApplied = appliedKey;
      if (reload) {
        await this.cdp.send("Page.enable", {}, sid).catch(() => {});
        await this.cdp.send("Page.reload", {}, sid).catch(() => {});
        await new Promise((r) => setTimeout(r, 900));
      }
      return { ok: true, device: this.deviceState() };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }

  /** Backwards-compatible boolean switch: on → iPhone preset, off → responsive. */
  async setMobile(on) {
    const out = await this.setDevice(on ? "mobile" : "responsive");
    return { ...out, mobile: !!on };
  }

  /**
   * 同标签导航垫片：把 target=_blank / window.open 改成当前页跳转。
   * 用 Page.addScriptToEvaluateOnNewDocument 保证每次新文档都先装上，不等页面脚本。
   */
  async applySameTab(page) {
    const p = page || await this.ensure();
    const sid = p.sessionId;
    const shim = `(() => {
      if (window.__abSameTab) return 'ready';
      window.__abSameTab = true;
      document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"], a[target=_blank]') : null;
        if (!a || !a.href) return;
        e.preventDefault();
        e.stopPropagation();
        location.assign(a.href);
      }, true);
      document.addEventListener('submit', function (e) {
        var f = e.target;
        if (f && (f.target === '_blank' || f.target === '_new')) { f.target = '_self'; }
      }, true);
      try {
        window.open = function (url) { if (url) location.assign(String(url)); return null; };
      } catch (err) {}
      return 'installed';
    })()`;
    try {
      if (this._sameTabFor !== sid) {
        await this.cdp.send("Page.enable", {}, sid).catch(() => {});
        await this.cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: shim }, sid).catch(() => {});
        this._sameTabFor = sid;
      }
      await this.cdp.send("Runtime.evaluate", { expression: shim, returnByValue: true }, sid).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 兜底：点击/跳转后若冒出新的 target（页面绕过了垫片），把它并回当前页并关掉。
   */
  async absorbNewTabs(knownTargetId, waitMs = 1200) {
    await new Promise((r) => setTimeout(r, waitMs));
    try {
      const pages = await this.cdp.listPages();
      const extra = pages.filter((p) => p.targetId !== knownTargetId);
      if (!extra.length) return { absorbed: 0 };
      const mine = pages.find((p) => p.targetId === knownTargetId);
      let url = extra[0].url;
      if (!url || url === "about:blank") url = "";
      for (const p of extra) {
        try { await this.cdp.send("Target.closeTarget", { targetId: p.targetId }); } catch {}
      }
      if (url && mine) {
        await this.cdp.send("Page.navigate", { url }, mine.sessionId).catch(() => {});
        await new Promise((r) => setTimeout(r, 800));
        this.page = { ...this.page, url, title: this.page?.title || "" };
      }
      return { absorbed: extra.length, navigatedTo: url };
    } catch {
      return { absorbed: 0 };
    }
  }

  /** 把远端页面视口设成面板实际尺寸（避免 1280 宽的桌面页在窄侧栏里缩成一条黑边）。 */
  async setViewport(width, height, dpr = 1) {
    // A pinned device preset owns the viewport: the panel resizing must not
    // silently turn "iPhone 390×844" into "whatever the sidebar is now".
    if (this.device && this.device.preset && this.device.preset !== "responsive") {
      return { ok: true, skipped: "device", device: this.deviceState() };
    }
    const page = await this.ensure();
    const w = Math.round(Number(width));
    const h = Math.round(Number(height));
    if (!(w >= 240 && w <= 4000 && h >= 240 && h <= 4000)) return { ok: false, error: "Viewport size out of range (240-4000 px)." };
    await this.cdp.send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      // 固定 1x：dpr=2 会让每帧截图像素翻 4 倍，1.2s 一帧直接卡死面板；1x 已经够看清
      deviceScaleFactor: 1,
      mobile: false
    }, page.sessionId);
    return { ok: true, width: w, height: h };
  }

  async clearViewport() {
    try {
      const page = await this.ensure();
      await this.cdp.send("Emulation.clearDeviceMetricsOverride", {}, page.sessionId);
    } catch {}
  }

  /** 历史前进/后退/刷新（走 CDP，不是假按钮）。 */
  /** 历史前进/后退/刷新。双通道：navigateToHistoryEntry，失效再退回页面内 history.back/forward。 */
  async nav(action) {
    const page = await this.ensure();
    const sid = page.sessionId;
    const readUrl = async () => {
      try {
        const r = await this.cdp.send("Runtime.evaluate", { expression: "location.href", returnByValue: true }, sid);
        return String((r && r.result && r.result.value) || "");
      } catch {
        return "";
      }
    };
    try { await this.cdp.send("Page.enable", {}, sid); } catch {}
    const before = await readUrl();

    if (action === "reload") {
      await this.cdp.send("Page.reload", {}, sid).catch(() => {});
      await new Promise((r) => setTimeout(r, 900));
      const afterReload = await readUrl();
      this.page = { ...page, url: afterReload || before };
      return { moved: true, url: afterReload || before, action };
    }

    const hist = await this.cdp.send("Page.getNavigationHistory", {}, sid);
    const idx = hist.currentIndex;
    const target = action === "back" ? idx - 1 : idx + 1;
    if (target < 0 || target >= (hist.entries || []).length) {
      return { moved: false, url: before, action, reason: target < 0 ? "no-back" : "no-forward" };
    }
    await this.cdp.send("Page.navigateToHistoryEntry", { entryId: hist.entries[target].id }, sid).catch(() => {});
    await new Promise((r) => setTimeout(r, 900));
    let after = await readUrl();
    // 某些 Chrome 会忽略 navigateToHistoryEntry：URL 没变就用页面内 history 兜底
    if (after === before) {
      await this.cdp.send("Runtime.evaluate", {
        expression: action === "back" ? "history.back()" : "history.forward()",
        returnByValue: true
      }, sid).catch(() => {});
      await new Promise((r) => setTimeout(r, 900));
      after = await readUrl();
    }
    this.page = { ...page, url: after || before };
    return { moved: !!(after && after !== before), url: after || before, action };
  }

  async elementAt(x, y) {
    const page = await this.ensure();
    return this.cdp.elementAt(page.sessionId, x, y);
  }

  close() {
    try { this.cdp?.close(); } catch {}
    this.cdp = null;
    this.page = null;
  }

  /** 停掉我们自己拉起的那台 Chrome（外部端点不动）。 */
  async shutdown() {
    const launched = this.launched;
    this.launched = null;
    this.close();
    if (launched) await stopChrome(launched.wsUrl, launched.pid).catch(() => {});
  }

  /** 供设置页/状态接口展示。 */
  info() {
    return {
      endpoint: this.wsUrl || this.endpoint(),
      attached: !this.launched,
      launched: this.launched ? { wsUrl: this.launched.wsUrl, pid: this.launched.pid, profileDir: this.launched.profileDir } : null,
      device: this.deviceState(),
      lastError: this.lastError
    };
  }
}
