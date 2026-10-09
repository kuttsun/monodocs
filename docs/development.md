# Development Guide

[日本語](ja/development.md)

## Development Policy

- **Don't pollute the host environment**: Node.js / pnpm are not installed globally on the host;
  all development, builds, and tests run inside the devcontainer (or a Docker container).
- **Separate the app from the site**: the application lives in `app/`, the promotional site (to be published) in `site/`,
  and development documentation in `docs/`.
- **Source Renderer Architecture**: each source format (Markdown / AsciiDoc, ...) is processed by a dedicated
  renderer, normalized into a common `Page` model, and then output ([architecture.md](architecture.md)).
- **Incremental releases**: features are added per roadmap version ([status.md](status.md)).

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
  examples/ja/              # Sample of all notations and all features (Japanese. markdown / asciidoc / mixed)
  examples/en/              # English version of the above
  site/                     # Static web site introducing the app (VitePress)
    .vitepress/theme/       # Custom theme (design tokens / type / home hero)
  docs/                     # Development documentation (this folder)
  scripts/app.sh            # Helper that runs commands inside the dedicated image
  Dockerfile.dev            # Image for development / build / test (with pnpm baked in)
  .devcontainer/            # For VS Code Dev Containers (optional. Uses Dockerfile.dev)
  README.md
```

## Development Environment (Dedicated Docker Image)

Develop, build, and test inside the dedicated image **`monodocs-dev`**, not on the host. It bakes pnpm (the
version in `packageManager` of `app/package.json`) into Node 22, so corepack does not download pnpm each time.

### App Dependency Advisory Ignored in the Audit

`app/pnpm-workspace.yaml` lists GHSA-238p-pmpm-9mq7 under `auditConfig.ignoreGhsas`, so `pnpm audit` does not
fail on it. It is a low-severity KaTeX advisory, patched in 0.18.2: KaTeX can treat options inherited from an
already-polluted `Object.prototype`, such as `trust`, as if the application had set them.

- **Where it ships**: in the two bundles of the one mermaid version monodocs uses — `mermaid.min.js` (embedded
  by the inline runtime and pre-render) and the ESM bundle that `mermaid.runtime: cdn` loads from jsDelivr at
  that exact version. Both carry KaTeX 0.16.47.
- **Why no override**: overriding this repository's KaTeX reaches neither bundle, and mermaid 11 and 12 both
  require `katex ^0.16.47`; it would silence the audit without changing what ships.
- **Build-time KaTeX**: `@monodocs/core` depends on KaTeX directly to render formulas, at the same 0.16.47,
  kept in step with Mermaid's so the notices name one KaTeX and the MathML rewrites (roadmap 6.4) match what
  was measured. It sets `trust` explicitly to a function that refuses every command, so an inherited `trust`
  cannot enable the gated commands; other options can still be inherited, which again needs code that has
  already polluted `Object.prototype`.
- **Accepted risk (low)**: exploiting it needs both code that has already polluted `Object.prototype` and
  attacker-controlled formulas, and mermaid passes its output through DOMPurify.
- **Removal**: when the mermaid monodocs uses carries a patched KaTeX, remove the entry, move the build-time
  KaTeX to that version, and survey its MathML against MathML Core again. Last checked 2026-10-06: mermaid
  12.1.0 still requires `katex ^0.16.47`.

### App Dependency Security Override (Removed)

`app/` used to pin `postcss` to `^8.5.18` via pnpm `overrides` in `pnpm-workspace.yaml`, because
`postcss <= 8.5.17` has a high-severity path-traversal advisory (GHSA-r28c-9q8g-f849) and reached the
dev/test-only tree through `vitest -> vite`. It was removed on 2026-10-01, once the lockfile resolved `vite`
8.3.1, which declares `postcss: ^8.5.28` itself.

`vite` is also declared as a direct dev dependency in `app/package.json`, so routine updates track it like any
other dev tool. While `vite` was only a peer dependency of `vitest`, Dependabot's routine version updates
(which follow the manifest) never proposed a bump, and the lockfile stayed on `vite` 8.1.0 for two months after
the upstream fix. The declaration adds nothing to the install (`vitest` required it already) or to the
published bundle.

### Release-Age Policy for Dependencies

pnpm 11 refuses to install any version published less than `minimumReleaseAge` minutes ago (default 1440 =
24 hours), and `pnpm install --frozen-lockfile` checks the committed lockfile against the same policy.
Malicious releases are usually removed from the registry within about an hour, so a day's wait avoids most of that window.
The repository relies on the pnpm default and does not configure the setting.

An install failing with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` means the lockfile references a version that
is too new, not a broken one. Wait until it ages past the cutoff and re-run; do not work around the policy.

`.github/dependabot.yml` sets a three-day `cooldown` for the npm ecosystems, so proposed updates are past the
pnpm cutoff when their CI runs.

> [!WARNING]
> Cooldown does not apply to Dependabot security updates. An urgent security release can be newer than the
> pnpm cutoff; that needs a deliberate decision (for example a temporary `minimumReleaseAgeExclude` entry),
> not a silent bypass.

### Site Dependency Security Override

The standalone package under `site/` temporarily overrides Vite to `~6.4.3`: VitePress 1.6.4 declares Vite
`^5.4.14`, which resolves to versions covered by the Vite and esbuild advisories Dependabot detects. The
override is limited to Vite 6.4 patch releases and must keep passing `npm ci`, `npm audit`, and the VitePress
production build. Revisit and remove it when upgrading to a stable VitePress release whose declared Vite
range includes a secure version. Last checked 2026-10-01: stable is still VitePress 1.6.4 with `vite ^5.4.14` (VitePress 2 is alpha only,
`2.0.0-alpha.20` on `next`), and `6.4.3` is still the newest Vite 6.4 patch, so the override stays.

### Site Theme

`site/.vitepress/theme/` layers a custom theme over the VitePress default theme. These points are
load-bearing, not cosmetic:

- `index.ts` extends `vitepress/theme-without-fonts` (not `vitepress/theme`), so the default theme's Inter
  files are never shipped. The site's faces are declared in `fonts.css` and come from npm
  (`@fontsource-variable/archivo`, `@fontsource/ibm-plex-mono`), so there are no font CDN requests. Japanese
  falls back to the system stack and downloads nothing.
- Monospace means a literal machine string (a path, a command, or the package name) and nothing else.
  `style.css` also takes inline code off the accent colour, so a coloured link stays distinguishable as the
  clickable one.
- `BundleDiagram.vue` and `HeroCommand.vue` share one input directory and one artifact name, so the hero reads
  as "run this command, get that file". Artifacts are named after their input directory (`docs.html`, and
  `docs.pdf` for the diagram's second output), not a kind of document, because monodocs bundles whatever pages
  it is given. Keep both components in step; the command is the HTML one, so `docs.html` must match. The
  artifact's link opens the published sample, a separate file (`site/public/sample.html`).
- The diagram's source list is a tree because the page hierarchy becomes the artifact's sidebar. Its image is
  deliberately absent from the miniature sidebar: `buildSidebar` builds from pages, so an assets-only folder
  never appears there.
- Overrides in `style.css` add an extra class or element to the selector on purpose: the default theme's scoped
  component styles carry an attribute selector, and matching that specificity exactly would make the rules
  depend on stylesheet order.

### What You Need

- Docker only (VS Code / devcontainer are not required)

### Building the Image (First Time Only)

```bash
docker build -f Dockerfile.dev -t monodocs-dev .
```

### Frequently Used Commands (via the `scripts/app.sh` helper)

`scripts/app.sh` builds `monodocs-dev` if it does not exist, mounts the working tree, and runs commands inside
`app/`. Run it **on the host only**; inside a devcontainer or container shell, run `pnpm` directly to avoid
Docker-in-Docker.

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

> [!IMPORTANT]
> Keep `packageManager` in `app/package.json` aligned with `PNPM_VERSION` in `Dockerfile.dev`.

Local preview (in the host's browser at `http://localhost:4173/`): `scripts/app-serve.sh` installs dependencies
(first time only), builds, and runs `serve --host 0.0.0.0` in one step.

```bash
scripts/app-serve.sh
# Different port: MONODOCS_PORT=8080 scripts/app-serve.sh --port 8080
```

To start it individually (`scripts/app-serve.sh` delegates to this internally):

```bash
scripts/app.sh node packages/cli/dist/index.js serve ../examples/ja --host 0.0.0.0
# Different port: MONODOCS_PORT=8080 scripts/app.sh node packages/cli/dist/index.js serve ../examples/ja --host 0.0.0.0 --port 8080
```

> [!NOTE]
> `serve` needs `--host 0.0.0.0` to be reachable from the host (`scripts/app-serve.sh` adds it; `scripts/app.sh`
> exposes `MONODOCS_PORT`, default 4173). Open `http://localhost:...`, not `http://0.0.0.0:...`.

To output a single HTML (distributable) to a file:

```bash
scripts/app.sh node packages/cli/dist/index.js build ../examples/ja -o dist/docs.html
```

To regenerate the PDF sample pages shown in the top README (`docs/assets/pdf-sample-*.png`) after changing
`site/samples/readme/` or the PDF layout:

```bash
scripts/app.sh pnpm build && scripts/readme-pdf-sample.sh
```

### Unicode Data for `sources.lineBreak: join`

`join` needs the East_Asian_Width property, which JavaScript regular expressions do not expose.

- The table in `app/packages/core/src/sources/eastAsianWidth.ts` is generated from the vendored
  `app/packages/core/scripts/data/EastAsianWidth-<version>.txt`; a test fails when they disagree.
- The data is under the Unicode License v3, vendored alongside as `LICENSE-Unicode.txt`. No package carries it,
  so `app/scripts/bundle.mjs` adds it to `THIRD-PARTY-NOTICES.txt` by hand.
- The generator refuses a data file whose header no longer names the ranges treated as "W" by default (those
  are given in prose, not data).

To move to a new Unicode version, replace the data file, point the generator at it, regenerate, and update the
version expected by the test in `sources/lineBreak.test.ts`:

```bash
scripts/app.sh sh -c 'cd packages/core && node scripts/generate-east-asian-width.mjs'
```

### Notices for the Inline Mermaid Runtime

HTML built with `mermaid.runtime: inline` embeds mermaid's prebuilt `mermaid.min.js` and the third-party notices
in `app/packages/core/src/themes/mermaid-notices.txt`. The runtime was bundled from mermaid's own lockfile, so
the notices come from its source map, not `node_modules`: the packages its sources come from, plus those
esbuild names inside the pre-bundled parser. Licences are read from the pnpm store when that exact version is
installed, otherwise from the npm tarball, checked against the registry's integrity hash.

A source map cannot see inside a package that ships its own pre-built file, so generation fails on:

- a runtime dependency of a component that the notices neither list nor explain — explain an absent dependency
  in `NOT_IN_RUNTIME`;
- a component with a large or pre-built source not covered by `PREBUILT_AUDITED` at that exact version — read
  the file and record in `PREBUILT_AUDITED` the packages it carries and any code copied in under another
  licence (or that it carries none);
- a URL cited in a source comment that `REVIEWED_URLS` does not record.

It also fails on a component with no licence text.

Sources are judged by size, minification, path, and bundler traces, so a small, unminified, traceless bundle
could still pass; mermaid's and the parser's own sources are not judged at all. Those are audited by hand for
each mermaid version, forced by the stale `mermaid@<version>` entry, starting from the citations generation
prints.

A test fails when the listed components no longer match the runtime's (as after a mermaid upgrade), or when the
generator, which holds the audit, changed after the notices were generated. Regenerate (this may use the
network) and commit the result:

```bash
scripts/app.sh sh -c 'cd packages/core && node scripts/generate-mermaid-notices.mjs'
```

### Building a Single Executable File (Native Binary)

`scripts/app.sh` / `scripts/app-serve.sh` mount only the repository (`/work`) with working directory
`/work/app`, so **they can only serve paths under the repository** (prefix `../` to point outside `app/`, as in
`../examples/ja`). To try documents anywhere else, use a single executable that runs directly on the host.

`scripts/app-build.sh` writes a single native binary with dependencies included (Node 22's
[Single Executable Application](https://nodejs.org/api/single-executable-applications.html)) to
`app/dist/monodocs`: esbuild bundles all dependencies and theme assets into one file, and `postject` injects
the SEA blob into the node binary. **node is not required on the host** (the target is the build environment's
OS/arch).

```bash
scripts/app-build.sh                              # → Generates app/dist/monodocs

# From here on, run directly on the host (no Docker needed; can point to any directory)
app/dist/monodocs serve ~/any-docs                # Local preview (--host 0.0.0.0 not needed)
app/dist/monodocs build ~/any-docs -o ~/docs.html
```

> [!NOTE]
> - The output is about 130 MiB (the node runtime is bundled). `app/dist/` is already in `.gitignore`.
> - On Windows the output is `app/dist/monodocs.exe` (Windows decides executability by extension).
>   Releases carry the same binary as `monodocs-linux-x64` / `monodocs-windows-x64.exe`, built by the release
>   workflow and smoke-tested on every pull request.
> - `pnpm build:bin` also writes `app/dist/monodocs-NOTICES.txt` (monodocs, Node.js runtime, and third-party
>   licenses); releases publish it next to each binary, since a redistributed binary cannot carry them itself.
> - Theme assets (`template.html` / `style.css` / `app.js`) and the mermaid inline runtime are embedded into
>   `globalThis.__MONODOCS_ASSETS__` at bundle time (`scripts/bundle.mjs`). `loadTheme` /
>   `mermaidRuntimeScript` prefer this and fall back to reading files if it is absent.
> - For the bundle only (with node on the host), run `scripts/app.sh pnpm bundle` to generate
>   `app/dist/monodocs.cjs`, then `node app/dist/monodocs.cjs ...`.

### Running with `docker run` Without the Helper

```bash
docker run --rm -it -v "$PWD":/work -w /work/app monodocs-dev pnpm test
docker run --rm -it -p 4173:4173 -v "$PWD":/work -w /work/app monodocs-dev \
  node packages/cli/dist/index.js serve examples/ja --host 0.0.0.0
```

### VS Code Dev Containers (Optional)

Not required. `.devcontainer` builds the image from the same `Dockerfile.dev`. **Dev Containers: Reopen in
Container** runs `pnpm install` in `postCreate`; inside, run `pnpm build` / `pnpm test` directly (no
`scripts/app.sh`). For `node packages/cli/dist/index.js serve examples/ja`, VS Code forwards port 4173
automatically (`--host` is not needed).

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

To avoid heading ID collisions within a single HTML, each heading / element ID is prefixed to
`{page-id}-{original ID}` (AsciiDoc's intra-document xrefs are rewritten to match).

When changing supported syntax or a single-file constraint, update [syntax.md](syntax.md). When completing a
roadmap version, update [status.md](status.md) and [testing.md](testing.md).

### Language of the UI (chrome)

The theme's UI text (copy/wrap, prev/next navigation, search, table of contents, etc.) **follows the document's
`lang`**, default `en` (v0.10). The language is chosen at build time; there is no runtime i18n following the
reader, since a single file has one audience at a time.

Core resolves the table for `lang`, applies `html.labels` over it, and publishes the result in `siteDataJson`;
`themes/default/app.js` consumes that instead of holding its own copy, and static text comes from tokens in
`template.html`. Tables ship for `en` and `ja`. When adding a label, add it to both tables and to the enumerated
key set: a key missing from one table fails the build rather than silently falling back.

> [!NOTE]
> Until v0.10 the labels were always English, so a `lang="ja"` document displayed `On this page`, and no
> configuration could fix it. See [roadmap.md](roadmap.md) 23.4.

### PDF Fonts

PDF output (`--format pdf` / `both`) and Mermaid pre-render are drawn with headless Chromium, so
**characters with no font in the runtime environment become tofu (□ / ☒) in the PDF** (HTML is unaffected; it
uses the browser's fonts). `Dockerfile.dev` bundles the following:

- `fonts-noto-cjk` … Japanese (CJK)
- `fonts-noto-color-emoji` … Emoji (`✅` / `⚠️`, etc.)

If you produce PDFs in your own environment, install fonts for the character types you use.

> [!IMPORTANT]
> After adding fonts, rebuild the image with `docker build -f Dockerfile.dev -t monodocs-dev .`.
> `scripts/app.sh` auto-builds the image **only when it is absent**, so a Dockerfile change needs a manual rebuild.

The build checks the characters the document contains against what the machine can draw and warns, naming
them and an example font (`fontCheck: warn | error | off`, default `warn`; see [roadmap.md](roadmap.md) 24.3.3).

> [!NOTE]
> The sample documents trip this check in the development image only for their formulas: it has no math font
> on purpose, so `examples/en`, `examples/ja`, and `examples/math` report the letters of their formulas and a
> font without an OpenType MATH table. With a math font installed they report nothing, which
> `build.fontcheck.test.ts` checks.

## Input Assumptions (Security)

`monodocs` is intended for converting **trusted documents that you (your team) manage**.

- Markdown does not pass through raw HTML (dropped by default by remark-rehype).
- AsciiDoc can output author-intended raw HTML via passthrough, embedded as-is without sanitization.
  Therefore, **converting untrusted AsciiDoc can lead to XSS**.
- AsciiDoc's `include::[]` is jailed under the input file's directory in `safe` mode
  (`base_dir` is set to the input file's directory). Reading external files is not possible.
- Data URI embedding of images targets only those whose real path (after symlink resolution) is under the input root.
  Images pointing outside the input root are not embedded and a warning is issued.
- The behavior when the image size limit (`assets.maxInlineSize`) is exceeded is chosen with `assets.onLargeImage`:
  `warn` (warn and embed; default) / `external` (do not embed, keep the original src) / `error` (fail the build).

> [!CAUTION]
> To handle untrusted input, consider adding a sanitization layer such as `rehype-sanitize` (not currently
> introduced). It would also restrict author-intended HTML/passthrough.
