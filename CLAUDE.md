# Repository Guidance

Project guidance is vendor-neutral and maintained in the following documents:

- [`CONTRIBUTING.md`](CONTRIBUTING.md): repository policy, language policy, required checks, and change guidelines
- [`docs/development.md`](docs/development.md): development environment and commands
- [`docs/architecture.md`](docs/architecture.md): architecture, implementation invariants, and security boundaries
- [`docs/testing.md`](docs/testing.md): test strategy and coverage

> **Run local commands through Docker.** The host has no Node.js / pnpm installed on purpose. All builds, tests, and the CLI run inside the `monodocs-dev` Docker image via `scripts/app.sh` (for example `scripts/app.sh pnpm ci:check`), and the documentation site builds with `scripts/site-build.sh`. A task is never "impossible to run locally" merely because `node` / `pnpm` is absent from the host `PATH` — see [`docs/development.md`](docs/development.md).

No particular editor, AI assistant, or automated review product is required for this repository.
