# Security Policy

[日本語](SECURITY.ja.md)

## Supported versions

`monodocs` is under development and has not reached its first stable release. Until v0.6.0 is released, security fixes are provided for the `main` branch on a best-effort basis. There is no SLA for response or remediation times.

After the 0.x releases begin, the latest minor version will normally be supported. Older minor versions will receive fixes only for critical vulnerabilities. Changes to version support will be announced in the release notes.

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

## Security assumptions

`monodocs` is intended to convert documents managed by you or a trusted team. AsciiDoc can emit raw HTML; converting untrusted input may therefore execute arbitrary scripts when the generated HTML is opened. See the [security boundaries](docs/architecture.md#security-boundaries) for details.

Use a regular public issue for usage questions, feature requests, and bugs that do not contain sensitive information.
