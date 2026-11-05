/**
 * 自己启动/管理一台 Chrome（不依赖任何第三方插件）。
 * 思路：--remote-debugging-port=0 + 独立 profile 目录，读 DevToolsActivePort 拿到端口与 ws 路径。
 * 无头优先（不打扰桌面）；需要人工拖滑块时可把 headless 关掉。
 */
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome-stable"
];

// Chromium's own sandbox needs unprivileged user namespaces or a setuid helper.
// Containers and sandboxed shells (Docker, Podman, bubblewrap, gVisor, CI
// runners) usually drop them: the browser then aborts with "No usable sandbox!"
// before it ever writes DevToolsActivePort — which is what the generic
// "Chrome did not expose its debugging port" timeout really means.
const NO_SANDBOX_ARGS = ["--no-sandbox", "--disable-dev-shm-usage"];
const SANDBOX_ERROR = /No usable sandbox|Failed to move to new namespace|SUID sandbox|namespace sandbox|CLONE_NEWUSER/i;

/** Container markers: when one matches, skip the doomed sandboxed attempt. */
function inContainer() {
  try {
    if (existsSync("/.dockerenv") || existsSync("/run/.containerenv")) return true;
  } catch {}
  if (process.env.container || process.env.KUBERNETES_SERVICE_HOST) return true;
  try {
    return /docker|kubepods|lxc|gvisor|containerd/i.test(readFileSync("/proc/1/cgroup", "utf8"));
  } catch {
    return false;
  }
}

export function findChrome(configured = "") {
  if (configured && existsSync(configured)) return configured;
  return CHROME_CANDIDATES.find((p) => existsSync(p)) || "";
}

export function defaultProfileDir() {
  return join(homedir(), ".local/share/dsh-sidepanel-web/profile");
}

/** DevToolsActivePort 内容：[端口, ws 路径]。 */
function readPortFile(portFile) {
  if (!existsSync(portFile)) return null;
  const lines = readFileSync(portFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  const port = Number(lines[0]);
  if (!port) return null;
  return { port, wsPath: lines[1] || `/devtools/browser` };
}

/** 启动一台 Chrome，stderr 落到 profileDir/chrome.log，便于失败时给出真正原因。 */
function spawnChrome(bin, args, profileDir) {
  const logFile = join(profileDir, "chrome.log");
  let fd = -1;
  try { fd = openSync(logFile, "w"); } catch { fd = -1; }
  const child = spawn(bin, args, { detached: true, stdio: ["ignore", "ignore", fd >= 0 ? fd : "ignore"] });
  if (fd >= 0) { try { closeSync(fd); } catch {} }
  child.unref();
  return { child, logFile };
}

/** 等端口文件出现且 /json/version 可用；进程提前退出则立刻失败，不空等整个超时。 */
async function waitForPort(portFile, child, deadline) {
  let exited = false;
  const markExited = () => { exited = true; };
  child.once("exit", markExited);
  child.once("error", markExited);
  while (Date.now() < deadline) {
    const got = readPortFile(portFile);
    if (got && await probe(`http://127.0.0.1:${got.port}/json/version`)) return got;
    if (exited) return null;
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

function readLogTail(logFile, max = 4000) {
  try {
    const text = readFileSync(logFile, "utf8");
    return text.length > max ? text.slice(-max) : text;
  } catch {
    return "";
  }
}

/** 从 Chrome 的 stderr 里挑一行最能说明问题的。 */
function firstDiagnostic(log) {
  if (!log) return "";
  const lines = log.split("\n").map((l) => l.trim()).filter(Boolean);
  const hit = lines.find((l) => /FATAL|No usable sandbox|ERROR/i.test(l));
  return (hit || lines[0] || "").slice(0, 300);
}

/**
 * 启动一台 Chrome 并返回 { wsUrl, httpUrl, pid, profileDir }。
 * 已有同 profile 的实例在跑时，直接复用（读它写下的 DevToolsActivePort）。
 */
export async function launchChrome({
  chromePath = "",
  profileDir = defaultProfileDir(),
  headless = true,
  timeoutMs = 20000,
  extraArgs = []
} = {}) {
  const bin = findChrome(chromePath);
  if (!bin) throw new Error("Chrome not found. Set chromePath in the settings.");
  mkdirSync(profileDir, { recursive: true });
  const portFile = join(profileDir, "DevToolsActivePort");

  const existing = readPortFile(portFile);
  if (existing) {
    // 端口还在监听就当作可复用
    const alive = await probe(`http://127.0.0.1:${existing.port}/json/version`);
    if (alive) {
      return {
        wsUrl: `ws://127.0.0.1:${existing.port}${existing.wsPath}`,
        httpUrl: `http://127.0.0.1:${existing.port}`,
        pid: 0,
        profileDir,
        reused: true
      };
    }
  }

  const args = [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--remote-allow-origins=*",
    "--window-size=1280,900",
    `--user-data-dir=${profileDir}`,
    "--remote-debugging-port=0",
    "--no-startup-window",
    ...(headless ? ["--headless=new"] : []),
    ...extraArgs
  ];

  // 容器里先带 --no-sandbox；其它环境先按默认沙箱启动，只有 Chromium 明说
  // 沙箱不可用时才降级重试一次（这样不会掩盖「缺库 / 崩溃」等别的原因）。
  let sandboxArgs = inContainer() ? [...NO_SANDBOX_ARGS] : [];
  const deadline = Date.now() + timeoutMs;
  let lastLog = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    rmSync(portFile, { force: true });
    const { child, logFile } = spawnChrome(bin, [...args, ...sandboxArgs], profileDir);
    const got = await waitForPort(portFile, child, deadline);
    if (got) {
      const httpUrl = `http://127.0.0.1:${got.port}`;
      return { wsUrl: `ws://127.0.0.1:${got.port}${got.wsPath}`, httpUrl, pid: child.pid, profileDir, reused: false };
    }
    lastLog = readLogTail(logFile);
    try { process.kill(child.pid, "SIGTERM"); } catch {}
    if (attempt === 0 && sandboxArgs.length === 0 && SANDBOX_ERROR.test(lastLog)) {
      sandboxArgs = [...NO_SANDBOX_ARGS];
      continue;
    }
    break;
  }

  const detail = firstDiagnostic(lastLog);
  throw new Error(
    `Chrome did not expose the debugging port within ${timeoutMs} ms (profile: ${profileDir})${detail ? `: ${detail}` : ""}`
  );
}

async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** 优雅关闭：先 Browser.close，再补 SIGTERM。 */
export async function stopChrome(wsUrl, pid) {
  try {
    if (wsUrl && typeof WebSocket === "function") {
      const ws = new WebSocket(wsUrl);
      await new Promise((resolve) => {
        const done = () => resolve();
        ws.addEventListener("open", () => { try { ws.send(JSON.stringify({ id: 1, method: "Browser.close" })); } catch {} setTimeout(done, 300); }, { once: true });
        ws.addEventListener("error", done, { once: true });
        setTimeout(done, 1500);
      });
    }
  } catch {}
  try { if (pid) process.kill(pid, "SIGTERM"); } catch {}
}
