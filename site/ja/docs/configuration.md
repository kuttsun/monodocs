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

# 生成する文書の言語。<html lang> を埋め、UI ラベルの表を選ぶ。
# BCP 47 タグならなんでも指定でき、同梱の表は en と ja のみ。それ以外は警告のうえ
# en のラベルに落ちる。CLI 自身のメッセージの言語とは別物。
lang: en

# 入力ディレクトリ（CLI の入力引数で上書きされる）
input: ./docs

output:
  format: html # html | pdf | both
  path: ./dist/docs.html

sources:
  markdown:
    extensions: [.md, .markdown]
  asciidoc:
    extensions: [.adoc, .asciidoc, .asc]

sidebar:
  # "folder"（既定）はフォルダ構造から生成、"custom" は下の items をそのまま使う
  mode: folder
  # mode: custom のときのサイドバー定義（各項目は path か children のどちらか一方）
  # items:
  #   - title: ホーム
  #     path: index.md
  #   - title: セットアップ
  #     children:
  #       - path: setup/install.adoc
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
  contentWidthToggle: true # 標準幅／ワイド幅切替ボタンを表示
  contentWidthDefault: standard # standard | wide（読者が選択するまでの初期状態）
  imageLightbox: true # リンクのない装飾目的以外の本文画像をクリックして拡大表示
```

## リファレンス

### トップレベル {#top-level}

| キー     | 型     | 既定値          | 説明                                                                       |
| -------- | ------ | --------------- | -------------------------------------------------------------------------- |
| `title`  | string | `Documentation` | 出力 HTML に表示されるタイトル（`<title>`・ヘッダ）。                       |
| `lang`   | string | `en`            | 生成する文書の言語。`<html lang>` を埋め、UI ラベルの表を選ぶ。下記参照。   |
| `input`  | string | `./docs`        | 走査する入力ディレクトリ。CLI の入力引数で上書き。設定ファイル基準の相対パス。 |

#### `lang`（文書の言語と UI ラベル） {#lang}

生成した文書には、一致する理由のない 2 つの言語があります。ページ本文の言語と、monodocs がその周りに被せる UI の言語（検索欄、`On this page`、`No results`、`Copy`、画像プレビューの操作、前後ナビ）です。`lang` は両方を決めます。`<html lang>` を埋め、ラベルの表を選びます。

```yaml
lang: ja
```

構文的に妥当な BCP 47 タグはすべて受け付けます。あなたの文書の言語であり、`<html lang>` はそれを表明できなければならないからです。妥当でない文字列は属性に書かず拒否します。

同梱のラベル表は `en`（既定）と `ja` だけです。照合は主言語サブタグで大文字小文字を無視するので、`en-GB` / `ja-JP` / `JA` はいずれも表に行き着きます。それ以外のタグも `<html lang>` には書かれ、ラベルだけ英語に落ちて、タグ名を挙げて 1 度警告します。フランス語の文書が、ビルドを通すためだけに自分を英語だと偽る必要はありません。文言は [`html.labels`](#html-labels) で与えてください。

`lang` は文書を記述するものです。CLI 自身のメッセージの言語とは意図的に別にしてあります。文書はある言語で書かれ、書いている人の端末は別の言語を返すことがよくあり、文書の言語でビルドログの言語が変わるべきではないためです。

### `output`

| キー            | 型                  | 既定値                | 説明                                                       |
| --------------- | ------------------- | --------------------- | ---------------------------------------------------------- |
| `output.format` | `html` `pdf` `both` | `html`                | 出力形式。`-f, --format` で上書き。                         |
| `output.path`   | string              | `./dist/docs.html`  | 出力ファイルパス。`-o, --output` で上書き。設定ファイル基準の相対パス。 |

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
| `sidebar.mode`               | `folder` `custom`    | `folder`                                                  | サイドバーの生成方式。`folder` はフォルダ構造から生成し、`custom` は `sidebar.items` をそのまま使う。下記参照。 |
| `sidebar.items`              | object[]             | 未指定                                                    | `mode: custom` で使うサイドバー定義。`mode: custom` とセットで指定する（片方だけはエラー）。下記参照。 |
| `sidebar.exclude`            | string[]             | `['_partials/**', 'partials/**', 'includes/**', '**/_*']` | 走査から除外する glob。`_` で始まるファイルは拡張子を問わず include/partial 扱い。 |
| `sidebar.collapseDepth`      | integer              | 未指定                                                    | この階層より **深い** ディレクトリを既定で折りたたむ（トップレベル=深さ 1）。`0` で全畳み、未指定で全展開。畳んでも隠さないため到達性は失わず、いつでも開ける。 |
| `sidebar.titleFrom`          | `heading` `filename` | `heading`                                                 | ナビ用タイトルの取得元。`heading` = 明示タイトル → 見出し → ファイル名。`filename` = 見出しを飛ばしファイル名を使う（明示タイトル / `:sd-title:` はどちらでも常に最優先）。 |
| `sidebar.flattenSingleChild` | boolean              | `false`                                                   | **ページちょうど 1 つ・サブフォルダ 0** のディレクトリを畳み、唯一のページを親へ繰り上げる。ドキュメント＋画像を 1 フォルダにまとめた場合などに有効（画像はページに数えない）。 |
| `sidebar.titleTransform`     | object               | `{ page: none, directory: none }`                         | **導出された** 表示タイトル（見出し / ファイル名由来のページタイトル、フォルダ名）への変換。明示タイトル / `:sd-title:` には適用せず、route / page id も不変。下記参照。 |

#### `sidebar.items`（カスタムサイドバー）

`sidebar.mode: custom` では、サイドバーの構造・順序・タイトルを書いたとおりに使います。

```yaml
sidebar:
  mode: custom
  items:
    - title: ホーム
      path: index.md
    - title: セットアップ
      children:
        - path: setup/install.adoc
        - title: 設定 # ページタイトルより優先される
          path: setup/config.md
```

各項目は `path`（ページ）か `children`（グループ）のどちらか一方だけを持ちます。

- `path` は `input` からの相対パスで、拡張子まで書きます（`setup/install.adoc`）。先頭の `./` と `\` 区切りも受け付けます。
- `title` はページでは省略可能（省略時はページ自身のタイトル）、グループでは必須です。

カスタムサイドバーは **閲覧順** も決めます。前後ナビ、PDF のページ順、初期表示ページはこの並びに従います。
`items` に載せなかったページは hash route では到達でき、`monodocs validate` が警告として報告します
（閲覧順では掲載ページの後ろに置かれます）。`hidden` なページを書いた場合は警告つきでスキップし、
ページがすべて消えたグループは出力しません。存在しないパスはエラーです。

構造とタイトルを明示するモードのため、`sidebar.titleTransform.directory` と
`sidebar.flattenSingleChild` は適用されません。`sidebar.collapseDepth` / `sidebar.exclude` /
`sidebar.titleFrom` / `sidebar.titleTransform.page` はこれまでどおり有効です。

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
| `html.theme`        | string          | `default` | 組み込みテーマ名（`default`）か、カスタムテーマディレクトリのパス（`./my-theme`。設定ファイル基準で解決）。下記参照。 |
| `html.colorScheme`  | `light` `dark` `auto` | `light` | ドキュメントを開いたときの初期配色。`auto` は OS の `prefers-color-scheme` に追従。読者が画面のトグルで切り替えるとブラウザに保存され、以降はそちらが優先される（`html.theme` のテンプレート名とは別物）。 |
| `html.contentWidth` | string / number | `860px`   | 本文領域の最大幅。CSS 長さ（`px`・`rem`・`em`・`ch`・`vw`・`%`）または数値（px）。`full`（または `none`）で残り幅いっぱいに広げる。 |
| `html.contentWidthToggle` | boolean | `true` | 読者向けの標準幅／ワイド幅切替ボタンを表示する。`false` の場合は保存済みの読者設定と `html.contentWidthDefault` を無視する。 |
| `html.contentWidthDefault` | `standard` `wide` | `standard` | 本文幅の初期状態。読者の選択が保存されている場合はそちらを優先する。 |
| `html.imageLightbox` | boolean | `true` | リンクのない装飾目的以外の本文画像をクリックまたはキーボード操作すると、画面内に収まる大きさのダイアログで表示する。リンク付き画像は元のリンク動作を維持し、`alt` が明示的に空の画像は装飾画像のままにする。印刷および PDF 出力にはダイアログを含めない。 |
| `html.labels`        | map     | （`lang` 由来） | [`lang`](#lang) が選んだ表の上に、個別の UI ラベルを差し替える。未知のキーは拒否する。下記参照。 |

#### `html.labels`（UI ラベル） {#html-labels}

各エントリは、`lang` が選んだ表のラベルを 1 つ差し替えます。書かなかったものは表の文言のままです。monodocs が表を同梱していない言語を与える手段でもあります。

```yaml
lang: fr
html:
  labels:
    tocTitle: Sur cette page
    noResults: Aucun résultat
```

未知のキーは無視せず拒否します。タイプミスが黙って既定のまま残らないようにするためです。その結果としてキー集合は設定の一部になるので、テーマがたまたま読むものに委ねず、ここに全部を列挙します。

| キー                 | `en`                         | `ja`                       | 現れる場所 |
| -------------------- | ---------------------------- | -------------------------- | ---------- |
| `openSidebar`        | Open sidebar                 | サイドバーを開く           | サイドバーを閉じているときの ☰ ボタン |
| `closeSidebar`       | Close sidebar                | サイドバーを閉じる         | サイドバーヘッダの « ボタン |
| `searchPlaceholder`  | Search…                      | 検索…                      | 検索欄のプレースホルダ |
| `searchLabel`        | Search documents             | ドキュメントを検索         | 検索欄のアクセシブル名 |
| `searchResults`      | Search results               | 検索結果                   | 結果一覧のアクセシブル名 |
| `noResults`          | No results                   | 該当なし                   | 一致が無いときの表示 |
| `contentWidthToggle` | Toggle content width         | 本文幅を切り替え           | 本文幅ボタンのアクセシブル名 |
| `useWideContent`     | Use wide content             | 本文を広く表示             | 標準幅のときの本文幅ボタンの説明 |
| `useStandardContent` | Use standard content width   | 本文を標準の幅で表示       | 広い幅のときの本文幅ボタンの説明 |
| `darkModeToggle`     | Toggle dark mode             | ダークモードを切り替え     | ダークモードボタン |
| `tocLabel`           | Table of contents            | 目次                       | ページ内目次のアクセシブル名 |
| `tocTitle`           | On this page                 | このページの内容           | ページ内目次の見出し |
| `pageNavLabel`       | Page navigation              | ページ移動                 | 前後ナビのアクセシブル名 |
| `prev`               | ← Prev                       | ← 前へ                     | 前のページへのリンク |
| `next`               | Next →                       | 次へ →                     | 次のページへのリンク |
| `wrapToggle`         | Toggle word wrap             | 折り返しを切り替え         | コードブロックの折り返しボタン |
| `copyCode`           | Copy code                    | コードをコピー             | コピーボタンのアクセシブル名 |
| `copy`               | Copy                         | コピー                     | コピーボタンの説明 |
| `copied`             | Copied!                      | コピーしました             | コピー成功時の表示 |
| `copyFailed`         | Copy failed                  | コピーできませんでした     | コピー失敗時の表示 |
| `openImagePreview`   | Open image preview           | 画像を拡大表示             | 拡大できる画像のアクセシブル名 |
| `imagePreview`       | Image preview                | 画像プレビュー             | 画像プレビューのアクセシブル名 |
| `closeImagePreview`  | Close image preview          | 画像プレビューを閉じる     | 画像プレビューの閉じるボタン |
| `generatedBy`        | Generated by                 | 生成:                      | ブランディングフッターの接頭辞 |

カスタムテーマが受け取れるものはテーマ契約の範囲に収まり、4 つの場合で異なります。

- **すべてのテーマ**は、解決済みのラベルを <span v-pre>`{{siteDataJson}}`</span> のデータとして受け取ります。無条件の保証はこれだけです。
- **既定の `app.js`** は、既定テンプレートが用意する DOM フックにそれを適用します。`style.css` だけを差し替えたテーマは組み込みと同じ挙動になります。`template.html` を差し替えたテーマは、<span v-pre>`{{labelTocTitle}}`</span> などの <span v-pre>`{{label…}}`</span> トークンを残した箇所にだけ入り、それ以外には入りません。
- **`app.js` を差し替えたテーマ**は、データを受け取って自分で適用します。
- **カスタム `template.html` が自分で書いた静的テキスト**は書いたままです。他人のマークアップのどの文字列がラベルのつもりだったかは、monodocs には知りようがありません。

<span v-pre>`{{lang}}`</span> は任意トークンなので、`<html lang="…">` を直接書いたカスタムテンプレートは書いたものをそのまま保ちます。

#### `html.theme`（カスタムテーマ）

パスらしき値（`.` 始まり、区切り文字を含む、絶対パス）はカスタムテーマのディレクトリとして扱い、
設定ファイル基準で解決します。それ以外は組み込みテーマ名です。

```yaml
html:
  theme: ./my-theme
```

ディレクトリには次の 3 ファイルのうち置きたいものだけを入れます。**置かなかったものは既定テーマで
補われます**。

| ファイル        | 置き換わるもの                                                             |
| --------------- | -------------------------------------------------------------------------- |
| `style.css`     | ドキュメントの CSS 全体（既定のスタイルシートとマージはしません）。         |
| `template.html` | HTML の骨組み（サイドバー・本文・スクリプトの配置位置を含む）。             |
| `app.js`        | クライアントスクリプト（hash ルーティング、検索、目次、前後ナビ、ダークモード、コードブロック操作、画像 lightbox）。 |

配色だけ変えるテーマは 1 ファイルで済み、将来クライアント側に機能が増えてもそのまま動きます。
`app.js` を置き換える場合は、上記の対話的な挙動をすべて自分で引き受けることになります。

カスタムの `template.html` では次のトークンが必須です。欠けると文書が成立しないため、ビルドが
エラーで止まります。

```text
{{style}}  {{sidebar}}  {{pages}}  {{siteDataJson}}  {{appJs}}  {{bodyScripts}}
```

残りは任意で、省いた分の機能が出力から消えるだけです。

```text
{{title}}                                                    ドキュメントタイトル
{{htmlAttrs}}                                                初期配色
{{bodyAttrs}} {{contentWidthTogglePressed}} {{contentWidthToggleTitle}}   本文幅の切り替え
{{generatorVersion}}                                         ブランディングフッターのバージョン
{{#contentWidthToggle}} {{#imageLightbox}} {{#branding}} {{#generatorVersion}}   任意ブロック
```

出力は単一の自己完結ファイルなので、テーマから外部アセットを参照できません。フォントや画像は
`style.css` に data URI で埋め込んでください。`monodocs watch` / `monodocs serve` はテーマ
ディレクトリも監視するので、編集はプレビューへ反映されます（監視開始時にディレクトリが存在している
必要があり、後から作成した場合は次にソースか設定が変わったときに拾います）。テーマは文書に埋め込まれる実行可能な
コードです。ドキュメントのソースと同じ信頼度で扱ってください。

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

- [対応記法](https://github.com/kuttsun/monodocs/blob/main/docs/syntax.md) — 対応範囲と、単一ファイル化に伴う制限。
- [ロードマップ](https://github.com/kuttsun/monodocs/blob/main/docs/roadmap.md) — バージョン計画。
