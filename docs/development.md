# Development Guide

[日本語](ja/development.md)

## Development Policy

- **Don't pollute the host environment**: Node.js / pnpm are not installed globally on the host;
  all development, builds, and tests are run inside the devcontainer (or a Docker container).
- **Separate the app from the site**: The application itself lives in `app/`, the promotional site to be published in the future lives in `site/`,
  and development documentation lives in `docs/`.
- **Source Renderer Architecture**: Each source format such as Markdown / AsciiDoc is
  processed by a dedicated renderer, normalized into a common `Page` model, and then output
  ([architecture.md](architecture.md)).
- **Incremental releases**: Features are added per roadmap version ([status.md](status.md)).

## Directory Structure

```text
monodocs/
  app/                      # The application itself (pnpm monorepo)
    packages/
      core/                 # Core of the conversion processing (@monodocs/core)
        src/
          sources/          # SourceRenderer for each format (markdown / asciidoc)
          pipeline/         # buildPages / buildSidebar / renderSingleHtml
          themes/default/   # HTML template / CSS / client JS
      cli/                  # CLI (monodocs command)
  examples/ja/              # Showcase of all notations and all features (Japanese. markdown / asciidoc / mixed)
  examples/en/              # English version of the above
  site/                     # Static web site introducing the app (VitePress)
  docs/                     # Development documentation (this folder)
  scripts/app.sh            # Helper that runs commands inside the dedicated image
  Dockerfile.dev            # Image for development / build / test (with pnpm baked in)
  .devcontainer/            # For VS Code Dev Containers (optional. Uses Dockerfile.dev)
  README.md
```

## Development Environment (Dedicated Docker Image)

Instead of installing Node / pnpm on the host, develop, build, and test inside the dedicated image **`monodocs-dev`**. The image bakes in pnpm on top of Node 22 (the same version as `packageManager` in `app/package.json`), so pnpm is not downloaded each time via corepack.

### Site Dependency Security Override

The standalone package under `site/` temporarily overrides Vite to `~6.4.3`. VitePress 1.6.4 still
declares Vite `^5.4.14`, but that line resolves to versions covered by the Vite and esbuild security
advisories detected by Dependabot. The override is intentionally limited to Vite 6.4 patch releases
and must continue to pass `npm ci`, `npm audit`, and the VitePress production build. Revisit and remove
it when upgrading to a stable VitePress release whose declared Vite range includes a secure version.

### What You Need

- Docker only (VS Code / devcontainer are not required)

### Building the Image (First Time Only)

```bash
docker build -f Dockerfile.dev -t monodocs-dev .
```

### Frequently Used Commands (via the `scripts/app.sh` helper)

`scripts/app.sh` automatically builds `monodocs-dev` if it does not exist, mounts the working tree, and runs commands inside `app/`. Run it **on the host side**.

```bash
scripts/app.sh pnpm install     # Install dependencies
scripts/app.sh pnpm build       # Build all packages (tsc) + copy theme assets
scripts/app.sh pnpm test        # Tests (vitest)
scripts/app.sh pnpm typecheck   # Type check
scripts/app.sh pnpm format      # Format with Prettier
scripts/app.sh pnpm format:check # Check formatting without changing files
scripts/app.sh pnpm ci:check    # Format check, build, typecheck, tests, and CLI bundle
scripts/app.sh pnpm package:verify # Build, install, and smoke-test the npm package artifact
```

Use `scripts/app.sh` only from the host. Inside a devcontainer or container shell, run `pnpm` directly to avoid
attempting Docker-in-Docker. Keep `packageManager` in `app/package.json` aligned with `PNPM_VERSION` in
`Dockerfile.dev`.

Local preview (in your host's browser at `http://localhost:4173/`).
The shortcut `scripts/app-serve.sh`, which performs dependency installation (first time only), the build, and `serve --host 0.0.0.0` all at once, is convenient:

```bash
scripts/app-serve.sh
# Different port: MONODOCS_PORT=8080 scripts/app-serve.sh --port 8080
```

To start it individually (`scripts/app-serve.sh` delegates to this internally):

```bash
scripts/app.sh node packages/cli/dist/index.js serve ../examples/ja --host 0.0.0.0
# Different port: MONODOCS_PORT=8080 scripts/app.sh node packages/cli/dist/index.js serve ../examples/ja --host 0.0.0.0 --port 8080
```

> To expose the served content from inside the container to the host, `serve` requires `--host 0.0.0.0`
> (`scripts/app-serve.sh` adds it automatically, and `scripts/app.sh` exposes `MONODOCS_PORT` (default 4173)).
> Open `http://localhost:...` rather than `http://0.0.0.0:...`.

To output a single HTML (distributable) to a file:

```bash
scripts/app.sh node packages/cli/dist/index.js build ../examples/ja -o dist/manual.html
```

### Building a Single Executable File (Native Binary)

`scripts/app.sh` / `scripts/app-serve.sh` mount only the repository (`/work`) into the container, and the working directory is `/work/app`, so **they can only serve paths under the repository** (you cannot point to an arbitrary directory outside the repository; to point outside `app/`, prefix with `../` as in `../examples/ja`). To avoid this and try out documents in an arbitrary location, use a single executable file that runs directly on the host.

`scripts/app-build.sh` outputs a single native binary with dependencies included (Node 22's
[Single Executable Application](https://nodejs.org/api/single-executable-applications.html)) to
`app/dist/monodocs`. It bundles all dependencies and theme assets into one file with esbuild, and
injects the SEA blob into the node binary with `postject`. **node is not required on the host** (targeted at the same OS/arch as the build environment).

```bash
scripts/app-build.sh                              # → Generates app/dist/monodocs

# From here on, run directly on the host (no Docker needed; can point to any directory)
app/dist/monodocs serve ~/any-docs                # Local preview (--host 0.0.0.0 not needed)
app/dist/monodocs build ~/any-docs -o ~/manual.html
```

> - The output is about 130 MiB (because the node runtime is bundled). `app/dist/` is already in `.gitignore`.
> - Theme assets (`template.html` / `style.css` / `app.js`) and the mermaid inline runtime are
>   embedded into `globalThis.__MONODOCS_ASSETS__` at bundle time (`scripts/bundle.mjs`).
>   `loadTheme` / `mermaidRuntimeScript` prefer this embedded data and fall back to reading from files as before if it is absent.
> - When you only want the bundle (if you have node on the host), run `scripts/app.sh pnpm bundle` to
>   generate `app/dist/monodocs.cjs`, and run it with `node app/dist/monodocs.cjs ...`.

### Running with `docker run` Without the Helper

```bash
docker run --rm -it -v "$PWD":/work -w /work/app monodocs-dev pnpm test
docker run --rm -it -p 4173:4173 -v "$PWD":/work -w /work/app monodocs-dev \
  node packages/cli/dist/index.js serve examples/ja --host 0.0.0.0
```

### VS Code Dev Containers (Optional)

This is not required. If you use it, `.devcontainer` builds the image from the same `Dockerfile.dev`.
When you start it with **Dev Containers: Reopen in Container**, `pnpm install` runs in `postCreate`,
and inside the container you can run `pnpm build` / `pnpm test` directly (`scripts/app.sh` is not needed).
When you run `node packages/cli/dist/index.js serve examples/ja` inside the container,
VS Code automatically forwards port 4173 (`--host` is not needed).

## Architecture

See [architecture.md](architecture.md) for the complete architecture, implementation invariants, security
boundaries, and output constraints. The high-level flow is:

```text
Markdown / AsciiDoc files
      ↓  Source Renderer (per format)
   Page[] (shared model)
      ↓  buildSidebar / renderSingleHtml
  single HTML
      ↓  (optional) headless browser   PDF support starts in v0.5
     PDF
```

- `core/src/sources/<format>/renderer.ts` … `SourceRenderer` implementation (`extractMeta` / `render`)
- `core/src/pipeline/buildPages.ts` … Normalizes sources into `Page` (detects duplicate route / page ids)
- `core/src/pipeline/buildSidebar.ts` … Generates the sidebar tree from the folder structure
- `core/src/pipeline/renderSingleHtml.ts` … Embeds into the template to generate a single HTML (also embeds page data for the table of contents / search)
- `core/src/themes/default/` … Template / CSS / client JS (hash route switching, search, table of contents, prev/next navigation, dark mode, collapsing)
- `core/src/watch.ts` … Watches for changes to inputs and configuration and rebuilds (`fs.watch`, with debounce)
- `core/src/serve.ts` … Local HTTP serving + watching + SSE live reload

To avoid heading ID collisions within a single HTML, each heading / element ID is
prefixed to `{page-id}-{original ID}` (AsciiDoc's intra-document xrefs are also rewritten to follow suit).

When changing supported syntax or a single-file constraint, update [syntax.md](syntax.md). When completing a
roadmap version, update [status.md](status.md) and [testing.md](testing.md).

### Language of the UI (chrome)

The theme's UI text (copy/wrap, prev/next navigation, search, table of contents, etc.) is **standardized in English**.
Given the design of bundling user-provided Markdown / AsciiDoc into a single HTML, runtime i18n that follows the reader's language has little meaning in a single file, so it is not done. We treat UI labels as independent of the body language and settle on internationally readable English as the default. Client-side dynamic text is consolidated in `LABELS` in `themes/default/app.js`, and static text is placed in `template.html` (this consolidation leaves room to swap languages/labels at build time via config in the future).

### PDF Fonts

Because PDF output (`--format pdf` / `both`) and Mermaid pre-render are drawn with headless Chromium,
**if the runtime environment lacks a font for the character types that appear in the body, they become tofu (□ / ☒) in the PDF** (HTML is unaffected because it is displayed with the browser's fonts). `Dockerfile.dev` bundles the following:

- `fonts-noto-cjk` … Japanese (CJK)
- `fonts-noto-color-emoji` … Emoji (`✅` / `⚠️`, etc.)

After adding fonts, rebuild the image with `docker build -f Dockerfile.dev -t monodocs-dev .`
(`scripts/app.sh` auto-builds the image **only when it is absent**, so a manual rebuild is required after changing the Dockerfile).
If you produce PDFs in your own environment, separately install fonts appropriate for the character types you use.

## Input Assumptions (Security)

`monodocs` is intended for converting **trusted documents that you (your team) manage**.

- Markdown does not pass through raw HTML (dropped by default by remark-rehype).
- AsciiDoc can output author-intended raw HTML via passthrough, and that HTML is embedded as-is without sanitization.
  Therefore, **converting untrusted AsciiDoc can lead to XSS**.
- AsciiDoc's `include::[]` is jailed under the input file's directory in `safe` mode
  (`base_dir` is set to the input file's directory). Reading external files is not possible.
- Data URI embedding of images targets only those whose real path (after symlink resolution) is under the input root.
  Images pointing outside the input root are not embedded and a warning is issued.
- The behavior when the image size limit (`assets.maxInlineSize`) is exceeded is chosen with `assets.onLargeImage`:
  `warn` (warn and embed; default) / `external` (do not embed, keep the original src) / `error` (fail the build).

If you need to handle untrusted input, consider adding a sanitization layer with `rehype-sanitize` or similar
(not currently introduced; note that introducing it also restricts author-intended HTML/passthrough).
