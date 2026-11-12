# Changelog

All notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
