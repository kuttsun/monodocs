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
  runtime: cdn # cdn | inline

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

| キー              | 型             | 既定値 | 説明                                                            |
| ----------------- | -------------- | ------ | --------------------------------------------------------------- |
| `mermaid.enabled` | boolean        | `true` | Mermaid コードブロックを図としてレンダリングする。              |
| `mermaid.runtime` | `cdn` `inline` | `cdn`  | Mermaid ランタイムを CDN から読み込むか、完全オフライン用にインライン化するか。 |

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

## 関連

- [対応記法](https://gitlab.com/kuttsun/monodocs/-/blob/main/docs/syntax.md) — 対応範囲と、単一ファイル化に伴う制限。
- [ロードマップ](https://gitlab.com/kuttsun/monodocs/-/blob/main/docs/roadmap.md) — バージョン計画。
