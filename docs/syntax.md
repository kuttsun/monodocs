# 対応記法と制限

`single-docs` は Markdown と AsciiDoc をそれぞれ専用 renderer で処理し、共通の `Page` モデルへ
正規化してから **単一 HTML** にまとめる（[roadmap.md](roadmap.md) 11章）。本書は、対応する記法と、
**複数ファイルを 1 つの HTML に統一する都合で対応できない／意図的に制限している記法**を仕様として示す。

- Markdown: [unified](https://unifiedjs.com/) / remark / rehype（CommonMark + GitHub Flavored Markdown）
- AsciiDoc: [Asciidoctor.js](https://docs.asciidoctor.org/asciidoctor.js/latest/) の標準変換

各記法を網羅したサンプルを 1 サイトにまとめた `app/examples/showcase/` がある（表示確認用。
`markdown/`（GFM）と `asciidoc/` のフォルダで構成）:

```bash
single-docs serve app/examples/showcase/docs
```

## Markdown 対応記法

CommonMark に加え、`remark-gfm` により GitHub Flavored Markdown を有効化している。

- 見出し（`#`〜`######`）、段落、改行
- 強調（`*em*` / `**strong**`）、インラインコード、リンク、画像
- リスト（順序付き / 順序なし）、ネスト、**タスクリスト**（`- [ ]` / `- [x]`）
- 引用、水平線、**表（GFM tables）**、**取り消し線**（`~~text~~`）、**オートリンク**
- フェンスドコードブロック（``` ```lang ```）。shiki で構文ハイライトする（dual theme・ダークモード追従）
- **脚注**（`[^1]`）。ID は単一 HTML 内で衝突しないよう page id を prefix する
- YAML frontmatter（`---`）。`title` / `order` / `hidden` / `description` を読む（[roadmap.md](roadmap.md) 13章）
- ` ```mermaid ` コードブロック → Mermaid 図（client mode）
- 画像（`![alt](path)`）→ 入力配下の実体を data URI 化して埋め込み

## AsciiDoc 対応記法

Asciidoctor.js の標準変換に委ねるため、AsciiDoc の大半の記法をそのまま利用できる。

- 文書タイトル（`= Title`）、セクション見出し（`==`〜）、段落、改行
- リスト（順序付き / 順序なし / **説明リスト** / チェックリスト）、ネスト、継続行
- 強調・モノスペース等のインライン書式、リンク、相互参照
- 表、**admonition**（NOTE / TIP / IMPORTANT / WARNING / CAUTION）
- ソースブロック（`[source,lang]`、shiki でハイライト）、リテラル / リスティング / 例 / サイドバー / 引用 / 詩ブロック
- コールアウト（callout）、`kbd:` / `btn:` / `menu:` マクロ
- 画像マクロ（`image::path[]` / `image:path[]`）→ data URI 埋め込み
- `include::[]`（safe モードで入力ファイルのディレクトリ配下に jail）
- ドキュメント属性、`:sd-title:` / `:sd-order:` / `:sd-hidden:` / `:sd-description:`（[roadmap.md](roadmap.md) 13章）
- `[source,mermaid]` ブロック → Mermaid 図（client mode）
- 同一文書内の `xref:` / 内部アンカー（ID を prefix して追従）
- 脚注（`footnote:[]`）。ID は page id を prefix する

## 単一 HTML 化のための共通仕様（形式横断）

複数ファイルを 1 ファイルにまとめるため、両形式の出力に対して次の正規化を行う。

- **要素 ID の prefix**: すべての要素 ID を `{page-id}-{元のID}` に書き換える。見出しに限らず脚注など
  自動生成 ID も対象とし、ページ間の ID 衝突を防ぐ（[sources/prefixIds.ts](../app/packages/core/src/sources/prefixIds.ts)）。
- **ルーティング**: 相対パスから拡張子を除いた route を生成し（`index` → `/`）、単一 HTML 内は
  hash route（`#/setup/install`）で疑似ページ切り替えする。
- **ファイル間リンク変換**: Markdown の `.md` / `.adoc` リンク、AsciiDoc の `xref:`、変換後 `.html` 相当の
  リンクを `#/route`（hash route）へ変換する。
- **ページ内アンカー**: `#id`（`/` で始まらない hash）はページ内アンカーとして扱い、該当要素を含む
  ページを表示してスクロールする。脚注・内部参照・直接 URL（`manual.html#id`）で機能する。

## 制限・非対応（理由つき）

複数形式を 1 つの HTML に統一する都合、または依存・安全性の都合で、次は対応しない／制限する。

| 記法 / 機能 | 状態 | 理由 |
| --- | --- | --- |
| Markdown 内の生 HTML（インライン / ブロック） | **非対応**（出力しない） | 安全性（XSS 回避）と混在出力の一貫性のため、remark-rehype の既定でドロップする。HTML を埋め込みたい場合は AsciiDoc の passthrough を使う |
| ファイル間リンクの見出しアンカー（`other.md#sec` / `xref:other.adoc#sec`） | **制限**（ページ先頭まで） | リンク変換はファイル単位までで解決し、アンカー部分は落として警告する。別ファイルの見出しへ正確にジャンプする変換は未対応（[roadmap.md](roadmap.md) 18.4 の将来対応） |
| コードハイライト（shiki） | **対応** | `highlight.enabled: false` で無効化可。言語指定の無いブロック・未対応言語は素のテキスト表示 |
| 数式（Markdown `$$...$$` / AsciiDoc `stem` / asciimath / latexmath） | **非対応** | 自己完結 HTML を保つため MathJax / KaTeX 依存を入れない方針 |
| Markdown 拡張記法（定義リスト / 絵文字ショートコード `:smile:` / `==marker==` / 上付き `^x^` / 下付き `~x~`） | **非対応** | CommonMark / GFM の範囲外。同等の表現が必要なら AsciiDoc 側を使う |
| AsciiDoc 文書単位の目次（`:toc:`） | **無効化** | 単一 HTML 共通の「ページ内目次（右カラム）」を使うため、文書ごとの TOC は出力しない |
| AsciiDoc アイコン（`:icons: font`） | **制限**（テキスト表示） | Font Awesome への外部依存を避け、admonition はラベルテキスト + 色分けで表示する（自己完結を優先） |
| ブラウザ印刷時の未訪問ページの Mermaid | **制限** | client mode の Mermaid は表示時に描画するため、ブラウザの印刷（Ctrl+P）では未訪問ページの図が未描画になることがある。全ページに図を含めた出力は PDF（v0.5、ヘッドレスブラウザで全展開後に描画待ち）で対応予定 |
| PDF 出力（`--format pdf` / `both`） | **未対応**（v0.5 予定） | 現状の出力は HTML のみ |

> 入力は信頼できる（自チーム管理の）ドキュメントを前提とする。とくに AsciiDoc は passthrough で
> 生 HTML を出力でき、それをサニタイズせず埋め込むため、信頼できない AsciiDoc の変換は避けること
> （[development.md](development.md)）。
