# OSS / npm Publishing Roadmap

[日本語](ja/oss-npm-roadmap.md)

Last updated: 2026-07-24

## 1. Purpose

Publish monodocs as OSS under the MIT License, aiming for a state where it can be reliably installed via the following method.

```bash
npm install -g monodocs
monodocs build ./docs -o ./dist/manual.html
```

Alternatively, make it usable via a temporary install.

```bash
npx monodocs build ./docs -o ./dist/manual.html
```

The initial release will be the npm package only. The SEA standalone binary is deferred to the future, after publishing and operating the npm version has stabilized, and is not included in the completion criteria for v0.6. No Docker image will be provided for users; the existing Docker environment for development and testing will be maintained.

## 2. Basic Policy

- Publish the source code under the MIT License.
- GitHub is the official source repository and publishing platform.
- Retain GitLab only for the existing Pages delivery until GitHub Pages replaces it; build all new release automation on GitHub.
- Use Semantic Versioning for versions.
- Do not replace already-published artifacts; fix defects in new versions.
- For the first npm publish, publish only the CLI package `monodocs`.
- Maintain `@monodocs/core` as an internal workspace package and bundle it into the CLI's published artifact.
- The npm version provides the main features including HTML, PDF, and Mermaid pre-render.
- v0.6 distributes only the npm package; the SEA standalone binary is a separate future milestone.
- Generate and publish the npm package from CI, and do not publish locally generated artifacts.

## 3. Current State and Issues to Resolve

### 3.1 Migration to GitHub

The source repository, default branch, and package metadata have migrated to GitHub. GitLab is retained temporarily only for the existing Pages delivery until GitHub Pages replaces it.

Completed migration items:

- Git remote and default branch
- The `homepage`, `repository`, and `bugs` URLs
- Repository URLs in the official site and contributor documentation
- Issue and pull request templates
- Private vulnerability reporting
- Dependency graph, Dependabot alerts and security updates, secret scanning, and push protection

Remaining GitHub setup items to complete before M2 and the M4 beta release:

- GitHub Actions Pull Request CI
- GitHub Releases and Artifact Attestations
- npm Trusted Publishing

Until GitHub Pages replaces it, maintain the existing Pages delivery in `.gitlab-ci.yml`. Do not add more GitLab-specific release processing that will be discarded, and keep verification steps such as format, typecheck, test, build, and bundle platform-independent as package scripts.

### 3.2 npm Package Structure

The development CLI depends on the private `@monodocs/core` via `workspace:*`.

```text
monodocs CLI
  └─ @monodocs/core
```

The development CLI remains private so workspace development and type checking can use the internal core package. The release pipeline creates a separate staging directory with a publish manifest, the bundled CLI, and the required notices. For the first publish, do not finalize core's public API, and instead bundle it into the CLI artifact and distribute it as a single package.

### 3.3 SEA Binary Is a Future Task

The current SEA build for development treats `puppeteer-core` as an external dependency, so it has the following limitations. In v0.6, the SEA will not be distributed to users, and after publishing the stable npm version, the supported features, target OS / CPU, signing, and installation method will be redesigned.

| Feature                 | SEA Binary    | npm Version Goal |
| ----------------------- | ------------- | ---------------- |
| HTML generation         | Supported     | Supported        |
| `validate`              | Supported     | Supported        |
| `watch` / `serve`       | Supported     | Supported        |
| PDF output              | Not supported | Supported        |
| Mermaid client mode     | Supported     | Supported        |
| Mermaid pre-render mode | Not supported | Supported        |

## 4. Milestones

| ID  | Milestone                          | Main Deliverables                                               |
| --- | ---------------------------------- | --------------------------------------------------------------- |
| M0  | Finalize publishing policy         | Official repository, npm name, owner, supported envs            |
| M1  | Set up OSS foundation              | CONTRIBUTING, SECURITY, Issue / PR operation                    |
| M2  | Set up CI foundation               | test, typecheck, build, HTML / PDF smoke test                   |
| M3  | Complete npm package               | Installable npm tarball                                         |
| M4  | npm beta publish                   | `monodocs@next`                                                 |
| M5  | npm stable publish                 | `monodocs@latest`                                               |
| M6  | Establish post-publish maintenance | Version updates, vulnerability handling, EOL, permission review |

The SEA standalone binary is a future item whose start will be decided after the M5 npm stable publish, and it is not a prerequisite for the npm publish.

## 5. M0: Finalize Publishing Policy

### 5.1 Confirmed Initial Policy

- The npm package will be individually owned, with the initial maintainer being only `kuttsun`. The actual npm account name to be used will be finalized just before the publishing work.
- The npm version targets Node.js 22 or later.
- The initial supported targets for the npm version are Linux x64 and Windows x64, and HTML, validate, watch, and serve will be verified with GitHub Actions before the beta publish. Linux arm64 and macOS arm64 will be considered for addition once an environment for continuous verification is available.
- The SEA standalone binary is out of scope for v0.6 and will be reconsidered after the npm stable publish.
- Chromium will not be auto-downloaded. `PUPPETEER_EXECUTABLE_PATH` takes top priority, and if unspecified, the standard Chromium / Google Chrome install locations are searched on Linux and Windows (on Windows, Chromium-based Microsoft Edge is also used as a fallback). macOS has no built-in candidates yet, so `PUPPETEER_EXECUTABLE_PATH` must be set there.
- During the 0.x period, provide normal support for the latest minor, and address only critical vulnerabilities for past minors.
- The canonical source of the changelog will be GitHub Releases, with important changes and known limitations recorded in the release notes.
- The availability of `monodocs` on the npm registry will be finalized just before the GitHub migration and publishing work.

### 5.2 Decisions

- [x] Make GitHub the official source repository and publishing platform.
- [x] Complete the source repository migration to GitHub.
- [x] Unify the `homepage`, `repository`, and `bugs` URLs to the official repository.
- [x] Set the npm package name to `monodocs`.
- [x] Confirm that the package name is available on the npm registry.
- [x] The npm package is individually owned.
- [x] Make `kuttsun` the only initial npm maintainer.
- [x] Finalize the policy of publishing only the CLI initially and maintaining core as an internal package.
- [x] The npm version supports Node.js 22 or later.
- [x] Set the initial supported targets of the npm version to Linux x64 and Windows x64.
- [x] Exclude the SEA standalone binary from the v0.6 distribution targets.
- [x] Do not auto-acquire Chromium; search from environment variables and executables on the system.
- [x] Decide the support targets and EOL policy for 0.x.

### 5.3 Completion Criteria

- The publishing policy is recorded in this document or an ADR.
- The package name, owner, publishing permissions, and official repository are finalized.
- The publishing boundary between the CLI and core is finalized.
- The supported ranges of Node.js, OS, CPU, and Chromium are documented.

## 6. M1: Set Up OSS Foundation

### 6.1 Documentation

- [x] Document installation, basic operations, supported environments, and known limitations in `README.md`.
- [x] Confirm that the MIT License is correctly stated in `LICENSE`.
- [x] Add `CONTRIBUTING.md`.
- [x] Add `SECURITY.md`.
- [x] Make GitHub Releases the canonical source of the changelog.
- [ ] Add `CODE_OF_CONDUCT.md` if needed.
- [x] Clearly state that no support scope or SLA is provided.
- [x] Clearly state that contributions are provided under the MIT License.

### 6.2 Repository Operation

- [x] Add an Issue template for bug reports.
- [x] Add an Issue template for feature requests.
- [x] Add a Pull Request template.
- [x] Enable a private reporting path for vulnerabilities.
- [x] Protect the default branch.
- [x] Make CI success and review merge conditions.
- [ ] Decide on an adoption policy for Dependabot or Renovate.
- [x] Establish rules for license verification when adding dependencies.

### 6.3 Completion Criteria

- A third party can build and test using only the README and CONTRIBUTING.
- The methods for receiving Issues, PRs, and vulnerability reports are clear.
- A policy for including LICENSE and third-party license notices in distributions is established.

## 7. M2: Set Up CI Foundation

### 7.1 Pull Request CI

For every Pull Request, run at least the following. Prepare a matrix of Linux x64 and Windows x64, and in addition to non-OS-specific verification, run PDF / pre-render that use Chromium on both OSes. The Chromium executable will be explicitly prepared in CI and specified with `PUPPETEER_EXECUTABLE_PATH`.

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm build
pnpm typecheck
pnpm test
pnpm bundle
```

- [x] Run the format check.
- [x] Build the entire workspace.
- [x] Run typecheck.
- [x] Run all tests.
- [x] Generate the CLI bundle.
- [x] Generate and verify the third-party license list.
- [x] Inspect for known vulnerabilities when dependencies change.

### 7.2 Smoke Test

- [x] Confirm `monodocs --version`.
- [x] Confirm `monodocs --help`.
- [x] Generate HTML from Markdown.
- [x] Generate HTML from a mixed Markdown / AsciiDoc document.
- [x] Run `validate`.
- [x] Run the basic flow of the npm version CLI on Linux x64 and Windows x64.
- [x] Specify Chromium on Linux x64 and Windows x64 and run PDF and Mermaid pre-render.
- [x] Confirm that the generated PDF begins with `%PDF-`.
- [x] Confirm that the artifacts to be published include LICENSE and third-party license notices.

### 7.3 Completion Criteria

- Broken artifacts cannot be merged into main.
- Representative generation flows for HTML and PDF are verified in CI.
- Missing license notices can be detected in CI.

## 8. M3: Complete npm Package

### 8.1 Package Metadata

- [x] Keep the development CLI private and generate the publish manifest in a separate staging directory.
- [x] Set the initial prerelease version.
- [x] Make `homepage` the official URL.
- [x] Make `repository` the official URL.
- [x] Make `bugs` the official Issue URL.
- [x] Set `engines.node`.
- [x] Point `bin.monodocs` to the executable to be published.
- [x] Define `files` as an allowlist.
- [x] Set `publishConfig.access`.
- [x] Include `LICENSE` in the package.
- [x] Include `THIRD-PARTY-NOTICES.txt` in the package.

### 8.2 Package Structure

For the first publish, aim for the following single package.

```text
package/
├── package.json
├── README.md
├── README.ja.md
├── LICENSE
├── THIRD-PARTY-NOTICES.txt
└── dist/
    └── monodocs.cjs
```

- [x] Bundle `@monodocs/core` into the artifact.
- [x] Eliminate `workspace:*` dependencies from the artifact.
- [x] Verify the CLI's shebang and execute permissions.
- [x] Include themes and client assets in the artifact.
- [x] Exclude unnecessary tests, configuration, and secrets from the artifact.

### 8.3 PDF and Chromium

- [x] Make `puppeteer-core` resolvable from the npm version.
- [x] Define the search method for system Chromium.
- [x] Allow setting an explicit Chromium path with `PUPPETEER_EXECUTABLE_PATH`.
- [x] Display a specific error when Chromium is absent.
- [x] Do not auto-download Chromium for users who use only HTML.
- [x] Verify PDF output in the npm version.
- [x] Verify Mermaid pre-render in the npm version.

### 8.4 Tarball Verification

Before publishing, generate the npm tarball, install it into a clean environment, and verify.

```bash
npm pack
npm install -g ./monodocs-0.6.0-beta.1.tgz
monodocs --version
monodocs build ./docs -o ./dist/manual.html
monodocs build ./docs --format pdf -o ./dist/manual.pdf
```

- [x] Verify the tarball's file list with an allowlist.
- [x] The CLI can be installed from the tarball alone.
- [x] HTML, PDF, validate, and serve can be run.
- [x] Confirm the package size and installation time.

Local tarball verification on 2026-07-18 used `monodocs-0.6.0-beta.1.tgz` in the Node.js 22 development
container. The tarball was 3,458,538 bytes (17,608,570 bytes unpacked), contained the expected allowlisted files,
installed 81 packages in approximately five seconds, and successfully ran `--version`, `--help`, `validate`,
HTML output, PDF output, Mermaid pre-render, and `serve`. The generated PDF began with `%PDF-`. This local
verification is also automated by `pnpm package:verify`, which runs in pull request CI on both supported
operating systems.

### 8.5 Completion Criteria

- The main features work with the npm tarball alone.
- No `workspace:*` remains in the artifact.
- LICENSE and third-party license notices are included.
- The main features and installation path are complete with the npm version alone.

## 9. M4: npm Beta Publish

### 9.1 Publishing Method

The `release.yml` workflow publishes from a GitHub Release on a GitHub-hosted runner. It verifies that the
release tag exactly matches the CLI package version, maps prereleases to `next` and stable versions to `latest`,
runs the full checks and tarball verification, and then publishes through npm Trusted Publishing. The workflow
uses the `npm` GitHub Environment so repository-side approval can gate publication.

Configure npm Trusted Publishing with these exact values before creating the release:

| Setting           | Value         |
| ----------------- | ------------- |
| GitHub owner      | `kuttsun`     |
| Repository        | `monodocs`    |
| Workflow filename | `release.yml` |
| Environment       | `npm`         |
| Allowed action    | `npm publish` |

Publish the beta version to `next`, not `latest`. Trusted Publishing generates provenance automatically; the
workflow also passes `--provenance` explicitly so that intent remains visible in the release definition.

```bash
npm publish --tag next
npm install -g monodocs@next
```

- [x] Issue `0.6.0-beta.1`.
- [x] Add the GitHub Release-triggered publishing workflow.
- [x] Set up GitHub Actions Trusted Publishing.
- [x] Do not store a long-lived npm write token in CI.
- [x] Set up approval for the release Environment.
- [x] Confirm that npm provenance is generated.
- [x] Require 2FA on the npm account.
- [x] Limit publishing permissions to the minimum necessary maintainers.

### 9.2 Beta Verification

- [ ] Confirm `npm install -g monodocs@next`.
- [ ] Confirm `npx monodocs@next`.
- [ ] Install on supported OSes.
- [ ] Install on supported Node.js.
- [ ] Generate HTML and PDF.
- [ ] Confirm Mermaid client / pre-render.
- [ ] Confirm watch / serve.
- [ ] Confirm Chromium detection and error display.
- [ ] Confirm uninstall and reinstall.
- [ ] Reproduce the README steps in a fresh environment.

### 9.3 Completion Criteria

- A third party can install `monodocs@next`.
- No defects blocking the release in the main features.
- The publish source provenance can be confirmed on npm.
- The installation steps in the README are reproducible.

## 10. M5: npm Stable Publish

### 10.1 Release Procedure

1. Create a version update PR.
2. Update the CHANGELOG or Release notes.
3. Pass all CI.
4. Inspect the `npm pack` artifact.
5. Install the tarball into a fresh environment and smoke test.
6. Merge the PR into main.
7. Create the `v0.6.0` tag.
8. Generate the GitHub Release in CI.
9. Publish to npm from CI.
10. Reinstall the published version from npm and verify.
11. Update the README, official site, and status documents.

### 10.2 Post-Publish Verification

```bash
npm install -g monodocs
monodocs --version
monodocs build ./docs -o ./dist/manual.html
```

- [ ] The Git tag, GitHub Release, and npm version match.
- [ ] `latest` points to the intended stable version.
- [ ] LICENSE and third-party license notices are included.
- [ ] npm provenance can be confirmed.
- [ ] The post-publish smoke tests for HTML and PDF pass.
- [ ] It can be adopted and used with the README alone.

### 10.3 Completion Criteria

- It can be installed with `npm install -g monodocs`.
- It can be run with `npx monodocs`.
- HTML and PDF can be generated in supported environments.
- A procedure for publishing a fixed version when problems occur is established.

## 11. M6: Post-Publish Maintenance

### 11.1 Versioning

- patch: Backward-compatible bug fixes.
- minor: Backward-compatible feature additions.
- major: Breaking changes.
- `next`: Pre-release.
- `latest`: Stable version.

During the 0.x period, treat the latest minor as the normal support target, and address only critical vulnerabilities for past minors.

### 11.2 Security Handling

- [ ] Address Critical / High vulnerabilities with priority over regular releases.
- [ ] Coordinate privately via Security Advisory or similar before disclosure.
- [ ] Announce the scope of impact and mitigation after publishing the fixed version.
- [ ] Deprecate the problematic npm version if needed.
- [ ] Do not carelessly unpublish already-published versions.

### 11.3 Recurring Tasks

- [ ] Update dependencies regularly.
- [ ] Check vulnerability alerts.
- [ ] Periodically review npm maintainer permissions.
- [ ] Audit the Trusted Publisher settings.
- [ ] Review the supported ranges of Node.js and Chromium.
- [ ] Announce EOL versions.
- [ ] Review priority issues based on Issues and download status.

## 12. Future: SEA Standalone Binary

The SEA standalone binary will have its start decided after publishing and operating the npm stable version, by confirming user demand and maintenance cost. It will not be a prerequisite that blocks the v0.6 release.

If started, decide at least the following anew.

- Target OS / CPU and the CI runners for each environment
- Whether to include PDF / Mermaid pre-render or limit to HTML-related features only
- The format of GitHub Release assets, SHA-256, and provenance
- The need for POSIX `install.sh`, Windows `install.ps1`, and code signing
- The size and update frequency from bundling the Node.js runtime
- Version correspondence with the npm version and the support period

## 13. Common Release Rules

- Do not regenerate or replace artifacts of the same version.
- If there is a problem, issue a new patch or prerelease.
- Match the version tag, the CLI's `--version`, package.json, and the GitHub Release.
- Verify the installation path with a prerelease before publishing the stable version.
- Record feature additions, fixes, breaking changes, and known limitations in the Release notes.
- Include LICENSE and third-party license notices in the npm tarball.
- Perform release operations from CI, and minimize publishing permissions.

## 14. References

- [npm package scope, access level, and visibility](https://docs.npmjs.com/package-scope-access-level-and-visibility/)
- [Creating and publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/)
- [Adding dist-tags to packages](https://docs.npmjs.com/adding-dist-tags-to-packages/)
- [npm Unpublish Policy](https://docs.npmjs.com/policies/unpublish/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [GitHub Artifact Attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
- [Node.js Single executable applications](https://nodejs.org/api/single-executable-applications.html)
