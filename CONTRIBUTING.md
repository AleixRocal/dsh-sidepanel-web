# Contributing

Thanks for improving `dsh-sidepanel-web`. It is a DSH Web plugin in two halves: a
host half (`lib/index.js` and friends) and a browser half (`lib/client.js`), with
no build step and no runtime dependencies. Both halves are plain ESM shipped from
this repository, so what you write is what runs.

In short:

- small fixes and docs: open a pull request;
- behaviour changes, settings, carriers or dependencies: open a proposal issue first;
- security: private advisory, never a public issue.

This file has the rules. The reasoning, how other projects solve the same
problems and how a contribution is integrated over time are in
[`docs/collaboracio.md`](docs/collaboracio.md) (Catalan).

## Pick the right path

| You have | Do this |
| --- | --- |
| A typo, a broken link, a mockup improvement | Pull request, no issue needed |
| A reproducible bug | [Bug report](.github/ISSUE_TEMPLATE/bug_report.yml), then a PR that links it |
| A behaviour change, a new option, carrier or setting | Proposal issue first, then a PR |
| A new dependency | Proposal issue first, see [Dependencies](#dependencies) |
| A security problem | [SECURITY.md](SECURITY.md); do not open an issue |
| A question about DSH itself | [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), not here |

## Proposals for behaviour changes

Small fixes do not need a proposal. Anything that changes what users see, the
annotation payload, a carrier, the proxy fence, the settings schema or the
dependency set does. Open an issue titled `proposal: ...` with:

- the problem, described in user terms rather than in code terms;
- the shape of the change and the alternatives you rejected;
- compatibility: does it touch the annotation JSON, the settings ids, the proxy
  scope, the `engines` window or the READMEs;
- how it gets tested, and which rows of [Checks](#checks) it needs;
- what happens to existing users, if anything.

The issue carries the `needs-design` label while it is open and `accepted` once
there is a decision to build it. A proposal can close without a merge; that is a
normal outcome and the reasoning stays in the thread. Do not open a large pull
request before the issue is `accepted`: the host and client halves move together,
the DSH API window is narrow, and a 600 line PR that has to be redesigned is
expensive for everyone.

Before a behaviour change is built, the maintainer writes the decision in the
thread and leaves it open for 7 days, so an argument nobody had considered still
has a place to land. That is the project's version of a final comment period: a
short, dated last call with the outcome stated in advance. It is also why a
settled decision is not reopened without a new argument; the reasoning is in the
thread for the next person who asks.

New here? Issues labelled `good first issue` are scoped to be self-contained, and
`help wanted` means the work is open but needs more context.

## Development setup

Requirements: Node.js 22.19+, DSH 0.2.1-rc.2 with the Web profile, and a
Chromium-based browser for the CDP carrier.

```bash
git clone https://github.com/AleixRocal/dsh-sidepanel-web
cd dsh-sidepanel-web
dsh plugin --profile web add link:"$PWD"
```

Restart `dsh web` after host-side changes. A GUI refresh is enough for
`lib/client.js`, which is served from the linked directory.

The file map and the test matrix are in the README under
[Development](README.md#development); the carriers are in
[The two carriers](README.md#the-two-carriers), and the preview harness states in
`test/preview/README.md`. Link those instead of describing them again in a PR.

## Checks

| Command | Proves | Required |
| --- | --- | --- |
| `npm run check` | every source file parses | every PR |
| `npm test` | URL rules agree in host and client, and the proxy rewrites | every PR |
| `npm run test:ui` | Esc, native Insert and composite attachments in the client | when `lib/client.js` or the overlay changes |
| `npm run test:composite` | a real Chromium composite render with pins | when the composite path changes |
| `npm run smoke` | the host CDP flow against a real Chromium | when `lib/cdp.js`, `lib/service.js` or `lib/launcher.js` change |
| `npm run mockups` | regenerates `assets/banner.png` and the storefront screenshots | only together with the screenshot rules below |

CI runs `npm run check` and `npm test`, plus the manifest, screenshot and
market-entry validations. The Chromium jobs need a browser on the host, so they
stay local; say in the PR which of them you ran and what the machine was.

## Screenshots and privacy

Screenshots are part of the deliverable, so the rule is hard: **no real user
data**. The committed images in `assets/screenshots/` are mockups, the panel is
the real client and the shell around it is invented, the storefront is fictional
and lives on the reserved `example.com` domain. Do not commit a capture of your
own session, your own dev server, or anything with an account, a token, a file
path or a customer name in it.

If you regenerate them with `npm run mockups`, keep that rule and touch
`screenshots.json` only if the file list changes.

## Branches, commits, merge

- Branch from `main` and keep it short lived: `fix/proxy-redirect`,
  `feat/device-presets`, `docs/collaboracio`.
- Rebase on `main` instead of merging `main` into your branch. `main` has a
  linear history and merge commits are refused by the ruleset.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
  `fix:`, `feat:`, `docs:`, `test:`, `chore:`, `ci:`, with a scope when it helps
  (`fix(proxy): ...`, `chore(deps): ...`).
- Pull requests are squash merged by convention, so the PR title is the commit
  that lands. A rebase merge also keeps the history linear; a merge commit does
  not, and the ruleset refuses it.

## The pull request

- One concern per PR. A refactor plus a behaviour change is two PRs.
- Link the issue, and say which carrier and which DSH profile you used.
- Fill the template: what changed, how it was tested, privacy of any image.
- Say what you could not run. "Not tested on Windows" is useful; an empty box is not.
- User-visible changes keep `README.md` and `README.ca.md` in sync, and
  `README.zh.md` when you can write it. If you cannot, say so and the maintainer
  will fill the gap before the release.
- Draft PRs are welcome early. It is cheaper to redirect a draft than a finished
  branch.
- Keep the diff reviewable. Below roughly 400 changed lines, review is quick;
  above it, split by carrier or by half.

## Review

A reviewer checks, in this order:

1. Scope: is this the change the issue asked for, and only that.
2. Halves: does the change belong in the host, the client or both, and is the
   shared URL mirror still in sync. `test/url-smoke.mjs` exists to prove that.
3. Security: new network or file access is measured against the threat model in
   [SECURITY.md](SECURITY.md). The proxy fence, the loopback routes and the
   overlay injection are the sensitive parts.
4. Dependencies and compatibility: no new runtime dependency, no new install
   step, no undocumented DSH host API, `engines` untouched unless the PR says why.
5. Tests: the new test fails before the fix and passes after it.
6. Docs and images: READMEs in sync, no real data in a screenshot.

Expect a first response within about a week. The maintainer is one person; a
polite ping in the thread after that is fine, and it is not rude to ask for a
decision.

## Dependencies

The hard rule: **no runtime dependencies and no build step**. The plugin runs
inside the DSH host straight from the published tarball, and it has to keep doing
that. Concretely:

- `dependencies` stays empty. Node 22 built-ins (`fetch`, `WebSocket`, `node:*`)
  are the toolbox; that is why `lib/cdp.js` speaks CDP over a global WebSocket
  instead of importing a client.
- There are no dev dependencies today. Adding one needs a proposal and a reason
  that survives review: a test runner you prefer is not enough when the
  `node:assert` smoke scripts and `node --check` already cover the surface.
- Vendored third-party code stays out of the repository. The preview harness
  fetches React UMD bundles into `test/preview/vendor/`, which is ignored.
- If a runtime dependency ever becomes unavoidable it needs a proposal, a
  maintainer decision, an `engines` review and a migration note in `CHANGELOG.md`.
  The default answer is no, and "no" is a design decision, not a rejection of
  your work.
- The window in `engines.dsh` (`>=0.2.1-rc.2 <0.3.0-0`) is a compatibility
  promise. Do not widen it to make CI pass locally; test against a version the
  window already claims.

## How a contribution lands

1. **Triage.** A new issue gets a label and a first read within about a week, and
   either `accepted` or an explanation of why not.
2. **Review.** One approving review from a code owner, with the PR template
   checked. Stale approvals are dismissed when new commits arrive.
3. **CI.** The `Syntax and smoke tests` job is green and the branch is up to date
   with `main`. The protection ruleset requires both.
4. **Merge.** Squash merge, so the PR title becomes the commit on a linear
   `main`. The ruleset itself only forbids merge commits, so a rebase merge is
   allowed; squash is the convention because it keeps the PR title as the record.
5. **Release.** The maintainer bumps the version in `package.json`, writes the
   `CHANGELOG.md` entry, tags `vX.Y.Z` and publishes to npm. The GitHub release
   also publishes the scoped mirror to GitHub Packages. The project is on the
   `0.y.z` line, which SemVer treats as unstable: anything may change in any
   release, so the changelog says which changes break something and which ones
   only add.
6. **Docs and credit.** READMEs updated, and the release notes name the people
   whose work landed.

## When work conflicts

Two PRs in the same area is normal; nothing is lost, and the second one is not a
rejection:

- **Same files, both wanted.** The first PR to be green and approved merges; the
  second rebases on the new `main`. If the rebase is not mechanical, the authors
  are told which version won and why.
- **Competing designs.** The maintainer picks one in the issue and writes the
  reason in the thread, because the next person will ask the same question. The
  other author is invited to review the winner.
- **Your branch conflicts.** `git fetch origin`, `git rebase origin/main`,
  resolve, `npm run check && npm test`, then `git push --force-with-lease`.
  Force push your own branch, never `main`.
- **Upstream.** This repository is a fork of
  [`zengxiaolou/dsh-annotate-browser`](https://github.com/zengxiaolou/dsh-annotate-browser)
  (MIT). A fix that is generic, such as the CDP client, the launcher or the
  element picker, belongs upstream first: say so in the issue and it can be sent
  there and synced back. Fork-only behaviour stays here and is listed in the
  README's Credits section.

## `main` is protected

`main` follows the `main protection` ruleset in
[`.github/branch-protection.json`](.github/branch-protection.json), applied with
[`scripts/protect-main.sh`](scripts/protect-main.sh). The ruleset is reviewed
like code: changing the policy is a PR to that JSON file, not a click in the
settings page.

| Rule | Effect |
| --- | --- |
| Pull request required | no direct push to `main` |
| 1 approval, code owner review | a second read; approvals are dismissed on new commits |
| Review threads resolved | an open comment blocks the merge |
| `Syntax and smoke tests`, branch up to date | red CI or a stale branch cannot merge |
| Linear history | squash or rebase only, no merge commits |
| No force push, no deletion | nobody but the repository admin can rewrite or remove `main` |

The maintainer can bypass the ruleset, and that includes pushing to `main`
directly: the repository admin role is always allowed. It is a break-glass path
for a one person project when `main` is broken, not a shortcut around review, and
the table above describes what everyone else gets, not a fence around the admin.
A bypass should be said in the issue thread or the commit message, because
otherwise it is just a commit that appeared from nowhere.

If `git push` is refused because you are on `main`, move the commits to a branch
instead of forcing anything:

```bash
git switch -c fix/my-change
git branch -f main origin/main
git push -u origin fix/my-change
```

Then open the pull request from `fix/my-change`.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind,
assume good faith, and never publish another person's private information.

## License and credit

By contributing you agree that your changes are released under the MIT license in
[`LICENSE`](LICENSE). There is no CLA and no DCO sign-off to add: inbound equals
outbound, and the original copyright notice stays in place. The part a CLA would
otherwise cover is attribution, so if your change brings in third-party code, keep
its license and copyright notice and say so in the pull request.
