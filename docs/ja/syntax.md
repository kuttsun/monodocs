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

## AsciiDoc 対応記法

Asciidoctor.js の標準変換に委ねるため、AsciiDoc の大半の記法をそのまま利用できる。

- 文書タイトル（`= Title`）、セクション見出し（`==`〜）、段落
- **改行**: 段落の中の改行は改行にならない（[形式横断の共通仕様](#単一-html-化のための共通仕様形式横断)）。
  明示的な改行は行末の ` +`、ブロック単位なら `[%hardbreaks]`、文書全体なら `:hardbreaks-option:`
  （別名 `:hardbreaks:`）
- リスト（順序付き / 順序なし / **説明リスト** / チェックリスト）、ネスト、継続行
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

## 単一 HTML 化のための共通仕様（形式横断）

複数ファイルを 1 ファイルにまとめるため、両形式の出力に対して次の正規化を行う。

- **要素 ID の prefix**: すべての要素 ID を `{page-id}-{元のID}` に書き換える。見出しに限らず脚注など
  自動生成 ID も対象とし、ページ間の ID 衝突を防ぐ（[sources/prefixIds.ts](../../app/packages/core/src/sources/prefixIds.ts)）。
- **ルーティング**: 相対パスから拡張子を除いた route を生成し（`index` → `/`）、単一 HTML 内は
  hash route（`#/setup/install`）で疑似ページ切り替えする。
- **ファイル間リンク変換**: Markdown の `.md` / `.adoc` リンク、AsciiDoc の `xref:`、変換後 `.html` 相当の
  リンクを `#/route`（hash route）へ変換する。アンカー付きリンク（`other.md#sec`）は route ではなく
  リンク先ページの prefix 済み要素 ID（`#{page-id}-sec`）へ変換し、HTML でも PDF でもアンカー位置に着地する。
- **ページ内アンカー**: `#id`（`/` で始まらない hash）はページ内アンカーとして扱い、該当要素を含む
  ページを表示してスクロールする。脚注・内部参照・直接 URL（`docs.html#id`）で機能する。
- **段落の中の改行**: 両形式とも、段落の中の改行は行を分けるのではなく繋ぐ。CommonMark の規則であり
  Asciidoctor の規則でもある。そしてブラウザはその改行を空白として描く。東アジアの文字に挟まれた場合の
  結果はエンジンによって違う。Firefox はその空白を消し、Chromium と WebKit は残すので、一文一行で書いた
  日本語の段落は、Chromium が作る PDF では文と文のあいだに空白が出る。各形式の明示的な改行の書き方は
  上記のとおり。実測と、この選択を明示できるようにする設定キーは [roadmap.md](roadmap.md) 12.6 に
  記録している。
- **Admonition / alert の共通化**: Markdown の GFM alerts（`> [!NOTE]` など）と AsciiDoc の admonition
  （Asciidoctor 出力の `.admonitionblock`）を、postprocess で共通の `<div class="admonition admonition-TYPE">`
  構造へ正規化する。5 種（NOTE / TIP / IMPORTANT / WARNING / CAUTION）は両形式で一致するため、
  CSS・配色を 1 セットで共有する（[postprocess.ts](../../app/packages/core/src/pipeline/postprocess.ts)）。

## 制限・非対応（理由つき）

複数形式を 1 つの HTML に統一する都合、または依存・安全性の都合で、次は対応しない／制限する。

| 記法 / 機能                                                                                                   | 状態                         | 理由                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown 内の生 HTML（インライン / ブロック）                                                                 | **非対応**（出力しない）     | 安全性（XSS 回避）と混在出力の一貫性のため、remark-rehype の既定でドロップする。HTML を埋め込みたい場合は AsciiDoc の passthrough を使う。例外は下の改ページマーカーだけで、これは素通しではなくマーカーとして認識する（入力は出力に届かない）                                                                                                     |
| 改ページ（Markdown は `<div class="page-break"></div>`、AsciiDoc は `<<<`）                                  | **対応**（v0.11）            | PDF で新しい紙を始める。ブラウザから HTML を印刷したときも同じ。Markdown では `<div style="page-break-after: always"></div>` も同じマーカーとして受け付ける。どちらも monodocs が組み立てた要素に置き換わるので、入力の属性は 1 つも残らない。Markdown ではマーカーはそれ自体が 1 つのブロックであること。引用・リスト項目・表のセル・見出しの中のものは認識しない（印刷用スタイルシートがそれらのブロックを分割しないため）。AsciiDoc では `<<<` を Asciidoctor が置いた場所に要素が出るので、そちらでもトップレベルに置くこと。受理する引用符と空白の揺れは公式サイトの設定リファレンスに列挙している |
| ファイル間リンクの見出しアンカー（`other.md#sec` / `xref:other.adoc#sec`）                                    | **対応**                     | リンク先ページの prefix 済み要素 ID（`{page-id}-{アンカー}`）へ解決する。見出しに限らず脚注・明示アンカーも対象。アンカーはリンク先ファイルが生成する ID と照合するため、Markdown から AsciiDoc の見出しを指すには Asciidoctor が生成する ID（例: `_details`）を書く。存在しないアンカーはページ先頭へフォールバックし警告する            |
| コードハイライト（shiki）                                                                                     | **対応**                     | `highlight.enabled: false` で無効化可。言語指定の無いブロック・未対応言語は素のテキスト表示                                                                                                                                                                                                                                               |
| 数式（Markdown `$$...$$` / AsciiDoc `stem` / asciimath / latexmath）                                          | **非対応**                   | 自己完結 HTML を保つため MathJax / KaTeX 依存を入れない方針                                                                                                                                                                                                                                                                               |
| Markdown 拡張記法（定義リスト / 絵文字ショートコード `:smile:` / `==marker==` / 上付き `^x^` / 下付き `~x~`） | **非対応**                   | CommonMark / GFM の範囲外。同等の表現が必要なら AsciiDoc 側を使う                                                                                                                                                                                                                                                                         |
| AsciiDoc 文書単位の目次（`:toc:`）                                                                            | **無効化**                   | 単一 HTML 共通の「ページ内目次（右カラム）」を使うため、文書ごとの TOC は出力しない                                                                                                                                                                                                                                                       |
| AsciiDoc アイコン（`:icons: font`）                                                                           | **制限**（テキスト表示）     | Font Awesome への外部依存を避け、admonition はラベルテキスト + 色分けで表示する（自己完結を優先）                                                                                                                                                                                                                                         |
| ブラウザ印刷時の未訪問ページの Mermaid                                                                        | **制限**（client mode のみ） | client mode の Mermaid は表示時に描画するため、ブラウザの印刷（Ctrl+P）では未訪問ページの図が未描画になることがある。`mermaid.mode: pre-render` を使えばビルド時に SVG 化されるため印刷でも全図が表示される（テーマはビルド時固定）。monodocs の PDF 生成は全ページを展開し、client mode の Mermaid の描画完了を待ってから PDF を生成する |
| PDF 出力（`--format pdf` / `both`）                                                                           | **対応**（v0.5）             | headless Chromium を使って単一 HTML から PDF を生成する。実行環境に Chromium が必要で、バンドル版 CLI では PDF 出力を利用できない                                                                                                                                                                                                         |

> 入力は信頼できる（自チーム管理の）ドキュメントを前提とする。とくに AsciiDoc は passthrough で
> 生 HTML を出力でき、それをサニタイズせず埋め込むため、信頼できない AsciiDoc の変換は避けること
> （[development.md](development.md)）。
