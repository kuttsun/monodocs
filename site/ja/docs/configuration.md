# 設定ファイル

monodocs は任意の `monodocs.config.yml` を読み込み、ファイルを単一 HTML にまとめる挙動を制御します。設定ファイルが無ければ以下の既定値が使われます。

## 設定ファイルの探索場所

monodocs は次の順で設定ファイルを探します。

1. `-c, --config <file>` で渡したパス。
2. **入力ディレクトリ内**の `monodocs.config.yml`（`monodocs build ./docs` のように入力引数を渡した場合）。入力引数が単一ファイルのときは、それを含むディレクトリを見ます（`monodocs build ./docs/plan.md` は `monodocs build ./docs` と同じ設定ファイルを読みます）。
3. **カレントディレクトリ**の `monodocs.config.yml`（入力引数を渡さない場合）。

`--config` で明示したファイルが存在しなければビルドは失敗します。設定内の相対パス（`input`・`output.path`）は、カレントディレクトリではなく **設定ファイルの場所** を基準に解決されます。

```bash
# ./docs/monodocs.config.yml を自動検出
monodocs build ./docs

# 設定ファイルを明示
monodocs build -c ./monodocs.config.yml
```

## 未知のキー

すべてのキーを、階層の深さに関わらず検証します。未知のキーがあればビルドは失敗し、そのキーと、
それを含むオブジェクトを示します。タイプミスが黙って無視されることはありません。

```text
error: 設定ファイル ./monodocs.config.yml の内容が不正です: pdf: Unrecognized key: "footr"
```

これはトップレベルにも当てはまります。後のリリースで入るキーは、更新するまで書けません。

## 優先順位

設定は次の順（左ほど優先）でマージされます。

**CLI オプション** › **設定ファイル** › **既定値**

`-o`・`--config`・`-f` といったコマンドラインの指定は常に優先されます。CLI で指定できるのは `output.path`/`-o`・`output.format`/`-f`・`input`/`<入力引数>` のみで、それ以外は設定ファイル専用です。

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

# 相対的なものすべての基準。既定は input の値。
# 複数のディレクトリから 1 つの文書を組むときに、sources.include と一緒に書く
# root: "."

output:
  format: html # html | pdf | both
  path: ./dist/docs.html

sources:
  markdown:
    extensions: [.md, .markdown]
  asciidoc:
    extensions: [.adoc, .asciidoc, .asc]
  # ページ化しうるものを選ぶ glob（root からの相対）。未指定なら root 配下すべてが候補。
  # exclude はここから引き、しかも最後に引く
  # include: [README.md, docs/**]
  # ページ化しない glob。下の既定リストを置き換えず、そこへ追加される
  # 既定: ['_partials/**', 'partials/**', 'includes/**', '**/_*']
  # exclude: [drafts/**]
  # false にすると既定リストが外れ、_ 始まりのファイルなども束に入る
  excludeDefaults: true
  # 段落の中の改行をどう扱うか: space（既定）/ break / join
  lineBreak: space

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

numbering:
  sections: false # false か、番号を付ける最も深い見出しレベル（2〜6）

assets:
  embedImages: true
  maxInlineSize: 5MB # "500KB"・"5MB"・またはバイト数
  onLargeImage: warn # warn | error | external
  # budget: 10MB # 既定は未設定。出力がこれを超えたら知らせる
  onBudget: warn # warn | error

mermaid:
  enabled: true
  mode: client # client | pre-render
  runtime: inline # inline | cdn（client mode のみ）

highlight:
  enabled: true

math:
  enabled: true

html:
  theme: default
  colorScheme: light # light | dark | auto（OS 設定に追従）
  contentWidth: 860px # CSS 長さ、または "full"（残り幅いっぱい）
  contentWidthToggle: true # 標準幅／ワイド幅切替ボタンを表示
  contentWidthDefault: standard # standard | wide（読者が選択するまでの初期状態）
  imageLightbox: true # リンクのない装飾目的以外の本文画像と Mermaid 図をクリックして拡大表示
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
  cover:
    enabled: false # true で title と document から表紙を生成する
  watermark: false # false、またはすべての紙の背面に印刷する 1 行のテキスト
  toc:
    enabled: false # true で本文の前にページ番号付きの目次を印刷する
    depth: 2 # 載せる見出しの最も深いレベル（2〜6）

```

## リファレンス

### トップレベル {#top-level}

| キー     | 型     | 既定値          | 説明                                                                       |
| -------- | ------ | --------------- | -------------------------------------------------------------------------- |
| `title`  | string | `Documentation` | 出力 HTML に表示されるタイトル（`<title>`・ヘッダ）。                       |
| `lang`   | string | `en`            | 生成する文書の言語。`<html lang>` を埋め、UI ラベルの表を選ぶ。下記参照。   |
| `fontCheck` | `warn` `error` `off` | `warn` | 文書が必要とするフォントがビルド環境に無いときの挙動。下記参照。 |
| `input`  | string | `./docs`        | 走査する入力パス。ディレクトリ、または単一のソースファイル。CLI の入力引数で上書き。設定ファイル基準の相対パス。 |
| `root`   | string | `input` の値    | 相対的なものすべての基準になるディレクトリ。route・画像・`include::`・設定ファイル。下記参照。 |
| `document` | object | 未設定 | 文書自身が名乗る情報。`version` / `date` / `authors`。下記参照。 |

#### `root`（複数のディレクトリから 1 つの文書を組む） {#root}

リポジトリ直下の `README.md` と `docs/` のページを 1 つの文書にするには、ルートを 1 つのまま、
入れるものを選びます。ルートが 1 つなのは、4 つの問いに同時に答えているからです。
`monodocs.config.yml` をどこから探すか、route が何からの相対か、画像をどのディレクトリから読んでよいか、
AsciiDoc の `include::` がどこまで届いてよいか。

```yaml
root: "."
sources:
  include:
    - "README.md"
    - "docs/**"
```

- `root` の既定値は `input` の値です。`input: ./docs` だけなら「`root: ./docs` で配下すべてを含める」
  です。
- route は `root` からの相対パスで作ります。したがって `docs/` のツリーに `README.md` を足すと、その
  中の全ページの route が変わり、`docs/index.md` は `/` ではなく `/docs` になります。
- `input` と `root` を併記できるのは、同じディレクトリを指すときだけです。それ以外は設定エラーで、
  `root` の**内側**を指す `input` も同様です。この規則はコマンドラインにも及び、`root: "."` の設定に
  対する `monodocs build ./docs` は、どちらかを選ばずに止まります。
- `input` を書かずに `root` を書いた場合、ビルドが指すのは既定の `./docs` ではなく `root` です。
  `root` にはファイルではなくディレクトリを指定してください。

> [!NOTE]
> 組み込みの除外パターンはルートを基準にしています。`_partials/**` はルート直下のディレクトリにだけ
> 当たるので、`root: "."` のもとでは `docs/_partials/` には当たりません。外したい場合は
> `sources.exclude` に書いてください。名前が `_` で始まるファイルは、`**/_*` によりどの深さでも
> 当たります。

#### `document`（文書自身が名乗る情報） {#document}

文書のバージョン・日付・作成者を記録します。読者は、手元のものがどのバージョンで、いつ時点の
ものかを知れます。

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

すべて任意で、いずれも monodocs が解釈しない文字列です。前後の空白だけは除去し、空白だけの値は
未設定として扱います。値が出るのは次の 3 か所だけです。

- HTML と PDF の末尾の **フッター**。1 行にまとめて出ます: `バージョン 1.2 · 2026-08-22 ·
  ドキュメントチーム`。`バージョン` という語は `lang` が選ぶラベル表から取り、
  [`html.labels`](#html-labels) で差し替えられます
- **PDF の文書情報**。著者は `Author`、バージョンと日付は `Subject`、書いたままの両方の値は
  `Keywords` に入ります
- **PDF の表紙**。[`pdf.cover`](#pdf-cover) を有効にしたときに、`title` の下に載ります

`title` はここへ移さずトップレベルに残ります。

> [!NOTE]
> ビルドは自前の日付を埋め込みません。出力に載る日付は、あなたが書いた日付です。
> ビルド日を載せたい場合は、`document.date` をワークフローから設定してください。

#### `lang`（文書の言語と UI ラベル） {#lang}

`lang` は文書の言語を決めます。`<html lang>` を埋め、monodocs がページの周りに被せる UI（検索欄、`On this page`、`No results`、`Copy`、画像プレビューの操作、前後ナビ）のラベル表を選びます。

```yaml
lang: ja
```

- 構文的に妥当な BCP 47 タグはすべて受け付けます。妥当でない文字列は属性に書かず拒否します。
- 同梱のラベル表は `en`（既定）と `ja` だけです。照合は主言語サブタグで大文字小文字を無視するので、`en-GB` / `ja-JP` / `JA` はいずれも表に行き着きます。それ以外のタグも `<html lang>` には書かれ、ラベルだけ英語に落ちて、タグ名を挙げて 1 度警告します。文言は [`html.labels`](#html-labels) で与えてください。

> [!NOTE]
> `lang` は CLI 自身のメッセージの言語ではありません。ビルドログの言語は文書の言語に連動しません。

#### `fontCheck`（フォント不足の検出） {#font-check}

出力はビルドマシンのフォントで組まれ、フォントの無い文字は豆腐（□ / ☒）になって、配った複製すべてで後から直せません。日本語には CJK フォント、絵文字には絵文字フォントが必要ですが、CI ランナーがどちらかを持っている保証はありません。

```yaml
fontCheck: warn # warn（既定） | error | off
```

- `warn` は危ない文字を挙げてビルドを続けます。
- `error` は非 0 で終了し、PDF を書き出しません。
- `off` は計測自体を行いません。

> [!WARNING]
> `--format both` では PDF を刷る前に HTML を書き出すため、`error` でもその HTML は残り、前回のビルドで作られた PDF もそのまま残ります。パイプラインが出力先を読む場合は掃除してください。

検査が走るのは、フォントが決まる場所です。

- **PDF 出力**：印刷のためにすでに開いているブラウザの中で測るので、起動が増えることはありません。
- **`mermaid.mode: pre-render`**：ビルドマシンのフォントで計測した図の文字を SVG に焼き込むので、フォント不足は PDF だけでなく HTML にも残ります。このキーが `pdf` の下ではなくトップレベルにあるのはこのためです。

素の HTML 出力は計測しません。読者のフォントで描かれるからです。

報告されるのは文字そのものと、それを含むフォントの例です。

```text
warning: No font on the machine running this build draws 2 character(s) this document uses, so they
come out as tofu (□ / ☒) in the PDF — permanently, in every copy of it. At risk: 日 (U+65E5, e.g.
Noto Sans CJK); ✅ (U+2705, e.g. Noto Color Emoji). Install a font that covers them …
```

例に挙げるのは**フォント名であってパッケージ名ではありません**。パッケージはプラットフォームごとに違うからです。Debian / Ubuntu なら `fonts-noto-cjk` と `fonts-noto-color-emoji` が定番で、[CI ガイド](/ja/docs/ci)ではその 2 つを入れています。

見えるもの・見えないもの:

- **実際に描かれるものだけを測ります。** サイドバー・ページ内目次・検索結果は印刷されないため、そこにしか出てこない文字は報告されません。隠れているとみなすのは `display: none` / `content-visibility: hidden` / `visibility: hidden` です。
- **単位は書記素クラスタ**で、それが現れる要素のフォントと組にして見ます。異体字セレクタや絵文字の ZWJ 列も、描かれるときの単位のまま判定されます。件数が多いときは先頭だけを挙げ、残りは件数で示します。
- **ヒューリスティックです。** どのフォントも描かないはずの私用領域のコードポイントと各クラスタを比べ、当たりはラスタライズして確認します。そのため既定は `warn` で、`error` を選ぶことは、誤検出でも CI が止まるのを受け入れることです。
- **基準そのものを検証します。** 別の私用領域コードポイントと非文字を対照に使い、グリフを持たないはずの文字をこのマシンが描くと分かった場合は、そのことを述べ、不足文字は報告しません。数式のフォントが MATH テーブルを持つかはこの基準に依らないので、その所見は出し、`error` ではビルドを止めます。非常に大きな文書で最後まで測りきれなかった場合も、「問題なし」ではなくそのことを述べます。
- **既定のページ番号フッタも一緒に測ります。** 置き換えた `pdf.header` / `pdf.footer` のフラグメントは対象外です（任意の HTML であり、フォントも自分で持ち込むため）。
- **数式は描かれるとおりに測ります。** 1 文字の変数は数学用イタリックの文字（`x` なら `𝑥`、U+1D465）で描かれるので、測るのもその文字です。数式用のフォントが無いマシンでは、`x` 自体は描けても報告されます。また、数式を描くフォントは OpenType MATH テーブルを持つ必要があり、無いと括弧・波括弧・根号が中身に合わせて伸びません。そのようなフォントは `font/no-math-table` として報告し、`warn` / `error` / `off` の扱いも同じです。Windows には Cambria Math が付属し、Debian と Ubuntu では `fonts-lmodern` が Latin Modern Math を提供します。

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
| `sources.asciidoc.attributes` | object   | 未指定                       | Asciidoctor 属性を、ロックではなく**既定値**として設定します。自分で指定した文書が勝ちます。下記参照。 |
| `sources.include`             | string[] | 未指定                       | ページ化しうるものを選ぶ glob（`root` からの相対）。未指定なら `root` 配下すべてが候補。`sources.exclude` はここから引き、しかも最後に引く。否定パターン（`!…`）はどちらのリストでも拒否されます。パターンは OR で結合されるため、否定パターンはほとんどすべてのパスに当たるからです。 |
| `sources.exclude`             | string[] | `[]`                         | ページ化しない glob（`root` からの相対パスに対して評価）。既定リストを置き換えず、**そこへ追加される**。 |
| `sources.excludeDefaults`     | boolean  | `true`                       | 既定の除外リストを適用するか。`_` 始まりのファイルも束ねたいツリーでは `false` にする。 |
| `sources.lineBreak`           | string   | `space`                      | 段落の中の改行をどう扱うか。Markdown と AsciiDoc の両方に効く。`space` は CommonMark と Asciidoctor のまま（ブラウザは空白として描く）。`break` は `<br>` にする。AsciiDoc では `hardbreaks-option` を既定値として設定するので、`:hardbreaks-option!:` と書いた文書は自分の行を繋いだままにできる。`join` は東アジアの文字（East_Asian_Width が F・W・H で、どちらもハングルでないもの）に挟まれた改行を取り除く。日本語の文がそうした文字で終わり、次の文もそうした文字で始まる箇所では、どのブラウザでも PDF でも空白が出ない。それ以外の改行は残す。英数字（`[^1]` のような脚注参照を含む）、`…` や `→` のような曖昧幅の文字、インラインコードや画像に接する改行がこれに当たる。`break` は見出しを変えず、どちらの値も `pre` と `code` の中身は変えない。検索インデックスも同じ値に従う。 |

既定リストは `['_partials/**', 'partials/**', 'includes/**', '**/_*']` で、ページではなく include
用の断片が置かれる場所です。`sources.exclude` はこれを置き換えずに追加するので、下書き 1 つを外しても
断片が束に戻ることはありません。

```yaml
sources:
  exclude: [drafts/**] # これも、_partials/** なども除外されたまま
```

コマンドラインで直接名指ししたファイル（`monodocs build ./docs/_draft.md`）は、パターンに関わらず
束に入ります。パターンが決めるのはディレクトリ走査が何を拾うかだけです。

> [!NOTE]
> `sources.exclude` は以前 `sidebar.exclude` にありました。いまも動き、挙動も同じ（置換ではなく
> 追加）ですが、警告を出します。一致したファイルはナビゲーションだけでなく、束そのものから
> 外れるためです。

#### `sources.asciidoc.attributes`（文書一式で共有する値） {#asciidoc-attributes}

すべての AsciiDoc ファイルに Asciidoctor 属性を設定します。`:sectnums:` を全ファイルに書かずに
済ませたり、ファイル間で共有したい値（製品名、リリース番号、顧客名）を置いたりできます。

```yaml
sources:
  asciidoc:
    attributes:
      sectnums: true
      product: "Widget"
      release: "7.2"
```

ここで設定した属性は**ロックではなく既定値**なので（Asciidoctor の API の既定とは逆）、自分で
指定した文書が勝ちます。

```asciidoc
= リリースノート
:product: Gadget

出荷: {product}   // Widget ではなく Gadget
```

個別に切るのも同じで、文書側で `:sectnums!:` と書きます。

`sectnums` はファイルごとに番号を付け、次のファイルでは 1 から数え直します。文書全体を 1 つとして
番号付けするには、代わりに [`numbering.sections`](#numbering) を使います。これが有効な間、
`sectnums` は拒否されます。

中身は素通しせず分類します。境界を動かす属性があるからです。

- **許可**し、ビルドごとに設定できるもの: `sectnums` / `sectnumlevels` / `experimental` /
  `idprefix` / `idseparator` / `tabsize` / `toclevels` などの体裁と構造の属性。
- **書き手が定義するもの**: monodocs が押さえていない名前すべて。列挙ではなく形で認識します。
- **拒否**し、属性名と理由を告げるもの: `allow-uri-read` / `docinfo` / `backend` / `data-uri` /
  `imagesdir` / `source-highlighter`、そして monodocs に属する `sd-*` 名前空間。
  `allow-uri-read` は `include::` に URL を取りに行かせてビルドを HTTP クライアントに変え、safe mode
  もこれを止めません（safe mode が参照する当の属性だからです）。
- **そもそも受け付けないもの**: サンドボックスである `safe` と `base_dir`、パスの解決先を決める
  `docdir` / `docfile` / `docname` / `docfilesuffix` / `outdir`、相互参照の見た目——ひいてはそれを
  hash route に変えられるかどうか——を決める `outfilesuffix` / `relfilesuffix`、そしてページタイトル・
  見出し一覧・すべての要素 ID の元になっている `showtitle`。

属性名は装飾なしで書いてください（英小文字・数字・アンダースコア・ハイフン）。`@` や `!` を含む名前は
拒否します。Asciidoctor はそれらを soft set や unset として読むので、その属性が上の分類をすり抜けて
しまうからです。

unset は提供しません（値 `false` と末尾が `!` の名前は拒否）。個別に外すのは文書側の仕事です。
末尾が `@` の値も拒否します。それは「文書側が上書きしてよい」ことを表す Asciidoctor の印であり、
monodocs がここのすべての値に既に付けるものです。

> [!NOTE]
> Markdown には対応物を用意しません。Markdown の本文に `vars:` を差し込むのはテンプレート言語に
> なるためです。共有したい値を使うページは AsciiDoc で書いてください。

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

- `items` に載せなかったページは hash route では到達でき、閲覧順では掲載ページの後ろに置かれ、
  `monodocs validate` が警告として報告します。
- `hidden` なページを書いた場合は警告つきでスキップし、ページがすべて消えたグループは出力しません。
- 存在しないパスはエラーです。

このモードでは `sidebar.titleTransform.directory` と `sidebar.flattenSingleChild` は適用されません。
`sidebar.collapseDepth` / `sources.exclude` / `sidebar.titleFrom` / `sidebar.titleTransform.page` は
これまでどおり有効です。

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

### `numbering` {#numbering}

| キー                 | 型                | 既定値  | 説明 |
| -------------------- | ----------------- | ------- | ---- |
| `numbering.sections` | `false` / integer | `false` | 文書全体を通して、このレベル（2〜6）までの見出しに番号を付ける。後述。 |

AsciiDoc の `:sectnums:` はファイルごとに 1 から数え直し、Markdown には番号付けがありません。
`numbering.sections` は、束ねた文書を 1 つの文書として番号付けするので、文書が自分自身を番号で
参照できます（「3.2 を参照」）。

```yaml
numbering:
  sections: 3 # h2 と h3 に番号を付ける。h4 以下には付けない
```

- **番号はサイドバーが決めます。** ページの番号はサイドバー上の位置で、ディレクトリはそれ自体が 1 階層
  を持ちます。2 番目のトップレベル項目の 3 番目のページは `2.3` で、その `h2` は `2.3.1`、`2.3.2` と
  続きます。数えるのは読者が見るサイドバーです。[`sidebar.flattenSingleChild`](#sidebar) を適用した後
  の形、または [`sidebar.items`](#sidebar) に書いた順で、グループはディレクトリと同じく 1 階層を持ち
  ます。サイドバーに場所を持たないページ（`hidden` のページや、`sidebar.items` に載せていないページ）
  には番号を付けません。
- **`h1` にはページの番号が付きます。** `h1` はページタイトルなので、見出しとしての番号は持ちません。
  付くのはページ最初の `h1` だけです。`h1` の無いページは、番号がサイドバーに出て、節の番号にも
  含まれます（`2.1`、`2.2`）。
- **番号が現れる場所。** 見出しそのものには `<span class="section-number">2.3</span>` と空白 1 つを
  入れます。スタイルシートで隠せ、見出しをコピーすれば番号もコピーされます。サイドバー、ページ内目次、
  PDF のしおりにも出ます。検索では `3.2` と入力すると 3.2 節が見つかります。番号は番号全体としてだけ
  照合し、「13.2」に触れているだけのページより先に並べます。語を照合する本文の文字列には数字を
  入れないので、語の順位は変わりません。
- **アドレスには入りません。** route、ページ ID、見出し ID は番号付けが無いときとまったく同じなので、
  番号が変わってもアドレスは変わらず、コピーされたリンクも壊れません。
- **数える見出し。** [`toc.maxLevel`](#toc) に関わらず、`h2` から `numbering.sections` までのすべての
  見出しを数えます。AsciiDoc の `[discrete]`（または `[float]`）見出しは節ではないので、番号を付けず、数え上げも飛ばし
  ます。`[appendix]` の節は他の節と同じく数え、Asciidoctor が付ける `Appendix A:` のキャプションは
  そのまま残ります。飛ばしたレベルは 0 と数えます（最初の `h2` の直下の
  `h4` は `x.1.0.1`）。この構造は `heading/level-skipped` として既に報告されます。
- **有効な間は `:sectnums:` を拒否します。** 文書が設定した場合も
  [`sources.asciidoc.attributes`](#asciidoc-attributes) が設定した場合も、このキーを名指しして
  エラーにします。1 つの見出しに番号が 2 つ付くからです。判定は
  Asciidoctor が番号を付けた節を問い合わせて行うので、ある節の上で `:sectnums:` を有効にし、その下で
  無効に戻した場合も検出します。`numbering.sections: false` なら `:sectnums:` は従来どおり働きます。

### `assets`

| キー                   | 型              | 既定値 | 説明                                                                    |
| ---------------------- | --------------- | ------ | ----------------------------------------------------------------------- |
| `assets.embedImages`   | boolean         | `true` | ローカル画像を data URI として埋め込み、出力を自己完結に保つ。           |
| `assets.maxInlineSize` | string / number | `5MB`  | 埋め込む画像の最大サイズ。`B` / `KB` / `MB` / `GB` 接尾辞またはバイト数。 |
| `assets.onLargeImage`  | `warn` `error` `external` | `warn` | 画像が `maxInlineSize` を超えたときの挙動: 警告して埋め込む / ビルド失敗 / 外部参照のまま残す。 |
| `assets.budget`        | string / number | 未設定 | 出力が達してよい大きさ。単位は `maxInlineSize` と同じ。書き出したすべてのファイル（HTML と PDF）について、完成後に確かめる。未設定なら確かめない。 |
| `assets.onBudget`      | `warn` `error`  | `warn` | `budget` を超えたときの挙動: 警告する（コード `output/over-budget`）/ ビルドを失敗させる。ファイルは書き出したまま残るので、中身を確かめられる。既定が `warn` なのは、予算を足しただけで既に超えているビルドが落ちないようにするため。`watch` と `serve` は常に警告する。 |

ビルドは毎回、書き出したものの大きさを、ファイルの完成後にディスクから読んで表示します。HTML については
内訳も示し、その合計はファイルの大きさと一致します。

```text
✓ 20 ページを生成しました -> docs.html
  docs.html  9.4 MB
    画像          7.9 MB（12 ファイル、最大: guide/setup.png 2.1 MB）
    Mermaid       912.4 KB（inline ランタイム）
    ページデータ  409.6 KB（siteDataJson: 本文テキスト・見出し・検索）
    文書本体      204.8 KB
```

- `画像` は埋め込んだ写しをすべて数えるので、2 か所から参照した画像は 2 回数えます。ファイル数は
  異なるファイルの数で、最大の画像は、ルートからの相対パスと 1 枚分の大きさで示します。
- `Mermaid` の行は、`mermaid.runtime: inline` がランタイムをファイルに入れたときだけ出ます。
- コードのハイライトには行がありません。ビルド時に行われ、文書にはマークアップしか残さないからです。

`onBudget: error` でビルドが失敗したときは、この表示をエラーメッセージに含めます（失敗したビルドは
サマリを表示しないため）。また HTML が予算を超えた時点で失敗し、そこから PDF は作りません。`watch` と
`serve` は `onBudget` の値にかかわらず予算超過を警告として扱うので、CI 用に書いた予算で保存のたびに失敗することはありません。

> [!NOTE]
> **画像は再エンコードしません。** 縮小には単一ファイルの CLI バンドルにも単体実行ファイルにも
> 載せられないネイティブのライブラリ（HTML だけのビルドなら Chromium）が要り、出力がエンコーダーの
> バージョンとプラットフォームで変わり、品質・色空間・EXIF の向き・アニメーション・SVG のそれぞれに
> 規則が要るためです。画像が大きすぎる文書では、`onLargeImage: external` で画像を HTML の隣の
> ファイルとして残せます。画像を小さくしたい場合は、ビルドの前段で画像ツールを走らせてください。

### `mermaid`

| キー              | 型                     | 既定値   | 説明                                                            |
| ----------------- | ---------------------- | -------- | --------------------------------------------------------------- |
| `mermaid.enabled` | boolean                | `true`   | Mermaid コードブロックを図としてレンダリングする。              |
| `mermaid.mode`    | `client` `pre-render`  | `client` | `client` はブラウザで mermaid ランタイムを実行（`runtime` で配給方法を選ぶ）。`pre-render` はビルド時にヘッドレス Chromium で各図を SVG 化して埋め込む（JS 不要・印刷安定・図が少数なら `inline` より小さい）。 |
| `mermaid.runtime` | `inline` `cdn`         | `inline` | **client mode 専用。** `inline`（既定）は mermaid ランタイムを HTML に埋め込み**完全オフラインで自己完結**（図があると、第三者表記を含め約 1.6MB(gzip) 増）。`cdn` は CDN から読み込み HTML は最小だが**表示にネット接続が必要**。 |

#### `client` と `pre-render` の比較

同じ mermaid エンジンで描画するため、図の形・レイアウトは基本的に一致する。client mode には、mermaid 12 を実行できるブラウザが要る。mermaid 12 は `Object.groupBy` などの ES2024 の機能を使うので、Chrome と Edge は 117、Firefox は 119、Safari は 17.4 以降である。それより古いブラウザでは図が描画されない。ただし次の違いがある。

| 観点                    | `client`（cdn / inline）                 | `pre-render`                                   |
| ----------------------- | ---------------------------------------- | ---------------------------------------------- |
| 自己完結                | cdn = 要ネット / inline = 自己完結       | 自己完結（SVG を埋め込み）                      |
| JavaScript              | 必要                                     | 不要                                           |
| 追加サイズ              | cdn ≈ 0 / inline ≈ 1.6MB(gzip) 固定      | 図の数に比例（1 図あたり数 KB）                |
| ダーク配色              | 追従しない（mermaid 既定テーマで固定）   | `html.colorScheme` で固定（`dark`→`redux-dark-color` / 他→mermaid の既定） |
| フォント                | 読者のブラウザ・フォントで描画           | **ビルド環境のフォントで計測・焼き込み**       |
| 対話機能（`click` 等）  | 有効                                     | 無効（静的 SVG）                               |
| 印刷・未訪問ページの図  | 崩れる場合がある                         | 常に表示される                                 |

`pre-render` はビルド時に Chromium を要するため、既定ではない。Chromium が無ければビルドが失敗する（環境エラーは fail fast）。個々の図の構文エラーのみ警告してソース表示にフォールバックする。ローカルの Chromium は `PUPPETEER_EXECUTABLE_PATH` で指定できる（開発用 Docker には同梱）。バンドル版 CLI（単一 `.cjs` / 単一実行ファイル）では `pre-render` は使えない（`node_modules` を持たないため。パッケージインストール版を使う）。

> [!WARNING]
> `pre-render` はテキストの計測・配置を**ビルドを実行するマシンのフォント**で行い、その結果を SVG に焼き込む。日本語などのラベルを含む図では、そのマシンに対応フォント（例: Noto CJK）が無いと文字化け（□）や折り返し崩れが起きる。npm などで導入した場合、monodocs はそのフォントを補えない。`client` は読者環境のフォントで描画するためこの問題は出ない。図に必要なフォントがそのマシンに無いときは [`fontCheck`](#font-check) が警告する。

### `highlight`

| キー                | 型      | 既定値 | 説明                                       |
| ------------------- | ------- | ------ | ------------------------------------------ |
| `highlight.enabled` | boolean | `true` | コードブロックをシンタックスハイライト（shiki）。 |

### `math`

| キー           | 型      | 既定値 | 説明                                                                                                         |
| -------------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `math.enabled` | boolean | `true` | 数式（Markdown の `$...$`、`$$...$$`、言語が `math` のフェンスのブロック。AsciiDoc の latexmath と asciimath、そのどちらかを意味する `stem`）をビルド時に MathML に描く。`false` では以前と同じく、数式を文字として、`math` のフェンスのブロックをコードとして出力する。 |

数式は KaTeX が MathML だけに描き、出力にスクリプトもスタイルシートも加えない。報告されるものは次のとおり。

- KaTeX が解析できない数式（`math/parse-failed`）や、`\href` などのリンクや HTML のコマンドを使う数式（`math/command-not-allowed`）は、書かれたとおりに示す。
- 次のものはそれぞれ報告し、その部分なしで数式を描く。Unicode に文字の無い書体（`math/style-unsupported`、例：`\mathit{123}`）、自動の数式番号（`math/numbering-unsupported`、例：星の無い `equation`）、CSS で描けない囲み（`math/notation-unsupported`、例：`\phase`）、ブラウザが書かれたとおりに描けない構文（`math/construct-unsupported`、例：`\vcenter`）。

> [!IMPORTANT]
> 数式はブラウザが OpenType MATH フォントで描くので、PDF を印刷するマシンにも、HTML を読む読者のブラウザにも、そのフォントが要る。Windows には Cambria Math が付属し、Linux では Latin Modern Math などを入れる（Debian と Ubuntu では `fonts-lmodern`）。無いと括弧が伸びず、数学用の文字を持つフォントがほかに無ければ変数が tofu になる。PDF では [`fontCheck`](#font-check) がその両方を報告する。

### `html`

| キー                | 型              | 既定値    | 説明                                                                       |
| ------------------- | --------------- | --------- | -------------------------------------------------------------------------- |
| `html.theme`        | string          | `default` | 組み込みテーマ名（`default`）か、カスタムテーマディレクトリのパス（`./my-theme`。設定ファイル基準で解決）。下記参照。 |
| `html.colorScheme`  | `light` `dark` `auto` | `light` | ドキュメントを開いたときの初期配色。`auto` は OS の `prefers-color-scheme` に追従。読者が画面のトグルで切り替えるとブラウザに保存され、以降はそちらが優先される（`html.theme` のテンプレート名とは別物）。 |
| `html.contentWidth` | string / number | `860px`   | 本文領域の最大幅。CSS 長さ（`px`・`rem`・`em`・`ch`・`vw`・`%`）または数値（px）。`full`（または `none`）で残り幅いっぱいに広げる。 |
| `html.contentWidthToggle` | boolean | `true` | 読者向けの標準幅／ワイド幅切替ボタンを表示する。`false` の場合は保存済みの読者設定と `html.contentWidthDefault` を無視する。 |
| `html.contentWidthDefault` | `standard` `wide` | `standard` | 本文幅の初期状態。読者の選択が保存されている場合はそちらを優先する。 |
| `html.imageLightbox` | boolean | `true` | リンクのない装飾目的以外の本文画像をクリックまたはキーボード操作すると、画面内に収まる大きさのダイアログで表示する。リンク付き画像は元のリンク動作を維持し、`alt` が明示的に空の画像は装飾画像のままにする。Mermaid 図はクリックするか、キーボードでフォーカスしたときに現れるボタンで開き、ダイアログいっぱいまで拡大する。`accTitle` を持つ図はそれをキャプションにする。印刷および PDF 出力にはダイアログを含めない。 |
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

未知のキーは無視せず拒否するので、タイプミスが黙って既定のまま残ることはありません。キーの全一覧は次のとおりです。

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
| `openImagePreview`   | Open image preview           | 画像を拡大表示             | 拡大できる画像と、Mermaid 図を拡大するボタンのアクセシブル名 |
| `imagePreview`       | Image preview                | 画像プレビュー             | 画像プレビューのアクセシブル名 |
| `closeImagePreview`  | Close image preview          | 画像プレビューを閉じる     | 画像プレビューの閉じるボタン |
| `generatedBy`        | Generated by                 | 生成:                      | ブランディングフッターの接頭辞 |
| `version`            | Version                      | バージョン                 | フッターの `document.version` の前 |
| `cover`              | Cover                        | 表紙                       | PDF ビューアのページ番号欄に出る、表紙のページラベル |
| `contents`           | Contents                     | 目次                       | 印刷する目次（[`pdf.toc`](#pdf-toc)）の見出し |

カスタムテーマがラベルを受け取る方法は次のとおりです。

- **すべてのテーマ**は、解決済みのラベルを <span v-pre>`{{siteDataJson}}`</span> のデータとして受け取ります。無条件の保証はこれだけです。
- **既定の `app.js`** は、既定テンプレートが用意する DOM フックにそれを適用します。`style.css` だけを差し替えたテーマは組み込みと同じ挙動になります。`template.html` を差し替えたテーマは、<span v-pre>`{{labelTocTitle}}`</span> などの <span v-pre>`{{label…}}`</span> トークンを残した箇所にだけ入り、それ以外には入りません。
- **`app.js` を差し替えたテーマ**は、データを受け取って自分で適用します。
- **カスタム `template.html` が自分で書いた静的テキスト**は書いたままです。

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

スタイルだけ変えるテーマは 1 ファイルで済み、将来クライアント側に機能が増えてもそのまま動きます。
`app.js` を置き換える場合は、上記の対話的な挙動をすべて自分で引き受けることになります。

カスタムの `template.html` では次のトークンが必須です。欠けるとビルドがエラーで止まります。

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
必要があり、後から作成した場合は次にソースか設定が変わったときに拾います）。

> [!CAUTION]
> テーマは文書に埋め込まれる実行可能なコードです。ドキュメントのソースと同じ信頼度で扱ってください。

### `pdf`

出力形式が `pdf` または `both` のときに適用されます。ただし [`pdf.density`](#pdf-density) と
[`pdf.pageBreakLevel`](#pdf-page-break-level) は HTML 側にも書き込まれ、その HTML をブラウザから
印刷したときにも効きます。

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
| `pdf.cover.enabled`   | boolean           | `false`   | `title` と `document` から生成した表紙を先頭に付ける。下記参照。 |
| `pdf.toc.enabled`     | boolean           | `false`   | 本文の前に、ページ番号付きの目次を印刷する。下記参照。 |
| `pdf.toc.depth`       | integer           | `2`       | 目次に載せる見出しの最も深いレベル（2〜6）。 |
| `pdf.watermark`       | `false` / string  | `false`   | すべての紙の本文の背面に、斜めに印刷する 1 行のテキスト。下記参照。 |

#### `pdf.density`（版面の密度） {#pdf-density}

`pdf.density` は、枚数を決める 4 つ（文字の大きさ・行送り・見出し上の空き・表のセル余白）を
まとめて動かします（`pdf.margin` が決めるのは本文の始まる位置だけです）。

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

- **既定は画面向けではなく紙向けに組みます。** `normal` は `relaxed` と同じ本文 16px のまま、
  行送り・見出し上の空き・表のセル余白を詰めるので、同じ文書が少ない枚数になります。4 つを
  [並べたもの](#pdf-density-sample)を下に載せています。
- **`relaxed` は画面の設定に名前を付けたものです。** 画面で読み、たまに印刷する文書のためのものです。
- **文字の大きさは最初ではなく最後の手段です。** 密度は本文の段の幅（`pdf.margin` が残した幅）を
  狭めないので、文字を小さくすると 1 行の文字数が増えます。A4 の既定余白では、16px でおよそ 42 字、
  12px では 56 字ほどです。行を長くせずに `compact` や `tight` を使いたいときは、同じ変更で
  `pdf.margin` も広げてください。

プリセットを調整したいときは、名前の代わりにオブジェクトを書きます。`base` がどのプリセットを
土台にするかを指し（既定は `normal`）、オブジェクトは名指しした値だけを差し替えます。そのため将来
プリセット側が調整されても、残りの値にはそれが届きます。

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

規則の書き出し方:

- **画面と違う値だけを書き出します。** `relaxed` はテーマが既にしていることなので、印刷用の規則は
  1 つも出力されません。既定は行送り・見出し上の空き・セル余白を書きますが、文字サイズは書かない
  ので、ブラウザから HTML を印刷するときはあなた自身の基準文字サイズが使われます。
- **規則は `@media print` です。** 画面ではこれまでどおり、紙の上ではより詰まって組まれます。
  `--format pdf` でも、ブラウザから HTML を印刷した場合でも同じです。

##### 同じ文書で 4 つのプリセットを見る {#pdf-density-sample}

原稿・用紙・余白は同じで、`pdf.density` だけを変えて 4 回組んだものです。各サムネイルは、リンク先の
PDF の 1 ページ目です。

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

> [!TIP]
> どこを見ればよいかは、見本の文書自身に書いてあります。決める前に一度は紙で読んでください。画面上の
> 100% 表示では問題なく見える密度が、腕を伸ばした距離では読みにくいことがあります。

#### `pdf.header` / `pdf.footer`（ページの帯） {#pdf-bands}

既定では、各ページの下端中央にページ番号と総ページ数が入ります。

```text
3 / 12
```

数字と区切りだけなので翻訳が要らず、[`lang`](#lang) によって変わることもありません。

どちらのキーも、`false` で帯を消し、HTML フラグメントで置き換えられます。

```yaml
pdf:
  header: '<div style="width:100%;font-size:8pt;text-align:right;margin:0 15pt"><span class="title"></span></div>'
  footer: false
```

フラグメントは Chromium に渡され、**Chromium 自身のクラス**（`pageNumber` / `totalPages` / `title` / `date` / `url`）を持つ要素に値が差し込まれます。独自のトークン構文はありません。

> [!WARNING]
> - **フラグメントは文書のスタイルを一切継承しません。** 例のようにフォントと大きさを自分で指定してください。指定しないと Chromium の素の既定になります。
> - **帯は余白の中に置かれます。** Chromium は帯を上下の余白の大きさに合わせるので、本文は再レイアウトされませんが、帯より小さい余白では帯が紙の端に貼りつきます。monodocs は、下余白が既定フッタに足りないときに警告します。しきい値は決め打ちの数値ではなく、そのフッタ自身の高さを測って決めます。**置き換えフラグメントは検査しません。** 任意の HTML と CSS が収まるかは余白の値だけでは判断できないためです。

#### `pdf.cover`（表紙） {#pdf-cover}

PDF の先頭に、題名・バージョン・日付・作成者を載せた表紙を付けます。

```yaml
title: 社内ドキュメント
document:
  version: "1.2"
  date: "2026-08-22"
  authors:
    - ドキュメントチーム
pdf:
  cover:
    enabled: true
```

- **表紙は書くものではなく生成されるものです。** 載るのは [`title`](#top-level) と
  [`document`](#document) の値だけで、PDF の文書情報と同じ値です。そのため、表紙と文書情報が
  食い違うことはありません。`document` が無ければ、表紙には題名だけが載ります。
- **レイアウトは固定で、選択肢はありません。** 題名は紙の 3 分の 1 ほどの高さ、バージョンと
  日付はその下、作成者は紙の下端に並びます。用紙サイズと余白は本文と同じです。
- **表紙には番号が付かず、本文が 1 から始まります。** 既定のフッタも置き換えたフラグメントも
  表紙には描かれず、総ページ数にも表紙は含まれません。PDF ビューアのページ番号欄も印字と一致し、
  表紙には [`cover`](#html-labels) ラベル（`表紙` / `Cover`）が、本文には 1, 2, 3… が出ます。
- **しおりは本文を指したままです。** 表紙はしおりに加わりません。
- **HTML には表紙を付けません。** 画面では、同じ情報が `document` が埋める末尾のフッターに出ます。

#### `pdf.toc`（紙の目次） {#pdf-toc}

印刷した文書の先頭に、節の一覧と各節が始まる紙の番号を載せます。

```yaml
pdf:
  toc:
    enabled: true
    depth: 2 # 各ページの下に h2 を載せる。3 なら h3 も載せる
```

- **載せるもの。** サイドバーやしおりと同じ木です。ディレクトリとページ、各ページの下に `depth` まで
  の見出しを載せます。ディレクトリには、その最初のページの紙の番号を出します。
  [`numbering.sections`](#numbering) が有効なら各行に節番号が付きます。サイドバーに場所を持たない
  ページは載せません。折りたたんだブロック（AsciiDoc の `[%collapsible]` の例）の中の見出しも、紙に
  出ないので載せません。各行はその節へのリンクです。
- **置き場所。** 本文の前、[表紙](#pdf-cover)の後に、専用の紙で入ります。目次の紙は本文の一部なので
  フッタの番号が付き、最初のページはその次の紙から始まります。見出しは [`contents`](#html-labels)
  ラベル（`Contents` / `目次`）です。
- **番号は PDF から読み、確かめます。** monodocs はまず番号の欄を空にして文書を印刷し、各節が
  どの紙に載ったかを読み取り、番号を入れてもう一度印刷します。そのうえで、書き出すその PDF をもう
  一度読んで比べます。番号の欄は等幅数字の固定幅なので、番号を入れても行は折り返し直さず、2 回目の
  印刷で定まります。万一定まらなければ決まった回数まで印刷し直し、それでも食い違う文書は
  **ビルドを失敗させます**（`pdf/toc-not-converged`）。行き先の節がページの中に見つからない行も、
  ビルドを失敗させます（`pdf/toc-unresolved`）。
- **印刷が 1 回増えます。** 既定で無効なのはこのためです。client mode の Mermaid 図を含む約 100 枚の
  日本語の文書を測ると、PDF のビルドは、Linux のワークステーションで目次なし約 2.1 秒・あり約 3.1 秒、
  GitHub の Windows ランナーで約 3.9 秒・約 6.1 秒でした（別のマシンなので、比べるのはそれぞれの組の
  中だけにしてください）。
- **PDF だけです。** HTML をブラウザから印刷しても目次は入りません。
- **柱（ランニングヘッダ、各紙の上に現在の章名）はありません。** Chromium は CSS の `string-set` も
  `string()` も実装しておらず、ヘッダのテンプレートは決まったクラスしか置き換えません。

#### `pdf.watermark`（透かし） {#pdf-watermark}

すべての紙に、下書きや社外秘などの印を入れます。

```yaml
pdf:
  watermark: "社外秘"
```

- **1 行のテキストだけで、ほかに設定はない。** すべての紙の中央に斜めに、コピーしても残る薄い灰色で、
  1 行が収まる大きさで印刷します。ページに乗算で重ねるので本文の背面にあるように見え（重なった箇所でも
  文字や線の濃さは変わらない）、コードブロックの背景にもテーマが塗った背景にも覆われません。画像・角度・
  フォント・不透明度・ページごとの指定はありません。
- **印刷した紙すべてに、印刷した紙にだけ。** PDF では[表紙](#pdf-cover)を含むすべての紙に入り、
  ブラウザから HTML を印刷したときも入ります。画面には出ません。乗算は暗くすることしかできないので、
  ダーク配色のまま背景も含めてブラウザから印刷すると、ほとんど見えません。
- **テーマでは消せない。** 規則は monodocs 自身がスタイルシートへ追記するので、`style.css` を
  差し替えたテーマでも印刷されます。宣言はすべて `!important` なので、生成コンテンツを隠す印刷用の規則
  （`*::after { display: none }`）にも巻き込まれません。
- **文字はフォント検査を受ける。** [`fontCheck`](#font-check) は透かしも、本文の紙と表紙のそれぞれで
  測るので、ビルドするマシンにフォントの無い用字系は報告されます。
- **テキストはテキストとして扱う。** スタイルシートへはエスケープして入れるので、値の中の引用符・
  バックスラッシュ・マークアップはその文字のまま出ます。改行を含む値や空白だけの値は拒否します。

#### `pdf.pageBreakLevel`（節ごとに紙を改める） {#pdf-page-break-level}

ソースファイルは既に新しい紙から始まります。節ごとに紙を改めたい文書のために、指定したレベルまでの
見出しの前でも改ページします。

```yaml
pdf:
  pageBreakLevel: 2
```

`2` は h2 だけ、`3` は h2 と h3、`6` は h2 から h6 まで。既定の `false` はどの見出しの前でも改ページ
しません。h1 はここでのレベルに含みません。h1 はページタイトルであり、そのファイルは既に紙を改めて
いるからです。

次の見出しは改ページ**しません**。

- その前に描画されるものが何も無いか、ページタイトルだけのもの。タイトルの直後に `## 節` が続く
  ページでは両者が同じ紙に載り、タイトルの後に導入文があるページでは節の前で改ページします。
- 分割してはならないブロックの中にあるもの（表・図・コードブロック・admonition・引用）。
- 手動の改ページマーカーの直後にあるもの。そこは既にマーカーが改ページしています（強制改ページが
  2 つ続くと空白の紙が 1 枚できます）。

紙の先頭に来た見出しは、密度が見出しの上に置く空きに押し下げられず、上余白の位置に載ります。

#### 改ページ {#page-breaks}

ソースファイルは常に新しい紙から始まり、ファイルの内側では、自分で置いたマーカーが新しい紙を始めます。

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
ツールで広く使われる空の `<div>` で、`<div style="page-break-after: always"></div>` も同じものとして
受け付けます。空の `div` は何も描かないので、ソースを読む場所では見えません。

Markdown の生 HTML はそれ以外は破棄します。monodocs はマーカーを自分で組み立てた要素に置き換える
ので、書いた属性が出力へ届くことはありません。それ以外（2 つ目の属性、余分なクラス、タグの間の
文字）は、修復されず他の生 HTML と同じく破棄されます。

**Markdown で何がマーカーとして認識されるか**（1.0 で凍結します）:

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

そのほか:

- **Markdown では、マーカーはそれ自体が 1 つのブロックであること。** 引用・リスト項目・表のセル・
  見出しの中のものは認識されず破棄されます。それらは印刷時に分割しないブロックだからです。
  AsciiDoc では要素は Asciidoctor が `<<<` を置いた場所に出るので、そちらでも `<<<` はトップレベルに
  置いてください。
- **後ろに何も無いマーカーは空白の紙を 1 枚残します。** 連続する 2 つのマーカーも同じです。
  空白の紙は、そうやって求めます。

規則は `@media print` なので、`--format pdf` にも、読み手がブラウザから HTML を印刷する場合にも
効きます。

## ページの並び順とタイトル

サイドバーとページ送り（前後ナビ）の**並び順は、表示タイトルとは無関係**に決まります。`sidebar.titleFrom` / `sidebar.titleTransform` は画面に出る**文言だけ**を変えるもので、並びには影響しません。順序は次の 2 段で決まります。

1. **`order`（明示順・昇順）** — frontmatter の `order`（AsciiDoc は `:sd-order:`）。小さいほど上に来ます。
2. **ファイル名（パス）順** — `order` を持たないページ同士は、拡張子を除いた相対パスの辞書順（`localeCompare`）で並びます。`order` を持つページが常に先で、未指定のページは末尾側に回ります。

つまり `01_intro.md` を `titleTransform: stripNumberPrefix` で「intro」と表示しても、**並びは `01_` を含むファイル名で決まり**、H1 見出しの文言では並びません。数字プレフィックスで順序を固定しつつ、表示だけ整えられます。

> [!NOTE]
> ディレクトリ（サイドバーのフォルダ）の並びも、その中に最初に現れるページの位置で決まります（＝同じくファイル名順）。

### ページ frontmatter

各ページの先頭で、Markdown は YAML frontmatter、AsciiDoc は `:sd-*:` 属性として以下を指定できます。いずれも任意です。

| Markdown frontmatter | AsciiDoc 属性      | 型      | 説明 |
| -------------------- | ------------------ | ------- | ---- |
| `title`              | `:sd-title:`       | string  | 明示タイトル。`titleFrom` / `titleTransform` に関わらず**常に最優先**で、変換もされません。 |
| `order`              | `:sd-order:`       | number  | 並び順（昇順）。未指定ならファイル名順（`order` を持つページが先）。 |
| `hidden`             | `:sd-hidden:`      | boolean | サイドバー・前後ナビ・検索から除外します。ページ HTML は生成され、hash route で直接到達はできます。 |
| `description`        | `:sd-description:` | string  | ページの説明（メタ情報）。 |
| `aliases`            | `:sd-aliases:`     | string[] | このページが今も応答する古い hash route。下記参照。 |

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

#### `aliases`（古いリンクを生かし続ける） {#aliases}

読者は hash route をチャット、チケット、別の文書へコピーするので、ページの名前を変えるとその
すべてが黙って壊れます。リンクをたどった読者は、正常に見える文書の、違うページに着きます。
`aliases` は古い route を生かし続けます。

```yaml
---
title: インストール
aliases:
  - /setup/install
  - /getting-started/install
---
```

```asciidoc
= インストール
:sd-aliases: /setup/install, /getting-started/install
```

どのページにも当たらない hash が来ると、文書は別名を引き、hash を現在の route に置き換えてページを
表示します。したがってアドレスバーには働くリンクが残ります。アンカー付きの route
（`#/setup/install#configuration`）は、アンカーを保ちます。

規則はビルド時に検査されます。

- 別名は実 route を**すべて試したあと**に照合されるので、ページを隠すことはできません。ある別名が
  主張している route にページが現れた場合はページが勝ち、別名は隠されたことを警告します。
- **2 つのページが同じ別名を主張するのはエラー**です。
- 別名は route と同じように正規化されます（先頭のスラッシュ、拡張子なし、`index` はディレクトリを指す）。
  したがって `setup/install.md` と `/setup/install` と `setup/install` は 3 つではなく 1 つの別名です。
- 別名はサイドバーにも検索インデックスにも前後ナビにも現れません。`hidden` なページも別名を保ちます。

別名は自動生成しません（たとえばリポジトリの履歴から作ると、CI の浅いチェックアウトなど、どのクローンで
ビルドしたかで出力が変わるため）。別名は、書き手が書いた 1 行です。

## 関連

- [対応記法](https://github.com/kuttsun/monodocs/blob/main/docs/syntax.md) — 対応範囲と、単一ファイル化に伴う制限。
- [ロードマップ](https://github.com/kuttsun/monodocs/blob/main/docs/roadmap.md) — バージョン計画。
