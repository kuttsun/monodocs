# 設定ファイル

monodocs は任意の `monodocs.config.yml` を読み込み、ファイルを単一 HTML にまとめる挙動を制御します。設定ファイルが無ければ以下の既定値が使われるため、既定値を変更したいときだけ用意すれば十分です。

## 設定ファイルの探索場所

monodocs は次の順で設定ファイルを探します。

1. `-c, --config <file>` で渡したパス。
2. **入力ディレクトリ内**の `monodocs.config.yml`（`monodocs build ./docs` のように入力引数を渡した場合）。入力引数が単一ファイルのときは、それを含むディレクトリを見ます（`monodocs build ./docs/plan.md` は `monodocs build ./docs` と同じ設定ファイルを読みます）。
3. **カレントディレクトリ**の `monodocs.config.yml`（入力引数を渡さない場合）。

`--config` を明示したのにファイルが存在しない場合はビルドが失敗します。設定内の相対パス（`input`・`output.path`）は、カレントディレクトリではなく **設定ファイルの場所** を基準に解決されます。

```bash
# ./docs/monodocs.config.yml を自動検出
monodocs build ./docs

# 設定ファイルを明示
monodocs build -c ./monodocs.config.yml
```

## 未知のキー

すべてのキーを、階層の深さに関わらず検証します。未知のキーがあればビルドは失敗し、そのキーと、
それを含むオブジェクトを示します。

```text
error: 設定ファイル ./monodocs.config.yml の内容が不正です: pdf: Unrecognized key: "footr"
```

受理されて無視される設定は、拒否される設定より悪いためです（ファイルは正しく見え、出力を読んで
初めて分かる）。これはトップレベルにも当てはまるので、まだ存在しないキーを先取りで書くことは
できません。

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

# 文書が必要とするフォントがビルド環境に無いときの挙動。
# PDF 出力と mermaid pre-render の両方を覆うため、トップレベルに置く。
fontCheck: warn # warn | error | off

# 文書自身が名乗る情報。すべて任意で、monodocs は解釈しない（日付は解析せず、
# バージョンは何とも比較しない）。既定では未設定。
# document:
#   version: "1.2"
#   date: "2026-08-22"
#   authors: [ドキュメントチーム]

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
  # ページ化しない glob。下の既定リストを置き換えず、そこへ追加される
  # 既定: ['_partials/**', 'partials/**', 'includes/**', '**/_*']
  # exclude: [drafts/**]
  # false にすると既定リストが外れ、_ 始まりのファイルなども束に入る
  excludeDefaults: true

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
  # labels: # lang が選んだ表の上に個別の UI ラベルを差し替える
  #   tocTitle: このページの内容

pdf:
  pageSize: A4
  margin: { top: 20mm, right: 15mm, bottom: 20mm, left: 15mm }
  printBackground: true
  density: normal # relaxed | normal | compact | tight、またはオブジェクト（下記参照）
  bookmarks: true # HTML サイドバーと同じ フォルダ→ページ 構造のしおり
  header: false # false、または Chromium のクラスを使う HTML フラグメント
  footer: '<div style="width:100%;margin:0 15pt;font-family:sans-serif;font-size:8pt;color:#666;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'

```

## リファレンス

### トップレベル {#top-level}

| キー     | 型     | 既定値          | 説明                                                                       |
| -------- | ------ | --------------- | -------------------------------------------------------------------------- |
| `title`  | string | `Documentation` | 出力 HTML に表示されるタイトル（`<title>`・ヘッダ）。                       |
| `lang`   | string | `en`            | 生成する文書の言語。`<html lang>` を埋め、UI ラベルの表を選ぶ。下記参照。   |
| `fontCheck` | `warn` `error` `off` | `warn` | 文書が必要とするフォントがビルド環境に無いときの挙動。下記参照。 |
| `input`  | string | `./docs`        | 走査する入力パス。ディレクトリ、または単一のソースファイル。CLI の入力引数で上書き。設定ファイル基準の相対パス。 |
| `document` | object | 未設定 | 文書自身が名乗る情報。`version` / `date` / `authors`。下記参照。 |

#### `document`（文書自身が名乗る情報） {#document}

誰かに手渡す仕様書には、バージョンと日付が載り、多くの場合は責任者も載ります。半年後に
`docs.html` を開いた読者には、それが何のどのバージョンで、いつ時点のものなのかを知る手立てが
ほかにありません。

```yaml
title: 社内ドキュメント
document:
  version: "1.2"
  date: "2026-08-22"
  authors:
    - ドキュメントチーム
```

| キー      | 型       | 説明                                          |
| --------- | -------- | --------------------------------------------- |
| `version` | string   | 文書のバージョン。何とも比較しません。        |
| `date`    | string   | 書いたままの日付。カレンダーとして解析しません。 |
| `authors` | string[] | 文書の責任者。                                |

すべて任意で、いずれも monodocs が解釈しない文字列です。届く先は 3 か所です。

- HTML と PDF の末尾の **フッター**。1 行にまとめて出ます: `バージョン 1.2 · 2026-08-22 ·
  ドキュメントチーム`。`バージョン` という語は `lang` が選ぶラベル表から取るので文書の言語に
  従い、[`html.labels`](#labels) で差し替えられます
- **PDF の文書情報**。著者は `Author`、バージョンと日付は `Subject`、書いたままの両方の値は
  `Keywords` に入ります
- それ以外にはありません。`title` はここへ移さずトップレベルに残ります

**ビルドは自前の日付を埋め込みません。** 出力に載る日付は、あなたが書いた日付です。ビルドを
実行した時刻をフッターに入れれば、同じ入力から毎回違うバイト列が出ることになり、コミットした
`docs.html` は誰かがビルドし直すたびに差分を出します。ビルド日を入れたいワークフローは
`document.date` をワークフローから設定してください。そうすれば日付は事故ではなく決定になります。

#### `lang`（文書の言語と UI ラベル） {#lang}

生成した文書には、一致する理由のない 2 つの言語があります。ページ本文の言語と、monodocs がその周りに被せる UI の言語（検索欄、`On this page`、`No results`、`Copy`、画像プレビューの操作、前後ナビ）です。`lang` は両方を決めます。`<html lang>` を埋め、ラベルの表を選びます。

```yaml
lang: ja
```

構文的に妥当な BCP 47 タグはすべて受け付けます。あなたの文書の言語であり、`<html lang>` はそれを表明できなければならないからです。妥当でない文字列は属性に書かず拒否します。

同梱のラベル表は `en`（既定）と `ja` だけです。照合は主言語サブタグで大文字小文字を無視するので、`en-GB` / `ja-JP` / `JA` はいずれも表に行き着きます。それ以外のタグも `<html lang>` には書かれ、ラベルだけ英語に落ちて、タグ名を挙げて 1 度警告します。フランス語の文書が、ビルドを通すためだけに自分を英語だと偽る必要はありません。文言は [`html.labels`](#html-labels) で与えてください。

`lang` は文書を記述するものです。CLI 自身のメッセージの言語とは意図的に別にしてあります。文書はある言語で書かれ、書いている人の端末は別の言語を返すことがよくあり、文書の言語でビルドログの言語が変わるべきではないためです。

#### `fontCheck`（フォント不足の検出） {#font-check}

配布物は、ビルドを実行するマシンが持っているフォントで一度だけ組まれます。フォントの無い文字は豆腐（□ / ☒）になり、配った複製すべてで後から直せません。日本語には CJK フォント、絵文字には絵文字フォントが必要ですが、CI ランナーがどちらかを持っている保証はありません。

```yaml
fontCheck: warn # warn（既定） | error | off
```

`warn` は危ない文字を挙げてビルドを続けます。`error` は非 0 で終了し、PDF を書き出しません（豆腐入りの成果物を出すくらいなら止めたいパイプライン向け）。`--format both` では PDF を刷る前に HTML を書き出すため、`error` はその HTML を残したところで止まり、前回のビルドで作られた PDF もそのまま残ります（パイプラインが出力先を読む場合は掃除してください）。`off` は計測自体を行いません。

検査が走るのは、フォントが実際に決まる場所です。

- **PDF 出力**：印刷のためにすでに開いているブラウザの中で測るので、起動が増えることはありません。
- **`mermaid.mode: pre-render`**：ビルドマシンのフォントで図の文字を計測・配置し、その結果を SVG に焼き込みます。フォント不足もそこへ焼き込まれるため、PDF だけでなく HTML でもそのまま残ります。このキーが `pdf` の下ではなくトップレベルにあるのはこのためです。

素の HTML 出力は計測しませんし、その必要もありません。読者のフォントで描かれるからです。

報告されるのは文字そのものと、それを含むフォントの例です。

```text
warning: No font on the machine running this build draws 2 character(s) this document uses, so they
come out as tofu (□ / ☒) in the PDF — permanently, in every copy of it. At risk: 日 (U+65E5, e.g.
Noto Sans CJK); ✅ (U+2705, e.g. Noto Color Emoji). Install a font that covers them …
```

例に挙げるのは**フォント名であってパッケージ名ではありません**。同じフォントを供給するパッケージは Debian・Windows などプラットフォームごとに違い、違うものを名指しするくらいなら名指ししないほうがましだからです。Debian / Ubuntu なら `fonts-noto-cjk` と `fonts-noto-color-emoji` が定番で、[CI ガイド](/ja/docs/ci)ではその 2 つを入れています。

見えるもの・見えないもの:

- **実際に描かれるものだけを測ります。** サイドバー・ページ内目次・検索結果は印刷されないため、そこにしか出てこない文字は報告されません。隠れているとみなすのは `display: none` / `content-visibility: hidden` / `visibility: hidden` です。
- **単位は書記素クラスタ**で、それが現れる要素のフォントと組にして見ます。異体字セレクタや絵文字の ZWJ 列も、描かれるときの単位のまま判定されます。件数が多いときは先頭だけを挙げ、残りは件数で示します（黙って打ち切ることはしません）。
- **ヒューリスティックです。** どのフォントも描かないはずの私用領域のコードポイントと各クラスタを比べ、当たりはラスタライズして確認します。既定が `warn` なのはこのためで、誤検出が本来通るビルドを止められる形にはしません。`error` を選ぶことは、誤検出でも CI が止まるのを受け入れることです。
- **基準そのものを検証します。** 別の私用領域コードポイントと非文字を対照に使い、グリフを持たないはずの文字をこのマシンが描くと分かった場合は、そのことだけを述べ、確信を持てない所見は出しません。非常に大きな文書で最後まで測りきれなかった場合も、「問題なし」ではなくそのことを述べます。
- **既定のページ番号フッタも一緒に測ります。** 置き換えた `pdf.header` / `pdf.footer` のフラグメントは対象外です（任意の HTML であり、フォントも自分で持ち込むため）。

### `output`

| キー            | 型                  | 既定値                | 説明                                                       |
| --------------- | ------------------- | --------------------- | ---------------------------------------------------------- |
| `output.format` | `html` `pdf` `both` | `html`                | 出力形式。`-f, --format` で上書き。                         |
| `output.path`   | string              | `./dist/docs.html`  | 出力ファイルパス。`-o, --output` で上書き。設定ファイル基準の相対パス。 |

### `sources`

どの拡張子を Markdown / AsciiDoc として扱うか、そしてどのファイルを束に入れないかを指定します。

| キー                          | 型       | 既定値                       | 説明 |
| ----------------------------- | -------- | ---------------------------- | ---- |
| `sources.markdown.extensions` | string[] | `[.md, .markdown]`           | Markdown として描画する拡張子。 |
| `sources.asciidoc.extensions` | string[] | `[.adoc, .asciidoc, .asc]`   | AsciiDoc として描画する拡張子。 |
| `sources.exclude`             | string[] | `[]`                         | ページ化しない glob（入力ディレクトリからの相対パスに対して評価）。既定リストを置き換えず、**そこへ追加される**。 |
| `sources.excludeDefaults`     | boolean  | `true`                       | 既定の除外リストを適用するか。`_` 始まりのファイルも束ねたいツリーでは `false` にする。 |

既定リストは `['_partials/**', 'partials/**', 'includes/**', '**/_*']` で、ページではなく include
用の断片が置かれる場所です。`sources.exclude` はこれを置き換えずに追加します。下書き 1 つを外す
ために書いたリストが、同時にすべての断片を呼び戻してしまうのは静かな失敗で、しかも原因から遠い
ところに現れるためです。

```yaml
sources:
  exclude: [drafts/**] # これも、_partials/** なども除外されたまま
```

コマンドラインで直接名指ししたファイル（`monodocs build ./docs/_draft.md`）は、パターンに関わらず
束に入ります。名指しは明示的な選択であり、パターンが決めるのはディレクトリ走査が何を拾うかだけ
だからです。

> このキーは以前 `sidebar.exclude` にありました。いまも動き、挙動も同じ（置換ではなく追加）に
> なりましたが、警告を出します。サイドバーの設定ではなく、束そのものからファイルを外す設定
> だったためです。

### `sidebar`

| キー                         | 型                   | 既定値                                                    | 説明 |
| ---------------------------- | -------------------- | --------------------------------------------------------- | ---- |
| `sidebar.mode`               | `folder` `custom`    | `folder`                                                  | サイドバーの生成方式。`folder` はフォルダ構造から生成し、`custom` は `sidebar.items` をそのまま使う。下記参照。 |
| `sidebar.items`              | object[]             | 未指定                                                    | `mode: custom` で使うサイドバー定義。`mode: custom` とセットで指定する（片方だけはエラー）。下記参照。 |
| `sidebar.exclude`            | string[]             | 未指定                                                    | **非推奨** — [`sources.exclude`](#sources) を使う。いまも有効だが警告が出る。 |
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
`sidebar.flattenSingleChild` は適用されません。`sidebar.collapseDepth` / `sources.exclude` /
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

> **フォント注意**: `pre-render` はテキストの計測・配置を**ビルドを実行するマシンのフォント**で行い、その結果を SVG に固定する。日本語などのラベルを含む図では、ビルド環境に対応フォント（例: Noto CJK）が無いと文字化け（□）や折り返し崩れが起きる。`client` は読者環境のフォントで描画するためこの問題は出ない。npm などで導入した場合に効くのは**あなたのビルド環境のフォント**で、monodocs 側の設定では補えない点に注意。図に必要なフォントがそのマシンに無いときは [`fontCheck`](#font-check) が警告する。

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
| `version`            | Version                      | バージョン                 | フッターの `document.version` の前 |

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

### `pdf`

出力形式が `pdf` または `both` のときに適用されます。ただし 2 つだけ例外があります。
[`pdf.density`](#pdf-density) と [`pdf.pageBreakLevel`](#pdf-page-break-level) は HTML 側にも
書き込まれます。その HTML をブラウザから印刷するのも、同じ「文書を紙に載せる」行為だからです。

| キー                  | 型                | 既定値    | 説明 |
| --------------------- | ----------------- | --------- | ---- |
| `pdf.pageSize`        | string            | `A4`      | 用紙サイズ。Chromium の `format` にそのまま渡す（`A4` / `Letter` / `A3` など）。 |
| `pdf.margin`          | map               | `20mm` / `15mm` / `20mm` / `15mm` | ページ余白（CSS 長さ）を辺ごとに指定（`top` / `right` / `bottom` / `left`）。省略した辺は既定値のまま。 |
| `pdf.printBackground` | boolean           | `true`    | 背景色・背景画像を印刷する。 |
| `pdf.density`         | string / map      | `normal`  | 版面の密度。`relaxed` / `normal` / `compact` / `tight`、またはオブジェクト。下記参照。 |
| `pdf.pageBreakLevel`  | `false` / 2〜6    | `false`   | このレベルまでの見出しの前で改ページする。`2` は h2 だけ、`6` は h2〜h6。下記参照。 |
| `pdf.bookmarks`       | boolean           | `true`    | HTML サイドバーと同じ フォルダ → ページ 構造のしおりを付ける。 |
| `pdf.header`          | `false` / string  | `false`   | 各ページ上部の帯。下記参照。 |
| `pdf.footer`          | `false` / string  | ページ番号 | 各ページ下部の帯。下記参照。 |

#### `pdf.density`（版面の密度） {#pdf-density}

`pdf.margin` が決めるのは本文の始まる位置であって、どれだけ入るかではありません。枚数を決めて
いるのは、文字の大きさ・行送り・見出し上の空き・表のセル余白です。`pdf.density` はこの 4 つを
まとめて動かします。

```yaml
pdf:
  density: compact
```

| | `fontSize` | `lineHeight` | `headingSpacing` | `tableCellPadding` |
| --- | --- | --- | --- | --- |
| `relaxed` | `16px` | `1.7` | `1.8em` | `0.5rem 0.8rem` |
| `normal`（既定） | `16px` | `1.45` | `0.9em` | `0.35rem 0.6rem` |
| `compact` | `14px` | `1.35` | `0.8em` | `0.3rem 0.5rem` |
| `tight` | `12px` | `1.3` | `0.6em` | `0.2rem 0.35rem` |

**既定は画面向けではなく紙向けに組みます。** 画面で読むために書かれたスタイルシートは行送りと
見出し上の空きに余裕を持たせていて、紙の上ではその余裕が枚数を払っています。`relaxed` と `normal`
のあいだで文字の大きさは変わりません（どちらも本文は 16px です）。それでも同じ文書が少ない枚数に
なります。4 つを[並べたもの](#pdf-density-sample)を下に載せています。

**`relaxed` は画面の設定に名前を付けたものです。** 画面で読み、たまに印刷する文書のためのものです。

**文字の大きさは最初ではなく最後の手段です。** 本文の段の幅は `pdf.margin` が残した幅そのもので、
密度はそれを狭めません。つまり文字を 1 段小さくするたびに 1 行の文字数は増えます。A4 の既定余白で
は、16px でおよそ 42 字、12px では 56 字ほどです。行を長くせずに `compact` や `tight` を使いたい
ときは、同じ変更で `pdf.margin` も広げてください。

プリセットを調整したいときは、名前の代わりにオブジェクトを書きます。`base` がどのプリセットを
土台にするかを指し（既定は `normal`）、オブジェクトは名指しした値だけを差し替えます。1 つ変える
ために残り 3 つを書き写す必要はなく、将来プリセット側が調整されてもそれが届きます。

```yaml
pdf:
  density:
    base: compact
    fontSize: 12px
    lineHeight: 1.5
```

`fontSize` と `headingSpacing` は CSS の長さ（数値と `px` / `pt` / `mm` / `cm` / `in` / `rem` /
`em` のいずれか、または `0`）。`lineHeight` は単位の無い正の数。`tableCellPadding` は CSS の
padding と同じく長さ 1 つか 2 つ。それ以外（`calc(...)`、後ろに何かが続く値）は、スタイルシートに
書き込まずに拒否します。

規則の置き場所から、2 つのことが導かれます。

- **画面と違う値だけを書き出します。** `relaxed` はテーマが既にしていることの記録なので、指定して
  も印刷用の規則は 1 つも出力されません。既定は行送り・見出し上の空き・セル余白を書きますが、
  文字サイズは書きません（変えていないからです）。ブラウザから HTML を印刷するときに、あなた自身
  の基準文字サイズが使われるのはこのためです。
- **規則は `@media print` です。** 同じファイルが、画面ではこれまでどおり、紙の上ではより詰まって
  組まれます。`--format pdf` は印刷用スタイルシートを通るので密度が効き、ブラウザから HTML を
  印刷した場合も同じです。キーが `pdf` の下にあるのは、それが目的だからです。

##### 同じ文書で 4 つのプリセットを見る {#pdf-density-sample}

原稿も用紙も余白も 1 つ。`pdf.density` だけを変えて 4 回組んだものです。各サムネイルは、その隣に
ある PDF の 1 ページ目そのものです。

<div class="density-samples">
  <figure>
    <a href="../density/relaxed.pdf" target="_blank" rel="noopener">
      <img src="/ja/density/relaxed.png" alt="relaxed で組んだ 1 ページ目" loading="lazy">
    </a>
    <figcaption><code>relaxed</code> — 5 枚</figcaption>
  </figure>
  <figure>
    <a href="../density/normal.pdf" target="_blank" rel="noopener">
      <img src="/ja/density/normal.png" alt="normal で組んだ 1 ページ目" loading="lazy">
    </a>
    <figcaption><code>normal</code>（既定） — 4 枚</figcaption>
  </figure>
  <figure>
    <a href="../density/compact.pdf" target="_blank" rel="noopener">
      <img src="/ja/density/compact.png" alt="compact で組んだ 1 ページ目" loading="lazy">
    </a>
    <figcaption><code>compact</code> — 3 枚</figcaption>
  </figure>
  <figure>
    <a href="../density/tight.pdf" target="_blank" rel="noopener">
      <img src="/ja/density/tight.png" alt="tight で組んだ 1 ページ目" loading="lazy">
    </a>
    <figcaption><code>tight</code> — 2 枚</figcaption>
  </figure>
</div>

どこを見ればよいかは、文書自身に書いてあります。決める前に一度は紙で読んでください。画面上の
100% 表示では問題なく見える密度が、腕を伸ばした距離では誰も読みたくないページになることがあります。

#### `pdf.header` / `pdf.footer`（ページの帯） {#pdf-bands}

既定では、各ページの下端中央にページ番号と総ページ数が入ります。

```text
3 / 12
```

数字と区切りだけにしてあるのは意図的です。monodocs が全ページに足す唯一のテキストなので、この形なら翻訳が要らず、[`lang`](#lang) によって変わることもありません。

どちらのキーも、`false` で帯を消し、HTML フラグメントで置き換えられます。

```yaml
pdf:
  header: '<div style="width:100%;font-size:8pt;text-align:right;margin:0 15pt"><span class="title"></span></div>'
  footer: false
```

フラグメントは Chromium に渡され、**Chromium 自身のクラス**（`pageNumber` / `totalPages` / `title` / `date` / `url`）を持つ要素に値が差し込まれます。独自のトークン構文はありません。フラグメントはすでに HTML であり、Chromium のクラスの上に monodocs のトークンを重ねても、置換とエスケープの層が一段増えるだけで得るものがないためです。

つまずきやすい点が 2 つあります。

- **フラグメントは文書のスタイルを一切継承しません。** 例のようにフォントと大きさを自分で指定してください。指定しないと、本文に合ったものではなく Chromium の素の既定になります。
- **帯は余白の中に置かれます。** Chromium は帯を上下の余白の大きさに合わせるので、本文が押し出されて再レイアウトされることはありません。ただし帯より小さい余白では、帯が紙の端に貼りついた状態になります。monodocs は、下余白が既定フッタに足りないときに警告します。しきい値は決め打ちの数値ではなく、そのフッタ自身の高さを測って決めます。**置き換えフラグメントは検査しません。** 任意の HTML と CSS が収まるかは余白の値だけでは判断できず、判断したふりをすれば誤警告になるか、測定でしか守れない約束をすることになるためです。

#### `pdf.pageBreakLevel`（節ごとに紙を改める） {#pdf-page-break-level}

ソースファイルは既に新しい紙から始まります。節ごとに紙を改めなければならない文書——仕様書、規程、
紙で手渡すもの——のために、指定したレベルまでの見出しの前で改ページします。

```yaml
pdf:
  pageBreakLevel: 2
```

`2` は h2 だけ、`3` は h2 と h3、`6` は h2 から h6 まで。既定の `false` はどの見出しの前でも改ページ
せず、既存の文書を 1 枚も変えません。h1 はここでのレベルに含みません。h1 はページタイトルであり、
それが属するファイルは既に紙を改めているからです。

**見出しは、その前に描画されるものが何も無いか、あるのがページタイトルだけのときにだけ改ページ
しません。** タイトルの直後に `## 節` が続くページでは両者が同じ紙に載り（そうしないと 1 行だけの紙
ができます）、タイトルの後に導入文があるページでは節の前で改ページします。導入文はタイトルの紙に
載るものだからです。

この規則から、さらに 2 つのことが導かれます。

- **分割してはならないブロックの中の見出しはそのままにします**——表・図・コードブロック・
  admonition・引用。まとめて置くことと、その中で割ることは両立しません。
- **手動の改ページマーカーの直後の見出しもそのままにします。** そこは既にマーカーが改ページして
  おり、強制改ページが 2 つ続くと間に空白の紙が 1 枚できるからです。

密度が見出しの上に置く空きは、見出しと一緒に移動します。紙の先頭に来た見出しは、節と節を隔てる
ための空きに押し下げられず、上余白の位置に載ります。

#### 改ページ {#page-breaks}

紙がどこで終わるかは、設定ではなく文書が決めることです。ソースファイルは常に新しい紙から始まり、
ファイルの内側では、自分で置いたマーカーが新しい紙を始めます。

```markdown
改ページ前の最後の段落。

<div class="page-break"></div>

新しい紙の最初の段落。
```

```asciidoc
改ページ前の最後の段落。

<<<

新しい紙の最初の段落。
```

AsciiDoc の `<<<` は Asciidoctor 自身の改ページです。Markdown のマーカーは、Markdown→PDF 系の
ツールが落ち着いた空の `<div>` で、`<div style="page-break-after: always"></div>` も同じものとして
受け付けます。空の `div` は何も描かないので、ソースを読む場所では見えません。

Markdown の生 HTML はこれまでどおり破棄します。monodocs はマーカーを認識して、自分で組み立てた
要素に置き換えるので、書いた属性が出力へ届くことはありません。それ以外——2 つ目の属性、余分な
クラス、タグの間の文字——は、修復されるのではなく他の生 HTML と同じく破棄されます。

**Markdown で何がマーカーとして認識されるか**（1.0 で凍結するため、厳密に書きます）:

- 要素は小文字の `div` で、属性はちょうど 1 つ。`class="page-break"` または
  `style="page-break-after: always"`。
- 引用符はどちらでも構いません。`"page-break"` と `'page-break'` は同じマーカーです。
- `style` 綴りでは、コロンの後に空白かタブを置いても、何も置かなくても構わず、末尾の `;` も
  許されます。`style="page-break-after:always;"` も同じマーカーです。その 1 宣言を超えるものは
  マーカーではありません。
- ASCII の空白類（スペース・タブ・復帰・改行）は、`=` の前後、`>` の前、
  マーカー全体の前後で許され、`<div` の直後には**1 つ以上必要**です。`>` と `</div>` の**間**には
  空白 1 つも許されません。
- それ以外はすべて破棄します。`<DIV>`、`class="page-break foo"`、2 つ目の属性、自己終了の
  `<div class="page-break"/>`、コロンと `always` の間の改行、`style` の中の 2 つ目以降の宣言。

改ページが改ページであることから、さらに 2 つのことが導かれます。

- **Markdown では、マーカーはそれ自体が 1 つのブロックであること。** 引用・リスト項目・表のセル・
  見出しの中のものは認識されず破棄されます。それらは印刷時に分割しないブロックだからです
  （AsciiDoc の `<<<` は Asciidoctor 自身の構文なので、要素は Asciidoctor が置いた場所に出ます。
  そちらでも `<<<` はトップレベルに置いてください）。
- **後ろに何も無いマーカーは空白の紙を 1 枚残します。** 連続する 2 つのマーカーも同じです。
  空白の紙は、そうやって求めます。

規則は `@media print` なので、`--format pdf` にも、読み手がブラウザから HTML を印刷する場合にも
効きます。

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
