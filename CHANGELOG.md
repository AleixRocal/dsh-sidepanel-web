# Changelog

All notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **A configuration page for the plugin.** It registers into the Plugins page
  (`plugins.row.config` and `plugins.bundle.config`), detects the
  Chromium-based browsers on this machine, and — when none is found or the
  wrong one is — opens a read-only file browser (new
  `GET /api/sidepanel-web/browse`, session-gated, metadata only, executables
  filter, hidden entries skipped, list capped) to pick the executable. The
  page saves through the same override store the panel dialog uses, so both
  surfaces agree.
- **Browser settings inside the panel.** A gear button (and the connection
  error state) opens a dialog for the Chrome executable path, a CDP `ws://`
  endpoint, auto-launch and headless mode. It lists the Chromium-based
  browsers found on the machine and fills the field on click. The choice is
  written to `~/.local/state/dsh-sidepanel-web/settings.json` and layered over
  the plugin config, so a wrong path is fixable from the panel itself — the
  only practical route in packaged DSH desktop builds. Saving reconnects with
  the new settings immediately.

### Changed

- **Chrome detection covers more installs.** Beyond the macOS app bundles and
  `/usr/bin/google-chrome`, the launcher now checks Snap, Flatpak, `/opt`,
  Edge, Brave, Vivaldi and the canary/beta channels, the `PATH` entries for
  those binaries, and the `DSH_SIDEPANEL_CHROME`, `DSH_CHROME_PATH`,
  `CHROME_PATH`, `CHROME_BIN`, `GOOGLE_CHROME_SHIM` and
  `PUPPETEER_EXECUTABLE_PATH` variables. A configured path that does not exist
  is reported as such instead of silently falling back to another browser, and
  the "not found" error now lists where it looked.

## [0.4.5] — 2026-11-16

### Changed

- **The annotation block is compact.** The note is the headline, followed by
  the element, selector, page and a `file#n` pointer; HTML, computed styles,
  geometry and framework source moved into the annotation JSON. The chat stays
  readable and the agent opens the structured detail only when it needs it.
- **One image, captured from the proxied page.** The native carrier's Insert
  screenshot now loads the same proxy path as the iframe, so a dev server that
  redirects to another path or to an internal port is captured exactly as it
  renders in the panel. The renderer gets a short-lived, path-scoped cookie
  (HttpOnly, deleted after the capture) because it has no DSH browser session;
  if the proxy refuses, the direct render stays as a fallback.
- Annotation numbers in the JSON continue across sessions, so `file#n` never
  points at two annotations on the same day.

### Added

- **Redirect-aware proxy.** A page that answers `/` with `/app/`, or with a
  port hop (a container forward, a dev server on another port), is redirected
  once to the canonical proxy URL of the final page. Relative assets and the
  overlay's `__AB_TARGET__` then agree with the URL the browser actually shows.
  The target fence is re-checked on every redirect hop, and the overlay reports
  the final URL so annotations cite the page the user is looking at.

### Tests

- `test/proxy-smoke.mjs` covers path redirects, port hops, nonce preservation
  on the canonical redirect, and a redirect that tries to reach a refused host.
- `test/preview/behavior.mjs` asserts the compact block (note first, no
  HTML/styles/screenshot paths) and that the native composite carries the proxy
  path; the harness records the composite request.
- `test/composite-smoke.mjs` captures through a cookie-gated proxy fixture that
  redirects once, and checks the direct-render fallback when the proxy refuses.

## [0.4.4] — 2026-11-12

### Documentation

- Rewrote the npm and market one-line descriptions around what the plugin does
  for the agent — a Browser tab in the right sidebar that turns an element pick
  into its selector, HTML, styles, size and a pinned screenshot. The previous
  text led with carrier jargon (`CDP`, "same-origin proxy") and made the plugin
  read like a browser-automation tool; the new one says what the agent receives
  and what it can do with it. Added search keywords (`element-picker`,
  `ui-feedback`, `screenshot`, `frontend`, `web-inspector`) for market discovery.
- Added an "At a glance" block to the three READMEs: what the plugin is, what
  the agent gets, why that helps, and what it deliberately does not do (no agent
  tools, no automation).

## [0.4.2] — 2026-11-11

### Documentation

- Published the npm weekly-downloads and GitHub-stars badges in all three
  READMEs, each linked to the npm package and the repository's stargazers. The
  download badge uses npm's weekly window (`npm/dw`), the same period npm shows
  on the package page, instead of the previous monthly one.
- Republished the package so npm renders the new README; the page had been
  showing the 0.4.1 tarball, which predates the badges.

## [0.4.1] — 2026-11-09

### Documentation

- Rewrote the README around the main flow: a browser in the right sidebar, DOM
  annotations that reach the chat, what the payload contains, why a DOM
  annotation beats a screenshot, and how the two carriers work. Added the
  step-by-step "How it feels", the payload example and the image-sizing
  rationale; mirrored in the Catalan and Chinese READMEs.
- Updated the npm package description to match the README.

## [0.4.0] — 2026-11-09

### Added

- **Force native view** for a public origin, from the panel's `⋯` menu. The
  choice is remembered per origin; the proxy accepts that host only when the
  page carries the explicit `f.` token, and the panel warns that the forced
  page shares DSH's origin. The default policy is unchanged (local/dev → proxy,
  public → CDP).
- **One annotated image per Insert.** The host renders a viewport screenshot,
  re-applies every pick's pin (by selector for the native carrier, from the live
  page for CDP) and attaches that single image. DSH renders a lone image at
  240px and several images in one message as 64px squares, so this replaces the
  per-annotation crops that made annotations look tiny.

### Changed

- Annotation crops are no longer attached one by one: their paths stay in the
  text, and the first crop is the fallback image when the composite render
  fails. The composite is a fresh render for native pages, so state that lived
  only in the panel (an open modal, a half-filled form) may not appear.
- The Quick start documents the npm install route
  (`dsh plugin --profile web add dsh-sidepanel-web`) and the README links are
  npm-safe (absolute images and repository links).

### Tests

- `test/proxy-smoke.mjs` covers the forced token, the target fence and the
  token's persistence in rewritten links; `test/composite-smoke.mjs` renders a
  real Chromium page with two pins and checks the composite PNG and its grown
  viewport; `test/preview/behavior.mjs` covers the forced native carrier, the
  native Insert path and the single composite attachment.

## [0.3.1] — 2026-11-06

### Fixed

- Esc did not leave annotate mode in the CDP carrier: the handler was on the
  panel root, which never has focus while the pointer is over the screencast.
  It now listens on `window` in capture, and the native overlay forwards Esc
  from inside the proxied iframe (including after in-page navigation).
- Annotation crops were saved as a path but not shown in the chat; the composer
  now receives them as image drafts (`createDrafts` + `addAttachments`) while
  the text keeps the path for the agent.

### Documentation

- Rebuilt the README around a banner, status badges, a table of contents,
  quick start, screenshots, a carrier table, FAQ and a dedicated privacy
  section; added a full Catalan translation in `README.ca.md`.
- Added `CODE_OF_CONDUCT.md` and linked it from the README and CONTRIBUTING.
- The repository banner is generated from `test/preview/banner.html` by
  `npm run mockups`.

## [0.3.0] — 2026-11-06

### Added

- Address-bar normalisation: `example.com` opens `https://example.com/`;
  local/dev hosts (`localhost`, `*.local`, private, loopback and link-local
  addresses) use `http://`; non-web schemes are refused. The same rule is
  enforced on the host `/navigate` route and covered by `test/url-smoke.mjs`,
  which also checks the mirrored copy in the client bundle.
- Public pages are documented as a first-class carrier: any site renders in the
  host Chromium over CDP, including sites that send `X-Frame-Options`/CSP.
- Four storefront screenshots in `assets/screenshots/` and `screenshots.json`.
  They are mockups with invented data (Northwind Supply on `example.com`), not
  captures of a real session, and are reproducible via `npm run mockups`.
- Documentation and repository infrastructure: screenshot gallery, updated
  architecture diagram, `CONTRIBUTING.md`, `SECURITY.md`, issue/PR templates,
  GitHub Actions CI and Dependabot.
- Market entry draft for awesome-dsh-plugin (`market/entry.yml`).

### Changed

- README architecture, usage, configuration table and known limitations now
  describe both carriers and the automatic scheme.
- `package.json` version, exports (`./url`), package file list and scripts
  (`test`, `test:url`, `mockups`).
- Preview harness renders through the client's real EN dictionary instead of
  raw source strings, and the mock page is a fictional English storefront.
- Screenshots generated with a 1600×1000 CSS viewport at 2× (3200×2000 PNG).

### Fixed

- Native carrier address bar rejected scheme-less input while the proxy panel
  handled it; both now canonicalise through one rule.
- The preview server no longer leaks a device preset between screenshots.

## [0.2.5] — 2026-11-05

### Added

- Device emulation presets (`responsive`, `desktop`, `laptop`, `tablet`,
  `mobile`, `android`) with touch and DPR, plus `config.device`.
- `/device` route, `cdpUrl` discovery and a persistent browser profile.
- Carrier preference per origin and a native ↔ remote switch.

### Fixed

- Proxy rewriting for import maps, `data-src`, `<meta content>` URLs, script
  `src`, root-relative `fetch`, inline JS, and full proxy paths on link clicks.
- DSH session cookies are not forwarded to proxied targets.
- Correct pointer mapping with DPR and downscaled screencasts.

## [0.1.0] — 2026-11-05

### Added

- Initial right-sidebar Browser tab (`kind: "browser"`), annotation overlay,
  element picks, crops and composer insertion.
- Host-side Chromium over CDP, launcher discovery, and the first same-origin
  proxy for local/dev pages.
- English and Spanish UI.

[0.4.1]: https://github.com/AleixRocal/dsh-sidepanel-web/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/AleixRocal/dsh-sidepanel-web/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/AleixRocal/dsh-sidepanel-web/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/AleixRocal/dsh-sidepanel-web/compare/v0.2.5...v0.3.0
[0.2.5]: https://github.com/AleixRocal/dsh-sidepanel-web/compare/v0.1.0...v0.2.5
[0.1.0]: https://github.com/AleixRocal/dsh-sidepanel-web/releases/tag/v0.1.0
