# Contributing

Thanks for improving `dsh-sidepanel-web`. This is a DSH Web plugin: a host half
(`lib/index.js` and friends) and a browser half (`lib/client.js`), with no
build step and no runtime dependencies.

## Development setup

Requirements: Node.js 22.19+, DSH 0.2.1-rc.2 (Web profile), and a Chromium-based
browser for the CDP carrier.

```bash
git clone https://github.com/AleixRocal/dsh-sidepanel-web
cd dsh-sidepanel-web
dsh plugin --profile web add link:$PWD
```

Restart `dsh web` and refresh the GUI after host-side changes. The client bundle
is served from the linked directory, so a refresh is enough for `lib/client.js`.

## Checks

```bash
npm run check   # node --check on every source file
npm test        # URL rules (host + client mirror) and proxy rewriting
npm run smoke   # host CDP smoke test; needs a real Chromium
```

The preview harness renders the real client with a mock backend:

```bash
node test/preview/server.mjs
# http://127.0.0.1:7788/harness.html?state=ready&w=360&h=780
```

See [`test/preview/README.md`](test/preview/README.md) for every state and for
the full-window mockups.

## Screenshots and privacy

Screenshots are part of the deliverable, so they have a hard rule: **no real
user data**. The committed images in `assets/screenshots/` are mockups:

- the panel is the real client, the shell around it is invented;
- the storefront is fictional and uses the reserved `example.com` domain;
- no real DSH window, account, customer, file path, token or page is captured.

If you regenerate them with `npm run mockups`, keep that rule and update
`screenshots.json` only if the file list changes. Never commit a screenshot of
your own session.

## Pull requests

- Keep one concern per PR; describe the user-visible behaviour and the tests.
- Run `npm run check` and `npm test` before pushing.
- For user-visible changes, keep the English `README.md` and the Catalan
  `README.ca.md` in sync (and the screenshots they reference).
- Do not edit `data/plugins/` in the awesome-dsh-plugin repository from here;
  the draft entry lives at `market/entry.yml`.
- Commits follow Conventional Commits (`fix:`, `feat:`, `docs:`, `chore:`).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind,
assume good faith, and never publish another person's private information.

## License

By contributing you agree that your changes are released under the MIT license
in [`LICENSE`](LICENSE).
