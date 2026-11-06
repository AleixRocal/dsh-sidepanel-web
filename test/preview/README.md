# Panel preview and mockup harness

Renders the real `lib/client.js` with React and a mock backend — no DSH, no real
browser — so the panel UI can be inspected and screenshotted without touching a
real session. The screenshots in `assets/screenshots/` are generated from here.

## One-time setup

```sh
mkdir -p test/preview/vendor
# React 18 UMD (not committed)
cp ~/.dsh/profiles/desktop/node_modules/react/umd/react.development.js test/preview/vendor/
curl -o test/preview/vendor/react-dom.development.js \
  https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js
```

If the local DSH desktop profile is not available, fetch `react.development.js`
from the same unpkg path.

## View the panel

```sh
node test/preview/server.mjs
# open http://127.0.0.1:7788/harness.html?state=ready&w=360&h=780
```

Query parameters:

- `state`: `ready` `picked` `typing` `insert` `blank` `loading` `error` `shoterr`
  `tall` `tallpicked` `device` `esc` `esc-native`.
- `esc-native` additionally needs `&url=http://shop.local/checkout`; it loads the
  native iframe fixture through the mock proxy so Esc-inside-the-page can be
  tested.
- `w` / `h`: sidebar width and height. Below 512 the narrow layout is used, 520+
  gets wide padding, 560+ anchors the floating card, 640+ shows the page title.
- `lang`: `en` (default) or `es`, resolved through the dictionary the client
  registers with `ctx.locale`.
- `note`: annotation text used by `picked` / `typing` / `insert`.
- `chrome=0`: hide the fake host strip, for embedding in `shell.html`.
- `url`: simulate a chat link arriving as `params.url`.

## Full-window mockups

- `shell.html` — a static DSH Web shell (invented conversation, workspace and
  session name) with the real panel embedded in an iframe:
  `http://127.0.0.1:7788/shell.html?shot=hero|annotate|devices&w=760`
- `diagram.html` — the “how it works” architecture image.
- `banner.html` — the repository banner used at the top of both READMEs.

Everything in these two pages is invented: Northwind Supply is a fictional
storefront on the reserved `example.com` domain, and no real account, page,
customer, file path or screenshot of the live GUI is used.

## Behaviour test

```sh
node test/preview/behavior.mjs
```

Checks the three regressions that are easy to bring back: **Esc leaves annotate
mode in the CDP carrier** (focus is not on the panel root), **Esc inside the
native iframe** (the overlay forwards it as a cancel message), and **an inserted
annotation attaches its crop as an image** (`conversation.createDrafts` + `inputActions.addAttachments`,
not just a path). The mock server serves a 1×1 PNG from `/crop`; the harness
fakes the conversation service and records the file type and size.

## Batch screenshots

```sh
node test/preview/shoot.mjs     # panel states  → test/preview/shots/*.png (gitignored)
node test/preview/mockups.mjs   # banner + storefront → assets/banner.png + assets/screenshots/*.png (committed)
```

Both need Node 22+ (the CDP client uses the global `WebSocket`) and a local
Chromium/Chrome. Set `CHROME_PATH` to override the detected binary. The
Playwright cache path is detected automatically, and both scripts launch Chrome
with `--no-sandbox` so they also work in containers/CI.

`mockups.mjs` starts the preview server itself if it is not already running; it
writes the 1600×420 banner and 1600×1000 screenshots at 2× scale (PNG).
`ONLY=02 npm run mockups` re-renders just the matching images.

## Known limits

- Mock data and timestamps are fixed; this does not exercise real CDP behaviour.
- Clicks are synthetic `MouseEvent`s; `?state=picked` toggles Annotate and clicks
  the frame the same way a person would.
- The DSH shell and the `conversation.input.dock` seat are stand-ins here, so a
  good-looking panel does not prove the host wiring.
- The mock page and its element are fictional; see `fixture-page*.svg`.
