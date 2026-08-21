# Security Policy

[日本語](SECURITY.ja.md)

## Supported versions

`monodocs` is in its 0.x series, and the supported version is the single stable release that npm's `latest` dist-tag points at. Prereleases, including whatever `next` points at, are not supported.

A report is accepted and investigated whatever version it was found in, and the advisory records the full affected range. Fixes only ship forward: the fixed version is a new one on the current line, never a backport to an earlier one. If you are on an affected older version, upgrading to the stable release that carries the fix is the remedy. Support is provided on a best-effort basis, and there is no SLA for response or remediation times.

A published npm package, Git tag, or GitHub Release asset is never rebuilt or replaced under the same version number. The one exception is a re-run that finishes a release whose asset upload failed part-way; assets that have been verified and announced are not replaced, and a correction is published as a new patch version instead.

Changes to this policy are announced in the release notes. The support window is reconsidered before 1.0, which promises nothing about supporting more than one line.

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
3. **Fix and release.** The fix ships as a new version on the current line. A finding that also reaches older versions is recorded in the advisory's affected range rather than backported to them, and already-published artifacts are not rebuilt or replaced ([Supported versions](#supported-versions)).
4. **Disclosure.** Once the fixed version is on npm, the advisory is published with the affected range, the impact, and any workaround, and the release notes point at it. The reporter is credited unless they ask otherwise.
5. **Deprecation.** Once the fixed version is published, an affected version that is genuinely dangerous to keep using is deprecated on npm with a message pointing at it. Deprecation changes the metadata npm serves, not the published artifact, so it sits inside the rule above rather than being an exception to it. Published versions are not unpublished, because that breaks installs that depend on them.

Findings that reach the project through a dependency audit rather than a report are handled the same way from step 1, and the routine that surfaces them is described in [docs/maintenance.md](docs/maintenance.md).

## Security assumptions

`monodocs` is intended to convert documents managed by you or a trusted team. AsciiDoc can emit raw HTML; converting untrusted input may therefore execute arbitrary scripts when the generated HTML is opened. See the [security boundaries](docs/architecture.md#security-boundaries) for details.

Use a regular public issue for usage questions, feature requests, and bugs that do not contain sensitive information.
