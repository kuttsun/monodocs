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
- `file.md#heading` のような別ファイルの見出しリンクは、対象ページの接頭辞付き要素 ID（`{page-id}-heading`）へ書き換えます。HTML でも PDF でも見出しに着地します。対象にそのアンカーが存在しない場合は、そのページの先頭へ落として警告します。同一ページのアンカーは維持します。

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
- `sidebar.mode: "custom"` はフォルダ構造ではなく `sidebar.items` からサイドバーを組み立て、その並びが閲覧順（前後ナビ、PDF のページ順、初期表示ページ）になります。ページに解決できないパスはエラー、未掲載・`hidden`・重複は警告で、いずれもページ自体は削除せず route で到達できます。フォルダ由来の `sidebar.titleTransform.directory` と `sidebar.flattenSingleChild` はこのモードでは適用しません。
- `html.colorScheme` は初期テーマを制御し、保存済みの `monodocs:theme` を優先します。
- 本文幅トグルは、読みやすい既定の最大幅と利用可能な横幅いっぱいの表示を切り替えます。
  読者の選択は `monodocs:content-width` に保存し、印刷・PDF レイアウトには影響させません。
  `html.contentWidthDefault` では、読者の選択が保存されるまでの初期状態を `standard` / `wide` から選べます。
  `html.contentWidthToggle: false` ではボタンを出力せず、保存済みの読者設定も適用しません。
- `html.imageLightbox` は、リンクのない装飾目的以外の本文画像をキーボードでも操作できるダイアログで拡大表示します。
  既定で有効とし、リンクまたはボタン内の画像では親要素の操作を維持し、`alt` が明示的に空の画像は装飾画像のままにし、印刷および PDF 出力にはダイアログを表示しません。
- `html.theme` は組み込みテーマ名か、カスタムテーマのディレクトリパス（設定ファイル基準で解決）を選びます。カスタムテーマは `template.html` / `style.css` / `app.js` の一部だけを置けばよく、残りは既定テーマで補います（配色を変えるためにクライアントスクリプトを丸ごと抱え込ませない）。`{{style}}` / `{{sidebar}}` / `{{pages}}` / `{{siteDataJson}}` / `{{appJs}}` / `{{bodyScripts}}` が欠けたテンプレートは、壊れた文書を出力せずビルドを失敗させます。テーマはどの配布形態でも使えるようファイルシステムから読み、外部アセットを参照してはいけません。
- 印刷と PDF にはスクロールがありません。画面でスクロールさせている要素（コードブロック、表）は、印刷時には折り返すか収まる形に組み直し、ページをまたぐ表は見出し行を繰り返します。内容を紙の端で黙って切り捨ててはいけません。
- サイドバーのタイトルとツール列（検索・本文幅・ダークモード）はその場に留め、目次（および目次と入れ替わる検索結果）だけをスクロールさせます。目次が画面より長いときに検索欄を画面外へ送り出してはいけません。読者が検索欄に手を伸ばすのは、まさにそのときだからです。ただし到達可能性のほうが優先です。列が収まらないほど画面が低いときは、目次を潰さずサイドバー全体のスクロールに戻します。
- `/` と `Ctrl+K` / `⌘K` は、文書のどこからでも検索欄へフォーカスを移します。サイドバーが閉じているときは先に開きます（フォーカスを受け付けない検索欄では、ショートカットが黙って無反応になります）。文字を入力している読者からキーを奪ってはいけません。IME の変換中も横取りしてはいけません。例外は `⌘K` だけです。編集操作としての意味を持たないためで、`Ctrl+K` は macOS では行末まで削除する操作にあたります。
- 768px 以下ではサイドバーを既定で閉じたオーバーレイのドロワーにし、本文から読み始められるようにします。ドロワーによって文書に横スクロールを生じさせないこと。広い画面ではサイドバーは常設で、外側クリックや `Escape` で閉じてはいけません。ドロワーの中からページを開いたときは、ポインタでもキーボードでもドロワーを閉じます（閉じないと、開いたページがドロワーの陰に隠れたままになります）。ドロワーを閉じるときは、読者が続けられる場所へフォーカスを置きます。隠れたドロワーの中にも body にも残してはいけません。
- monodocs が印字するもの（Commander が生成する見出しを含む `--help`、すべてのエラー、すべての警告）は、ひとつのカタログを通します。既定は英語で、`--lang ja` または `MONODOCS_LANG=ja` で日本語になり、フラグが環境変数に優先します。`LANG` / `LC_ALL` は意図的に見ません。ビルドログを、それを作ったマシンに依存させないためです。core はメッセージキーを返すのではなく現在の言語を保持するので、呼び出し側は引き当てずに文そのものを読めます。依存パッケージのメッセージが包まれずに届くものは対象外です。ただし読者が実際に当たる引数エラー（不明なオプション・不明なコマンド・引数の欠落）は捕まえて訳します。放っておくとパーサが自分で終了するので、後段では手が出せません。カタログの外で新しい文字列を出すとテストが落ちるようにします（穴を後から見つける形にしない）。文書の `lang` とは別物で、あちらはページを、こちらは端末を記述します。
- monodocs が報告するエラーと警告はすべて `Diagnostic` です。安定した `code`、severity、翻訳済みの `message`、そしてパイプラインが知っている範囲でのソースのパスと位置を持ちます。メッセージカタログとコード集合は別の識別子です（メッセージキーは文言を選び、コードは所見を識別します）。したがって警告を訳しても書き直しても、利用側が固定したものは動きません。2 つのメッセージが 1 つのコードを共有することもあります。monodocs が投げるものはすべてコードを持つ `MonodocsError` なので、最上位で捕まえたエラーもその所見として報告できます。そこへ届くそれ以外のものは、コードの無い所見にせず `internal/unexpected` として報告します。一度リリースしたコードは改名も意味の変更もしません。
- PDF の各ページ下端中央に、ページ番号と総ページ数を入れます。帯は Chromium に渡す HTML フラグメントで、Chromium 自身のクラスに値が差し込まれます。monodocs のテンプレート言語ではありません。全ページに足す唯一のものなので、数字と区切りだけにして翻訳が要らない形にします。帯を出さないときは空のフラグメントを明示すること。`displayHeaderFooter` を有効にしたまま何も渡さないと Chromium 組み込みの日付＋タイトルのヘッダに落ち、「出さない」指定が逆の結果になります。下余白が既定フッタに足りないときは警告します。しきい値は決め打ちではなくそのフラグメントを測って決め、置き換えフラグメントは判定しません（任意の HTML が収まるかは余白の値からは分からないため）。
- 生成した PDF には、文書タイトルと `monodocs v<version>`（Creator / Producer）を記録します。pdf-lib は保存のたびに Producer を書き戻すため、この処理はしおり付与の後に実行します。
- `html.branding` は、HTML と PDF の末尾にフッターを既定で表示します。
  CLI は実行時にパッケージのバージョンを渡し、レンダラーはその値をエスケープします。
  バージョンがない場合はバージョン部分だけを省略し、`html.branding: false` ではフッター全体を出力しません。

既定テーマは意図的に中立で、`site/` のドキュメントサイトのデザインには揃えません。両者はブリーフが別です。サイトは monodocs を採用させるために主張を持ちますが、出力は他人が書いた文書の複製です。生成物すべてにベンダーの配色と書体を焼き付けることは、文書を書いた当人を表すはずの成果物に monodocs の署名を押すことになります。中立であることは、このディレクトリを差し替える `html.theme` の出発点としても適切です。同じ理由でテーマは webfont を埋め込まず、システムフォントスタックを使います。単一ファイルは外部を参照できないため、書体を持たせるには全成果物にインライン埋め込みするしかなく、この形式が存在する理由である小ささに反します。サイトとの違いは、直すべき不整合ではなく決定として扱ってください。

テーマ UI ラベルは文書の `lang` に従います（v0.10）。正本は core です。core が `lang` に対応する表を解決し、`html.labels` を上から適用し、結果を `siteDataJson` に公開します。`app.js` は文字列の写しを自前で持たずそれを消費するので、表と上書きが二重管理でずれることがありません。静的ラベルは `template.html` のトークンから取ります。同梱する表は `en` と `ja` で、表を持たない `lang` は英語のラベルへフォールバックして警告します。

v0.10 までは本文言語から独立した英語に統一していました。これは読者のためというより実装の説明であり、日本語の文書が `lang="ja"` を宣言しながら `On this page` を表示するという、誰の役にも立たない組み合わせを残していました。しかもそのどちらも設定では直せませんでした。覆した理由とカスタムテーマに対する保証の範囲は [roadmap.md](roadmap.md) 23.4 を参照してください。

TypeScript コンパイルはテーマ資産をコピーしません。core build では `packages/core/scripts/copy-theme.mjs` を実行し、テーマ変更後は再ビルドしてください。

## Watch と Serve

`watch.ts` は `fs.watch` と debounce を使用します。対応環境では recursive mode を使い、出力ファイル自身による再ビルドループを避け、入力パスがなければ拒否します。単一ファイルの入力は、それを含むディレクトリを監視し、その名前だけに絞って拾います。`fs.watch` は inode を追うため、ファイル自身を監視すると、エディタが一時ファイルを書いて元の名前へ rename する保存の後は何も届かなくなるからです。

`serve.ts` は Node.js API で HTTP 配信、`watchSite`、SSE live reload を提供します。明確な移植性要件がない限り依存を増やしません。

## PDF

PDF は Chromium の印刷レイアウトで単一 HTML を展開します。

- 印刷前に全ページを展開し、client mode の Mermaid 完了を待ちます。
- ページ間 hash route は印刷前にページ要素の宛先へ書き換えます。
- Unicode のページ ID でも PDF outline が安定するよう、しおりの宛先には ASCII 代替 ID を使います。
- PDF に必要な画像は、通常の HTML 設定で無効でも可能な限り埋め込みます。
- ブラウザのセットアップ失敗は即座に失敗させ、文書固有の描画失敗と区別します。

PDF はシステムフォントを使います。開発イメージには Noto CJK と Noto Color Emoji が含まれます。他の環境では文書に必要なフォントを導入してください。v0.10 からは、文書が必要とするものとそのマシンが描けるものの差をビルドが実測して報告します（`fontCheck`、既定 `warn`）。測るのは PDF 出力のためにすでに開いているブラウザの中で、Mermaid pre-render も同様です。後者はビルドマシンのフォントを SVG に焼き込むため、この設定は `pdf` の下ではなくトップレベルにあります。

## セキュリティ境界

`monodocs` は利用者または信頼できるチームが管理する文書を変換するものです。

- Markdown の raw HTML は既定の remark-rehype 経路で破棄します。例外は改ページマーカー
  （`<div class="page-break"></div>` と、その `style="page-break-after: always"` 綴り。引用符と
  ASCII 空白の揺れは設定リファレンスに列挙）だけで、この経路より前に mdast の `html` ノードで
  一致させ、core が組み立てた要素（`div` ひとつ、クラスひとつ、子は無し）に置き換えます。
  入力から出力へ届くものは無いので、境界に開いた穴ではなく、認識されたマーカーです。
- AsciiDoc passthrough は未サニタイズの raw HTML を出力できるため、信頼できない入力は XSS の原因になります。
- AsciiDoc `include::[]` は safe mode で実行しますが、その制限は**復旧**によるものです。`../` も
  絶対パスも、拒否されるのではなく jail の中へ引き戻されます。しない のはシンボリックリンクの解決で、
  ツリーの内側から外側を指すリンクはたどられます。これは Asciidoctor 自身が明記しています。そのため monodocs は
  Asciidoctor に尋ねます。読もうとしているすべての include について include processor が展開済みの
  target とともに呼ばれ、実体パスが入力ルートの外へ落ちるものを、解決先のパスを示して拒否します。
  パスは Asciidoctor 自身が呼ぶ `normalizeSystemPath` から得るので、safe mode が jail 外のパスを
  復旧することにも推測せず追随します。安全な target は Asciidoctor へ見送るので、`lines` / `tag` /
  `tags` はそのまま効きます。同じプロセスに登録された他の include processor は、この境界を追い越す
  ことも別の場所を読むこともできます。monodocs は他の processor を登録しません
  （[roadmap.md](roadmap.md) 17.5）。
- 画像は symlink 解決後の real path が入力ルート内にある場合だけ埋め込みます。
- `assets.onLargeImage` は、上限超過画像を警告付きで埋め込む、外部参照に保つ、エラーにする、のいずれかを制御します。

開発環境は [development.md](development.md)、これらの境界を保護するテストは [testing.md](testing.md) を参照してください。
