# 1.0 が凍結するもの

1.0 からは、1.x のリリースはこのページにあるものを削除も改名もせず、意味も変えず、既定値も変えません。既存の文書が含みえない、新しい省略可能なキー、コマンド、オプション、記法を足すことはあります。非推奨にした書き方は、置き換え先を名指す警告を出しながら動き続け、次のメジャーリリースより前には削除しません。警告の文言と出力のバイト列は凍結しません。全文は [roadmap.md](https://github.com/kuttsun/monodocs/blob/main/docs/ja/roadmap.md) 12.4 にあります。

このページはすべての表面を 1 か所に挙げます。設定のスキーマ、CLI、診断コードにあってこのページに無いもの、またはその逆があると、テストが失敗します。それぞれの働きは [設定ファイル](./configuration)、[コマンドオプション](./commands)、[記法](https://github.com/kuttsun/monodocs/blob/main/docs/ja/syntax.md) にあります。

## 設定キー {#keys}

`monodocs.config.yml` が受け付けるすべてのキーと、その既定値です。知らないキーはエラーになります。

| キー | 既定値 |
| --- | --- |
| `title` | `Documentation` |
| `lang` | `en` |
| `fontCheck` | `warn` |
| `document.version` | 未設定 |
| `document.date` | 未設定 |
| `document.authors` | 未設定 |
| `input` | `./docs` |
| `root` | `input` の値（単一ファイルならそのディレクトリ） |
| `output.format` | `html` |
| `output.path` | `./dist/docs.html`（`pdf` は `./dist/docs.pdf`、`both` は `./dist`） |
| `sources.markdown.extensions` | `[.md, .markdown]` |
| `sources.asciidoc.extensions` | `[.adoc, .asciidoc, .asc]` |
| `sources.asciidoc.attributes` | 未設定 |
| `sources.include` | 未設定 |
| `sources.exclude` | `[]` |
| `sources.excludeDefaults` | `true` |
| `sources.lineBreak` | `space` |
| `sidebar.mode` | `folder` |
| `sidebar.items` | 未設定 |
| `sidebar.items[].title` | 未設定 |
| `sidebar.items[].path` | 未設定 |
| `sidebar.items[].children` | 未設定 |
| `sidebar.exclude` | 未設定（非推奨。1.0 で削除） |
| `sidebar.collapseDepth` | 未設定 |
| `sidebar.titleTransform.page` | `none` |
| `sidebar.titleTransform.page.type` | 未設定（オブジェクトを書くときは必須） |
| `sidebar.titleTransform.page.pattern` | 未設定 |
| `sidebar.titleTransform.page.replacement` | 未設定 |
| `sidebar.titleTransform.page.flags` | 未設定 |
| `sidebar.titleTransform.directory` | `none` |
| `sidebar.titleTransform.directory.type` | 未設定（オブジェクトを書くときは必須） |
| `sidebar.titleTransform.directory.pattern` | 未設定 |
| `sidebar.titleTransform.directory.replacement` | 未設定 |
| `sidebar.titleTransform.directory.flags` | 未設定 |
| `sidebar.titleFrom` | `heading` |
| `sidebar.flattenSingleChild` | `false` |
| `toc.maxLevel` | `3` |
| `numbering.sections` | `false` |
| `figures.align` | `center` |
| `assets.embedImages` | `true` |
| `assets.maxInlineSize` | `5MB` |
| `assets.onLargeImage` | `warn` |
| `assets.budget` | 未設定 |
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
| `html.labels.openSidebar` | `lang` から |
| `html.labels.closeSidebar` | `lang` から |
| `html.labels.searchPlaceholder` | `lang` から |
| `html.labels.searchLabel` | `lang` から |
| `html.labels.clearSearch` | `lang` から |
| `html.labels.searchResults` | `lang` から |
| `html.labels.noResults` | `lang` から |
| `html.labels.contentWidthToggle` | `lang` から |
| `html.labels.useWideContent` | `lang` から |
| `html.labels.useStandardContent` | `lang` から |
| `html.labels.darkModeToggle` | `lang` から |
| `html.labels.tocLabel` | `lang` から |
| `html.labels.tocTitle` | `lang` から |
| `html.labels.pageNavLabel` | `lang` から |
| `html.labels.prev` | `lang` から |
| `html.labels.next` | `lang` から |
| `html.labels.wrapToggle` | `lang` から |
| `html.labels.copyCode` | `lang` から |
| `html.labels.copy` | `lang` から |
| `html.labels.copied` | `lang` から |
| `html.labels.copyFailed` | `lang` から |
| `html.labels.openImagePreview` | `lang` から |
| `html.labels.imagePreview` | `lang` から |
| `html.labels.closeImagePreview` | `lang` から |
| `html.labels.generatedBy` | `lang` から |
| `html.labels.version` | `lang` から |
| `html.labels.cover` | `lang` から |
| `html.labels.contents` | `lang` から |
| `pdf.pageSize` | `A4` |
| `pdf.margin.top` | `20mm` |
| `pdf.margin.right` | `15mm` |
| `pdf.margin.bottom` | `20mm` |
| `pdf.margin.left` | `15mm` |
| `pdf.printBackground` | `true` |
| `pdf.bookmarks` | `true` |
| `pdf.header` | `false` |
| `pdf.footer` | ページ番号 / 総ページ数 |
| `pdf.cover.enabled` | `false` |
| `pdf.toc.enabled` | `false` |
| `pdf.toc.depth` | `2` |
| `pdf.watermark` | `false` |
| `pdf.pageBreakLevel` | `false` |
| `pdf.density` | `normal` |
| `pdf.density.base` | `normal` |
| `pdf.density.fontSize` | `base` から |
| `pdf.density.lineHeight` | `base` から |
| `pdf.density.headingSpacing` | `base` から |
| `pdf.density.tableCellPadding` | `base` から |

### 既定値の裏にある値 {#values}

2 つの既定値は値の集まりを表し、その値も一緒に凍結します。

- `sources.excludeDefaults` が有効にする**組み込みの除外**：`_partials/**`、`partials/**`、`includes/**`、`**/_*`。
- **`pdf.density` のプリセット**。既定は `normal` です。

| プリセット | `fontSize` | `lineHeight` | `headingSpacing` | `tableCellPadding` |
| --- | --- | --- | --- | --- |
| `relaxed` | `16px` | `1.7` | `1.8em` | `0.5rem 0.8rem` |
| `normal` | `16px` | `1.45` | `0.9em` | `0.35rem 0.6rem` |
| `compact` | `14px` | `1.35` | `0.8em` | `0.3rem 0.5rem` |
| `tight` | `12px` | `1.3` | `0.6em` | `0.2rem 0.35rem` |

## コマンドとオプション {#commands}

| コマンド | 引数 | オプション |
| --- | --- | --- |
| （共通） | — | `-V, --version`, `--lang <lang>`, `-h, --help` |
| `init` | — | — |
| `build` | `[input]` | `-o, --output <path>`, `-c, --config <file>`, `-f, --format <format>` |
| `watch` | `[input]` | `-o, --output <file>`, `-c, --config <file>` |
| `serve` | `[input]` | `-o, --output <file>`, `-c, --config <file>`, `-p, --port <port>`, `-H, --host <host>`, `--open` |
| `validate` | `[input]` | `-c, --config <file>`, `--format <format>`, `--strict` |
| `help` | `[command]` | — |

どのコマンドも `-h, --help` を受け付けます。

## 診断 {#diagnostics}

`monodocs validate --format json` は `"schemaVersion": 1` を持つ報告を書きます。CI のジョブが固定するのは monodocs のバージョンではなくこの番号です。ジョブが解析する形が変わったときだけ変わり、リリースは形を変えずに検査とコードを増やせます（[コマンドオプション](./commands#json-report)）。

診断の `code` はジョブが絞り込みに使うもので、名前を変えません。コードは次のとおりです。

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

## CommonMark・GFM・AsciiDoc を超える記法 {#markup}

- **Markdown のフロントマター**：`title`、`order`、`hidden`、`description`、`aliases`。
- **AsciiDoc の属性**：`:sd-title:`、`:sd-order:`、`:sd-hidden:`、`:sd-description:`、`:sd-aliases:`。
- Markdown の **GitHub のアラート**：`> [!NOTE]`、`[!TIP]`、`[!IMPORTANT]`、`[!WARNING]`、`[!CAUTION]`。
- **ファイル間のリンク**：ほかのソースファイル（`.md`、`.adoc`、またはビルド後の `.html`）へのリンクは、`#anchor` の有無によらず、AsciiDoc の `xref:` とともに文書の中のルートになります。アンカーは、それが名指すページの中で解決します（[記法](https://github.com/kuttsun/monodocs/blob/main/docs/ja/syntax.md)）。
- **改ページ**：Markdown の `<div class="page-break"></div>` または `<div style="page-break-after: always"></div>`（受け付ける書き方は[設定ファイル](./configuration#page-breaks)にあります）、AsciiDoc の `<<<`。
- **Mermaid**：言語が `mermaid` のフェンスのブロック、AsciiDoc の `[source,mermaid]`。
- Markdown の **数式**：`$...$`、`` $`...`$ ``、`$$...$$`、言語が `math` のフェンスのブロック。AsciiDoc の `latexmath:[...]`、`asciimath:[...]`、`stem:[...]` と、`[latexmath]`、`[asciimath]`、`[stem]` のブロック。`stem` は `:stem:` 属性（`latexmath`、`latex`、`tex`、`asciimath`）に従います。

## そのほかに凍結するもの {#also}

上の表には無いが、スクリプト、テーマ、リンクが頼りにするので、これらも凍結します。

- **`MONODOCS_LANG`**：CLI 自身のメッセージの言語を、`--lang` と同じく選びます。`--lang` が優先します（[コマンドオプション](./commands)）。
- **設定ファイルを探す場所**：`-c, --config` が名指すファイルで、無ければエラーです。指定が無ければ、入力引数があるときは入力ディレクトリ（単一ファイルならそのディレクトリ）の `monodocs.config.yml` だけを、入力引数が無いときはカレントディレクトリの `monodocs.config.yml` を探します（[設定ファイル](./configuration#設定ファイルの探索場所)）。
- **オプションの既定値**：`--lang` は `MONODOCS_LANG` に従い、無ければ `en` です。設定の `lang` は文書の言語であり、CLI の言語ではありません。`validate --format` は `human` で、`--strict` が無ければ警告だけでは `validate` は失敗しません。`serve` は `127.0.0.1` のポート `4173` で待ち受け、`--open` が無ければブラウザを開きません。`-o` と `build -f` は `output.path` と `output.format` から、`-c` は上のファイルの探し方から既定値を取ります。
- **アドレス**：ページのルートは、入力ルートからの相対パスから拡張子を除いたもので、大文字小文字も文字もそのまま保ちます。どの階層でも `index` のページはそのディレクトリを表します（`index.md` は `/`、`guide/index.md` は `/guide`）。文書はそれを `#/route` として開きます。ページの ID はルートから作ります。区切りごとに小文字にし、空白をハイフンにし、文字・数字・ハイフン以外を落とし、続くハイフンを 1 つにし、両端のハイフンと空の区切りを除いて、ハイフンでつなぎます。空になれば `index` です（`/Setup/API_Reference` は `setup-apireference`、`/foo--bar` は `foo-bar`、`/` は `index`）。要素の ID は、ページの ID、ハイフン、ソースが付けた ID を続けたものです。移動したページは、`aliases`（`:sd-aliases:`）で古いルートを保ちます。
- **カスタムテーマ**は `template.html`、`style.css`、`app.js` を持てます。置かなかったものは既定のテーマのものになります。`template.html` は次のトークンを残す必要があります（[設定ファイル](./configuration#html-theme-カスタムテーマ)）。凍結するのはファイル名とこれらのトークンです。任意のトークン、<span v-pre>`{{siteDataJson}}`</span> が運ぶデータの形、既定のテーマ自身のマークアップとクラスは凍結しないので、`app.js` を差し替えるテーマや既定のマークアップにスタイルを当てるテーマは、マイナーリリースで手直しが要ることがあります。

```text
{{style}} {{sidebar}} {{pages}} {{siteDataJson}} {{appJs}} {{bodyScripts}}
```

テストは、オプションの既定値、トークン、アドレスの例をコードと照らし合わせます。アドレスの規則、ファイルの探し方、上の記法はレビューで保ちます。
