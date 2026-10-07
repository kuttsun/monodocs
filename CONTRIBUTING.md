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
[docs/testing.md](docs/testing.md). Commit messages use a Conventional Commits prefix, an English description,
and the target version at the end, for example:

```text
feat: add search indexing (v0.4)
```

## Pull Requests

Include at least the following in the pull request description:

- Purpose of the change
- Main implementation changes
- Verification performed
- Known limitations or follow-up work

## License

Unless explicitly agreed otherwise, contributions are provided under the project's [MIT License](LICENSE).
When adding dependencies or third-party code, confirm that their licenses are compatible with the distribution
policy.
