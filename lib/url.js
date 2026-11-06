/**
 * URL normalisation shared by the host half and the client half.
 *
 * The client cannot import this module: it is loaded by DSH's browser
 * `__ModuleLoader__` with only a `require` for host packages, so the same
 * helpers live in lib/client.js inside `@url-helpers` markers. That copy is
 * not free-standing documentation: test/url-smoke.mjs extracts it and runs the
 * same corpus through both implementations, so drift fails the suite.
 *
 * Rules:
 *  - a missing scheme defaults to https://, except for local/dev hosts
 *    (localhost, *.localhost, *.local, loopback, private and link-local
 *    addresses), which default to http:// because dev servers rarely have TLS;
 *  - a bare `host:port` ("localhost:3000", "example.com:8443") is a host, not
 *    a scheme;
 *  - non-http(s) schemes (mailto:, file:, javascript:, data:) are rejected
 *    instead of being turned into a website;
 *  - the result is canonical (`new URL().href`), so "example.com" doubles as
 *    the address the panel actually opens.
 */

/** True for hosts that are reachable only on the local machine/dev network. */
export function isLocalUrl(raw) {
  let host = "";
  try {
    host = new URL(String(raw)).hostname.toLowerCase();
  } catch {
    return false;
  }
  host = host.replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || host === "::1" || /^f[cd][0-9a-f]{2}:/.test(host)
    || /^127\./.test(host) || /^10\./.test(host)
    || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^169\.254\./.test(host);
}

/** Canonical http(s) URL for user input, or "" when it cannot be a page. */
export function normalizeUrl(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  // Protocol-relative input ("//example.com") is a URL, not a host.
  if (s.startsWith("//")) s = "https:" + s;
  // "http:example.com" is accepted by browsers as http://example.com.
  if (/^https?:/i.test(s) && !/^https?:\/\//i.test(s)) s = s.replace(/^(https?):/i, "$1://");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (scheme && !/^https?$/i.test(scheme[1])) {
    // `localhost:3000` and `example.com:8443` are host:port, not schemes.
    const hostPort = /^[a-z0-9.-]+:\d+(?:[/?#]|$)/i.test(s);
    if (!hostPort) return "";
  }
  if (!/^https?:\/\//i.test(s)) {
    const local = isLocalUrl("https://" + s);
    s = (local ? "http://" : "https://") + s;
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    return "";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "";
  if (!u.hostname) return "";
  return u.href;
}
