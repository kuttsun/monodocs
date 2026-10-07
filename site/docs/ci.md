# Running monodocs in CI

Two jobs are worth automating: validating the documents on every pull request, and building the distributable HTML or PDF when the default branch or a tag changes. monodocs is a plain npm CLI, so no dedicated action or plugin is required: install it with `npm`/`npx` and run the same commands as locally.

## What CI needs

| Requirement | Applies to |
| ----------- | ---------- |
| Node.js 22.12.0 or later | Everything |
| Chromium or Google Chrome | `--format pdf` / `--format both` and `mermaid.mode: pre-render` only |
| Network access at build time | `mermaid.mode: client` with the CDN runtime only |

`validate` exits with code `1` when it finds errors, so it can gate a pull request. HTML output and `validate` never launch a browser.

Pin the version so a build is reproducible: add monodocs as a devDependency (`npm install -D monodocs`) and call it through `npm exec`, or pass an exact version to `npx`.

> [!IMPORTANT]
> Keep the pin moving. Security fixes ship only as a new version: monodocs supports the release npm's `latest` points at and does not backport ([security policy](https://github.com/kuttsun/monodocs/blob/main/SECURITY.md)). Let Dependabot or Renovate raise the pin, and watch the repository's security advisories. monodocs bundles its dependencies into the published CLI, so a scanner reading your lockfile sees only `monodocs`, not the libraries inside it.

## GitHub Actions

### Validate documents on pull requests

```yaml
name: Docs

on:
  pull_request:
    paths: ['docs/**', 'monodocs.config.yml']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx --yes monodocs@0.15.0 validate ./docs
```

### Build the single HTML and PDF

GitHub-hosted runners ship Google Chrome, which monodocs finds automatically, so a PDF build needs no extra setup on `ubuntu-latest` or `windows-latest`.

```yaml
name: Build docs

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      # Only needed for PDFs containing Japanese text, emoji, or formulas.
      - name: Install fonts
        run: sudo apt-get update && sudo apt-get install -y fonts-noto-cjk fonts-noto-color-emoji fonts-lmodern

      - name: Build HTML and PDF
        run: npx --yes monodocs@0.15.0 build ./docs --format both -o ./dist

      - uses: actions/upload-artifact@v4
        with:
          name: manual
          path: dist/
```

With `--format both`, `-o` is treated as a directory and produces `docs.html` and `docs.pdf` (`manual.html` and `manual.pdf` in 0.8.0 and earlier).

To attach the result to a release instead, trigger the workflow on `release: types: [published]`, give the job `permissions: contents: write`, and replace the upload step. Selecting files by extension keeps the step working whichever version you pin:

```yaml
      - name: Attach to the release
        run: gh release upload "$GITHUB_REF_NAME" dist/*.html dist/*.pdf
        env:
          GH_TOKEN: ${{ github.token }}
```

### Publish to GitHub Pages

The single HTML is self-contained, so publishing means copying one file into the Pages artifact, as this repository's [`deploy-site.yml`](https://github.com/kuttsun/monodocs/blob/main/.github/workflows/deploy-site.yml) does alongside its VitePress site.

## GitLab CI

```yaml
docs:
  image: node:22-bookworm-slim
  script:
    - npx --yes monodocs@0.15.0 validate ./docs
    - npx --yes monodocs@0.15.0 build ./docs -o ./dist/docs.html
  artifacts:
    paths: [dist/]
```

The `node` images contain no browser, so add Chromium and the fonts when the job also produces a PDF:

```yaml
  before_script:
    - apt-get update
    - apt-get install -y chromium fonts-noto-cjk fonts-noto-color-emoji fonts-lmodern
  variables:
    PUPPETEER_EXECUTABLE_PATH: /usr/bin/chromium
```

## Notes

- **Chromium discovery.** `PUPPETEER_EXECUTABLE_PATH` always wins. Without it, monodocs searches the standard install locations on Linux and Windows (Chromium-based Microsoft Edge is a Windows fallback). Set the variable explicitly in container images and on macOS.
- **PDF fonts come from the runner.** A character with no installed font renders as tofu (□) in the PDF. Japanese needs `fonts-noto-cjk`, emoji need `fonts-noto-color-emoji`, and formulas need a font with an OpenType MATH table, such as Latin Modern Math from `fonts-lmodern` (without one, brackets do not stretch and letters can come out as tofu). HTML uses the reader's fonts and is unaffected. The build warns on a character the runner cannot draw or a formula font with no MATH table (`font/no-math-table`); [`fontCheck: error`](/docs/configuration#font-check) turns that warning into a failed job.
- **Offline builds.** `mermaid.mode: client` defaults to loading the runtime from a CDN. Use `inline` or `pre-render` when the runner has no outbound network access.
- **Warnings do not fail `build` or `validate`.** Broken links and missing titles are reported and the output is still produced. Add [`--strict`](/docs/commands#validate) to make a warning fail `validate` too.

## See also

- [Command Options](/docs/commands) — exit codes and every flag used above.
- [Configuration](/docs/configuration) — `mermaid`, `pdf`, and `assets` keys referenced here.
