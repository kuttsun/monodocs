# アーキテクチャ

[English](../architecture.md)

`monodocs` は複数の Markdown / AsciiDoc ソースを、自己完結した単一 HTML にまとめ、必要に応じて PDF に変換します。単一ファイル配布に特化した軽量ジェネレータであり、Pandoc の代替ではありません。仕様は [roadmap.md](roadmap.md)、実装状況は [status.md](status.md) を参照してください。

## ソースレンダラーアーキテクチャ

各ソース形式を専用レンダラーで処理し、共通の `Page` モデルへ正規化してから出力します。Markdown と AsciiDoc を共通レンダラーへ通してはいけません。共通型は [`app/packages/core/src/types.ts`](../../app/packages/core/src/types.ts) にあります。

中心となる [`build.ts`](../../app/packages/core/src/build.ts) の `preparePages()` は `buildSite` と `validateSite` で共有され、次の順序で処理します。

```text
loadConfig (config.ts)
  -> scanSourceFiles (scan.ts)           入力走査、形式判定、除外
  -> buildPages (pipeline/buildPages.ts) 各 SourceRenderer で Page[] へ正規化
  -> postprocessPages (pipeline/postprocess.ts)
                                         リンク、画像、Mermaid、Shiki を HAST 上で処理
  -> buildSidebar (pipeline/buildSidebar.ts)
                                         ディレクトリ構造からサイドバーを生成
  -> renderSingleHtml (pipeline/renderSingleHtml.ts)
                                         テンプレートへ内容を注入
  -> writeOutput (build.ts)
```

形式別レンダラーは `sources/markdown/renderer.ts` と `sources/asciidoc/renderer.ts` にあり、どちらも `SourceRenderer` の `extractMeta` と `render` を実装します。frontmatter または `:sd-*:` 属性は `sources/meta.ts` で `PageMeta` へ正規化します。

## 単一 HTML の不変条件

### ID とアンカー

複数ソースが一つの HTML を共有するため、すべての要素 ID はグローバルに一意でなければなりません。

- ソース由来 ID には `{page-id}-` を付けます。
- 両レンダラーは `sources/prefixIds.ts` の `prefixIdsAndCollect` を使い、ID の接頭辞付与、同一ページアンカーの書き換え、見出しと検索テキストの収集を行います。
- `buildPages` はルート衝突とページ ID 衝突を拒否します。たとえば `a-b.md` と `a/b.md` は同じページ ID になります。
- 脚注など自動生成された ID にも接頭辞を付けます。

### ルーティングとリンク変換

- 拡張子を除いた相対パスからルートを作り、`index` は `/` へ割り当てます。
- 疑似ページ遷移には `#/setup/install` のような hash route を使います。
- `href` には `encodeURI` 済みの値、`data-route` には生のルートを保存します。クライアントは照合前に `decodeURI` し、日本語や空白を扱います。
- `.md`、`.adoc`、`.html` 相当のリンクと AsciiDoc xref を hash route へ変換します。
- `file.md#heading` のような別ファイルの見出しリンクは、現在は対象ページだけへ移動します。アンカーを除去して警告し、同一ページのアンカーは維持します。

対応・非対応・意図的に制限する記法は [syntax.md](syntax.md) に記録し、記法対応の変更時に更新します。

## Mermaid

Mermaid は `client` と `pre-render` の二つのモードを持ちます。

- `client` は HTML に Mermaid ランタイムを注入します。`mermaid.runtime` で CDN または inline bundle を選択します。
- `pre-render` は `pipeline/mermaidPrerender.ts` と Puppeteer、システム Chromium を使ってビルド時に SVG へ変換します。
- pre-render SVG は raw HAST node として挿入します。`viewBox`、`<defs>`、`url(#...)`、`foreignObject` を保持するため、シリアライズ時の `allowDangerousHtml` を維持します。

次の不変条件を守ってください。

- SVG はソース ID の接頭辞付与後に挿入し、ビルド全体で単調増加する ASCII-safe な `mermaid-{n}` ID を割り当てます。
- 図が存在し、Mermaid が有効で、モードが `client` の場合だけランタイムを注入します。
- Chromium や `puppeteer-core` の欠落、ブラウザ起動失敗はセットアップエラーとしてビルドを失敗させます。個別の図の構文エラーは警告し、その図だけソース `<pre>` へ置き換えます。
- ブラウザは遅延生成し、`finally` で閉じます。図がなければ起動しません。
- `validateSite` は Mermaid を client mode に上書きし、ブラウザを必要としません。
- pre-render SVG のテーマはビルド時に固定され、閲覧者のテーマ切替には追従しません。
- pre-render と PDF は npm インストール版 CLI が必要です。`puppeteer-core` を外部依存に保つため、単一ファイル bundle と standalone executable では利用できません。

ブラウザ起動と実行ファイル探索は PDF と `pipeline/browser.ts` で共有します。`PUPPETEER_EXECUTABLE_PATH` は自動探索より優先されます。

## クライアントテーマ

`themes/default/` は `template.html`、`style.css`、`app.js` を含みます。`renderSingleHtml` は次のトークンを置換します。

```text
{{htmlAttrs}} {{bodyAttrs}} {{title}} {{style}} {{sidebar}} {{pages}}
{{siteDataJson}} {{appJs}} {{bodyScripts}}
{{contentWidthTogglePressed}} {{contentWidthToggleTitle}}
{{#contentWidthToggle}}...{{/contentWidthToggle}}
{{generatorVersion}}
{{#branding}}...{{/branding}} {{#generatorVersion}}...{{/generatorVersion}}
```

`window.__MONODOCS_DATA__` にはルーティング、検索、ページ内目次、前後ナビ用の情報を格納します。クライアントは plain IIFE であり、要素アクセスの null guard を維持します。印刷 CSS は全ページを縦に展開します。

表示と到達可能性について次を維持してください。

- `sidebar.collapseDepth` はディレクトリを折りたたみますが、項目を削除しません。最上位の深さは 1、`0` は全ディレクトリを折りたたみ、省略時はすべて展開します。
- `toc.maxLevel` は埋め込む見出しを h2 から設定レベル（2〜6、既定 3）までに絞りますが、本文は削除しません。
- ディレクトリ名の大文字・小文字を維持します。
- `sidebar.titleTransform.page` と `.directory` は表示ラベルだけに適用し、ルート、ページ ID、本文見出しは変更しません。
- `sidebar.titleFrom: "heading"` は明示タイトル、見出し、ファイル名の順です。`"filename"` は見出しを飛ばしますが明示タイトルを上書きしません。
- `sidebar.flattenSingleChild` は、ページが一つでサブディレクトリがない場合だけ表示上フラット化し、到達可能性を失わせません。
- `html.colorScheme` は初期テーマを制御し、保存済みの `monodocs:theme` を優先します。
- 本文幅トグルは、読みやすい既定の最大幅と利用可能な横幅いっぱいの表示を切り替えます。
  読者の選択は `monodocs:content-width` に保存し、印刷・PDF レイアウトには影響させません。
  `html.contentWidthDefault` では、読者の選択が保存されるまでの初期状態を `standard` / `wide` から選べます。
  `html.contentWidthToggle: false` ではボタンを出力せず、保存済みの読者設定も適用しません。
- `html.imageLightbox` は、リンクのない装飾目的以外の本文画像をキーボードでも操作できるダイアログで拡大表示します。
  既定で有効とし、リンクまたはボタン内の画像では親要素の操作を維持し、`alt` が明示的に空の画像は装飾画像のままにし、印刷および PDF 出力にはダイアログを表示しません。
- `html.branding` は、HTML と PDF の末尾にフッターを既定で表示します。
  CLI は実行時にパッケージのバージョンを渡し、レンダラーはその値をエスケープします。
  バージョンがない場合はバージョン部分だけを省略し、`html.branding: false` ではフッター全体を出力しません。

テーマ UI ラベルは本文言語から独立した英語に統一します。動的ラベルは `app.js` の `LABELS`、静的ラベルは `template.html` に置きます。

TypeScript コンパイルはテーマ資産をコピーしません。core build では `packages/core/scripts/copy-theme.mjs` を実行し、テーマ変更後は再ビルドしてください。

## Watch と Serve

`watch.ts` は `fs.watch` と debounce を使用します。対応環境では recursive mode を使い、出力ファイル自身による再ビルドループを避け、入力ディレクトリがなければ拒否します。

`serve.ts` は Node.js API で HTTP 配信、`watchSite`、SSE live reload を提供します。明確な移植性要件がない限り依存を増やしません。

## PDF

PDF は Chromium の印刷レイアウトで単一 HTML を展開します。

- 印刷前に全ページを展開し、client mode の Mermaid 完了を待ちます。
- ページ間 hash route は印刷前にページ要素の宛先へ書き換えます。
- Unicode のページ ID でも PDF outline が安定するよう、しおりの宛先には ASCII 代替 ID を使います。
- PDF に必要な画像は、通常の HTML 設定で無効でも可能な限り埋め込みます。
- ブラウザのセットアップ失敗は即座に失敗させ、文書固有の描画失敗と区別します。

PDF はシステムフォントを使います。開発イメージには Noto CJK と Noto Color Emoji が含まれます。他の環境では文書に必要なフォントを導入してください。

## セキュリティ境界

`monodocs` は利用者または信頼できるチームが管理する文書を変換するものです。

- Markdown の raw HTML は既定の remark-rehype 経路で破棄します。
- AsciiDoc passthrough は未サニタイズの raw HTML を出力できるため、信頼できない入力は XSS の原因になります。
- AsciiDoc `include::[]` は safe mode で実行し、入力ファイルのディレクトリ内へ制限します。
- 画像は symlink 解決後の real path が入力ルート内にある場合だけ埋め込みます。
- `assets.onLargeImage` は、上限超過画像を警告付きで埋め込む、外部参照に保つ、エラーにする、のいずれかを制御します。

開発環境は [development.md](development.md)、これらの境界を保護するテストは [testing.md](testing.md) を参照してください。
