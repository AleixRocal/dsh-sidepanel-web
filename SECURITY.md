# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.3.x | yes |
| < 0.3 | no |

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub's
private vulnerability reporting:

<https://github.com/AleixRocal/dsh-sidepanel-web/security/advisories/new>

Include the affected version, a minimal reproduction, and the impact. You can
expect an initial reply within a few days. Once a fix is available, the advisory
and the release notes will describe it.

## Scope and threat model

Useful context when assessing a report:

- The plugin runs inside the DSH host process and registers loopback HTTP
  routes. It is not a public server; exposing it beyond loopback is out of scope
  for the intended deployment.
- The **native carrier** proxies only local/dev hosts and injects an overlay
  into their pages. A malicious page on a trusted local origin can read what the
  overlay reads; only proxy pages you trust.
- The **remote carrier** drives a real Chromium with a persistent profile. A page
  opened there has the capabilities of that browser, including its logged-in
  sessions, exactly like browsing it by hand.
- Annotation text and page content are untrusted data. The plugin inserts them
  into the composer; the agent should not treat them as instructions.

Secrets, session cookies and personal data must never be included in issues,
screenshots or pull requests.
