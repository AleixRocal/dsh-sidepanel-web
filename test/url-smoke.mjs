/**
 * Address-bar normalisation: "example.com" becomes https://example.com/, local
 * dev hosts get http://, non-web schemes are refused. The client half cannot
 * import lib/url.js (DSH loads it through the browser ModuleLoader), so this
 * test extracts the mirrored block from lib/client.js and runs the same corpus
 * through both implementations — drift fails the suite.
 *
 *   node test/url-smoke.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLocalUrl, normalizeUrl } from "../lib/url.js";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const block = source.match(/\/\* @url-helpers-start[\s\S]*?@url-helpers-end \*\//);
assert.ok(block, "lib/client.js keeps the @url-helpers-start/end markers");
const client = new Function(`${block[0]}; return { normalizeUrl, isLocalUrl };`)();

const CASES = [
  // scheme-less input: https:// by default
  ["example.com", "https://example.com/"],
  ["example.com/path?q=1", "https://example.com/path?q=1"],
  ["  example.com  ", "https://example.com/"],
  ["HTTPS://Example.COM", "https://example.com/"],
  ["http://example.com", "http://example.com/"],
  ["example.com:8443", "https://example.com:8443/"],
  ["//example.com/x", "https://example.com/x"],
  ["http:example.com", "http://example.com/"],
  // local/dev hosts: http:// because dev servers rarely have TLS
  ["localhost:3000", "http://localhost:3000/"],
  ["localhost", "http://localhost/"],
  ["127.0.0.1:5173/x", "http://127.0.0.1:5173/x"],
  ["192.168.1.20:8080", "http://192.168.1.20:8080/"],
  ["10.0.0.5", "http://10.0.0.5/"],
  ["172.16.0.9:3000", "http://172.16.0.9:3000/"],
  ["shop.local", "http://shop.local/"],
  ["[::1]:3000", "http://[::1]:3000/"],
  // refused: not a web page
  ["mailto:dev@example.com", ""],
  ["file:///etc/passwd", ""],
  ["javascript:alert(1)", ""],
  ["data:text/html,hi", ""],
  ["ftp://example.com", ""],
  ["localhost:abc", ""],
  ["https://", ""],
  ["", ""],
  ["   ", ""]
];

for (const [input, expected] of CASES) {
  assert.equal(normalizeUrl(input), expected, `host normalizeUrl(${JSON.stringify(input)})`);
  assert.equal(client.normalizeUrl(input), expected, `client normalizeUrl(${JSON.stringify(input)})`);
}

const HOSTS = [
  ["https://localhost:3000", true],
  ["http://app.local", true],
  ["http://192.168.0.2", true],
  ["http://172.16.5.4", true],
  ["http://172.32.5.4", false],
  ["https://example.com", false],
  ["http://169.254.1.1", true]
];
for (const [input, expected] of HOSTS) {
  assert.equal(isLocalUrl(input), expected, `isLocalUrl(${input})`);
  assert.equal(client.isLocalUrl(input), expected, `client isLocalUrl(${input})`);
}

console.log("url-smoke: ok");
console.log("  https:// added for public hosts, http:// for local/dev hosts");
console.log("  host:port is not mistaken for a scheme");
console.log("  client and host copies agree on all cases");
