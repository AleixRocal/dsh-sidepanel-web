/**
 * 运行期覆盖冒烟：面板写的设置文件必须能读回、能清掉，且不能让一条坏 JSON
 * 把插件拖死。再确认检测顺序——显式环境变量/配置路径优先于探测出来的默认值。
 *
 * 设置文件的位置在 import 时由 homedir() 定，所以子进程里换 HOME 跑，不碰真实的
 * ~/.local/state。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "ab-settings-"));
const settingsUrl = new URL("../lib/settings.js", import.meta.url).href;
const launcherUrl = new URL("../lib/launcher.js", import.meta.url).href;

const childSource = `
import { readOverrides, writeOverrides, clearOverrides, SETTINGS_FILE } from ${JSON.stringify(settingsUrl)};
import { writeFileSync } from "node:fs";
const out = {};
out.empty = readOverrides();
out.written = writeOverrides({ chromePath: "  /opt/chrome  ", autoLaunch: false, bogus: "x" });
out.read = readOverrides();
out.file = SETTINGS_FILE;
out.merged = writeOverrides({ autoLaunch: true });
out.clearedKey = writeOverrides({ chromePath: "" });
writeFileSync(SETTINGS_FILE, "{ not json");
out.corrupt = readOverrides();
out.cleared = clearOverrides();
out.afterClear = readOverrides();
console.log(JSON.stringify(out));
`;

const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", childSource], {
  env: { ...process.env, HOME: home, XDG_STATE_HOME: "" },
  encoding: "utf8"
}));

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

check("empty when no file", Object.keys(result.empty).length === 0, result.empty);
check("trims strings", result.written.chromePath === "/opt/chrome", result.written);
check("coerces booleans", result.written.autoLaunch === false, result.written);
check("ignores unknown keys", !("bogus" in result.written), result.written);
check("reads back what it wrote", result.read.chromePath === "/opt/chrome", result.read);
check("patches without dropping the rest", result.merged.chromePath === "/opt/chrome" && result.merged.autoLaunch === true, result.merged);
check("empty string removes a key", !("chromePath" in result.clearedKey), result.clearedKey);
check("corrupt file reads as empty", Object.keys(result.corrupt).length === 0, result.corrupt);
check("clear resets everything", Object.keys(result.afterClear).length === 0, result.afterClear);
check("settings file lives under HOME", result.file.startsWith(home), result.file);

// 检测顺序：显式路径（config 或环境变量）必须赢过自动探测。
const fakeChrome = join(home, "fake-chrome");
writeFileSync(fakeChrome, "#!/bin/sh\n");
const launcher = await import(launcherUrl);
const fromEnv = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
import { findChrome, chromeCandidates } from ${JSON.stringify(launcherUrl)};
console.log(JSON.stringify({ found: findChrome(), hasEnv: chromeCandidates().some((c) => c.source.startsWith("env:") && c.exists), first: chromeCandidates()[0] }));
`], { env: { ...process.env, HOME: home, DSH_SIDEPANEL_CHROME: fakeChrome }, encoding: "utf8" }));

check("explicit env path wins", fromEnv.found === fakeChrome, fromEnv.found);
check("env candidate is reported first", fromEnv.first && fromEnv.first.path === fakeChrome, fromEnv.first);
check("candidate list marks existence", fromEnv.hasEnv, fromEnv.hasEnv);

// 写错的路径必须报「你配的这条不存在」，而不是默默换成别的浏览器。
let configuredError = "";
try {
  await launcher.launchChrome({ chromePath: join(home, "does-not-exist"), profileDir: join(home, "profile") });
} catch (error) {
  configuredError = String(error && error.message);
}
check("bad configured path is reported as such", /configured path/.test(configuredError) && configuredError.includes("does-not-exist"), configuredError);

rmSync(home, { recursive: true, force: true });

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name}`);
if (failed.length) {
  console.error(JSON.stringify(failed, null, 1));
  process.exit(1);
}
console.log("settings-smoke: ok");
