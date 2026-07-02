# 設定ファイル

monodocs は任意の `monodocs.config.yml` を読み込み、ファイルを単一 HTML にまとめる挙動を制御します。設定ファイルが無ければ以下の既定値が使われるため、既定値を変更したいときだけ用意すれば十分です。

## 設定ファイルの探索場所

monodocs は次の順で設定ファイルを探します。

1. `-c, --config <file>` で渡したパス。
2. **入力ディレクトリ内**の `monodocs.config.yml`（`monodocs build ./docs` のように入力引数を渡した場合）。
3. **カレントディレクトリ**の `monodocs.config.yml`（入力引数を渡さない場合）。

`--config` を明示したのにファイルが存在しない場合はビルドが失敗します。設定内の相対パス（`input`・`output.path`）は、カレントディレクトリではなく **設定ファイルの場所** を基準に解決されます。

```bash
# ./docs/monodocs.config.yml を自動検出
monodocs build ./docs

# 設定ファイルを明示
monodocs build -c ./monodocs.config.yml
```

## 優先順位

設定は次の順（左ほど優先）でマージされます。

**CLI オプション** › **設定ファイル** › **既定値**

そのため `-o`・`--config`・`-f` といったコマンドラインの指定は常に設定ファイルより優先されます。CLI で指定できるのは `output.path`/`-o`・`output.format`/`-f`・`input`/`<入力引数>` のみで、それ以外は設定ファイル専用です。

## 全項目の例

すべてのキーは任意です。以下は全項目を既定値とともに並べた例です。

```yaml
# 出力 HTML に表示されるドキュメントタイトル
title: Documentation

# 入力ディレクトリ（CLI の入力引数で上書きされる）
input: ./docs

output:
  format: html # html | pdf | both
  path: ./dist/manual.html

sources:
  markdown:
    extensions: [.md, .markdown]
  asciidoc:
    extensions: [.adoc, .asciidoc, .asc]

sidebar:
  # 走査から除外する glob（partials/includes、_ で始まるファイル）
  exclude: ['_partials/**', 'partials/**', 'includes/**', '**/_*']
  # この階層より深いディレクトリを既定で折りたたむ。既定は未指定=全展開 / 0=全畳み
  # collapseDepth: 2
  # ナビ用タイトルの取得元: "heading"（既定）または "filename"
  titleFrom: heading
  # ページ 1 つだけのフォルダの唯一のページを親へ繰り上げる
  flattenSingleChild: false
  # 導出された表示タイトルへの変換（明示タイトル / :sd-title: には適用しない）
  titleTransform:
    page: { type: none } # none | stripNumberPrefix | regex
    directory: { type: none }

toc:
  # ページ内目次に出す見出しの最深レベル（2〜6）
  maxLevel: 3

assets:
  embedImages: true
  maxInlineSize: 5MB # "500KB"・"5MB"・またはバイト数
  onLargeImage: warn # warn | error | external

mermaid:
  enabled: true
  mode: client # client | pre-render
  runtime: inline # inline | cdn（client mode のみ）

highlight:
  enabled: true

html:
  theme: default
  colorScheme: light # light | dark | auto（OS 設定に追従）
  contentWidth: 860px # CSS 長さ、または "full"（残り幅いっぱい）
```

## リファレンス

### トップレベル

| キー     | 型     | 既定値          | 説明                                                                       |
| -------- | ------ | --------------- | -------------------------------------------------------------------------- |
| `title`  | string | `Documentation` | 出力 HTML に表示されるタイトル（`<title>`・ヘッダ）。                       |
| `input`  | string | `./docs`        | 走査する入力ディレクトリ。CLI の入力引数で上書き。設定ファイル基準の相対パス。 |

### `output`

| キー            | 型                  | 既定値                | 説明                                                       |
| --------------- | ------------------- | --------------------- | ---------------------------------------------------------- |
| `output.format` | `html` `pdf` `both` | `html`                | 出力形式。`-f, --format` で上書き。PDF は対応予定。         |
| `output.path`   | string              | `./dist/manual.html`  | 出力ファイルパス。`-o, --output` で上書き。設定ファイル基準の相対パス。 |

### `sources`

どの拡張子を Markdown / AsciiDoc として扱うかを指定します。

| キー                          | 型       | 既定値                       |
| ----------------------------- | -------- | ---------------------------- |
| `sources.markdown.extensions` | string[] | `[.md, .markdown]`           |
| `sources.asciidoc.extensions` | string[] | `[.adoc, .asciidoc, .asc]`   |

### `sidebar`

`sidebar` 配下の未知のキーはエラーになります（このセクションは厳格に検証されます）。

| キー                         | 型                   | 既定値                                                    | 説明 |
| ---------------------------- | -------------------- | --------------------------------------------------------- | ---- |
| `sidebar.exclude`            | string[]             | `['_partials/**', 'partials/**', 'includes/**', '**/_*']` | 走査から除外する glob。`_` で始まるファイルは拡張子を問わず include/partial 扱い。 |
| `sidebar.collapseDepth`      | integer              | 未指定                                                    | この階層より **深い** ディレクトリを既定で折りたたむ（トップレベル=深さ 1）。`0` で全畳み、未指定で全展開。畳んでも隠さないため到達性は失わず、いつでも開ける。 |
| `sidebar.titleFrom`          | `heading` `filename` | `heading`                                                 | ナビ用タイトルの取得元。`heading` = 明示タイトル → 見出し → ファイル名。`filename` = 見出しを飛ばしファイル名を使う（明示タイトル / `:sd-title:` はどちらでも常に最優先）。 |
| `sidebar.flattenSingleChild` | boolean              | `false`                                                   | **ページちょうど 1 つ・サブフォルダ 0** のディレクトリを畳み、唯一のページを親へ繰り上げる。ドキュメント＋画像を 1 フォルダにまとめた場合などに有効（画像はページに数えない）。 |
| `sidebar.titleTransform`     | object               | `{ page: none, directory: none }`                         | **導出された** 表示タイトル（見出し / ファイル名由来のページタイトル、フォルダ名）への変換。明示タイトル / `:sd-title:` には適用せず、route / page id も不変。下記参照。 |

#### `sidebar.titleTransform`

`page`・`directory` はそれぞれ 3 種類の変換のいずれかを受け取ります。

- `{ type: none }` — 無変換（既定）。
- `{ type: stripNumberPrefix }` — `01_setup` / `001-intro` のような先頭数字プレフィックスを除去。
- `{ type: regex, pattern, replacement, flags }` — 正規表現置換。`flags` は任意（`g` / `i` / `u` など JavaScript `RegExp` の flags）。

```yaml
sidebar:
  titleTransform:
    page: { type: stripNumberPrefix }
    directory:
      type: regex
      pattern: '-'
      replacement: ' '
      flags: g
```

### `toc`

| キー           | 型      | 既定値 | 説明                                                                        |
| -------------- | ------- | ------ | --------------------------------------------------------------------------- |
| `toc.maxLevel` | integer | `3`    | ページ内目次に出す見出しの最深レベル（2〜6）。`h1` はページタイトル相当のため常に除外。目次を浅くしても本文には常に表示されるため到達性は失わない。 |

### `assets`

| キー                   | 型              | 既定値 | 説明                                                                    |
| ---------------------- | --------------- | ------ | ----------------------------------------------------------------------- |
| `assets.embedImages`   | boolean         | `true` | ローカル画像を data URI として埋め込み、出力を自己完結に保つ。           |
| `assets.maxInlineSize` | string / number | `5MB`  | 埋め込む画像の最大サイズ。`B` / `KB` / `MB` / `GB` 接尾辞またはバイト数。 |
| `assets.onLargeImage`  | `warn` `error` `external` | `warn` | 画像が `maxInlineSize` を超えたときの挙動: 警告して埋め込む / ビルド失敗 / 外部参照のまま残す。 |

### `mermaid`

| キー              | 型                     | 既定値   | 説明                                                            |
| ----------------- | ---------------------- | -------- | --------------------------------------------------------------- |
| `mermaid.enabled` | boolean                | `true`   | Mermaid コードブロックを図としてレンダリングする。              |
| `mermaid.mode`    | `client` `pre-render`  | `client` | `client` はブラウザで mermaid ランタイムを実行（`runtime` で配給方法を選ぶ）。`pre-render` はビルド時にヘッドレス Chromium で各図を SVG 化して埋め込む（JS 不要・印刷安定・図が少数なら `inline` より小さい）。 |
| `mermaid.runtime` | `inline` `cdn`         | `inline` | **client mode 専用。** `inline`（既定）は mermaid ランタイムを HTML に埋め込み**完全オフラインで自己完結**（図があると約 975KB(gzip) 増）。`cdn` は CDN から読み込み HTML は最小だが**表示にネット接続が必要**。 |

#### `client` と `pre-render` の比較

同じ mermaid エンジンで描画するため、図の形・レイアウトは基本的に一致する。ただし次の違いがある。

| 観点                    | `client`（cdn / inline）                 | `pre-render`                                   |
| ----------------------- | ---------------------------------------- | ---------------------------------------------- |
| 自己完結                | cdn = 要ネット / inline = 自己完結       | 自己完結（SVG を埋め込み）                      |
| JavaScript              | 必要                                     | 不要                                           |
| 追加サイズ              | cdn ≈ 0 / inline ≈ 975KB(gzip) 固定      | 図の数に比例（1 図あたり数 KB）                |
| ダーク配色              | 追従しない（mermaid 既定テーマで固定）   | `html.colorScheme` で固定（`dark`→dark / 他→light） |
| フォント                | 読者のブラウザ・フォントで描画           | **ビルド環境のフォントで計測・焼き込み**       |
| 対話機能（`click` 等）  | 有効                                     | 無効（静的 SVG）                               |
| 印刷・未訪問ページの図  | 崩れる場合がある                         | 常に表示される                                 |

> **フォント注意**: `pre-render` はテキストの計測・配置を**ビルドを実行するマシンのフォント**で行い、その結果を SVG に固定する。日本語などのラベルを含む図では、ビルド環境に対応フォント（例: Noto CJK）が無いと文字化け（□）や折り返し崩れが起きる。`client` は読者環境のフォントで描画するためこの問題は出ない。npm などで導入した場合に効くのは**あなたのビルド環境のフォント**で、monodocs 側の設定では補えない点に注意。

> **既定は `client`**: `pre-render` はビルド時に Chromium を要し、無ければビルドが失敗する（環境エラーは fail fast。個々の図の構文エラーのみ警告してソース表示にフォールバック）。この依存を全員に強制しないため既定は `client`。ローカルの Chromium は `PUPPETEER_EXECUTABLE_PATH` で指定できる（開発用 Docker には同梱）。バンドル版 CLI（単一 `.cjs` / 単一実行ファイル）では `pre-render` は使えない（node_modules を持たないため。パッケージインストール版を使う）。

### `highlight`

| キー                | 型      | 既定値 | 説明                                       |
| ------------------- | ------- | ------ | ------------------------------------------ |
| `highlight.enabled` | boolean | `true` | コードブロックをシンタックスハイライト（shiki）。 |

### `html`

| キー                | 型              | 既定値    | 説明                                                                       |
| ------------------- | --------------- | --------- | -------------------------------------------------------------------------- |
| `html.theme`        | string          | `default` | 出力 HTML に使うテーマ名。                                                  |
| `html.colorScheme`  | `light` `dark` `auto` | `light` | ドキュメントを開いたときの初期配色。`auto` は OS の `prefers-color-scheme` に追従。読者が画面のトグルで切り替えるとブラウザに保存され、以降はそちらが優先される（`html.theme` のテンプレート名とは別物）。 |
| `html.contentWidth` | string / number | `860px`   | 本文領域の最大幅。CSS 長さ（`px`・`rem`・`em`・`ch`・`vw`・`%`）または数値（px）。`full`（または `none`）で残り幅いっぱいに広げる。 |

## ページの並び順とタイトル

サイドバーとページ送り（前後ナビ）の**並び順は、表示タイトルとは無関係**に決まります。`sidebar.titleFrom` / `sidebar.titleTransform` は画面に出る**文言だけ**を変えるもので、並びには影響しません。順序は次の 2 段で決まります。

1. **`order`（明示順・昇順）** — frontmatter の `order`（AsciiDoc は `:sd-order:`）。小さいほど上に来ます。
2. **ファイル名（パス）順** — `order` を持たないページ同士は、拡張子を除いた相対パスの辞書順（`localeCompare`）で並びます。`order` を持つページが常に先で、未指定のページは末尾側に回ります。

つまり `01_intro.md` を `titleTransform: stripNumberPrefix` で「intro」と表示しても、**並びは `01_` を含むファイル名で決まり**、H1 見出しの文言では並びません。数字プレフィックスで順序を固定しつつ、表示だけ整える運用ができます。

> ディレクトリ（サイドバーのフォルダ）の並びも、その中に最初に現れるページの位置で決まります（＝同じくファイル名順）。

### ページ frontmatter

各ページの先頭で、Markdown は YAML frontmatter、AsciiDoc は `:sd-*:` 属性として以下を指定できます。いずれも任意です。

| Markdown frontmatter | AsciiDoc 属性      | 型      | 説明 |
| -------------------- | ------------------ | ------- | ---- |
| `title`              | `:sd-title:`       | string  | 明示タイトル。`titleFrom` / `titleTransform` に関わらず**常に最優先**で、変換もされません。 |
| `order`              | `:sd-order:`       | number  | 並び順（昇順）。未指定ならファイル名順（`order` を持つページが先）。 |
| `hidden`             | `:sd-hidden:`      | boolean | サイドバー・前後ナビ・検索から除外します。ページ HTML は生成され、hash route で直接到達はできます。 |
| `description`        | `:sd-description:` | string  | ページの説明（メタ情報）。 |

```yaml
---
title: セットアップ
order: 10
hidden: false
description: 環境構築の手順
---
```

AsciiDoc の場合:

```asciidoc
= セットアップ
:sd-order: 10
```

## 関連

- [対応記法](https://gitlab.com/kuttsun/monodocs/-/blob/main/docs/syntax.md) — 対応範囲と、単一ファイル化に伴う制限。
- [ロードマップ](https://gitlab.com/kuttsun/monodocs/-/blob/main/docs/roadmap.md) — バージョン計画。
