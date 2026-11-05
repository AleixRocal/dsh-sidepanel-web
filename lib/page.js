/**
 * Same-origin page carrier for the iframe panel.
 *
 * The CDP browser renders the target page (its JavaScript already ran), then
 * this module returns that HTML from DSH with:
 *   - a <base> pointing at the target so CSS/images/scripts load from there;
 *   - an injected overlay that highlights elements, emits picks to the parent
 *     and draws annotation pins;
 *   - a link/window.open interceptor so navigation stays inside the panel.
 *
 * The iframe is sandboxed without allow-same-origin: the page cannot reach the
 * DSH GUI, while postMessage still carries the annotation protocol.
 */

/** Message source tag shared with the client half. */
export const OVERLAY_SOURCE = "sidepanel-web";

/** Self-contained overlay; `__NONCE__` is replaced per page load. */
const OVERLAY = String.raw`(function () {
  var SRC = "sidepanel-web";
  var NONCE = "__NONCE__";
  var ORIGIN = "__ORIGIN__";
  var active = false;
  var host = document.createElement("div");
  host.setAttribute("data-ab-overlay", "1");
  host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  root.innerHTML = '<style>' +
    '[data-ab-hl]{position:fixed;display:none;pointer-events:none;border:2px solid #2563eb;background:rgba(37,99,235,.12);box-shadow:0 0 0 9999px rgba(15,23,42,.10);border-radius:2px}' +
    '[data-ab-pin]{position:fixed;pointer-events:none;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#2563eb;color:#fff;font:600 11px/18px system-ui,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.35)}' +
    '[data-ab-tip]{position:fixed;display:none;pointer-events:none;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#111827;color:#f9fafb;border:1px solid #374151;border-radius:4px;padding:2px 6px;font:11px/16px ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 4px 12px rgba(0,0,0,.35)}' +
    '</style><div data-ab-hl></div><div data-ab-pins></div><div data-ab-tip></div>';

  function post(msg) {
    try {
      msg.source = SRC;
      msg.nonce = NONCE;
      parent.postMessage(msg, "*");
    } catch (e) {}
  }
  function mount() {
    if (!document.documentElement.contains(host)) document.documentElement.appendChild(host);
  }
  function cssEscape(v) {
    if (window.CSS && CSS.escape) return CSS.escape(v);
    return String(v).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
  function selector(el) {
    if (!el || el.nodeType !== 1) return "";
    var tid = el.getAttribute("data-testid");
    if (tid) return '[data-testid="' + tid.replace(/"/g, '\\"') + '"]';
    if (el.id) return "#" + cssEscape(el.id);
    var parts = [];
    while (el && el.nodeType === 1 && parts.length < 8) {
      var tag = el.tagName.toLowerCase();
      var parent = el.parentElement;
      if (!parent) { parts.unshift(tag); break; }
      var idx = 1;
      for (var sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (sib.tagName === el.tagName) idx += 1;
      }
      parts.unshift(tag + ":nth-of-type(" + idx + ")");
      el = parent;
    }
    return parts.join(" > ");
  }
  function payload(el) {
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    var text = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      classes: typeof el.className === "string" ? el.className : "",
      text: text,
      label: el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("title") || "",
      selector: selector(el),
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      styles: {
        display: cs.display, position: cs.position, color: cs.color,
        background: cs.backgroundColor, font: cs.font,
        padding: cs.padding, borderRadius: cs.borderRadius
      },
      html: String(el.outerHTML || "").slice(0, 600),
      page: { url: location.href, title: document.title }
    };
  }
  function setHover(el) {
    var hl = root.querySelector("[data-ab-hl]");
    var tip = root.querySelector("[data-ab-tip]");
    if (!el || el === host || !active) {
      hl.style.display = "none";
      tip.style.display = "none";
      return;
    }
    var r = el.getBoundingClientRect();
    hl.style.left = r.left + "px";
    hl.style.top = r.top + "px";
    hl.style.width = r.width + "px";
    hl.style.height = r.height + "px";
    hl.style.display = "block";

    var name = el.tagName.toLowerCase();
    if (el.id) name += "#" + el.id;
    var cls = typeof el.className === "string" ? el.className.trim() : "";
    if (cls) name += "." + cls.split(/\s+/).slice(0, 3).join(".");
    var role = el.getAttribute("role");
    tip.textContent = name + "  " + Math.round(r.width) + "×" + Math.round(r.height) + (role ? "  [" + role + "]" : "");
    tip.style.display = "block";
    var top = r.top > 26 ? r.top - 24 : r.top + r.height + 4;
    tip.style.top = Math.max(2, top) + "px";
    tip.style.left = Math.max(2, Math.min(r.left, window.innerWidth - 240)) + "px";
  }
  function onMove(e) {
    if (!active) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    setHover(el);
  }
  function onClick(e) {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host) return;
    post({ kind: "pick", payload: payload(el) });
    setHover(null);
  }
  function targetOf(href) {
    try {
      var u = new URL(href, location.href);
      var prefix = window.__AB_PREFIX__;
      if (prefix && u.pathname.indexOf(prefix + "/") === 0) {
        var rest = u.pathname.slice(prefix.length + 1);
        var slash = rest.indexOf("/");
        var path = slash === -1 ? "" : rest.slice(slash + 1);
        return (window.__AB_TARGET__ || "") + "/" + path + u.search + u.hash;
      }
    } catch (e) {}
    return href;
  }
  function onNav(e) {
    if (active) return;
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var href = targetOf(a.href);
    if (!/^https?:/i.test(href)) return;
    e.preventDefault();
    e.stopPropagation();
    post({ kind: "navigate", url: href });
  }
  function addPin(index, rect) {
    var pins = root.querySelector("[data-ab-pins]");
    var d = document.createElement("div");
    d.setAttribute("data-ab-pin", "1");
    d.style.left = Math.max(2, rect.x + rect.w - 10) + "px";
    d.style.top = Math.max(2, rect.y - 10) + "px";
    d.textContent = String(index);
    pins.appendChild(d);
  }
  function clearPins() {
    var pins = root.querySelector("[data-ab-pins]");
    if (pins) pins.innerHTML = "";
  }
  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.source !== SRC || d.nonce !== NONCE) return;
    if (d.kind === "mode") {
      active = !!d.on;
      if (!active) setHover(null);
    } else if (d.kind === "pin") {
      addPin(d.index, d.rect);
    } else if (d.kind === "clear") {
      clearPins();
    }
  }, false);
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("click", onNav, true);
  var nativeOpen = window.open;
  window.open = function (u) {
    if (u) { post({ kind: "open", url: targetOf(String(u)) }); return null; }
    return nativeOpen.apply(window, arguments);
  };
  function fixNode(n) {
    if (!n || n.nodeType !== 1) return;
    var list = [n];
    if (n.querySelectorAll) list = list.concat(Array.prototype.slice.call(n.querySelectorAll("link[href],script[src],img[src]")));
    for (var i = 0; i < list.length; i += 1) {
      var el = list[i];
      if (el.removeAttribute) el.removeAttribute("crossorigin");
      ["href", "src"].forEach(function (attr) {
        var v = el.getAttribute && el.getAttribute(attr);
        if (v && v.charAt(0) === "/" && v.charAt(1) !== "/") el.setAttribute(attr, ORIGIN + v);
      });
    }
  }
  if (window.MutationObserver) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i += 1) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j += 1) fixNode(added[j]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  mount();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
  post({ kind: "ready" });
})();`;

/** Escape a value for a double-quoted HTML attribute. */
function attr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Directory base for relative resources, derived from the final URL. */
function baseHref(finalUrl) {
  try {
    const u = new URL(finalUrl);
    return u.origin + u.pathname.replace(/[^/]*$/, "");
  } catch {
    return String(finalUrl).replace(/[^/]*$/, "");
  }
}

/** Origin of the final URL, used to absolutise root-relative assets. */
function originOf(finalUrl) {
  try {
    return new URL(finalUrl).origin;
  } catch {
    return "";
  }
}

/**
 * Rewrite root-relative asset URLs to the target origin and drop crossorigin.
 *
 * A <base> only helps document-relative URLs; `/_next/...` resolves against
 * the document origin (DSH) and 404s. The `crossorigin` attribute also turns
 * stylesheets into CORS requests the target rarely allows.
 */
function rewriteRootRelative(html, origin) {
  if (!origin) return html;
  let out = html.replace(/\s+crossorigin(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "");
  out = out.replace(/\b(href|src|action|poster|data-src)=("|')(\/(?!\/)[^"']*)\2/gi,
    (_m, name, quote, path) => `${name}=${quote}${origin}${path}${quote}`);
  out = out.replace(/\bsrcset=("|')([^"']*)\1/gi, (_m, quote, value) => {
    const rewritten = value.split(",").map((part) => {
      const bits = part.trim().split(/\s+/);
      if (bits[0] && bits[0].startsWith("/") && !bits[0].startsWith("//")) bits[0] = origin + bits[0];
      return bits.join(" ");
    }).join(", ");
    return `srcset=${quote}${rewritten}${quote}`;
  });
  out = out.replace(/url\(\s*(['"]?)(\/(?!\/)[^)'"]*)\1\s*\)/gi,
    (_m, quote, path) => `url(${quote}${origin}${path}${quote})`);
  return out;
}

/**
 * Inject the base, strip meta CSP and append the overlay script.
 * @param {string} html - Executed DOM from the CDP page.
 * @param {string} finalUrl - URL after redirects.
 * @param {string} nonce - Per-page token shared with the parent.
 * @returns {string} HTML ready to serve to the sandboxed iframe.
 */
export function overlayScript(nonce, origin) {
  const safeNonce = String(nonce).replace(/[^a-zA-Z0-9_-]/g, "");
  return `<script>${OVERLAY.replace("__NONCE__", safeNonce).replace('"__ORIGIN__"', JSON.stringify(String(origin || "")))}</script>`;
}

export function injectOverlay(html, finalUrl, nonce) {
  let out = String(html || "");
  // A meta CSP would block the inline overlay; the iframe sandbox is the fence.
  out = out.replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, "");
  out = rewriteRootRelative(out, originOf(finalUrl));
  if (!/<base\s/i.test(out)) {
    const tag = `<base href="${attr(baseHref(finalUrl))}">`;
    out = /<head[^>]*>/i.test(out)
      ? out.replace(/<head[^>]*>/i, (m) => m + tag)
      : tag + out;
  }
  const script = overlayScript(nonce, originOf(finalUrl));
  out = /<\/body>/i.test(out)
    ? out.replace(/<\/body>/i, script + "</body>")
    : out + script;
  return out;
}
