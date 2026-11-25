/**
 * 文件浏览器：插件设置页要能「在系统里挑出 Chrome」，而 DSH 自带的目录选择器只服务
 * workspace 流程（只能选目录），所以这里给一条只读的列目录接口。
 *
 * 边界很硬：只列目录项（名字/路径/类型/是否可执行），绝不读文件内容；只接受绝对路径；
 * 条目数量封顶；隐藏项默认不返回。调用方是 DSH 自己的 webServer 路由，走和其它路由
 * 一样的 session 准入（见 index.js 的 denied）。
 */
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

const MAX_ENTRIES = 400;
/** 桌面版里没装 Chrome 时最可能去翻的几个目录，给浏览器一个起点。 */
const STARTS = [
  "/usr/bin",
  "/usr/local/bin",
  "/opt/google/chrome",
  "/snap/bin",
  "/var/lib/flatpak/exports/bin",
  "/Applications",
  "/opt",
  join(homedir(), "Applications"),
  join(homedir(), ".local/bin")
];

const WIN_EXE = /\.(exe|cmd|bat)$/i;

/** 可执行位（Win 上看扩展名）。符号链接看好坏，坏链不算可执行。 */
function isExecutableFile(path, stats) {
  try {
    if (process.platform === "win32") return WIN_EXE.test(path);
    if (!stats.isFile() && !stats.isSymbolicLink()) return false;
    const real = statSync(path);
    if (!real.isFile()) return false;
    return (real.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** 一个目录的条目：目录在前，名字按本地化顺序排；只回元数据。 */
export function listDirectory(target, { executablesOnly = false, limit = MAX_ENTRIES } = {}) {
  const given = typeof target === "string" ? target.trim() : "";
  if (given && !isAbsolute(given)) throw new Error("path must be absolute.");
  if (given.includes("\0")) throw new Error("path is not a valid directory.");
  const path = given ? resolve(given) : homedir();

  let stats;
  try {
    stats = statSync(path);
  } catch {
    throw new Error(`not found: ${path}`);
  }
  // 指到一个可执行文件上就是「已经选好了」：回它所在的目录并把它标记出来。
  if (!stats.isDirectory()) {
    if (!isExecutableFile(path, stats)) throw new Error(`not a directory: ${path}`);
    return {
      path: dirname(path),
      parent: parentOf(dirname(path)),
      entries: [{ name: path.slice(dirname(path).length + 1), path, type: "file", executable: true, selected: true }],
      truncated: false
    };
  }

  let names;
  try {
    names = readdirSync(path);
  } catch {
    throw new Error(`not readable: ${path}`);
  }

  const entries = [];
  for (const name of names) {
    if (entries.length >= limit) break;
    if (name.startsWith(".")) continue;
    const full = join(path, name);
    let entryStats;
    try {
      entryStats = statSync(full);
    } catch {
      continue;
    }
    if (entryStats.isDirectory()) {
      entries.push({ name, path: full, type: "dir", executable: false });
      continue;
    }
    const executable = isExecutableFile(full, entryStats);
    if (executablesOnly && !executable) continue;
    entries.push({ name, path: full, type: "file", executable });
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });

  return { path, parent: parentOf(path), entries, truncated: names.length > limit };
}

function parentOf(path) {
  const up = dirname(path);
  return up === path ? null : up;
}

/** 起手位置：第一个真实存在的起点目录，否则用户 home。 */
export function startDirectory() {
  for (const path of STARTS) {
    try {
      if (statSync(path).isDirectory()) return path;
    } catch {}
  }
  return homedir();
}
