/**
 * Host-half smoke test: real service layer against a real Chromium over CDP.
 * status() -> shot() -> elementAt(300,300), plus DevToolsActivePort / page checks.
 *
 * Usage:
 *   node test/host-smoke.mjs
 *   CHROME_PATH=/path/to/chrome HOME_URL=https://example.com node test/host-smoke.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AnnotateBrowserService } from "../lib/service.js";

const CHROME = process.env.CHROME_PATH || "/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const PROFILE = join(homedir(), ".local/share/dsh-sidepanel-web/profile");
const OUT_DIR = join(homedir(), ".cache/ab-host-smoke");
const config = { chromePath: CHROME, headless: true };
if (process.env.HOME_URL) config.homeUrl = process.env.HOME_URL;
const svc = new AnnotateBrowserService({ getConfig: () => config });

const t0 = Date.now();
const out = { status: await svc.status(), msStatus: Date.now() - t0 };
const portFile = join(PROFILE, "DevToolsActivePort");
out.devtoolsActivePort = existsSync(portFile) ? readFileSync(portFile, "utf8").trim().split("\n") : null;
out.info = svc.info();

if (out.status.ok) {
  const shot = await svc.shot();
  const buf = Buffer.from(shot.data, "base64");
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `shot-${Date.now()}.jpg`);
  writeFileSync(file, buf);
  out.shot = { bytes: buf.length, magic: buf.subarray(0, 2).toString("hex"), page: shot.page, file };
  const el = await svc.elementAt(300, 300);
  out.element = {
    tag: el.tag, id: el.id, classes: el.classes, text: el.text,
    selector: el.selector, rect: el.rect, page: el.page
  };
}
out.msTotal = Date.now() - t0;
console.log(JSON.stringify(out, null, 1));
svc.close();
