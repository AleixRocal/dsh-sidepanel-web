/**
 * 运行期覆盖：面板自己能改的那几项「连哪台浏览器」的设置。
 *
 * 插件 config（cordis.patch.yml / DSH 设置分区）仍是声明的唯一来源，这里只存
 * 一份叠加在上面的覆盖文件。做成文件而不是只放内存，是因为打包好的 DSH 桌面版
 * 里根本没有方便的入口改插件 config——而那正是「Chrome 没检测到」最常见的现场：
 * 用户需要就地填一个可执行文件路径，重启后还得留住。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** 只有这几项允许从面板覆盖；其余仍归插件 config。 */
export const OVERRIDE_KEYS = ["wsUrl", "cdpUrl", "chromePath", "headless", "autoLaunch", "profileDir"];

const STATE_DIR = join(homedir(), ".local/state/dsh-sidepanel-web");
export const SETTINGS_FILE = join(STATE_DIR, "settings.json");

function coerce(key, value) {
  if (key === "headless" || key === "autoLaunch") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  }
  if (typeof value !== "string") return undefined;
  return value.trim();
}

/** 读覆盖文件；坏文件/坏类型一律当没有，绝不让面板因为一个手改的 JSON 起不来。 */
export function readOverrides() {
  let raw;
  try {
    if (!existsSync(SETTINGS_FILE)) return {};
    raw = JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const key of OVERRIDE_KEYS) {
    if (!(key in raw)) continue;
    const value = coerce(key, raw[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * 合并写入：patch 里没出现的键保持原值，空字符串等于「删掉这一项」，
 * 这样面板清空输入框就能回到自动检测。
 */
export function writeOverrides(patch = {}) {
  const next = { ...readOverrides() };
  const source = patch && typeof patch === "object" ? patch : {};
  for (const key of OVERRIDE_KEYS) {
    if (!(key in source)) continue;
    const value = coerce(key, source[key]);
    if (value === undefined) continue;
    if (value === "") delete next[key];
    else next[key] = value;
  }
  try {
    mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
    writeFileSync(SETTINGS_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch {}
  return next;
}

export function clearOverrides() {
  try {
    rmSync(SETTINGS_FILE, { force: true });
  } catch {}
  return {};
}
