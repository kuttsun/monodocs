# Security Policy

[日本語](SECURITY.ja.md)

## Supported versions

`monodocs` is in its 0.x series. The latest published minor version is the supported one: security fixes are released for it, and older minor versions receive fixes only for critical vulnerabilities. Support is provided on a best-effort basis, and there is no SLA for response or remediation times.

Changes to version support are announced in the release notes.

## Reporting a vulnerability

Do not post vulnerabilities or sensitive information in a public issue, pull request, or discussion.

Use GitHub Private Vulnerability Reporting as the only reporting channel. Open the repository's Security page, select **Report a vulnerability**, and submit the private form. Vulnerability reports are not accepted by email.

Include the following information when possible:

- Affected version or commit
- Summary and expected impact
- Reproduction steps or a minimal reproducer
- Environment details (OS, Node.js, Chromium, and monodocs configuration)
- Any known workaround

Please do not share vulnerability details with third parties until a fix is published. We will review the report and coordinate its scope, remediation, and disclosure, but cannot guarantee an initial-response or resolution time.

## How a report is handled

This is what happens after a report arrives, so that reporters know what to expect.

1. **Triage.** The report is confirmed and rated. Critical and High findings take precedence over feature work; anything lower is scheduled with the normal release flow.
2. **Private coordination.** Discussion stays in the GitHub Security Advisory draft for the report. Fixes are prepared without a public issue or a pull request that describes the vulnerability.
3. **Fix and release.** The fix ships as a new version — a patch on the supported minor, and a separate patch on an older minor if the finding is critical enough to reach it. Already-published versions are never rebuilt or replaced.
4. **Disclosure.** Once the fixed version is on npm, the advisory is published with the affected range, the impact, and any workaround, and the release notes point at it. The reporter is credited unless they ask otherwise.
5. **Deprecation.** If a published version cannot be made safe, it is deprecated on npm with a message pointing at the fixed version. Published versions are not unpublished, because that breaks installs that depend on them.

Findings that reach the project through a dependency audit rather than a report are handled the same way from step 1, and the routine that surfaces them is described in [docs/maintenance.md](docs/maintenance.md).

## Security assumptions

`monodocs` is intended to convert documents managed by you or a trusted team. AsciiDoc can emit raw HTML; converting untrusted input may therefore execute arbitrary scripts when the generated HTML is opened. See the [security boundaries](docs/architecture.md#security-boundaries) for details.

Use a regular public issue for usage questions, feature requests, and bugs that do not contain sensitive information.
