<p align="center">
  <img src="https://raw.githubusercontent.com/AleixRocal/dsh-sidepanel-web/main/assets/banner.png" alt="dsh-sidepanel-web — a browser in the DSH right sidebar with DOM annotations that reach the chat" width="100%">
</p>

<p align="center">
  <strong>A browser in the DSH right sidebar — annotate any page in its DOM and send the annotation to the chat.</strong>
</p>

<p align="center">
  <a href="https://github.com/AleixRocal/dsh-sidepanel-web/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/AleixRocal/dsh-sidepanel-web/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/AleixRocal/dsh-sidepanel-web/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/AleixRocal/dsh-sidepanel-web?sort=semver&label=release&display_name=tag"></a>
  <a href="https://www.npmjs.com/package/dsh-sidepanel-web"><img alt="npm package" src="https://img.shields.io/npm/v/dsh-sidepanel-web"></a>
  <a href="https://www.npmjs.com/package/dsh-sidepanel-web"><img alt="npm downloads per week" src="https://img.shields.io/npm/dw/dsh-sidepanel-web"></a>
  <a href="https://github.com/AleixRocal/dsh-sidepanel-web/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/AleixRocal/dsh-sidepanel-web"></a>
  <a href="https://github.com/AleixRocal/dsh-sidepanel-web/pkgs/npm/dsh-sidepanel-web"><img alt="GitHub Packages" src="https://img.shields.io/badge/GitHub%20Packages-mirror-24292f?logo=github"></a>
  <a href="https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/AleixRocal/dsh-sidepanel-web"></a>
  <img alt="DSH 0.2.1-rc.2 to 0.3" src="https://img.shields.io/badge/DSH-0.2.1--rc.2%20%E2%86%92%200.3-4f46e5">
  <img alt="Node 22.19+" src="https://img.shields.io/badge/node-%E2%89%A522.19-339933?logo=nodedotjs&logoColor=white">
  <a href="https://github.com/awesome-dsh-plugin/awesome-dsh-plugin"><img alt="Market: listed" src="https://img.shields.io/badge/market-listed-2ea44f"></a>
</p>

<p align="center">
  English · <a href="https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/README.ca.md">Català</a> · <a href="https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/README.zh.md">中文</a>
</p>

`dsh-sidepanel-web` adds a **Browser** tab to the right sidebar of DeepSeek Harness Web. It is a real browser next to your conversation, and it can turn any element on the page into a precise message for the agent.

Pick the button, field or card you are talking about, write what should change, and insert it. The message carries the element's selector, its text, an HTML excerpt, its computed styles, its size and position, and one screenshot with the annotation pinned. The agent no longer has to guess which element you mean — and you no longer have to describe it with coordinates or a pile of screenshots.

**At a glance**

- **What it is:** a DSH Web plugin that adds a **Browser** tab to the right sidebar.
- **What the agent gets:** the element's selector, tag, id and classes, an HTML excerpt, the CSS that applies (computed styles), its size and position, the page URL, your note, and one screenshot with the pick pinned.
- **Why it helps:** the agent can find the component in the code and make the change, instead of guessing from pixels or from “the blue button at the bottom”.
- **What it does not do:** it adds no agent tools and runs no automation. You still drive the browser and send the message.

**Source:** [github.com/AleixRocal/dsh-sidepanel-web](https://github.com/AleixRocal/dsh-sidepanel-web) · **Package:** [npmjs.com/package/dsh-sidepanel-web](https://www.npmjs.com/package/dsh-sidepanel-web)

> [!TIP]
> **Two carriers, one flow.** Pages you build — `localhost`, `*.local`, private IPs, self-signed dev servers — go through a same-origin proxy and stay fully interactive. Public pages are rendered by a real Chromium on the host over CDP, so `X-Frame-Options` and CSP cannot block them. The panel chooses automatically; the switch is one click away.

![DSH Web with the Browser panel open next to a conversation](https://raw.githubusercontent.com/AleixRocal/dsh-sidepanel-web/main/assets/screenshots/01-browser-panel.png)

<p align="center"><em>Mockup screenshots: the storefront, conversation and URLs are invented. No real account or customer data is shown.</em></p>

## Table of contents

- [How it feels](#how-it-feels)
- [What reaches the chat](#what-reaches-the-chat)
- [Why annotate in the DOM](#why-annotate-in-the-dom)
- [The two carriers](#the-two-carriers)
- [Features](#features)
- [Quick start](#quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [FAQ](#faq)
- [Screenshots](#screenshots)
- [Screenshots and privacy](#screenshots-and-privacy)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Development](#development)
- [Changelog](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/CHANGELOG.md)
- [Market](#market)
- [Contributing](#contributing)
- [Credits](#credits)
- [License](#license)

## How it feels

1. **Open the page.** Expand the right sidebar and choose **Browser**. Type `localhost:5173`, `shop.local` or `example.com` — the scheme is added for you (`http://` for local hosts, `https://` for public ones).
2. **Point at the element.** Click **Annotate**, hover the page, and click the button, field or card you mean. A note card shows what you picked. Write what should change: *make this primary action sticky on mobile*, *this field should be required*, *match this card to the design*.
3. **Send it to the chat.** Choose **Add to list** to keep annotating, then **Insert**. The composer receives the annotation text and one annotated screenshot. Send it to the agent.

No coordinates and no “the blue button at the bottom”. The annotation names the element, shows where it lives, and carries the note that says what you want.

## What reaches the chat

Each annotation is one block of text, followed by one image with every pick pinned:

```text
[Annotation 1] button#save.primary
· Selector: #save
· Text: Save changes
· HTML: <button id="save" class="btn primary" type="button">Save changes</button>
· Styles: display=inline-block; position=static; color=rgb(255, 255, 255); background=rgb(37, 99, 235); font=…; padding=12px 20px; radius=8px
· Position: 132×40 @ (24, 680)
· Page: Settings https://localhost:5173/settings
· Note: Make this primary action sticky on mobile
· Screenshot: ~/.dsh/data/dsh-sidepanel-web/crops/…
```

- **The text is a pointer the agent can follow.** It gets the element's identity (tag, id, classes, selector), an HTML excerpt, the computed styles that usually matter (display, position, colors, font, padding, radius), the element's size and position, the page URL and title, and your note. It can use the selector and the HTML to find the component in the code, and the styles and position to reason about the layout.
- **The image is the context.** Insert captures one viewport screenshot with every pick numbered and outlined. DSH shows a lone image at 240px on its long edge (and several images in one message as 64px squares), so one image per Insert is deliberate: you see the page, the pins and what surrounds them, and you can open the original full size.
- **Several picks, one message.** Add as many elements as you need to the list; Insert sends all the annotation blocks plus a single image with all the pins.

## Why annotate in the DOM

A screenshot shows what the page looks like. A DOM annotation says what the element *is*.

| Only a screenshot | A DOM annotation |
| --- | --- |
| The agent sees pixels and guesses which element you mean. | The agent gets the tag, id, classes, selector and an HTML excerpt. |
| You describe the location in words. | The agent gets computed styles, size and position. |
| The visual context is clear. | The visual context is still there, with numbered pins. |

Both matter. The image tells the agent where the element sits and what surrounds it; the DOM payload tells it what the element is, so it can find the code, make the change, and reason about the layout without a round of “which button?”. The note adds intent — what you want changed, not just what exists.

## The two carriers

The panel can render a page in two ways. You normally do not need to think about it: the choice follows the URL and is remembered per origin.

| URL | Carrier | What it gives you |
| --- | --- | --- |
| `localhost`, `*.localhost`, `*.local`, private/loopback/link-local IPs | **Native** — same-origin proxy | The real page and its DOM, fully interactive, with the annotation overlay; self-signed certificates are accepted; cookies live in a per-origin host jar. |
| Any other `http(s)` page | **Remote** — CDP | A real Chromium on the host renders the page; frames and input are streamed into the panel. Works with `X-Frame-Options`, CSP and logins from the browser profile. |

**Native carrier.** DSH fetches the page, rewrites its URLs and injects a small shim plus the annotation overlay, so the page is same-origin with DSH and can be inspected and clicked like a normal tab. HTML, CSS, JS, images and API calls stay on the proxy; `fetch`, `XMLHttpRequest`, `history.pushState`/`replaceState` and `window.open` are kept on it; `<script type="importmap">` URLs are rewritten; `data-action="family"`-style action names are left alone. WebSockets/HMR are not proxied.

**Remote carrier.** The host Chromium loads the page for real and streams frames into the panel; clicks, wheel, typing and drags are forwarded. It is the carrier for public sites, pages that refuse to be framed, and sites behind a login.

**Switching.** The native view has a **Remote view (CDP)** button. The remote view offers **Native view (proxy)** for local hosts and **Force native view (unsafe)** for any other origin, remembered per origin. Forcing a public page through the proxy shares DSH's origin with that page — only do it for sites you trust.

## Features

**In the sidebar**

- **A real browser tab** (`kind: "browser"`), so the chat's “open link in sidebar” preference lands here; `params.url` is navigated on arrival.
- **Automatic address-bar scheme.** `example.com` becomes `https://example.com/`; `shop.local:5173`, `127.0.0.1:5173` or `192.168.1.20:8080` use `http://`. Non-web schemes (`mailto:`, `file:`, `javascript:`, `data:`) are refused.
- **Bring your own browser.** Point `cdpUrl`/`wsUrl` at any Chrome started with `--remote-debugging-port`, let the plugin discover one, or let it launch its own with a persistent profile.
- **Device emulation.** Responsive (fits the panel), desktop 1280×800, laptop 1440×900, tablet 768×1024 (iPad UA), phone 390×844 (iPhone UA) and Android 412×915, with touch and matching `devicePixelRatio`.
- **English and Spanish UI** through `ctx.locale`; other locales fall back to English.

**Annotating**

- **Hover inspector:** `tag#id.class  240×44  [role]`, so you can see what you are about to pick.
- **Element pick** with selector, text, classes, an HTML excerpt, computed styles, size/position and page URL.
- **Numbered pins and notes.** Keep several picks in the list, then insert them together.
- **Composer hand-off** with `InputActions.insertText`, so the annotation is added at the caret without replacing your draft.
- **One annotated image** per Insert, with every pick pinned — not one tiny crop per element.
- **Esc leaves annotate mode** from the page or the toolbar; an open note card closes first.

## Quick start

### Requirements

- DSH **0.2.1-rc.2** or newer, below `0.3.0` (Web profile).
- Node.js **22.19+**.
- A Chromium-based browser on the host. The plugin auto-detects Chrome/Chromium; the Playwright Chromium cache also works.

### Install

```bash
# from npm
dsh plugin --profile web add dsh-sidepanel-web

# from GitHub
dsh plugin --profile web add github:AleixRocal/dsh-sidepanel-web

# or from a local clone, while developing
git clone https://github.com/AleixRocal/dsh-sidepanel-web
dsh plugin --profile web add link:/absolute/path/to/dsh-sidepanel-web
```

Restart `dsh web` once and refresh the GUI. The **Browser** tab appears in the right-sidebar guide.

A scoped copy (`@aleixrocal/dsh-sidepanel-web`) is also published to [GitHub Packages](https://github.com/AleixRocal/dsh-sidepanel-web/pkgs/npm/dsh-sidepanel-web); the canonical package is the npmjs one. Installing the mirror needs a token with `read:packages` and `@aleixrocal:registry=https://npm.pkg.github.com`.

### First page

1. Expand the right sidebar and choose **Browser**.
2. Type `example.com` and press **Enter**. The panel opens `https://example.com/`; the scheme is added for you.
3. Click **Annotate**, hover the page, click an element, write the note and choose **Insert**.

> [!NOTE]
> If no browser is found on the usual CDP ports, the plugin launches a dedicated headless Chromium with a persistent profile. Set `chromePath` only when auto-detection misses your binary.

### Use your own browser

To reuse the browser you already run (same cookies and logins), expose its CDP port and point the plugin at it — no separate install:

```sh
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/chrome-dsh" &
```

```yaml
- id: dsh-sidepanel-web
  config:
    cdpUrl: http://127.0.0.1:9222   # or wsUrl: ws://127.0.0.1:9222/devtools/browser/…
```

Chrome 136+ refuses `/json/version` on the default profile, hence the separate `--user-data-dir`. Without `cdpUrl`/`wsUrl` the plugin probes 9222–9225 and 9333, then `~/.local/state/dsh-sidepanel-web/browser.json`, then the ego bridge file.

## Usage

1. Open a session, expand the right sidebar, and choose **Browser**.
2. Enter a URL in the address bar.
   - `example.com` → `https://example.com/` (scheme added for you).
   - `localhost:3000`, `shop.local`, `192.168.1.20:8080` → `http://`, because local dev servers rarely have TLS.
   - A local/dev host is proxied through DSH and stays fully interactive; a public host is rendered by the host Chromium and streamed into the panel.
3. Click **Annotate** and hover the page. The inspector shows the element type and size.
4. Click the element, write the note, and choose **Add to list**. Repeat for every element you want to include.
5. Choose **Insert** to place the annotations and the annotated image in the composer; send the message.
6. Use the **⋯** menu for device presets, to clear pins, or to switch between **Native view (proxy)** and **Remote view (CDP)**. The choice is remembered per origin.

| URL | Carrier | Why |
| --- | --- | --- |
| `example.com`, any public site | CDP screencast | Works even when the site sends `X-Frame-Options`/CSP. |
| `localhost`, `*.local`, private/loopback/link-local IPs | Same-origin proxy | Native rendering, DOM access and annotation without a screencast. |

## Configuration

Set options in the profile patch, under the plugin's row:

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: dsh-sidepanel-web
  config:
    chromePath: /path/to/chrome
    headless: true
```

| Key | Default | Meaning |
| --- | --- | --- |
| `chromePath` | auto-detect | Absolute path to a Chromium-based browser. |
| `headless` | `true` | Launch the host browser without a window. |
| `autoLaunch` | `true` | Start a browser when no CDP endpoint is available. |
| `wsUrl` | empty | Explicit CDP endpoint (`ws://127.0.0.1:port/devtools/browser/…`). |
| `cdpUrl` | empty | HTTP debugging endpoint of an existing browser, e.g. `http://127.0.0.1:9222`; resolved through `/json/version`. |
| `profileDir` | `~/.local/share/dsh-sidepanel-web/profile` | Browser profile directory (persistent: logins survive restarts). |
| `homeUrl` | `https://www.deepseek.com` | First page when the browser starts. |
| `device` | `responsive` | Emulation preset: `responsive`, `desktop`, `laptop`, `tablet`, `mobile`, `android`. |
| `pollMs` | `1200` | Screenshot polling interval for the legacy stream mode. |
| `quality` | `82` | JPEG quality for the legacy stream mode. |
| `streamMode` | `screencast` | `screencast` or `poll` (legacy stream mode). |
| `streamFps` | `15` | Frame-rate cap for the legacy stream mode. |

## How it works

```text
DSH Web GUI
  └─ Browser tab (sidebar.right.pane.tab)
       ├─ Carrier A · native (local/dev)
       │    proxy iframe ──► /api/sidepanel-web/p/<origin>/<path>
       │                         └─ rewriting proxy (HTML/CSS/JS/API)
       │                              └─ overlay: element pick → note → composite image
       └─ Carrier B · remote (any page)
            CDP Chromium (host) ──► screencast frames + forwarded input
                 └─ same panel, same annotation flow

  annotations + one pinned screenshot ──► composer (InputActions.insertText)
```

The **host half** owns the Chromium, the proxy, the screenshots and the composite render; the **client half** is the tab you see. The native carrier keeps the page same-origin so the overlay can read its DOM and you can click it; the remote carrier streams a real browser and forwards your input. Both feed the same annotation payload, so the chat does not care which carrier you used.

On **Insert**, the host renders one viewport screenshot, re-applies every pick's pin (by selector for a native page, from the live page for CDP) and returns a single PNG. If that render fails, the first element crop is attached instead, so the message always has one image and all the text.

- **Host half** (`lib/index.js`, `lib/service.js`, `lib/cdp.js`, `lib/launcher.js`): routes, Chromium lifecycle, CDP, screenshots, crops, composite render.
- **Proxy** (`lib/proxy.js`): fetches local/dev pages, rewrites URLs, injects the shim and overlay, keeps a per-origin cookie jar.
- **Page/overlay** (`lib/page.js`): rendered-page carrier and the annotation overlay.
- **URL rules** (`lib/url.js`): scheme detection shared with the client (mirrored inside `lib/client.js` and enforced by `test/url-smoke.mjs`).
- **Client half** (`lib/client.js`): the sidebar tab, address bar, native/remote carriers, annotation note card, composer insertion, EN/ES dictionaries.

A deeper write-up of the DSH Web integration (slots, tab registry, carriers, browser discovery) is in [`docs/browser-integration.md`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/docs/browser-integration.md) (Catalan).

## FAQ

<details>
<summary><strong>I typed <code>example.com</code> and it opened <code>https://example.com/</code>. Can I force <code>http://</code>?</strong></summary>

Yes — type the scheme explicitly (`http://example.com`). Local/dev hosts (`localhost`, `*.local`, private, loopback and link-local addresses) already default to `http://` because dev servers rarely have TLS. Non-web schemes are rejected.
</details>

<details>
<summary><strong>The public page shows a connection error or refuses to load.</strong></summary>

Public pages use the CDP carrier, not an iframe, so `X-Frame-Options` is not the cause. Check that the host Chromium is running and reachable (`cdpUrl`/`wsUrl` or the auto-launch), and that the host has network access to the site. The panel's status line names the CDP error.
</details>

<details>
<summary><strong>Can I force the native view for a public site?</strong></summary>

Yes, explicitly: open the site, click the **⋯** menu and choose **Force native view (unsafe)**. The choice is remembered per origin, so every later tab to that origin opens in the native carrier, and the page becomes proxied and annotatable like a local one. Only do it for sites you trust: the proxied page shares DSH's origin and can read the panel DOM and call the DSH API with your session. The default policy is unchanged — local/dev goes native, public goes to CDP.
</details>

<details>
<summary><strong>Why does the chat show one image instead of a crop per annotation?</strong></summary>

Because DSH sizes images by how many arrive together: a lone image is shown at 240px on its long edge and is never upscaled past its natural size, while several images in one message become 64px squares. A crop of a small button would look tiny either way. Insert therefore sends one viewport screenshot with every pick pinned, and keeps each element's crop path in the text.
</details>

<details>
<summary><strong>The local page is blank in the native view.</strong></summary>

The rewriting proxy drives most apps, but WebSockets/HMR are not proxied and some heavy JavaScript apps need a real browser. Use **Remote view (CDP)** for that site; the choice is remembered per origin.
</details>

<details>
<summary><strong>Chrome 136+ refuses to expose <code>/json/version</code>.</strong></summary>

Start it with a separate profile: `--user-data-dir="$HOME/.config/chrome-dsh"`. The default profile is protected from CDP since Chrome 136.
</details>

<details>
<summary><strong>Where are cookies and logins stored?</strong></summary>

The plugin's own Chromium uses the persistent `profileDir` (`~/.local/share/dsh-sidepanel-web/profile` by default). When you point it at your own browser via `cdpUrl`/`wsUrl`, that browser keeps its own profile and cookies.
</details>

<details>
<summary><strong>Does it work in DSH Desktop?</strong></summary>

No. This is a Web-profile plugin; DSH Desktop uses an Electron `<webview>` and a different profile.
</details>

<details>
<summary><strong>Can I annotate cross-origin iframes or closed shadow DOM?</strong></summary>

Only their container. The overlay cannot pierce a cross-origin frame or a closed shadow root.
</details>

<details>
<summary><strong>How are the screenshots generated, and is any real data used?</strong></summary>

With `npm run mockups`, from the real client and a mock backend. Every image uses invented content (fictional storefront, reserved `example.com`, invented conversation); no real DSH window, account, customer, file path or token is captured. See [Screenshots and privacy](#screenshots-and-privacy).
</details>

## Screenshots

| | |
| --- | --- |
| ![Annotating the place-order button](https://raw.githubusercontent.com/AleixRocal/dsh-sidepanel-web/main/assets/screenshots/02-annotate.png) | ![Phone emulation preset](https://raw.githubusercontent.com/AleixRocal/dsh-sidepanel-web/main/assets/screenshots/03-devices.png) |
| **Pick, note, send.** The pin lands on the element and the note card prepares the composer payload. | **Device emulation.** Desktop, laptop, tablet, iPhone and Android with touch and DPR. |

![How the two carriers and the annotation path work](https://raw.githubusercontent.com/AleixRocal/dsh-sidepanel-web/main/assets/screenshots/04-how-it-works.png)

<p align="center"><em>The diagram: a local/dev page through the same-origin proxy, a public page through CDP, and both feeding the same annotation payload.</em></p>

All screenshots are mockups generated from [`test/preview/shell.html`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/test/preview/shell.html) and [`test/preview/diagram.html`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/test/preview/diagram.html): the panel is the real client, the storefront is the fictional **Northwind Supply** on the reserved `example.com` domain, and no real account, page or customer data is used. See [Screenshots and privacy](#screenshots-and-privacy).

## Screenshots and privacy

Screenshots are part of the deliverable, so they follow a hard rule: **no real user data**.

- The panel is the real `lib/client.js`; the shell around it (conversation, workspace, session) is static HTML in [`test/preview/shell.html`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/test/preview/shell.html).
- The storefront is **Northwind Supply**, a fictional shop on the reserved `example.com` domain.
- No real DSH window, account, page, customer, file path or token appears in any image.
- [`screenshots.json`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/screenshots.json) declares the four storefront images for plugin marketplaces.
- Regenerate with `npm run mockups`; the banner is rendered from [`test/preview/banner.html`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/test/preview/banner.html).

## Security

- Every host route calls `connection.requestRejection(req)`; the web server is loopback-bound.
- The rewriting proxy only accepts **local/dev hosts** (localhost, `*.local`, private, loopback and link-local ranges). Public URLs are refused and handled by the CDP carrier, unless the origin was explicitly forced into the native view.
- The native iframe runs sandboxed (`allow-scripts allow-forms allow-same-origin allow-popups` for local proxy pages). `allow-same-origin` is required for the proxy document to keep its cookies and APIs; it also means a proxied page shares the DSH origin. Only proxy pages you trust.
- **Force native view is an explicit override.** It lets a public origin through the same-origin proxy; that page then shares the DSH origin (DOM, cookies, API calls). The default policy still refuses public hosts. Only force sites you trust.
- The host browser uses a dedicated profile and ignores certificate errors for local self-signed dev servers. The CDP carrier has the capabilities of the browser you point it at.
- Annotation text and page content are treated as untrusted data by the agent.
- Report vulnerabilities privately through [SECURITY.md](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/SECURITY.md); do not open a public issue.

## Known limitations

- **Web only.** DSH Desktop uses Electron `<webview>` and a different profile; this plugin does not replace it.
- **The proxy is local/dev only by default.** Public sites are not proxied; they run in the CDP browser. **Force native view** is the deliberate per-origin override, with the same-origin warning above.
- **WebSocket/HMR is not proxied** in the native carrier. Dev servers still serve the page, but hot reload may not work; switch to the CDP view for HMR.
- **Cookies** in the native carrier live in a per-origin host jar; some login flows may still fail. The CDP carrier uses the browser's own profile.
- **Cross-origin iframes and closed shadow DOM** cannot be annotated; only their container.
- **The annotated image is a fresh render on the host** (a 1200px-wide viewport that grows to fit the picks, or the live CDP page), so state that lived only in the panel — an open modal, a half-filled form — may not appear. The text keeps every pick, its HTML excerpt and its crop path.
- **CDP latency** depends on the host and the page; the screencast caps at 15 fps by default.
- **Alpha:** APIs and behaviour may change.

## Development

```text
lib/
  index.js        host plugin: routes, settings, proxy registration
  service.js      CDP service: status, navigation, screenshots, crop, composite
  cdp.js          zero-dependency CDP client
  launcher.js     Chromium discovery/launch (container-safe, cert errors ignored)
  page.js         rendered-page carrier + annotation overlay
  proxy.js        local/dev rewriting reverse proxy
  url.js          address-bar normalisation (mirrored in client.js)
  client.js       sidebar tab, carriers, overlay bridge, composer
assets/           icon.svg, icon.png, icon-180.png, banner.png, screenshots/
test/             smoke tests and the preview/mockup harness
docs/             DSH Web integration research (Catalan)
```

```bash
npm run check          # node --check on every source file
npm test               # URL rules + proxy rewrite smoke tests
npm run test:ui        # Esc, native Insert and composite attachments (needs Chromium)
npm run test:composite # real Chromium composite render with pins (needs Chromium)
npm run smoke          # host CDP smoke test (needs Chromium)
npm run mockups        # re-render assets/banner.png and assets/screenshots
dsh plugin --profile web add link:$PWD
```

Release notes live in [`CHANGELOG.md`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/CHANGELOG.md).

The preview harness renders the real `lib/client.js` with a mock backend:

```bash
node test/preview/server.mjs
# http://127.0.0.1:7788/harness.html?state=ready&w=360&h=780
```

See [`test/preview/README.md`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/test/preview/README.md) for every state, the full-window shell, the behaviour test and the mockup pipeline.

## Market

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) (PR [#12641](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/12641), merged 2026-11-08):

- [x] Repository is public and the `dsh-plugin` topic is set.
- [x] `package.json` declares `dsh.bundle` and ships [`cordis.patch.yml`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/cordis.patch.yml).
- [x] Raster icon at `assets/icon-180.png` and storefront screenshots in [`screenshots.json`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/screenshots.json).
- [x] Entry at [`market/entry.yml`](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/market/entry.yml).
- [x] Package published as [`dsh-sidepanel-web`](https://www.npmjs.com/package/dsh-sidepanel-web) on npm.

## Contributing

Contributions are welcome: bug reports, carrier fixes, documentation and mockup improvements. Start with [CONTRIBUTING.md](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/CONTRIBUTING.md), run `npm run check` and `npm test`, and read the screenshot privacy rule before adding images. This project follows the [Code of Conduct](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/CODE_OF_CONDUCT.md). Security reports go through [SECURITY.md](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/SECURITY.md), not public issues.

## Credits

Forked from [`zengxiaolou/dsh-annotate-browser`](https://github.com/zengxiaolou/dsh-annotate-browser) (MIT): the CDP client, launcher, element picker and crop flow started there. This fork adds the official right-sidebar integration, the local/dev rewriting proxy, the two-carrier switch, the annotation overlay, device emulation, EN/ES copy, the composite annotated image and the composer hand-off.

## License

MIT. See [LICENSE](https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/LICENSE); the original copyright notice is preserved.

---

<p align="center">English · <a href="https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/README.ca.md">Català</a> · <a href="https://github.com/AleixRocal/dsh-sidepanel-web/blob/main/README.zh.md">中文</a> · <a href="#table-of-contents">Back to top ↑</a></p>
