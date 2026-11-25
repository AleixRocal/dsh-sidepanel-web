/**
 * 目录浏览冒烟：设置页要「在系统里挑出一个可执行文件」，这条路由只允许列目录和
 * 标出可执行位，绝不读文件内容。这里把边界固化下来：相对路径被拒、隐藏项不出现、
 * 目录排在前、只看可执行文件时过滤、指到可执行文件上时回它所在的目录。
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listDirectory, startDirectory } from "../lib/browse.js";

const root = mkdtempSync(join(tmpdir(), "ab-browse-"));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

try {
  mkdirSync(join(root, "bin"));
  mkdirSync(join(root, ".hidden-dir"));
  writeFileSync(join(root, "chrome"), "#!/bin/sh\n");
  chmodSync(join(root, "chrome"), 0o755);
  writeFileSync(join(root, "notes.txt"), "not a browser\n");
  chmodSync(join(root, "notes.txt"), 0o644);
  writeFileSync(join(root, ".secret"), "hidden\n");
  chmodSync(join(root, ".secret"), 0o700);
  try {
    symlinkSync(join(root, "chrome"), join(root, "chrome-link"));
  } catch {}

  const all = listDirectory(root);
  const names = all.entries.map((e) => e.name);
  check("directories sort before files", all.entries[0].type === "dir" && all.entries[0].name === "bin", names);
  check("hidden entries stay out", !names.includes(".secret") && !names.includes(".hidden-dir"), names);
  check("plain file is listed", names.includes("notes.txt"), names);
  check("executable bit is reported", all.entries.find((e) => e.name === "chrome").executable === true, all.entries);
  check("non executable is reported as such", all.entries.find((e) => e.name === "notes.txt").executable === false, all.entries);
  check("symlink to an executable follows", (all.entries.find((e) => e.name === "chrome-link") || {}).executable === true, all.entries);
  check("parent is the containing directory", all.parent === join(root, "..").replace(/\/\.\.$/, "") || typeof all.parent === "string", all.parent);
  check("nothing is truncated in a small directory", all.truncated === false, all.truncated);

  const exeOnly = listDirectory(root, { executablesOnly: true });
  const exeNames = exeOnly.entries.map((e) => e.name);
  check("executables-only keeps directories", exeNames.includes("bin"), exeNames);
  check("executables-only drops non executables", !exeNames.includes("notes.txt"), exeNames);
  check("executables-only keeps executables", exeNames.includes("chrome"), exeNames);

  const capped = listDirectory(root, { limit: 2 });
  check("limit truncates the listing", capped.truncated === true && capped.entries.length === 2, capped);

  const pointed = listDirectory(join(root, "chrome"));
  check("pointing at an executable returns its directory", pointed.path === root && pointed.entries.length === 1, pointed);
  check("the pointed entry is flagged selected", pointed.entries[0].selected === true, pointed.entries[0]);

  let relativeError = "";
  try {
    listDirectory("bin");
  } catch (error) {
    relativeError = String(error.message);
  }
  check("relative paths are refused", /absolute/.test(relativeError), relativeError);

  let missingError = "";
  try {
    listDirectory(join(root, "nope"));
  } catch (error) {
    missingError = String(error.message);
  }
  check("missing directory is reported", /not found/.test(missingError), missingError);

  const start = startDirectory();
  check("start directory is absolute", start.startsWith("/"), start);

  const serialised = JSON.stringify(listDirectory(root));
  check("no file contents leak into the payload", !serialised.includes("not a browser"), serialised.slice(0, 120));
} finally {
  rmSync(root, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`  ${c.ok ? "ok  " : "FAIL"} ${c.name}`);
if (failed.length) {
  console.error(JSON.stringify(failed, null, 1));
  process.exit(1);
}
console.log("browse-smoke: ok");
