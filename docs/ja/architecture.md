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
  -> buildSidebar (pipeline/buildSidebar.ts)
                                         ディレクトリ構造からサイドバーを生成
                                         （numbering.sections のとき numberSidebar が番号を付ける）
  -> postprocessPages (pipeline/postprocess.ts)
                                         リンク、画像、Mermaid、Shiki、見出し番号を HAST 上で処理
  -> renderSingleHtml (pipeline/renderSingleHtml.ts)
                                         テンプレートへ内容を注入
  -> writeOutput (build.ts)
```

形式別レンダラーは [`sources/markdown/renderer.ts`](../../app/packages/core/src/sources/markdown/renderer.ts) と [`sources/asciidoc/renderer.ts`](../../app/packages/core/src/sources/asciidoc/renderer.ts) で、どちらも `SourceRenderer`（`extractMeta` と `render`）を実装します。frontmatter と `:sd-*:` 属性は [`sources/meta.ts`](../../app/packages/core/src/sources/meta.ts) で `PageMeta` へ正規化します。

ハイライトはブロックだけで決まらなければなりません。そうしないと `watch` の再ビルドが最初のビルドと食い違います。Shiki のショートハンドはプロセスごとに 1 つのハイライターを共有して言語を必要時に読み込むため、埋め込む側の文法（AsciiDoc、Markdown）は埋め込まれた言語を既に誰かが読み込んでいたときだけハイライトし、差し込む側の文法（JavaScript のタグ付きテンプレートへの `lit`）はそれより後に初めて使われた文法にしか届きません。そこで `postprocess.ts` は次のようにします。

- ハイライトの前に、各言語を、その文法が埋め込みうる言語と、その scope またはそのドット区切りの前方部分へ差し込む文法（Shiki は `source.js` への差し込みを `source.js.jsx` にも適用する）ごと推移的に読み込む。
- コードから推測した言語を読み込むショートハンドではなく、ハイライターのインスタンスを通してハイライトする。
- 同じ位置に一致する差し込みは登録順に試される（Vue と Angular はどちらも `{{` に一致する）ので、競合しうる差し込みの文法は、いずれかが初めて必要になった時点で、まとめて決まった順序で登録する。

`sources.lineBreak` は、共通のヘルパー（[`sources/lineBreak.ts`](../../app/packages/core/src/sources/lineBreak.ts)）を通して各レンダラーの中で適用し、`prefixIdsAndCollect` がページのテキストを集める前に済ませます。

> [!WARNING]
> `sources.lineBreak` を `postprocessPages` へ移してはいけません。`postprocessPages` は `page.html` を再パースしますが `page.text` は再計算しないので、検索インデックスが HTML と食い違います。

## 単一 HTML の不変条件

### ID とアンカー

複数ソースが一つの HTML を共有するため、すべての要素 ID はグローバルに一意でなければなりません。

- ソース由来 ID には、脚注など自動生成された ID も含めて `{page-id}-` を付けます。
- 両レンダラーは [`sources/prefixIds.ts`](../../app/packages/core/src/sources/prefixIds.ts) の `prefixIdsAndCollect` を使い、ID の接頭辞付与、同一ページアンカーの書き換え、見出しと検索テキストの収集を行います。
- `buildPages` はルート衝突とページ ID 衝突を拒否します（たとえば `a-b.md` と `a/b.md` は同じページ ID になります）。
- 見出し番号（`numbering.sections`）はラベルであり、アドレスではありません。
  - 番号は読者が見るサイドバーから、どちらかのレンダラーではなく共有の `Page` モデルの上で決め、後処理で `.section-number` 要素として見出しへ書き込みます。サイドバー（要るのはタイトルとパスだけ）を後処理より前に組み立てるのはこのためです。
  - route・ページ ID・見出し ID・`page.text`・見出しテキストは、番号付けが無いときのままです。
  - クライアントには番号をタイトルや見出しテキストの中ではなく横に渡すので、検索は番号を番号全体として照合し、数字が語の順位を変えることはありません。すべての語に完全に一致するかどうかが同じ結果の間では（[roadmap.md](roadmap.md) 22.3 章）、番号が一致した結果を、一致しなかった結果より先に並べます。
  - core が書く span には `data-monodocs-section-number` を付けます。クライアントはこれを目印に、文書自身が同じクラスを使ったマークアップには触れずに、その数字を本文ハイライトから外します。
  - 番号付けが有効な間は AsciiDoc の `:sectnums:` を拒否します。判定は属性を読むのではなく、Asciidoctor が番号を付けた節を問い合わせて行います。

### ルーティングとリンク変換

- 拡張子を除いた相対パスからルートを作り、`index` は `/` へ割り当てます。
- 疑似ページ遷移には `#/setup/install` のような hash route を使います。
- `href` には `encodeURI` 済みの値、`data-route` には生のルートを保存します。クライアントは照合前に `decodeURI` し、日本語や空白を扱います。
- `.md`、`.adoc`、`.html` 相当のリンクと AsciiDoc xref を hash route へ変換します。
- `file.md#heading` のような別ファイルの見出しリンクは、対象ページの接頭辞付き要素 ID（`{page-id}-heading`）へ書き換え、HTML でも PDF でも見出しに着地させます。対象にそのアンカーが無い場合は、そのページの先頭へ落として警告します。同一ページのアンカーは維持します。

対応・非対応・意図的に制限する記法は [syntax.md](syntax.md) に記録し、記法対応の変更時に更新します。

## Mermaid

Mermaid は `client` と `pre-render` の二つのモードを持ちます。

- `client` は Mermaid ランタイムを注入します。`mermaid.runtime` で CDN 参照か inline bundle を選びます。inline は自己完結しますが、図があると出力サイズが増えます。
- `pre-render` は [`pipeline/mermaidPrerender.ts`](../../app/packages/core/src/pipeline/mermaidPrerender.ts) と Puppeteer、システム Chromium を使ってビルド時に SVG へ変換します。
- `processMermaidPrerender` は SVG を raw HAST node として挿入します。`viewBox`、`<defs>`、`url(#...)`、`foreignObject` を保持するため、シリアライズ時の `allowDangerousHtml` を維持します。

pre-render の次の不変条件を守ってください。

- SVG はソース ID の接頭辞付与後に挿入します。ビルド全体で一意かつ単調増加する ASCII-safe な `mermaid-{n}` ID を割り当て、`page.id` から導出してはいけません。
- 図が存在し、Mermaid が有効で、モードが `client` の場合だけランタイムを注入します。
- Chromium や `puppeteer-core` の欠落、ブラウザ起動失敗はセットアップエラーとしてビルドを失敗させます。個別の図の構文エラーは警告し、その図だけソース `<pre>` へ置き換えます。
- ブラウザは遅延生成し、`finally` で閉じます。図がなければ Chromium を起動しません。
- `validateSite` は Mermaid を client mode に上書きし、ブラウザを必要としません。
- pre-render SVG のテーマはビルド時に固定され、閲覧者のテーマ切替には追従しません。

> [!IMPORTANT]
> pre-render と PDF は npm インストール版 CLI が必要です。`puppeteer-core` を外部依存に保つため、単一ファイル bundle と standalone executable では利用できません。

ブラウザ起動と実行ファイル探索は PDF と [`pipeline/browser.ts`](../../app/packages/core/src/pipeline/browser.ts) で共有します。`PUPPETEER_EXECUTABLE_PATH` はシステムブラウザの自動探索より優先されます。

## クライアントテーマ

[`themes/default/`](../../app/packages/core/src/themes/default/) は `template.html`、`style.css`、`app.js` を含みます。`renderSingleHtml` は次のトークンを置換します。

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

- **サイドバー**
  - `sidebar.collapseDepth` はディレクトリを折りたたみますが、項目を削除しません。最上位の深さは 1、`0` は全ディレクトリを折りたたみ、省略時はすべて展開します。
  - ディレクトリ名の大文字・小文字を維持します。
  - `sidebar.titleTransform.page` と `.directory` は表示ラベルだけに適用し、ルート、ページ ID、本文見出しは変更しません。
  - `sidebar.titleFrom: "heading"` は明示タイトル、見出し、ファイル名の順です。`"filename"` は見出しを飛ばしますが、frontmatter や `:sd-title:` の明示タイトルは上書きしません。
  - `sidebar.flattenSingleChild` は、ページがちょうど一つでサブディレクトリがないディレクトリだけをフラット化します。表示上の変換であり、到達可能性を失わせてはいけません。
  - `sidebar.mode: "custom"` はフォルダ構造ではなく `sidebar.items` からサイドバーを組み立て、その並びが閲覧順（前後ナビ、PDF のページ順、初期表示ページ）になります。ページに解決できないパスはエラー、未掲載・`hidden`・重複は警告で、ページ自体は削除せず route で到達できます。フォルダ由来の `sidebar.titleTransform.directory` と `sidebar.flattenSingleChild` はこのモードでは適用しません。
  - サイドバーのタイトルとツール列（検索・本文幅・ダークモード）はその場に留め、目次（および目次と入れ替わる検索結果）だけをスクロールさせます。目次が長くても検索欄を画面外へ送り出してはいけません。ただし到達可能性が優先で、列が収まらないほど画面が低いときは、目次を潰さずサイドバー全体のスクロールに戻します。
  - 768px 以下ではサイドバーを既定で閉じたオーバーレイのドロワーにし、本文から読み始められるようにします。ドロワーで文書に横スクロールを生じさせないこと。広い画面ではサイドバーは常設で、外側クリックや `Escape` で閉じてはいけません。ドロワーの中からページを開いたときは、ポインタでもキーボードでもドロワーを閉じます（閉じないと開いたページが陰に隠れます）。ドロワーを閉じるときは、読者が続けられる場所へフォーカスを置き、隠れたドロワーの中にも body にも残しません。
- **検索ショートカット**：`/` と `Ctrl+K` / `⌘K` は、文書のどこからでも検索欄へフォーカスを移し、サイドバーが閉じていれば先に開きます（そうしないとショートカットが黙って無反応になります）。入力中の読者や IME の変換中からキーを奪ってはいけません。例外は編集操作の意味を持たない `⌘K` だけです。`Ctrl+K` は macOS では行末まで削除する操作です。
- **検索のクリアボタン**：テーマ自身のものを検索欄の中に置き、その横にブラウザ自身の × を描かせません。欄に語があるあいだだけ表示し、`Escape` と同じものを消し、フォーカスは欄に、狭い画面のドロワーは開いたままに残します。ボタンの無いテンプレートでも検索は働き、`app.js` はボタンが無いことに備えます。ブラウザ自身の × を隠す規則はボタンがあるところ（`app.js` がボタンを見つけたときに付ける `.search-field.has-clear`）だけに効くので、そのようなテンプレートはその × を保ちます。
- `toc.maxLevel` は埋め込む見出しを h2 から設定レベル（2〜6、既定 3）までに絞りますが、本文は削除しません。
- `html.colorScheme` はライト・ダーク・自動の初期配色を決めます。保存済みの `monodocs:theme` が優先されます。
- **本文幅**：トグルは、読みやすい既定の最大幅と利用可能な横幅いっぱいを切り替えます。読者の選択は `monodocs:content-width` に保存し、印刷・PDF レイアウトには影響させません。`html.contentWidthDefault` は、読者の選択が保存されるまでの状態を `standard` / `wide` から選びます。`html.contentWidthToggle: false` ではボタンを出力せず、保存済みの選択も適用しません。
- **画像ライトボックス**：`html.imageLightbox`（既定で有効）は、リンクのない装飾目的以外の本文画像を、キーボードでも操作できるダイアログで拡大表示します。
  - リンクまたはボタン内の画像は親要素の操作を維持し、`alt` が明示的に空の画像は装飾画像のままです。印刷および PDF 出力にはダイアログを表示しません。
  - Mermaid 図も、SVG ができた時点（`pre-render` では読み込み時、`client` では描画後）から同じダイアログで開きます。SVG は複製せずダイアログへ移し、閉じたら戻します。複製すると、SVG 自身のスタイルや `url(#…)` 参照が依存する ID が重複するためです。
  - 図のブロック自体にはボタンのロールを付けません（付けると図の文字や説明が支援技術から隠れるため）。キーボードフォーカス時に現れる別のボタンから開きます。
  - 印刷の前とルート変更時にはダイアログを閉じ、図がページから欠けないようにします。
- **カスタムテーマ**：`html.theme` は組み込みテーマ名か、カスタムテーマのディレクトリパス（設定ファイル基準で解決）を選びます。
  - カスタムテーマは `template.html` / `style.css` / `app.js` の一部だけを置けばよく、残りは既定テーマで補います（配色を変えるためにクライアントスクリプトを抱え込ませない）。
  - `{{style}}` / `{{sidebar}}` / `{{pages}}` / `{{siteDataJson}}` / `{{appJs}}` / `{{bodyScripts}}` が欠けたテンプレートは、壊れた文書を出力せずビルドを失敗させます。
  - テーマはどの配布形態でも使えるようファイルシステムから読み、外部アセットを参照してはいけません。
  - 文書が求めた規則は、テーマに任せず、テーマが渡したスタイルシートへ core が追記します。改ページマーカー、図の配置（`figures.align` と AsciiDoc の `align=`）、`pdf.pageBreakLevel`、`pdf.density`、`pdf.watermark` の規則（[`pipeline/watermark.ts`](../../app/packages/core/src/pipeline/watermark.ts)）です。`style.css` を差し替えたテーマが、それを求めた文書から「CONFIDENTIAL」を消せてはいけません。透かしの文字列はエスケープした CSS 文字列として届き、生成した表紙にも同じ規則が付き、`mix-blend-mode: multiply` で本文の上に描きます。下に置くとテーマの背景に覆われるからです。
- **印刷**：印刷と PDF にはスクロールがありません。画面でスクロールさせている要素（コードブロック、表）は印刷時に折り返すか収まる形にし、ページをまたぐ表は見出し行を繰り返します。内容を紙の端で黙って切り捨ててはいけません。
- **メッセージと言語**：monodocs が印字するもの（Commander が生成する見出しを含む `--help`、すべてのエラー、すべての警告）は、ひとつのカタログを通します。既定は英語で、`--lang ja` または `MONODOCS_LANG=ja` で日本語になり、フラグが環境変数に優先します。
  - `LANG` / `LC_ALL` は意図的に見ません。ビルドログをそれを作ったマシンに依存させないためです。
  - core はメッセージキーを返すのではなく現在の言語を保持するので、呼び出し側は文そのものを読めます。
  - 依存パッケージのメッセージが包まれずに届くものは対象外です。ただし読者が実際に当たる引数エラー（不明なオプション・不明なコマンド・引数の欠落）は捕まえて訳します。放っておくとパーサが自分で終了するからです。
  - カタログの外で新しい文字列を出すとテストが落ちます。
  - 文書の `lang` とは別物です。あちらはページを、こちらは端末を記述します。
- **診断**：monodocs が報告するエラーと警告はすべて `Diagnostic` で、安定した `code`、severity、翻訳済みの `message`、パイプラインが知っている範囲でのソースのパスと位置を持ちます。
  - メッセージキーは文言を選び、コードは所見を識別します。両者は別なので、警告を訳しても書き直しても利用側が固定したものは動かず、2 つのメッセージが 1 つのコードを共有することもあります。
  - monodocs が投げるものはすべてコードを持つ `MonodocsError` なので、最上位で捕まえたエラーもその所見として報告できます。そこへ届くそれ以外のものは `internal/unexpected` として報告します。
  - 一度リリースしたコードは改名も意味の変更もしません。
- **PDF のページ番号**：本文の各ページ下端中央に、ページ番号と総ページ数を入れます。
  - 生成する表紙（`pdf.cover`）は本文と別に帯なしで描画するので番号を持たず、本文は 1 から始まり、総ページ数は本文だけを数えます。ページラベルでビューアの表示も一致させます。
  - 帯は Chromium 自身のクラスで値が差し込まれる HTML フラグメントで、monodocs のテンプレート言語ではありません。数字と区切りだけにして翻訳が要らない形にします。
  - 帯を出さないときは空のフラグメントを明示すること。`displayHeaderFooter` を有効にしたまま何も渡さないと、Chromium 組み込みの日付＋タイトルのヘッダになります。
  - 下余白が既定フッタに足りないときは警告します。しきい値はそのフラグメントを測って決めます。置き換えフラグメントは判定しません（任意の HTML が収まるかは余白の値からは分からないため）。
- **PDF メタデータ**：生成した PDF には、文書タイトルと `monodocs v<version>`（Creator / Producer）を記録します。pdf-lib は保存のたびに Producer を書き戻すため、この処理はしおり付与の後に実行します。
- **ブランディング**：`html.branding` は、HTML と PDF の末尾にフッターを既定で表示します。CLI は実行時にパッケージのバージョンを渡し、レンダラーはその値をエスケープし、値がなければバージョン部分だけを省略します。`html.branding: false` ではフッター全体を出力しません。

既定テーマは意図的に中立で、[`site/`](../../site/) のドキュメントサイトのデザインには揃えません。サイトは monodocs を売り込むものですが、出力は文書を書いた人を表すものだからです。中立であることは、このディレクトリを差し替える `html.theme` の出発点としても適切です。同じ理由に加え、単一ファイルは外部を参照できない（webfont は全成果物へインライン埋め込みするしかない）ため、テーマは webfont を埋め込まず、システムフォントスタックを使います。サイトとの違いは、直すべき不整合ではなく決定として扱ってください。

テーマ UI ラベルは文書の `lang` に従います（v0.10）。正本は core です。core が `lang` に対応する表を解決し、`html.labels` を上から適用し、結果を `siteDataJson` に公開します。`app.js` は文字列の写しを持たずそれを消費するので、表と上書きがずれません。静的ラベルは `template.html` のトークンから取ります。同梱する表は `en` と `ja` で、表を持たない `lang` は英語のラベルへフォールバックして警告します。v0.10 まではラベルが常に英語で、`lang="ja"` の文書が `On this page` を表示していました。覆した理由とカスタムテーマに対する保証の範囲は [roadmap.md](roadmap.md) 23.4 を参照してください。

> [!WARNING]
> TypeScript コンパイルは `.html`、`.css`、`.js` のテーマ資産をコピーしません。コンパイル後に `dist/themes` を使えるよう、core build で `packages/core/scripts/copy-theme.mjs` を実行してください。テーマ資産を変えたら再ビルドが必要です。

## Watch と Serve

[`watch.ts`](../../app/packages/core/src/watch.ts) は `fs.watch`（対応環境では recursive mode）と debounce を使います。ソースと設定の入力を監視し、出力ファイルの書き込みを無視して再ビルドループを避け、入力パスがなければ拒否します。単一ファイルの入力は、それを含むディレクトリをその名前だけに絞って監視します。`fs.watch` は inode を追うため、ファイル自身を監視すると、エディタが一時ファイルを元の名前へ rename して保存した後は何も届かなくなるからです。

[`serve.ts`](../../app/packages/core/src/serve.ts) は Node.js API で HTTP 配信、`watchSite`、SSE live reload を提供します。明確な移植性要件がない限り、監視用の依存を増やしません。

## 出力サイズ

[`pipeline/outputSize.ts`](../../app/packages/core/src/pipeline/outputSize.ts) は、各出力を書き出したあとに報告します（roadmap 20.5）。

- 合計はビルド中に積算せず、ディスクから読みます。
- HTML の内訳の各部分（埋め込んだ各画像の data URI、inline の Mermaid ランタイム、`siteDataJson`）は完成したテキストの中から探し、`document` は残りとするので、内訳の合計は必ずファイルと一致します。
- `assets.budget` は HTML と PDF の各出力を測った直後に確かめます。そのため `onBudget: error` で HTML が予算を超えると、PDF を作る前に失敗します。失敗したビルドは結果を返さないので、エラーに大きさの報告を含めます。
- `watch`（とその上で動く `serve`）は `onBudget: "warn"` を渡します。

## PDF

PDF は Chromium の印刷レイアウトで単一 HTML を展開します。次の性質を維持してください。

- 印刷前に全ページを展開し、client mode の Mermaid 描画完了を待ちます。
- ページ間 hash route は印刷前にページ要素の宛先へ書き換えます。
- Unicode のページ ID でも PDF outline が安定するよう、しおりの宛先には ASCII 代替 ID を使います。
- PDF に必要な画像は、HTML の画像埋め込みが無効でも可能な限り埋め込みます。
- ブラウザのセットアップ失敗は即座に失敗させ、文書固有の描画失敗と区別します。
- 印刷する目次（`pdf.toc`、[`pipeline/pdfToc.ts`](../../app/packages/core/src/pipeline/pdfToc.ts)）は PDF の中にだけあります。フォント検査の前にページへ差し込み、各行き先に ASCII のアンカー（`mdtoc-{n}`）を置き、ページ番号は印刷結果のカタログ `/Dests` から読みます。返すのは、宛先が自分の印刷した番号と一致した印刷だけで、決まった回数の印刷で定まらない文書は失敗させます。番号の欄は固定幅にして、番号を入れても行が折り返し直さないようにします。

v0.10 からは、文書が必要とするものとそのマシンが描けるものの差をビルドが実測して報告します（`fontCheck`、既定 `warn`）。測るのは、PDF 出力でも Mermaid pre-render でも、そのためにすでに開いているブラウザの中です。後者はビルドマシンのフォントを SVG に焼き込むため、この設定は `pdf` の下ではなくトップレベルにあります。

> [!IMPORTANT]
> PDF はシステムフォントを使います。開発イメージには Noto CJK と Noto Color Emoji が含まれます。他の環境では文書に必要なフォントを導入してください。

## セキュリティ境界

`monodocs` は利用者または利用者のチームが管理する、信頼できる文書を変換するものです。

- Markdown の raw HTML は既定の remark-rehype 経路で破棄します。例外は改ページマーカー（`<div class="page-break"></div>` と、その `style="page-break-after: always"` 綴り。引用符と ASCII 空白の揺れは設定リファレンスに列挙）だけで、この経路より前に mdast の `html` ノードで一致させ、core が組み立てた要素（`div` ひとつ、クラスひとつ、子は無し）に置き換えます。入力から出力へ届くものは無いので、境界に開いた穴ではなく、認識されたマーカーです。
- AsciiDoc passthrough は未サニタイズの raw HTML を出力できるため、信頼できない AsciiDoc を変換すると XSS の原因になります。
- AsciiDoc `include::[]` は safe mode で実行し、入力ファイルのディレクトリの下に閉じ込めますが、その制限は**復旧**によるものです。`../` も絶対パスも、拒否されるのではなく jail の中へ引き戻されます。safe mode はシンボリックリンクを解決しないので、ツリーの内側から外側を指すリンクはたどられます（Asciidoctor 自身が明記）。そのため monodocs は include processor を登録します。
  - 読もうとしているすべての include について、展開済みの target とともに呼ばれ、実体パスが入力ルートの外へ落ちるものを、解決先のパスを示して拒否します。
  - パスは Asciidoctor 自身が呼ぶ `normalizeSystemPath` から得るので、safe mode の復旧にも推測せず追随します。
  - 安全な target は Asciidoctor へ見送るので、`lines` / `tag` / `tags` はそのまま効きます。
  - 同じプロセスに登録された他の include processor は、この processor を追い越すことも別の場所を読むこともできます。monodocs は他の processor を登録しません（[roadmap.md](roadmap.md) 17.5）。
- 画像は symlink 解決後の real path が入力ルート内にある場合だけ埋め込みます。
- `assets.onLargeImage` は、上限超過画像を警告付きで埋め込む、外部参照に保つ、エラーにする、のいずれかを制御します。

開発環境は [development.md](development.md)、これらの境界を保護するテスト戦略は [testing.md](testing.md) を参照してください。
