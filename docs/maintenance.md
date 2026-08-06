# Maintenance

[日本語](ja/maintenance.md)

What keeps running after a release, and what a person has to check. This is the operational half of
[oss-npm-roadmap.md](oss-npm-roadmap.md) M6; the policy behind it lives there.

## What runs on its own

| Concern                | Mechanism                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Routine version bumps  | Dependabot, monthly, for `github-actions`, `app/` (pnpm), and `site/` (npm)           |
| Vulnerable versions    | Dependabot alerts and automated security fixes, enabled in the repository settings    |
| Advisories on the tree | `.github/workflows/scheduled-audit.yml`, weekly, opening an issue when it fails       |
| Pull request checks    | `.github/workflows/pr-ci.yml`, which also audits both dependency sets                 |
| Published package      | `.github/workflows/verify-published.yml`, run by hand against a dist-tag or version   |
| Review reminder        | `.github/workflows/quarterly-review.yml`, opening the quarterly checklist as an issue |

The scheduled audit exists because the PR CI audit only runs when a pull request is open. It reads
the committed lockfiles without installing, so a failure means an advisory, not an install problem.
It is not redundant with Dependabot alerts: alerts compare the dependency graph against GitHub's
advisory database, while `pnpm audit` sees the tree that this repository's `overrides` actually
resolve to.

## Release binary verification

`verify-published.yml` covers the published npm package, but not the release binaries and not the
long-running commands. Those are verified per release on a real host of each supported platform,
where the point is the published asset itself running without Node.js — something no CI job in this
repository does. Run each script on a machine that has no Node.js: the binary carries its own
runtime and never consults `PATH`, but a host with Node.js installed cannot demonstrate the property
the release is claiming, so both scripts say so when they find `node`.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-windows-binary.ps1 -Version v0.9.0
```

```bash
scripts/verify-linux-binary.sh --version v0.9.0
```

[`scripts/verify-windows-binary.ps1`](../scripts/verify-windows-binary.ps1) and
[`scripts/verify-linux-binary.sh`](../scripts/verify-linux-binary.sh) each download the published
asset, gate on its `.sha256`, and run the same core checks: the CLI surface, a build without `-o`,
self-contained HTML, PDF and Mermaid pre-render failing with the guidance to switch to the npm build,
the NOTICES file, `serve`, and `watch`. The live-reload check reads the SSE endpoint directly, so a
browser is not needed to prove that an edit reaches a rebuild. Every check is reported and the script
exits non-zero if any failed.

They are two scripts rather than one with a platform switch. A Linux host that deliberately has no
Node.js should not need PowerShell installed either, and the platform-specific checks do not overlap:
the executable bit the asset arrives without, and a rebuild from an edit in a subdirectory that only
recursive `fs.watch` catches, on Linux; path handling with spaces and Japanese characters, and Mark
of the Web, on Windows. This document is where the required checks are recorded, and the scripts are
its two implementations — a check added to one belongs in the other unless it is platform-specific.

What stays manual, because a script cannot settle it:

- Browser rendering: sidebar, search interaction, dark mode, and the narrow-width drawer.
- `serve --open`, which launches the default browser.
- On Windows, SmartScreen and Mark of the Web. Downloads made by the script do not attach a Mark of
  the Web, so the warning is not exercised. The binary is unsigned by policy
  ([roadmap.md](roadmap.md) 8.5) and the site documents the warning; see [status.md](status.md).

## Quarterly review

Nothing below can be automated, so it needs a date rather than good intentions.
`quarterly-review.yml` opens an issue carrying a copy of this list on the first day of January,
April, July, and October. Work through it there, record the outcome of every item — including the
ones where nothing changed — and close the issue when the list is done. Anything that cannot be
settled becomes its own issue instead of keeping the review open.

This list is the source; the issue is a copy for a single quarter. Change the list here when the work
changes, and the next issue carries it.

The reminder runs on the same GitHub cron as the first item below, so it can stop for the same
reason. That is not a hole: a quarter passing with no issue appearing is exactly the signal the first
item is looking for.

- [ ] **Scheduled workflows still enabled.** GitHub disables cron in a repository with no activity
      for 60 days. Check that `Scheduled Audit` has recent runs; re-enable it if it stopped.
- [ ] **Dependabot pull requests.** None open longer than a cycle; none silently failing CI.
- [ ] **Open alerts.** Dependabot alerts triaged, with anything left open explained.
- [ ] **Security overrides.** Re-check the two documented overrides in
      [development.md](development.md) against their removal conditions and update the "Last checked"
      line, whether or not the answer changed.
- [ ] **npm maintainers.** Only intended accounts can publish `monodocs`, and each has 2FA enabled.
- [ ] **Trusted Publisher.** The npm setting still names this repository, `release.yml`, and the
      release environment. Renaming any of the three breaks publishing silently — the failure shows
      up only at the next release.
- [ ] **Node.js and Chromium support range.** The floor is Node 22.12. Node 22 leaves LTS in April
      2027, so decide before then whether to raise it. Confirm the Chromium detection paths in
      [ci.md](../site/docs/ci.md) still match what the supported platforms install.
- [ ] **dist-tags and EOL.** `latest` and `next` point where they should, and `next` is never older
      than `latest` — publishing a stable version leaves `next` on the prerelease before it, so
      moving it is a step in the release procedure ([oss-npm-roadmap.md](oss-npm-roadmap.md) 10.1)
      and this is the backstop. Any minor that has fallen out of support per
      [SECURITY.md](../SECURITY.md) has been announced as such in the release notes.
- [ ] **Priorities.** Review open issues and npm download numbers, and let them, rather than the
      roadmap alone, decide what comes next.

## When an audit or an alert fires

1. Separate a finding from a broken run. The scheduled audit's issue is opened by any job failure,
   including checkout, tool setup, and registry errors, and only the run log says which happened. An
   infrastructure failure tells you nothing about the dependencies — re-run it.
2. Decide whether the finding reaches a user. `site/` never ships, and part of `app/` is dev-only
   and excluded from the published bundle. Record that reasoning; do not silently close.
3. Fix Critical and High before other work, per [SECURITY.md](../SECURITY.md).
4. If no patched version exists yet, prefer a scoped `overrides` entry with a comment naming its
   removal condition, and add it to the quarterly re-check above.
5. Release the fix as a patch. Do not rebuild an already-published version.
