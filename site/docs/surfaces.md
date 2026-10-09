# What 1.0 Freezes

From 1.0, a 1.x release does not remove, rename, or give a different meaning to anything on this page, and does not change a default; it may add a new optional key, command, option, or piece of markup that no existing document could already contain. A deprecated spelling keeps working with a warning that names its replacement, and is removed no earlier than the next major release. A warning's wording and the exact bytes of the output are not frozen. The full statement is in [roadmap.md](https://github.com/kuttsun/monodocs/blob/main/docs/roadmap.md) 12.4.

This page lists every surface in one place; a test fails when the configuration schema, the CLI, or the diagnostic codes have something this page does not, or the reverse. What each one does is in the [configuration reference](./configuration), [command options](./commands), and the [syntax reference](https://github.com/kuttsun/monodocs/blob/main/docs/syntax.md).

## Configuration keys {#keys}

Every key `monodocs.config.yml` accepts, with its default. An unknown key is an error.

| Key | Default |
| --- | --- |
| `title` | `Documentation` |
| `lang` | `en` |
| `fontCheck` | `warn` |
| `document.version` | unset |
| `document.date` | unset |
| `document.authors` | unset |
| `input` | `./docs` |
| `root` | value of `input` (for a single file, its directory) |
| `output.format` | `html` |
| `output.path` | `./dist/docs.html` (`./dist/docs.pdf` for `pdf`, `./dist` for `both`) |
| `sources.markdown.extensions` | `[.md, .markdown]` |
| `sources.asciidoc.extensions` | `[.adoc, .asciidoc, .asc]` |
| `sources.asciidoc.attributes` | unset |
| `sources.include` | unset |
| `sources.exclude` | `[]` |
| `sources.excludeDefaults` | `true` |
| `sources.lineBreak` | `space` |
| `sidebar.mode` | `folder` |
| `sidebar.items` | unset |
| `sidebar.items[].title` | unset |
| `sidebar.items[].path` | unset |
| `sidebar.items[].children` | unset |
| `sidebar.exclude` | unset (deprecated; removed in 1.0) |
| `sidebar.collapseDepth` | unset |
| `sidebar.titleTransform.page` | `none` |
| `sidebar.titleTransform.page.type` | unset (required when the object is written) |
| `sidebar.titleTransform.page.pattern` | unset |
| `sidebar.titleTransform.page.replacement` | unset |
| `sidebar.titleTransform.page.flags` | unset |
| `sidebar.titleTransform.directory` | `none` |
| `sidebar.titleTransform.directory.type` | unset (required when the object is written) |
| `sidebar.titleTransform.directory.pattern` | unset |
| `sidebar.titleTransform.directory.replacement` | unset |
| `sidebar.titleTransform.directory.flags` | unset |
| `sidebar.titleFrom` | `heading` |
| `sidebar.flattenSingleChild` | `false` |
| `toc.maxLevel` | `3` |
| `numbering.sections` | `false` |
| `figures.align` | `center` |
| `assets.embedImages` | `true` |
| `assets.maxInlineSize` | `5MB` |
| `assets.onLargeImage` | `warn` |
| `assets.budget` | unset |
| `assets.onBudget` | `warn` |
| `mermaid.enabled` | `true` |
| `mermaid.mode` | `client` |
| `mermaid.runtime` | `inline` |
| `highlight.enabled` | `true` |
| `math.enabled` | `true` |
| `html.theme` | `default` |
| `html.contentWidth` | `860px` |
| `html.contentWidthToggle` | `true` |
| `html.contentWidthDefault` | `standard` |
| `html.imageLightbox` | `true` |
| `html.branding` | `true` |
| `html.colorScheme` | `light` |
| `html.labels.openSidebar` | from `lang` |
| `html.labels.closeSidebar` | from `lang` |
| `html.labels.searchPlaceholder` | from `lang` |
| `html.labels.searchLabel` | from `lang` |
| `html.labels.clearSearch` | from `lang` |
| `html.labels.searchResults` | from `lang` |
| `html.labels.noResults` | from `lang` |
| `html.labels.contentWidthToggle` | from `lang` |
| `html.labels.useWideContent` | from `lang` |
| `html.labels.useStandardContent` | from `lang` |
| `html.labels.darkModeToggle` | from `lang` |
| `html.labels.tocLabel` | from `lang` |
| `html.labels.tocTitle` | from `lang` |
| `html.labels.pageNavLabel` | from `lang` |
| `html.labels.prev` | from `lang` |
| `html.labels.next` | from `lang` |
| `html.labels.wrapToggle` | from `lang` |
| `html.labels.copyCode` | from `lang` |
| `html.labels.copy` | from `lang` |
| `html.labels.copied` | from `lang` |
| `html.labels.copyFailed` | from `lang` |
| `html.labels.openImagePreview` | from `lang` |
| `html.labels.imagePreview` | from `lang` |
| `html.labels.closeImagePreview` | from `lang` |
| `html.labels.generatedBy` | from `lang` |
| `html.labels.version` | from `lang` |
| `html.labels.cover` | from `lang` |
| `html.labels.contents` | from `lang` |
| `pdf.pageSize` | `A4` |
| `pdf.margin.top` | `20mm` |
| `pdf.margin.right` | `15mm` |
| `pdf.margin.bottom` | `20mm` |
| `pdf.margin.left` | `15mm` |
| `pdf.printBackground` | `true` |
| `pdf.bookmarks` | `true` |
| `pdf.header` | `false` |
| `pdf.footer` | page number / total pages |
| `pdf.cover.enabled` | `false` |
| `pdf.toc.enabled` | `false` |
| `pdf.toc.depth` | `2` |
| `pdf.watermark` | `false` |
| `pdf.pageBreakLevel` | `false` |
| `pdf.density` | `normal` |
| `pdf.density.base` | `normal` |
| `pdf.density.fontSize` | from `base` |
| `pdf.density.lineHeight` | from `base` |
| `pdf.density.headingSpacing` | from `base` |
| `pdf.density.tableCellPadding` | from `base` |

### Values behind a default {#values}

Two defaults stand for values, and the values are frozen with them.

- **The built-in exclusions** `sources.excludeDefaults` turns on: `_partials/**`, `partials/**`, `includes/**`, `**/_*`.
- **The `pdf.density` presets**, `normal` being the default:

| Preset | `fontSize` | `lineHeight` | `headingSpacing` | `tableCellPadding` |
| --- | --- | --- | --- | --- |
| `relaxed` | `16px` | `1.7` | `1.8em` | `0.5rem 0.8rem` |
| `normal` | `16px` | `1.45` | `0.9em` | `0.35rem 0.6rem` |
| `compact` | `14px` | `1.35` | `0.8em` | `0.3rem 0.5rem` |
| `tight` | `12px` | `1.3` | `0.6em` | `0.2rem 0.35rem` |

## Commands and options {#commands}

| Command | Arguments | Options |
| --- | --- | --- |
| (any) | — | `-V, --version`, `--lang <lang>`, `-h, --help` |
| `init` | — | — |
| `build` | `[input]` | `-o, --output <path>`, `-c, --config <file>`, `-f, --format <format>` |
| `watch` | `[input]` | `-o, --output <file>`, `-c, --config <file>` |
| `serve` | `[input]` | `-o, --output <file>`, `-c, --config <file>`, `-p, --port <port>`, `-H, --host <host>`, `--open` |
| `validate` | `[input]` | `-c, --config <file>`, `--format <format>`, `--strict` |
| `help` | `[command]` | — |

Every command also takes `-h, --help`.

## Diagnostics {#diagnostics}

`monodocs validate --format json` writes a report with `"schemaVersion": 1`. A CI job pins that number, not the monodocs version: it changes only when the shape a job parses changes, and a release can add checks and codes without changing it ([command options](./commands#json-report)).

A diagnostic's `code` is what a job filters on, and is not renamed. The codes:

- `browser/setup`
- `config/deprecated-key`
- `config/input-outside-root`
- `config/invalid`
- `config/not-found`
- `font/missing`
- `font/no-math-table`
- `font/unchecked`
- `heading/level-skipped`
- `image/embedded-for-pdf`
- `image/large`
- `image/no-alt`
- `image/not-found`
- `image/outside-input`
- `image/too-large`
- `image/unsupported`
- `include/outside-input`
- `init/exists`
- `input/no-sources`
- `input/not-found`
- `input/unsupported-file`
- `internal/unexpected`
- `lang/no-label-table`
- `lang/unsupported`
- `link/unresolved`
- `link/unresolved-anchor`
- `math/command-not-allowed`
- `math/construct-unsupported`
- `math/notation-unsupported`
- `math/numbering-unsupported`
- `math/parse-failed`
- `math/style-unsupported`
- `mermaid/prerenderer-missing`
- `mermaid/render-failed`
- `numbering/sectnums`
- `output/over-budget`
- `page/alias-shadowed`
- `page/duplicate-alias`
- `page/duplicate-id`
- `page/duplicate-route`
- `page/no-renderer`
- `page/no-title`
- `pdf/margin-too-small`
- `pdf/toc-not-converged`
- `pdf/toc-unresolved`
- `sidebar/group-empty`
- `sidebar/item-duplicate`
- `sidebar/item-hidden`
- `sidebar/item-not-found`
- `sidebar/page-unlisted`
- `theme/invalid`
- `theme/not-found`
- `theme/unknown`

## Markup beyond CommonMark, GFM, and AsciiDoc {#markup}

- **Markdown frontmatter**: `title`, `order`, `hidden`, `description`, `aliases`.
- **AsciiDoc attributes**: `:sd-title:`, `:sd-order:`, `:sd-hidden:`, `:sd-description:`, `:sd-aliases:`.
- **GitHub alerts** in Markdown: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`.
- **Links between files**: a link to another source file (`.md`, `.adoc`, or the `.html` it would build to), with or without `#anchor`, and AsciiDoc's `xref:`, become routes inside the document; an anchor is resolved within the page it names ([syntax reference](https://github.com/kuttsun/monodocs/blob/main/docs/syntax.md)).
- **Page break**: `<div class="page-break"></div>` or `<div style="page-break-after: always"></div>` in Markdown, in the spellings [configuration](./configuration#page-breaks) lists; `<<<` in AsciiDoc.
- **Mermaid**: a fenced block whose language is `mermaid`; `[source,mermaid]` in AsciiDoc.
- **Math** in Markdown: `$...$`, `` $`...`$ ``, `$$...$$`, and a fenced block whose language is `math`; in AsciiDoc, `latexmath:[...]`, `asciimath:[...]`, `stem:[...]`, and the `[latexmath]`, `[asciimath]`, and `[stem]` blocks, `stem` following the `:stem:` attribute (`latexmath`, `latex`, `tex`, or `asciimath`).

## Also frozen {#also}

These are not in the tables above, but a script, a theme, or a link depends on them, and they are frozen as well:

- **`MONODOCS_LANG`**: chooses the language of the CLI's own messages, as `--lang` does, which wins over it ([command options](./commands#global-options)).
- **Where the configuration file is found**: the file `-c, --config` names, which is an error if it does not exist; otherwise, given an input argument, `monodocs.config.yml` in the input directory (for a single file, its directory) and nowhere else; given none, `monodocs.config.yml` in the current directory ([configuration](./configuration#where-the-config-file-lives)).
- **Options' defaults**: `--lang` follows `MONODOCS_LANG`, then is `en`; the configuration's `lang` is the document's language, not the CLI's. `validate --format` is `human`, and without `--strict` a warning alone does not fail `validate`. `serve` listens at `127.0.0.1` on port `4173`, and without `--open` opens no browser. `-o` and `build -f` take their defaults from `output.path` and `output.format`, and `-c` from the file lookup above.
- **Addresses**: a page's route is its path under the input root without the extension, case and characters kept, an `index` page at any level standing for its directory (`index.md` is `/`, `guide/index.md` is `/guide`), and the document opens it as `#/route`. A page's ID is made from its route: each segment is lowercased, spaces become hyphens, anything but letters, digits, and hyphens is dropped, runs of hyphens become one, hyphens at either end and empty segments are dropped, and the segments are joined with hyphens; an ID that would be empty is `index` (`/Setup/API_Reference` is `setup-apireference`, `/foo--bar` is `foo-bar`, `/` is `index`). An element's ID is the page's ID, a hyphen, and the ID the source gave it. A page that moves keeps its old route with `aliases` (`:sd-aliases:`).
- **A custom theme** may hold `template.html`, `style.css`, and `app.js`, each one left out falling back to the default theme's, and a `template.html` must keep these tokens ([configuration](./configuration#html-theme-custom-theme)). The file names and these tokens are frozen; the optional tokens, the shape of the data <span v-pre>`{{siteDataJson}}`</span> carries, and the default theme's own markup and classes are not, so a theme that replaces `app.js` or styles the default markup may need changing in a minor release:

```text
{{style}} {{sidebar}} {{pages}} {{siteDataJson}} {{appJs}} {{bodyScripts}}
```

The test checks the options' defaults, the tokens, and the address examples against the code. The address rules, the file lookup, and the markup above are kept by review.
