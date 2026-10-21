# Contributing to monodocs

[日本語](CONTRIBUTING.ja.md)

Issues, documentation improvements, bug fixes, and feature proposals are welcome. The official development
platform is [GitHub](https://github.com/kuttsun/monodocs).

## Before You Start

> [!CAUTION]
> Report security vulnerabilities through the process in [SECURITY.md](SECURITY.md), not through a public issue.

- Discuss the purpose and design of substantial changes in an issue before implementation.
- Small bug fixes and documentation corrections may be submitted directly as pull requests.
- Maintenance is best-effort; response times for issues and pull requests are not guaranteed.
- No particular editor, AI assistant, or automated review product is required to contribute.

## Repository Language Policy

- Use English as the default language for human-readable documents, at the conventional path (`README.md`,
  `docs/development.md`).
- Maintain a Japanese counterpart for each human-readable document: `*.ja.md` at the repository or package root,
  and mirrors under `docs/ja/` and `site/ja/` for documentation trees.
- Add reciprocal language links near the beginning of each English/Japanese document pair, except where the
  documentation framework provides its own locale switcher.
- Update both language versions in the same change when shared facts, instructions, or behavior change.
- Write code comments in English.
- Preserve technical identifiers, commands, paths, and code in their original form.
- Do not add personal language or tooling preferences to version-controlled repository instructions.

## Development Environment

Development, builds, and tests run in Docker.

> [!IMPORTANT]
> Do not install Node.js or pnpm globally on the host.

```bash
scripts/app.sh pnpm install
scripts/app.sh pnpm build
scripts/app.sh pnpm test
```

> [!TIP]
> In VS Code Dev Containers or an existing container shell, run `pnpm` commands directly in `app/`.

See the [development guide](docs/development.md) for setup details and command variants.

## Required Checks

Before submitting a pull request, run the application verification suite:

```bash
scripts/app.sh pnpm ci:check
```

It runs the format check, build, typecheck, tests, and CLI bundle generation. When changing npm distribution,
also verify the staged package:

```bash
scripts/app.sh pnpm package:verify
```

To run one Vitest file or matching test:

```bash
scripts/app.sh pnpm exec vitest run packages/core/src/route.test.ts
scripts/app.sh pnpm exec vitest run -t "rewrites links"
```

The complete test policy and coverage map are in [docs/testing.md](docs/testing.md).

## Change Guidelines

- Preserve the architecture in [docs/architecture.md](docs/architecture.md): one renderer per source format,
  normalized into the shared `Page` model, and the single-file output invariants (globally unique element IDs,
  stable routes, page reachability).
- Add or update tests when behavior changes.
- Update the README and relevant files under `docs/` when user-facing behavior, configuration, supported syntax,
  or limitations change.
- Check purpose, bundle-size impact, license compatibility, and single-file distribution impact before adding a
  dependency.
- Keep changes focused. Do not mix unrelated formatting or refactoring into a pull request.

Features are organized by roadmap version. At a version boundary, update [docs/status.md](docs/status.md) and
[docs/testing.md](docs/testing.md).

## Pull Requests

### Scope

Make each pull request a change that can be explained by a single purpose and passes the status checks
required for merging (see [Merging](#merging)) on its own. Split a large feature into stages that each meet this condition.

### Title

The pull request title becomes the subject of the commit on `main`. Use a Conventional Commits prefix, an
English description, and the target roadmap version at the end:

```text
feat: add search indexing (v0.4)
```

GitHub appends the pull request number after the version when merging, so the commit on `main` reads
`feat: add search indexing (v0.4) (#123)`. These conventions apply to the pull request title only, not to the
commits inside the pull request. Pull requests opened by automation, such as Dependabot, follow the same
conventions: edit their title and description before merging.

### Description

Include at least the following in the pull request description:

- Purpose of the change
- Main implementation changes
- Verification performed
- Known limitations or follow-up work

The description becomes the body of the commit on `main`. Before merging, bring it up to date with the final
change: the reason for the change, the main design decisions, and the verification results. Remove the
template's checklist, its HTML comments, sections left empty, and any explanation that no longer matches the
change; the comments are hidden on GitHub but are kept in the commit body. Leave discussion in the pull request
conversation, and keep the reasoning that future maintenance needs in the description.

### Merging

Pull requests are merged into `main` by squash merge, so each pull request becomes one commit on `main`. The
number of commits in a pull request, their messages, and whether each intermediate commit passes the checks do
not matter, and you do not need to squash or rewrite history before submitting. You may still need to resolve
conflicts, or to rebase a pull request that depends on another one onto the updated `main` after that one is
merged.

Merging a pull request requires the required status checks — App CI (Linux), App CI (Windows), and Site CI —
to pass, the branch to be up to date with `main`, and review conversations to be resolved. Pull request CI
checks the result of merging the branch into `main`, not the individual commits in the pull request. When a
pull request is focused on one purpose, reverting its commit on `main` removes exactly that change, and
`git bisect` can narrow a regression down to that pull request, though not to a commit inside it.

## License

Unless explicitly agreed otherwise, contributions are provided under the project's [MIT License](LICENSE).
When adding dependencies or third-party code, confirm that their licenses are compatible with the distribution
policy.
