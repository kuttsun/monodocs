# 対応記法と制限

[English](../syntax.md)

`monodocs` は Markdown と AsciiDoc をそれぞれ専用 renderer で処理し、共通の `Page` モデルへ
正規化してから **単一 HTML** にまとめる（[roadmap.md](roadmap.md) 11章）。本書は、対応する記法と、
**複数ファイルを 1 つの HTML に統一する都合で対応できない／意図的に制限している記法**を仕様として示す。

- Markdown: [unified](https://unifiedjs.com/) / remark / rehype（CommonMark + GitHub Flavored Markdown）
- AsciiDoc: [Asciidoctor.js](https://docs.asciidoctor.org/asciidoctor.js/latest/) の標準変換

各記法を網羅したサンプルを 1 サイトにまとめた `examples/ja/`（日本語）/ `examples/en/`（英語）がある（表示確認用。
`markdown/`（GFM）/ `asciidoc/` / `mixed/` のフォルダで構成）:

```bash
monodocs serve examples/ja
```

## Markdown 対応記法

CommonMark に加え、`remark-gfm` により GitHub Flavored Markdown を有効化している。

- 見出し（`#`〜`######`）、段落
- **改行**: 段落の中の改行は改行にならない（[形式横断の共通仕様](#単一-html-化のための共通仕様形式横断)）。
  明示的な改行は行末のスペース 2 つ、または行末のバックスラッシュ（`\`）。生 HTML の `<br>` は他の生 HTML
  とともに落とされるので、行末の空白を削るエディタでも残るのはバックスラッシュのほう
- 強調（`*em*` / `**strong**`）、インラインコード、リンク、画像
- リスト（順序付き / 順序なし）、ネスト、**タスクリスト**（`- [ ]` / `- [x]`）
- 引用、水平線、**表（GFM tables）**、**取り消し線**（`~~text~~`）、**オートリンク**
- **アラート（GitHub alerts）**: `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]`。
  AsciiDoc の admonition と共通の構造・配色で表示する（[形式横断仕様](#単一-html-化のための共通仕様形式横断)）
- フェンスドコードブロック（` `lang ```）。shiki で構文ハイライトする（dual theme・ダークモード追従）
- **脚注**（`[^1]`）。ID は単一 HTML 内で衝突しないよう page id を prefix する
- YAML frontmatter（`---`）。`title` / `order` / `hidden` / `description` を読む（[roadmap.md](roadmap.md) 13章）。加えて `aliases`（このページが今も応答する古い hash route）を読む（[roadmap.md](roadmap.md) 15.5）
- ` ```mermaid ` コードブロック → Mermaid 図（`mermaid.mode`: `client` 既定 / `pre-render` = ビルド時 SVG 化）
- 画像（`![alt](path)`）→ 入力配下の実体を data URI 化して埋め込み
- **数式**（v0.15）: GitHub が描く 4 つの形を、GitHub の規則で読む（[roadmap.md](roadmap.md) 6.4）
  - `$...$` は文中の数式。`$` が数式を始めるのは、ASCII の空白・`(` の後、段落の先頭、または要素の中や直後で、
    空白でも `$` でもない文字の前にあるとき。同じ行の次の `$` で閉じるが、その `$` が ASCII の英字・
    数字・`_` の前、またはその `$` の直前と同じ文字の前（`$a.$.` は文字）にあるときは数式にならない。そのため `It costs $5 and $10 today.` や `$HOME/$USER` は
    文字のまま残るが、`Between $5 and 10$` は数式になる。そこでドル記号を書くには `\$` と書く。全角
    スペースの後でも始まらない（`値は　$x$　です` は文字）。`値は$x$です` は文字、`値は $x$ です` は数式である
  - ``$`...`$`` は、前後の文字を問わず文中の数式になる（``値は$`x`$です`` は数式）
  - `$$...$$`: `$$` で始まり `$$` で終わり、文字だけを含む段落では、その中の `$$...$$` がすべて別行立てに
    なる。行をまたいでもよく、間の文は文字のまま残る。リスト項目・見出し・表のセルの中や、ほかの文と
    並ぶ `$$...$$` は、`$...$` と同じ規則で文中の数式になる。ただし、閉じる `$$` は、その直前と同じ文字の前にあってもよい
  - 言語がちょうど `math` のフェンスのコードブロックは別行立ての数式（`Math` はコード）

  バックスラッシュのエスケープは、CommonMark がどこでもそうするように、数式を読む前に解決される。
  `$...$` と `$$...$$` の中では `\,` は `,`、`\\` は `\` になる。それらが要る TeX は、バックスラッシュを
  すべて保つ ``$`...`$`` か `math` のブロックで書く。`\$` は例外で、数式を始めも終えもせず、数式の外では
  `$` を、中では TeX の `\$` のまま残る。`$...$` と `$$...$$` の中の文字参照（`&lt;`）はデコードされる。
  斜体、リンクの文字、画像の代替テキスト、コードスパン、脚注の定義（そこの `math` ブロックも含む）、生の
  `<em>`・`<b>`・`<a>`・`<code>` の中では数式を探さない

## AsciiDoc 対応記法

Asciidoctor.js の標準変換に委ねるため、AsciiDoc の大半の記法をそのまま利用できる。

- 文書タイトル（`= Title`）、セクション見出し（`==`〜）、段落
- **改行**: 段落の中の改行は改行にならない（[形式横断の共通仕様](#単一-html-化のための共通仕様形式横断)）。
  明示的な改行は行末の ` +`、ブロック単位なら `[%hardbreaks]`、文書全体なら `:hardbreaks-option:`
  （別名 `:hardbreaks:`）
- リスト（順序付き / 順序なし / **説明リスト** / **チェックリスト**）、ネスト、継続行。チェックリストの
  チェックボックスは Markdown のタスクリストと同じように描く（[形式横断仕様](#単一-html-化のための共通仕様形式横断)）
- 強調・モノスペース等のインライン書式、リンク、相互参照
- 表、**admonition**（NOTE / TIP / IMPORTANT / WARNING / CAUTION）。Markdown の GFM alerts と
  共通の構造・配色に正規化する（[形式横断仕様](#単一-html-化のための共通仕様形式横断)）
- ソースブロック（`[source,lang]`、shiki でハイライト）、リテラル / リスティング / 例 / サイドバー / 引用 / 詩ブロック
- コールアウト（callout）、`kbd:` / `btn:` / `menu:` マクロ
- 画像マクロ（`image::path[]` / `image:path[]`）→ data URI 埋め込み
- `include::[]`（safe モードで入力ファイルのディレクトリ配下に jail）
- ドキュメント属性、`:sd-title:` / `:sd-order:` / `:sd-hidden:` / `:sd-description:`（[roadmap.md](roadmap.md) 13章）、および `:sd-aliases:`（カンマ区切りの古い hash route）（[roadmap.md](roadmap.md) 15.5）
- `[source,mermaid]` ブロック → Mermaid 図（`mermaid.mode`: `client` 既定 / `pre-render` = ビルド時 SVG 化）
- 同一文書内の `xref:` / 内部アンカー（ID を prefix して追従）
- 脚注（`footnote:[]`）。ID は page id を prefix する
- **数式**（v0.15。asciimath は v0.16）: `latexmath:[...]` と `asciimath:[...]`、それぞれのブロック、
  `stem:[...]` と `[stem]` ブロック。`stem` が latexmath を意味するのは、`:stem:` が `latexmath`・`latex`・
  `tex` のとき（ブロックのスタイルが `[stem,asciimath]` のように別の指定をしない限り）か、ブロックの
  スタイルが `latexmath` のときで、それ以外は Asciidoctor と同じく asciimath を意味する。asciimath は
  TeX に変換して（asciimath2tex）latexmath と同じく描く。コピーすると `asciimath:[...]` として戻り、
  検索はその TeX で見つかる。空行や行末の ` \` で区切ったブロックは、Asciidoctor と同じく区切り、1 行に
  1 つの式として積む。描かずに報告するもの: KaTeX にコマンドの無い太字のサンセリフ、太字のスクリプト、
  太字のフラクトゥール（`bbsf`、`bbsfit`、`bbcc`、`bbfr`）、属性を設定する `class` と `id`、12 段より深く
  入れ子になった括弧。`text(...)` の中の 1 つの `'` や `` ` `` は活字の引用符で描かれる。
  `math.enabled: false` ではどちらの記法も Asciidoctor が書くとおりに残す

## 単一 HTML 化のための共通仕様（形式横断）

複数ファイルを 1 ファイルにまとめるため、両形式の出力に対して次の正規化を行う。

- **要素 ID の prefix**: すべての要素 ID を `{page-id}-{元のID}` に書き換える。見出しに限らず脚注など
  自動生成 ID も対象とし、ページ間の ID 衝突を防ぐ（[sources/prefixIds.ts](../../app/packages/core/src/sources/prefixIds.ts)）。
- **ルーティング**: 相対パスから拡張子を除いた route を生成し（`index` → `/`）、単一 HTML 内は
  hash route（`#/setup/install`）で疑似ページ切り替えする。
- **ファイル間リンク変換**: Markdown の `.md` / `.adoc` リンク、AsciiDoc の `xref:`、変換後 `.html` 相当の
  リンクを `#/route`（hash route）へ変換する。アンカー付きリンク（`other.md#sec`）は route ではなく
  リンク先ページの prefix 済み要素 ID（`#{page-id}-sec`）へ変換し、HTML でも PDF でもアンカー位置に着地する。
- **タスクリストとチェックリスト**（v0.16）: Markdown のタスクリストの項目（`- [x]` / `- [ ]`）も AsciiDoc の
  チェックリストの項目（`* [x]` / `* [ ]`）も、`<input type="checkbox" disabled>`（チェック済みなら `checked`
  付き）を持つ。Asciidoctor はそのままだと、チェック済みを `✓`、未チェックを `❏`（U+274F）という文字で
  描く。`❏` を持つフォントは少なく、印刷すると豆腐になる。そのため monodocs はチェックボックスを書かせる。
  `[%interactive]` も同じく無効にしたチェックボックスで描く。単一の HTML ファイルには、読者が付けた
  チェックを保存する場所が無いからである。`✓` で始まるように書いただけの項目は文字のまま残る。
- **見出し番号**（v0.14）: `numbering.sections` は、サイドバー順に全ファイルを通して見出しに番号を付ける。
  Markdown と AsciiDoc で同じ扱いになる。番号は見出しの中の要素（`<span class="section-number">`）で、
  ID や route には入らない。有効な間は AsciiDoc の `:sectnums:` を拒否する。`:sectnums:` はファイルごと
  に番号を付けるので、1 つの見出しに番号が 2 つ付いてしまう（[roadmap.md](roadmap.md) 19.1）。
- **ページ内アンカー**: `#id`（`/` で始まらない hash）はページ内アンカーとして扱い、該当要素を含む
  ページを表示してスクロールする。脚注・内部参照・直接 URL（`docs.html#id`）で機能する。
- **段落の中の改行**: 両形式とも、段落の中の改行は行を分けるのではなく繋ぐ。CommonMark の規則であり
  Asciidoctor の規則でもある。そしてブラウザはその改行を空白として描く。東アジアの文字に挟まれた場合の
  結果はエンジンによって違う。Firefox はその空白を消し、Chromium と WebKit は残すので、一文一行で書いた
  日本語の段落は、Chromium が作る PDF では文と文のあいだに空白が出る。各形式の明示的な改行の書き方は
  上記のとおり。`sources.lineBreak` で、この選択を両形式まとめて明示できる。`break` はその改行をすべて
  `<br>` にし、`join` は東アジアの文字（East_Asian_Width が F・W・H で、どちらもハングルでないもの）に
  挟まれた改行を取り除くので、そこでは結果がエンジンに左右されなくなる。それ以外のもの（英字、曖昧幅の文字、
  インラインコード、画像）に接する改行は残す。`pre` と `code` は書いたまま残す。
  実測と判断の経緯は [roadmap.md](roadmap.md) 12.6 に記録している。
- **Admonition / alert の共通化**: Markdown の GFM alerts（`> [!NOTE]` など）と AsciiDoc の admonition
  （Asciidoctor 出力の `.admonitionblock`）を、postprocess で共通の `<div class="admonition admonition-TYPE">`
  構造へ正規化する。5 種（NOTE / TIP / IMPORTANT / WARNING / CAUTION）は両形式で一致するため、
  CSS・配色を 1 セットで共有する（[postprocess.ts](../../app/packages/core/src/pipeline/postprocess.ts)）。
- **数式**（v0.15）: 数式はビルド時に KaTeX が MathML だけに描き、KaTeX のスクリプトもスタイルシートも出力に加えない。描くのはブラウザで、OpenType MATH フォントを使う。そのフォントは、PDF を印刷するマシンにも、読者のブラウザにも要る。Windows には Cambria Math が付属し、Debian と Ubuntu では `fonts-lmodern` が Latin Modern Math を提供する。PDF では `fontCheck` が、どのフォントも描かない数式の文字と、MATH テーブルの無い数式フォントを報告する。Chromium（MathML Core）は `normal` 以外の `mathvariant` を無視するので、`\mathbb`・`\mathbf`・`\mathcal` などの書体は Unicode の数学用の文字にする。HTML で数式を含む選択をコピーすると、数式はソースになる。Markdown では書いたとおり、AsciiDoc では Asciidoctor が `stem` を解決した後なので `latexmath` としてである。検索は数式の TeX を読む。PDF からのコピーはビューアのものである。見出しの ID は、数式が入る前と同じく、Markdown では TeX から、AsciiDoc では Asciidoctor が作る。見出しやページタイトルを文字で示す場所（サイドバー、目次、検索結果、PDF のしおりなど）では、数式を `$TeX$` で示す。`math.enabled: false` で数式を止めると、以前の出力になる。`examples/math` は v0.14 が測った数式を両形式で持ち、マシンのフォントを確かめるのに使える。

## 制限・非対応（理由つき）

複数形式を 1 つの HTML に統一する都合、または依存・安全性の都合で、次は対応しない／制限する。

| 記法 / 機能                                                                                                   | 状態                         | 理由                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown 内の生 HTML（インライン / ブロック）                                                                 | **非対応**（出力しない）     | 安全性（XSS 回避）と混在出力の一貫性のため、remark-rehype の既定でドロップする。HTML を埋め込みたい場合は AsciiDoc の passthrough を使う。例外は下の改ページマーカーだけで、これは素通しではなくマーカーとして認識する（入力は出力に届かない）                                                                                                     |
| 改ページ（Markdown は `<div class="page-break"></div>`、AsciiDoc は `<<<`）                                  | **対応**（v0.11）            | PDF で新しい紙を始める。ブラウザから HTML を印刷したときも同じ。Markdown では `<div style="page-break-after: always"></div>` も同じマーカーとして受け付ける。どちらも monodocs が組み立てた要素に置き換わるので、入力の属性は 1 つも残らない。Markdown ではマーカーはそれ自体が 1 つのブロックであること。引用・リスト項目・表のセル・見出しの中のものは認識しない（印刷用スタイルシートがそれらのブロックを分割しないため）。AsciiDoc では `<<<` を Asciidoctor が置いた場所に要素が出るので、そちらでもトップレベルに置くこと。受理する引用符と空白の揺れは公式サイトの設定リファレンスに列挙している |
| ファイル間リンクの見出しアンカー（`other.md#sec` / `xref:other.adoc#sec`）                                    | **対応**                     | リンク先ページの prefix 済み要素 ID（`{page-id}-{アンカー}`）へ解決する。見出しに限らず脚注・明示アンカーも対象。アンカーはリンク先ファイルが生成する ID と照合するため、Markdown から AsciiDoc の見出しを指すには Asciidoctor が生成する ID（例: `_details`）を書く。存在しないアンカーはページ先頭へフォールバックし警告する            |
| コードハイライト（shiki）                                                                                     | **対応**                     | `highlight.enabled: false` で無効化可。言語指定の無いブロック・未対応言語は素のテキスト表示                                                                                                                                                                                                                                               |
| 数式（Markdown `$...$` / `$$...$$` / ```` ```math ````、AsciiDoc latexmath / asciimath / `stem`） | **対応**（v0.15、asciimath は v0.16、制限あり） | ビルド時に MathML に描く（上の形式横断の共通仕様）。描けない部分を落として数式を描き、報告するもの: 自動の式番号（星の無い `equation`・`align`・`gather`。`math/numbering-unsupported`。KaTeX のスタイルシートが描くもので、出力はそれを持たない。星付きの環境の `\tag{}` は描く）、Unicode に文字の無い書体（`\mathit{123}`。`math/style-unsupported`）、CSS で描けない囲み（`\phase`。`math/notation-unsupported`）、ブラウザが書かれたとおりに描けない構文（`\vcenter`。`math/construct-unsupported`）。数式を書いたとおりに示し、報告するもの: KaTeX が `trust` の後ろに置くコマンドを使う数式（`\href`、`\includegraphics`。`math/command-not-allowed`）と、KaTeX が解釈できない数式（`math/parse-failed`）。段の幅より広い別行立ての数式は、画面ではスクロールする。紙では全幅で印刷し、紙より広ければ紙の端で切れる。アクセント: Latin Modern Math では `\vec` の矢印が文字の左に寄る（KaTeX が書く結合文字の矢印を、そのフォントがそう描く）。ほかのアクセントは、Chromium が斜めの線ではなく文字の箱の中央に置く。`\widehat`・`\widetilde`・`\widecheck`・`\utilde` は長い項の上でも 1 文字ほどの幅のままで、どのフォントにも合う文字は無い。`\overline` と `\underline` は、フォントにかかわらず項の幅の線で描く。`\overrightarrow`・`\overbrace`・`\underbrace` は、画面でも紙でも項にわたる（[roadmap.md](roadmap.md) 6.4） |
| Markdown 拡張記法（定義リスト / 絵文字ショートコード `:smile:` / `==marker==` / 上付き `^x^` / 下付き `~x~`） | **非対応**                   | CommonMark / GFM の範囲外。同等の表現が必要なら AsciiDoc 側を使う                                                                                                                                                                                                                                                                         |
| AsciiDoc 文書単位の目次（`:toc:`）                                                                            | **無効化**                   | 単一 HTML 共通の「ページ内目次（右カラム）」を使うため、文書ごとの TOC は出力しない                                                                                                                                                                                                                                                       |
| AsciiDoc アイコン（`:icons: font`）                                                                           | **制限**（テキスト表示）     | Font Awesome への外部依存を避け、admonition はラベルテキスト + 色分けで表示する（自己完結を優先）                                                                                                                                                                                                                                         |
| ブラウザ印刷時の未訪問ページの Mermaid                                                                        | **制限**（client mode のみ） | client mode の Mermaid は表示時に描画するため、ブラウザの印刷（Ctrl+P）では未訪問ページの図が未描画になることがある。`mermaid.mode: pre-render` を使えばビルド時に SVG 化されるため印刷でも全図が表示される（テーマはビルド時固定）。monodocs の PDF 生成は全ページを展開し、client mode の Mermaid の描画完了を待ってから PDF を生成する |
| PDF 出力（`--format pdf` / `both`）                                                                           | **対応**（v0.5）             | headless Chromium を使って単一 HTML から PDF を生成する。実行環境に Chromium が必要で、バンドル版 CLI では PDF 出力を利用できない                                                                                                                                                                                                         |

> 入力は信頼できる（自チーム管理の）ドキュメントを前提とする。とくに AsciiDoc は passthrough で
> 生 HTML を出力でき、それをサニタイズせず埋め込むため、信頼できない AsciiDoc の変換は避けること
> （[development.md](development.md)）。
