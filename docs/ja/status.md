# 実装状況

[English](../status.md)

最終更新: 2026-09-03

## 対応状況

| 機能                                | 状態      | 対象バージョン |
| ----------------------------------- | --------- | -------------- |
| 開発環境（devcontainer / monorepo） | ✅ 完了   | -              |
| Markdown → 単一 HTML（MVP）         | ✅ 完了   | v0.1           |
| AsciiDoc 対応・混在対応             | ✅ 完了   | v0.2           |
| リンク変換 / 画像埋め込み / Mermaid | ✅ 完了   | v0.3           |
| 検索 / 目次 / watch / serve         | ✅ 完了   | v0.4           |
| PDF 出力                            | ✅ 完了   | v0.5           |
| npm / GitHub Actions                | ✅ 完了   | v0.6           |
| VS Code 拡張                        | ⏸️ 凍結   | v0.7           |
| 高度な機能（検索・テーマ・バイナリ）| ✅ 完了   | v0.8           |
| 検索の仕上げ（仮名畳み込み・キー操作）| ✅ 完了   | v0.9           |
| 言語 / `init` / PDF の仕上げ        | ✅ 完了   | v0.10          |
| 改ページ（マーカー / `pdf.pageBreakLevel`）| ✅ 完了   | v0.11          |
| 仕様の同期 / 診断 / `document`      | ✅ 完了   | v0.11          |
| 入力ルート / route の別名 / AsciiDoc 属性 | ✅ 完了   | v0.12          |
| 出力サイズと予算 / 透かし / 改行     | 🚧 予定   | v0.13          |
| 見出し番号 / 表紙 / 紙の目次        | 🚧 予定   | v0.14          |
| 表面の凍結 / JSON スキーマ v1       | 🚧 予定   | 1.0            |

VS Code 拡張は凍結しており、着手予定はない。需要が分からず、リリースと Marketplace の運用が単独
メンテナンス体制に対して重く、拡張と `@monodocs/core` の境界も未決定であるため。理由は
[roadmap.md](roadmap.md) の v0.7 に記録している。代わりに着手した v0.8 と、それに続く v0.9・v0.10・v0.11 は
いずれもリリース済みである。

0.12.0 はまだリリースしていない。チェックリストの項目はすべて入った——`root` と
`sources.include`、route の別名、`sources.asciidoc.attributes`、include の読み取り境界である。先に
プレリリースを `next` で出すのは、そのうち 2 つが既存の設定の振る舞いを変えるからである。
`sources.include` / `sources.exclude` の否定パターンは誤読ではなく拒否になり、シンボリックリンクで
入力ルートの外へ届く `include::` はビルドを止めるようになった。どちらも `latest` を動かす前に、
公開された成果物がそうしているところを見ておく価値がある。

## 完了条件の達成状況

### v0.1: Markdown 単一 HTML MVP

- [x] `monodocs build ./docs -o ./dist/docs.html` が動作する
- [x] 複数 Markdown ファイルが 1 つの HTML に含まれる
- [x] サイドバーからページ切り替えできる（hash route）
- [x] H1 がタイトルとして使われる（無ければファイル名にフォールバック＋警告）

### v0.2: AsciiDoc 基本対応・混在対応

- [x] `.md` と `.adoc` が混在していてもビルドできる
- [x] AsciiDoc の `= Title` がページタイトルになる
- [x] Markdown / AsciiDoc が同じサイドバーに表示される
- [x] include 用ファイル（`_*` / `partials/**` / `includes/**`）をページ化対象から除外できる
- [x] AsciiDoc の同一文書内 xref を単一 HTML 内リンクに変換する

### v0.3: 実用機能

- [x] Markdown / AsciiDoc 間のリンクを hash route に変換できる（`.md` / `.adoc` / `.html`）
- [x] 画像を data URI として HTML に埋め込める（サイズ上限・超過時の挙動を設定可能）
- [x] Markdown / AsciiDoc の Mermaid を表示できる（`mermaid.mode`: `client` 既定はランタイムを CDN / inline 切替。`pre-render` はビルド時にヘッドレス Chromium で各図を SVG 化して埋め込み、JS 不要・印刷安定・図が少数なら inline より小さい。バンドル版 CLI＝単一 `.cjs` / 単一実行ファイルでは利用不可でパッケージインストール版が必要）
- [x] frontmatter / `:sd-*:` により order・hidden・description を制御できる
- [x] validate でリンク切れ・画像欠落・タイトル欠落を検出できる

### v0.4: HTML ドキュメントサイト機能強化

- [x] HTML 内検索ができる（タイトル・見出し・本文の部分一致。サイドバーの検索ボックス）
- [x] ページ内目次（既定 h2 / h3）が表示される（スクロールに連動して現在地をハイライト。`toc.maxLevel` で最深レベルを 2〜6 に設定可能）
- [x] 前後ページナビゲーションを表示する（hidden ページは除外）
- [x] サイドバーを折りたたみできる（全体トグル＋ディレクトリ単位の開閉。`sidebar.collapseDepth` でこの階層より深いディレクトリを既定で畳める）
- [x] サイドバーのフォルダ名を強制大文字化せず原文のまま表示する。`sidebar.titleTransform.page` / `directory` でページ表示タイトルとフォルダ表示名に別々の変換を適用できる（route は順序のため保持）
- [x] `sidebar.titleFrom: "filename"` で、見出し（H1 / `= Title`）があってもファイル名をページタイトルに使える（明示タイトル frontmatter `title` / `:sd-title:` は常に最優先）。既定は `"heading"`（frontmatter → 見出し → ファイル名）
- [x] `sidebar.flattenSingleChild` でページを 1 つだけ含む（サブフォルダ無し）のフォルダ階層を畳み、唯一のページを親へ繰り上げられる（ドキュメント＋画像を 1 フォルダにまとめた場合の冗長な階層を解消。route は不変で到達性を失わない）
- [x] ダークモードに対応（OS 設定に追従。手動切替は localStorage に保存）
- [x] メインコンテンツを読みやすい既定幅と利用可能な横幅いっぱいの表示で切り替え可能（読者の選択は localStorage に保存し、`html.contentWidthDefault` で初期状態を指定、`html.contentWidthToggle: false` で非表示）
- [x] リンクのない装飾目的以外の本文画像をキーボードでも操作できる lightbox で拡大表示（`html.imageLightbox`、既定 true。リンク付き画像と明示的な装飾画像は元の意味を維持し、印刷および PDF では非表示）
- [x] 印刷時に全ページを縦に展開する print 用レイアウト（`@media print`）
- [x] コードブロックを shiki で構文ハイライト（dual theme でダークモード追従。ライトでも本文と見分けやすい背景）
- [x] コードブロックにコピー / 折り返しトグルボタンを表示（ホバー表示。クライアント側で注入）
- [x] `monodocs watch` で入力・設定の変更を監視して再ビルドできる
- [x] `monodocs serve` でローカルプレビューできる（変更検出でライブリロード、`--open` で自動起動）

### v0.5: PDF 出力

- [x] `monodocs build --format pdf -o ./dist/docs.pdf` で単一 HTML を経由して PDF を生成できる（ヘッドレス Chromium。print 用レイアウトで全ページを縦展開）
- [x] `--format both` で HTML と PDF を同時出力できる（`-o` はディレクトリ扱いで `docs.html` / `docs.pdf` を出力）
- [x] client mode の Mermaid を含む場合、全ページを展開して各図の描画完了を待ってから PDF 化する（pre-render 済み SVG はそのまま埋め込み）
- [x] `pdf.pageSize` / `pdf.margin` / `pdf.printBackground` を設定で制御できる（既定 A4・20/15/20/15mm・背景印刷 on）
- [x] PDF 出力時は画像を data URI として埋め込む（配布 PDF は外部の相対画像を参照できないため、`assets.embedImages: false` でも上書きして埋め込み、警告を出す。`onLargeImage: external` で外部化した大きい画像は PDF に含まれない）
- [x] アラート/admonition のアイコンをインライン SVG で埋め込む（CSS mask だと PDF でソフトマスク化され一部ビューアで塗り四角になるため）。print で `.admonition` / 図表 / コードブロック等の途中改ページを回避（`break-inside: avoid`）
- [x] PDF にしおり（アウトライン）を HTML サイドバーと同じ フォルダ→ページ 構造で付与（`pdf.bookmarks`、既定 true）。各ページ位置へ ASCII サロゲート宛先の内部リンクを注入して Chromium に `/Dests` を作らせ、`pdf-lib` で `/Outlines` を構築（Unicode page id でも堅牢。ビューアでしおりパネルを既定表示）
- [x] PDF の本文中のページ間リンクをクリック可能にする（SPA 用 hash route `#/route` は PDF に対応要素が無く飛べないため、`renderPdf` が各 article の `data-route` → 要素 id 対応で `#/route` を `#page-{id}` へ書き換え、Chromium が内部リンク＝GoTo 注釈を生成）。同一ページ内アンカー（脚注・見出し）はそのまま有効
- [x] Puppeteer 起動処理を `pipeline/browser.ts` に共通化し、Mermaid pre-render と PDF で共有（環境エラーは `BrowserSetupError` で fail fast）
- [x] `serve` はプレビュー用途のため、設定が pdf/both でも HTML を配信する（PDF を毎回生成しない。明示 `-o` は尊重）
- [x] バンドル版 CLI（単一 `.cjs` / 単一実行ファイル）では PDF 出力は利用不可（`puppeteer-core` を `external` 化。パッケージインストール版が必要）

### v0.6: 配布・CI 対応

- [x] 生成した HTML と PDF の文書末尾に、リンク付きの monodocs 名と CLI バージョンを既定で表示する（`html.branding: false` でフッターを非表示）
- [x] 公開方針、対応環境、npm package 境界、0.x のサポート方針を定義
- [x] コントリビューション・セキュリティ方針、bug・feature・pull request template を用意
- [x] Linux x64 / Windows x64 の Pull Request CI で format、build、typecheck、test、bundle、dependency audit、license notice を検証
- [x] Linux x64 / Windows x64 の CI で HTML、validate、PDF、Mermaid pre-render を smoke test
- [x] `workspace:*` 依存を含まない allowlist 方式の npm tarball staging を生成
- [x] staged `0.6.0-beta.1` tarball をローカルインストールし HTML、PDF、validate、Mermaid pre-render、serve を smoke test
- [x] Linux x64 / Windows x64 の CI で実際の npm tarball を install・smoke test
- [x] version/tag validation、release approval、OIDC、provenance を備えた GitHub Release 起点の npm publish workflow を準備
- [x] リポジトリの security・branch protection 設定を完了
- [x] npm Trusted Publishing、release approval、provenance、maintainer 2FA を設定
- [x] `next` tag で `0.6.0-beta.1`、続いて `0.6.0-beta.2`（Windows のブラウザ自動検出を追加）を npm へ公開（最初の公開版のため、stable リリースまでは `latest` も同じ版を指す）
- [x] 公開した beta を Linux x64 / Windows x64 で検証（install、HTML / PDF / both / Mermaid pre-render、`PUPPETEER_EXECUTABLE_PATH` なしのブラウザ自動検出、加えて serve / watch / uninstall / README の手動確認）
- [x] stable `0.6.0` を公開・検証
- [x] `validate`、HTML、PDF の GitHub Actions / GitLab CI ワークフローを公式サイトに掲載
      （専用の再利用可能な GitHub Action は公開しない。[roadmap.md](roadmap.md) を参照）

### v0.8: 高度な機能

- [x] 見出し単位のファイル間リンク（`file.md#見出し` / `xref:other.adoc#sec`）をリンク先ページの要素 ID へ解決する
- [x] 検索が複数キーワード（全角空白を含む空白区切り）を受け付け、すべての語を含むページだけを結果に残す
- [x] 検索結果をフィールド別の重み（タイトル > 見出し > 本文）で順位付けし、繰り返し出現と語順一致に上限付きで加点する（同点は文書順）
- [x] 見出しに一致した結果はページ先頭ではなくその見出しへリンクし、ページタイトルの下に見出しを表示する（`toc.maxLevel` より深い見出しは目次に出ないが検索できる）
- [x] タイトル・見出し・抜粋で一致語を強調し、抜粋は異なる語を最も多く含む本文の窓を表示する
- [x] 大文字小文字と全角英数字を畳んで照合する（`ＰＤＦ` と `pdf` が同じ結果になる）
- [x] `html.theme` にカスタムテーマのディレクトリを指定できる（設定ファイル基準で解決）。`template.html` / `style.css` / `app.js` は個別に省略でき、省いた分は既定テーマで補う。必須トークンが欠けたテンプレートはビルドを失敗させ、`watch` / `serve` はテーマディレクトリも監視し、設定でテーマを差し替えたら監視先も追従する
- [x] カスタムサイドバー（`sidebar.mode: custom`）でサイドバーの構造・順序・タイトルを指定でき、同じ並びが前後ナビ・PDF のページ順・初期表示ページにも反映される
- [x] カスタムサイドバーは存在しないパスをエラー、未掲載・`hidden`・重複を警告として報告する（`validate` で確認できる）
- [x] Node.js 無しで動くスタンドアロンバイナリを Linux x64 / Windows x64 向けに GitHub Release へ `.sha256` と、同梱依存・Node.js ランタイムのライセンスをまとめた `-NOTICES.txt` を添えて添付する（macOS 版は公開しない。[roadmap.md](roadmap.md) 8.5 を参照）
- [x] Pull Request CI が Linux x64 / Windows x64 でスタンドアロンバイナリをビルドし、PDF 出力が想定どおり失敗することも含めて smoke test する
- [x] Homebrew / Scoop / winget 対応を決定：行わない（npm とリリースバイナリで対象利用者をカバーできており、リリースごとのマニフェスト同期と審査プロセスに見合わないため。[roadmap.md](roadmap.md) 8.5）
- [x] 幅の広い内容が PDF から消えないようにする（コードブロックの折り返し、URL など分割できない文字列の折り返し、表をスクロール枠ではなく表として組み各ページで見出し行を繰り返す、図を紙幅に収める）
- [x] 狭い画面ではサイドバーを既定で閉じたドロワーにして本文から読み始められるようにし、横スクロールを解消する
- [x] 生成した PDF に文書タイトルと `monodocs v<version>`（Creator / Producer）を記録する
- [x] バイナリで PDF / pre-render が使えないときのメッセージが、Node.js を持たない利用者には実行できないパッケージマネージャのコマンドではなく、npm 版への切り替えを案内する
- [x] `next` tag で `0.8.0-beta.1` を npm へ公開する（0.7.0 は飛ばす。凍結中の VS Code 拡張マイルストーン用に番号を予約したままにするため）
- [x] 公開した beta の npm パッケージを `verify-published.yml` で Linux x64 / Windows x64 検証する（install、HTML、PDF、`PUPPETEER_EXECUTABLE_PATH` 無しのブラウザ自動検出、`--format both`、Mermaid pre-render）
- [x] Linux x64 のリリースバイナリを `.sha256` で照合し、Node.js の無いホストで実行する（validate、自己完結 HTML、カスタムサイドバー、style.css だけのカスタムテーマ、想定どおりの PDF 失敗）
- [x] Windows x64 のリリースバイナリと `serve` / `watch` を手動で確認する（`verify-published.yml` は長時間動作するコマンドを意図的に対象外にしている）。SmartScreen は出なかったが、ダウンロードに `curl.exe` を使ったため Mark of the Web が付いておらず、ドキュメントが留保している警告を試したことにはならない（ブラウザで Releases ページから取得した場合は依然として出得る）。このブラウザ経由の検証は意図的に行わない。バイナリは方針として署名していない（[roadmap.md](roadmap.md) 8.5）ため警告が出ること自体が想定内であり、サイトのドキュメントでも既に注意喚起している。留保は留保のまま残し、コード署名が可能になった時点で再検討する
- [x] stable `0.8.0` を公開・検証し、ドキュメントサイトの CI ガイドのピン留めを更新する（npm の `latest` は provenance 付きの `0.8.0` で、`verify-published.yml` により Linux x64 / Windows x64 で再検証済み。両プラットフォームのバイナリと `.sha256` / `-NOTICES.txt` を Release に添付し、公開された Linux バイナリが修正後のメッセージを出すことも確認した）

### v0.9: 検索の仕上げ

- [x] 検索がカタカナをひらがなへ畳む（U+30A1–U+30F6 ↔ U+3041–U+3096 の 1 対 1 対応で、濁点付きや `ヴ` / `ヵ` / `ヶ` も含む）ため、`インストール` と `いんすとーる` が互いに引ける
- [x] 長音記号 `ー`・ダッシュ類（U+2010–U+2015、U+2212）・全角ハイフンを `-` へ、波ダッシュ `〜` と全角チルダ `～` を `~` へ畳むため、これらの書き分けで結果が分かれない
- [x] 畳み込みは 1 文字 → 1 文字を保つため、ハイライトは元の表記のまま強調される（ひらがなで検索しても結果一覧では `インストール` が強調される）
- [x] 半角カタカナ・送り仮名の揺れ・英語のステミングを、理由とともに対象外として記録した（いずれもトークンの長さが変わり、その場で畳む方式をトークンと原文の位置対応表を持つ方式へ置き換える必要があるため。[roadmap.md](roadmap.md) 22.3 章）
- [x] 結果リストを `↓` / `↑` で辿り（端では反対側へ回り込む）、`Enter` で開ける。未選択のまま `Enter` を押したときは先頭の結果を開く。`Escape` はこれまでどおりクエリを消す
- [x] 選択中もフォーカスは検索欄に残るため、Tab で戻らずにそのまま絞り込みを続けられる。選択位置は ARIA の combobox / listbox の `aria-activedescendant` で伝え、フォーカスリングが入力欄側にあるぶん、選択行には専用の枠線を出す
- [x] マウスとキーボードの現在地が食い違わない（ポインタを合わせた行へ選択も移り、結果を開く経路は両者で同一）。role は `app.js` から付けるため、`template.html` を差し替えたカスタムテーマでも同じ操作ができる
- [x] IME の変換中はキーを IME に渡すため、上下キーでの候補移動と `Enter` での確定がそのまま働き、未確定のクエリで結果が開くことがない
- [x] option の ID は文書が既に持つ ID と突き合わせて決めるため、同じ文字列になる見出しがあっても結果の行がそれを覆い隠してアンカー遷移を壊すことがない
- [x] 結果を開くと、その語を開いた先のページの本文でも（結果一覧と同じ畳み込みで）強調する。検索を開いている間は強調し続けるため、前後ナビや本文中のリンクで移っても一致を見失わない。開く位置は変えない
- [x] クエリを打ち替えるか消せば強調は外れ、本文は同じ構造・同じノード数に戻る。外すのはスクリプトが付けた `<mark>` だけで、判定は class ではなく DOM プロパティで行うため、本文自身の `<mark>`（AsciiDoc の `#強調#`）も、たまたま同じ class を持つ本文も残る。Mermaid のソース・描画済みの図・コードブロックのツールバーには触れず、1 ページあたりの強調数と、その裏の一致収集の両方に上限を置く（[roadmap.md](roadmap.md) 22.5 章）
- [x] 既定出力は `./dist/docs.html`（`--format pdf` は `./dist/docs.pdf`、`--format both` は `-o` に渡したディレクトリの中へ `docs.html` / `docs.pdf`）。monodocs は渡されたページ群を何であれまとめ、それはマニュアルとは限らないため `manual.html` / `manual.pdf` から改名した。既定に依存していた利用者には破壊的変更であり、1.0 より前に行った
- [x] 公開サンプルで検索の成果を試せるようにする（`examples/` の検索ページに、サンプル自身へ入力できるクエリをまとめ、意図的に畳み込まない表記の違いも明示する）
- [x] `next` tag で `0.9.0-beta.1` を npm へ公開する
- [x] 公開した beta の npm パッケージを `verify-published.yml` により Linux x64 / Windows x64 で検証する（install、HTML、PDF、`PUPPETEER_EXECUTABLE_PATH` なしのブラウザ自動検出、`--format both`、Mermaid pre-render）。改名した既定出力が `docs.html` / `docs.pdf` になることを確認した
- [x] Linux x64 のリリースバイナリを `.sha256` で照合して実行する（`validate`、`-o` を省略したビルドが `dist/docs.html` を書くこと、出力に外部アセット参照が無いこと、PDF が想定どおり失敗して npm 版を案内すること）
- [x] Windows x64 のリリースバイナリと、`serve` / `watch` を手で検証する（`verify-published.yml` は長時間動作するコマンドとリリースバイナリを意図的に対象外にしている）。機械的に確認できる部分は [`scripts/verify-windows-binary.ps1`](../../scripts/verify-windows-binary.ps1) に自動化し、公開した資材に対して実機の Windows x64 で実行した（`.sha256` の照合、`validate`、`-o` を省略したビルドが `dist/docs.html` を書くこと、出力に外部アセット参照が無いこと、空白と日本語を含むパスからのビルド、PDF と Mermaid pre-render が npm 版への切り替えを案内して失敗すること、NOTICES、`serve` の SSE によるライブリロード通知・編集が配信ページに届くこと・停止時のポート解放、`watch` の初回ビルドと編集後の再ビルド。16 項目すべて PASS）。スクリプトでは決着しないブラウザでの表示と `serve --open` は手で確認した。v0.8 と同じく Mark of the Web は付いていない（スクリプトは `curl.exe` / `Invoke-WebRequest` で取得するため）ので、ドキュメントが留保している警告は依然として試していない。留保は留保のまま残し、コード署名が可能になった時点で再検討する
- [x] stable `0.9.0` を公開・検証し、公式サイトの CI ガイドの固定バージョンをそれに合わせる

### v0.10: 言語と 1.0 前の積み残し

マイルストーンの定義は [roadmap.md](roadmap.md)。以下はその追跡用。

**CLI・ランタイムのメッセージ**

- [x] `--help`（`configureHelp` / `addHelpText` 経由で届く Commander 生成の `Usage:` / `Options:` / `Commands:` 見出しを含む）と全てのエラー・警告が既定で英語になり、`--lang ja` または `MONODOCS_LANG=ja` で日本語になる。フラグが環境変数に優先し、対応していない値は黙ってフォールバックせず対応する値を挙げて拒否する。`LANG` / `LC_ALL` は意図的に見ない。ビルドログを出力したマシンに依存させないため（[roadmap.md](roadmap.md) 25.6）
- [x] カタログが monodocs 自身の出す全ての文字列を覆い、その外に新しい文字列を足すとテストが落ちる。包まれないまま利用者に届く依存パッケージ由来のメッセージ（Zod のパースエラー、Puppeteer のスタック）は対象外とし、monodocs が既に包んでいるものはその包み側を訳す。境界を文書に書く

**文書の言語と UI ラベル**（[roadmap.md](roadmap.md) 23.4）

- [x] トップレベルの `lang` キーが `<html lang>` と UI ラベルの両方を決め、既定は `en`。文書がある言語を宣言しながら別の言語を表示することが無くなる。これは [architecture.md](architecture.md) と [development.md](development.md) に記録されている「ラベルは英語に統一」の決定を覆すものであり、ロードマップと矛盾したまま残さず両方とも更新する。直書きされていた `<html lang="ja">` に依存していた利用者にはその属性が変わる破壊的変更であり、1.0 より前に行う
- [x] `lang` は構文的に妥当な BCP 47 タグを受理し、そうでない文字列は属性に書かず拒否する。照合は主要言語サブタグに対して大文字小文字を無視する（`en-GB` / `JA` → `en` / `ja`）。表を持たないタグ——照合すべきサブタグを持たない、タグ全体が私用の `x-…` や grandfathered tag を含む——は英語のラベルへフォールバックし、タグを名指ししてビルドごとに一度警告する
- [x] 表の解決と `html.labels` の適用は core が行い、結果を `{{siteDataJson}}` に公開する。`app.js` は自前の写しを持たずそれを消費するので、表と上書きがずれることがない
- [x] `en` / `ja` の表が、列挙されたキー集合を完全に覆う。どちらかに欠けたキーは黙ってフォールバックせずビルドを失敗させる。1.0 が凍結するのでキー集合は設定リファレンスに列挙する。未知の `html.labels` キーは無視されずに拒否される
- [x] ラベル値は行き先ごとにエスケープする。HTML のテキスト、`title` / `aria-label` などの属性値、`siteDataJson` の JSON はそれぞれ扱いが異なり、`<` や引用符を含む値が 3 つとも壊れずに届く
- [x] テーマへの保証を、ひとまとめにせず 4 段階として実装し文書化する。どのテーマも `{{siteDataJson}}` からデータとしてラベルを受け取る／既定の `app.js` は既定テンプレートの DOM hook に適用する／`app.js` を差し替えたテーマは自分で適用する／独自の `template.html` が自前で書いた静的な文字列はそのまま残る。`{{lang}}` は任意トークンなので、`<html lang>` を直書きしたテンプレートは書いたものが残る

**`monodocs init`**（[roadmap.md](roadmap.md) 25.1）

- [x] 編集無しでビルドできる `monodocs.config.yml` と `docs/index.md` を書き出し、どちらかが既にある場合はどちらも書かずに見つけたものを名指しする（最初の 1 つではなく、見つかったすべてを挙げる）。生成する設定は全キーのダンプではなくコメント付きの短い出発点とし、残りは設定リファレンスへのリンクで示す
- [x] 雛形はコメントだけでなく、書き出す `lang` の値までメッセージ言語に従う。最初のページはその言語で書かれた文章だからである。`--lang ja` なら `lang: "ja"` の下に日本語のページを書き出す。ここで既定の `en` を書けば、日本語の文書が英語を宣言した状態で世に出ることになり、それは [roadmap.md](roadmap.md) 23.4 が終わらせるために存在する食い違いそのものである

**フォント検査**（[roadmap.md](roadmap.md) 24.3.3）

- [x] 文書が必要とするフォントが無いマシンでのビルドが、危ういクラスタと、それを収録するフォントの例を組み込みの用字系→例フォント表から挙げて警告する（パッケージ名は挙げない。プラットフォームごとに異なるため）。そのマシンに無いものを必要としない文書では黙っている
- [x] 単位は、コードポイントでも用字系ごとの代表文字でもなく、書記素クラスタと、それが現れる要素の計算後フォントの組である。まずクラスタを測り、クラスタ自体が 1 つの notdef になっていないときにだけ構成コードポイントを測るので、1 つの豆腐になる場合も複数の豆腐へばらける場合も捕まる。構成コードポイントがすべて描けたうえでフォントが合成だけを行わない場合は、理由とともに対象外とした（[roadmap.md](roadmap.md) 24.3.3）。検査は `document.fonts.ready` の後に走る
- [x] 判定は `U+10FFFD` との比較で行い、当たったものをラスタライズで確認する。開発イメージでの実測で、描ける文字と描けない文字を分けられたのはこの 2 つだけだった。存在しない family 名との比較と CDP の `CSS.getPlatformFontsForNode` はいずれも実測して退けた。前者は何に対しても同じ幅を返し、後者は描けない文字に対しても `Liberation Sans:2` を報告するため
- [x] 検査は自身の基準を 2 つの対照——別の面の私用領域コードポイントと非文字——で検証し、どれかが食い違えば指摘を出さずに「この環境では実行できない」と報告する。意味を持たせているのは非文字のほうで、私用領域どうしの一致は「同じに描かれる」ことしか示さず、両方を 1 つのグリフに割り当てたフォントでも成立してしまい、そのとき検査は何も見えないまま文書を通してしまう（[roadmap.md](roadmap.md) 24.3.3）
- [x] 走査が上限（異なるクラスタ×フォントの組 50,000）に達した場合は「問題なし」を返さずそのことを述べる。打ち切られた検査は通過した検査とまったく同じに見えるため
- [x] `mermaid.mode: pre-render` は完成後の HTML ではなく自身の描画コンテキストで測る。埋め込まれた SVG を測り直してもそれを生んだフォント解決を再現できないため（[roadmap.md](roadmap.md) 21.2）。設定を `pdf.fontCheck` ではなくトップレベルの `fontCheck` に置く理由もそこにある
- [x] `fontCheck: warn | error | off` の既定は `warn`。ヒューリスティックの誤検出が既定でビルドを壊せないようにするため。`error` は非ゼロで終了し、それを選ぶ人は誤検出でも CI が止まることを受け入れる
- [x] 測るのは実際に描かれるものだけ。PDF は print エミュレート下で測り、`display: none` と `content-visibility: hidden` の部分木は辿らず、`visibility: hidden` の要素はその要素自身のテキストだけを飛ばす（`visibility` は継承し子孫が戻せるため部分木は辿る）ので、紙に載らないサイドバー・ページ内目次・検索結果から指摘が出ることはない。ルート要素は別途確認する（`TreeWalker` はルートにフィルタを掛けず、`display` は継承しないため）。既定のページ番号フッタはそれ自身の文脈で測り、置き換えたフラグメントは対象外にする（`pdf.margin` の検査と同じ線引き）

**PDF のページ番号**（[roadmap.md](roadmap.md) 24.5）

- [x] 生成した PDF が既定で中央にページ番号を持ち、その形式は翻訳を必要としない。ヘッダーとフッターは Chromium 自身の `pageNumber` / `totalPages` / `title` / `date` / `url` クラスを使う HTML 断片であり（`{{token}}` 構文は無い）、文書のスタイルを一切継承しないので自分でフォントを指定する
- [x] `pdf.header: false` と `pdf.footer: false` は、オプションの省略ではなく明示的に空の断片を渡す。`displayHeaderFooter` が on の状態で何も渡さないと Chromium は自前の日付とタイトルのヘッダーへフォールバックするため。差し替えた断片は上下どちらでも Chromium のクラスで描かれる
- [x] 既定のフッターに足りないマージンは警告する。閾値は選んだ数値ではなくその断片を描いた高さから取る。実測では、Chromium の組み込みテンプレートは 10 mm と 5 mm の間で描かれなくなるが、渡した断片（monodocs が使うのはこちら）は 0 mm でも描かれる。したがって失敗の形は、消えるフッターではなく紙端に貼り付いたフッターである。差し替えた断片は検査対象外であることを明記する。任意の HTML と CSS をマージン値だけからは判定できないため

**公開版が初めて外部で使われて分かったこと**

- [x] 未知のキーは、トップレベルを含めどの深さにあってもビルドを止め、エラーはキーとそれを含むオブジェクトを名指しする（`pdf: Unrecognized key: "footr"`）。検証ライブラリの issue 配列を JSON のまま出したりはしない。v0.10 までは `sidebar` / `pdf` / `html.labels` だけが strict で、綴りの誤りが捕まるかどうかは深さで決まっていた。悪いのは受理されて無視される側である（ファイルは正しく見え、出力を読むまで分からない）（[roadmap.md](roadmap.md) 12.2）
- [x] `sources.exclude` は既定の除外リストを置き換えず追加し、`sources.excludeDefaults: false` は本当に `_` 始まりのファイルまで束ねたいツリーのためにその既定リストを外す。キーは `sidebar.exclude` から移した。一致したファイルはそもそもページにならないのだから、これはサイドバーの設定ではなかった。旧キーも同じ規則（追加）で引き続きビルドでき、移動先を警告で伝える（[roadmap.md](roadmap.md) 12.3）
- [x] 単一ファイルを入力として受け取る（`monodocs build ./docs/plan.md`）。1 ページの文書として読み、リンク・画像・`monodocs.config.yml` の基準はそれを含むディレクトリになる。コマンドラインで名指ししたファイルに除外パターンは適用しない。どのレンダラも扱えない拡張子は、`readdir` まで届いて Node の `ENOTDIR` を素通しするのではなく、扱える拡張子を挙げて拒否する（[roadmap.md](roadmap.md) 25.2）
- [x] 印刷時の表は `table-layout: auto` にし、各列が紙幅の等分ではなく中身なりの幅を取るようにした。セルの `overflow-wrap: anywhere` が表を紙幅に収め続けるので、印刷ブロックが防ごうとしている切り捨ては起きない（[roadmap.md](roadmap.md) 24.3.1）

**版面の密度**（[roadmap.md](roadmap.md) 24.6）

- [x] `pdf.density` がプリセット名（`relaxed` / `normal` / `compact` / `tight`）かオブジェクトを取り、枚数を決める 4 つの値（基準文字サイズ・行送り・見出し上の空き・表のセル余白）を動かす。`examples/ja` のドキュメント一式で、4 つはそれぞれ 56 枚・49 枚・44 枚・40 枚になる。それまで唯一の手段だった `pdf.margin` は、A4 の事業書類を実用範囲の全域で 9 枚のままに置いていた
- [x] オブジェクト形式は `base`（既定 `normal`）が指すプリセットを土台にし、名指しした値だけを差し替える。1 つ変えるために残りを書き写す必要が無く、プリセットを後で調整しても取り残されない。`lang` が選んだ表に `html.labels` が重なるのと同じ解決順である
- [x] 既定は画面向けではなく紙向けに組む。`relaxed` と既定はどちらも本文 16px で、両者の 56 枚と 49 枚の差は行送り・見出し上の空き・セル余白だけから出ている。最初の版の `compact` が文字を 13.5px に落として買っていたのと同じ枚数である。文字の大きさが動くのは既定より下だけで、段の幅は `pdf.margin` が残した幅なので、文字を小さくすることは行を長くすることでもあるからである（A4 の既定余白で 16px なら 1 行およそ 42 字、12px では 56 字）
- [x] `relaxed` は画面の設定に名前を付けたものであり、それが既定を動かせるようにした。以前は 2 つが同じ 1 行で、どちらか一方だけを変えられなかった。書き出されるのは画面（既定のプリセットではなく別に置いた定数）と異なる値だけなので、`relaxed` は規則を 1 つも出力せず、既定も文字サイズを出力しない。ブラウザから HTML を印刷する読者の基準文字サイズはそのまま残る
- [x] 公式サイトは 4 つを説明せずに見せる。言語ごとの短い原稿を `site/samples/density/` に置き、密度以外を変えずに 4 回組んで PDF として公開し、その 1 ページ目自身を隣のサムネイルにする
- [x] Puppeteer の `page.pdf({ scale })` ではなくプリセットにした。scale は組み上がったページを小さく写し取るだけで、行分割も列幅も元の大きさで決まったままだが、密度は読まれる大きさそのもので組む。表の多い書類ではそこが効く
- [x] 値は「数値と単位」であることを検証する（`calc(...)` や `;` を含む値は拒否）。設定の境界と、それ自体が公開の入口である `renderSingleHtml` の両方で行う。measure も任意 CSS の口も持たない。段の幅は `pdf.margin` のものであり、閉じたキー集合こそ 1.0 で凍結できるものだから

**決定とドキュメント**

- [x] Docker を提供しない配布形態として、Homebrew / Scoop / winget を決着させたのと同じリリースごとの保守コストの論法とともに記録する（[roadmap.md](roadmap.md) 8.3）。`Dockerfile.dev` は影響を受けない
- [x] ドキュメントサイト（コマンド・設定・CI ガイド）とその日本語ミラーを更新する。上記の項目はどれもサイトが記述している内容を変えるため
- [x] `verify-published.yml` が、PDF が生成されたことだけでなく、新しい表面を実行して確かめる。メッセージの言語（既定は英語、フラグと `MONODOCS_LANG` で日本語、フラグが環境変数に優先、未対応の値は対応する値を挙げて拒否）、`init`（雛形が編集なしでビルドできること、2 回目は書かずに見つけたものを名指しすること、`--lang ja` が `lang: "ja"` を書くこと）、ページ番号が実際に紙に描かれていること（[`scripts/assert-pdf-page-numbers.mjs`](../../scripts/assert-pdf-page-numbers.mjs) が各フォントの `ToUnicode` から数字を読み戻す。既定フッタでは在ること、`pdf.footer: false` では無いことの両方）、そしてどのフォントも収録しない文字をフォント検査が報告すること。0.10 を必要とする手順はインストールされたバージョンで切り替えるので、0.9 の検証も従来どおり行える

**リリース**

- [x] `next` tag で `0.10.0-beta.1` を npm へ公開し、`verify-published.yml` により Linux x64 / Windows x64 で検証する
- [x] リリースバイナリを両プラットフォームの `verify-release-binaries.yml` で検証し、加えて Node.js の無い Linux x64 ホストで [`scripts/verify-linux-binary.sh`](../../scripts/verify-linux-binary.sh) を実行する。バイナリ配布が主張しているのはまさにその環境であり、このリポジトリのどの CI ジョブも用意できないものである（[maintenance.md](maintenance.md)）。16 項目すべてが PASS: `.sha256` による資産の検証、CLI の表面、`validate`、`-o` を省いたビルドが `dist/docs.html` を書くこと、外部参照を持たない HTML、空白を含むパスからのビルド、PDF と Mermaid の pre-render が npm 版への切り替えを案内して失敗すること、NOTICES、そして長時間動作する `serve` / `watch`（SSE によるライブリロードの配信と、サブディレクトリの編集からの再ビルドを含む）
- [ ] Windows x64 のリリースバイナリを、Node.js の無いホストで [`scripts/verify-windows-binary.ps1`](../../scripts/verify-windows-binary.ps1) により手動で検証する。あわせて両スクリプトが人に委ねている確認を終える: 生成された HTML のブラウザ確認（サイドバー・検索・ダークモード・狭い幅のドロワー）、`serve --open`、Windows の Mark of the Web と SmartScreen
- [x] stable `0.10.0` を公開・検証し、公式サイトの CI ガイドの固定バージョンをそれに合わせる。`v0.10.0` タグから CI で公開して `latest` dist-tag が指し、`verify-published.yml` と `verify-release-binaries.yml` により Linux x64 / Windows x64 で検証済み。サイトの CI ガイドは英日とも `monodocs@0.10.0` を固定する

### v0.11: 改ページと 1.0 の契約

このマイルストーンは [roadmap.md](roadmap.md) が定義し、以下はその追跡である。

**マーカー**（[roadmap.md](roadmap.md) 24.7）

- [x] AsciiDoc の `<<<` が新しい紙を始める。Asciidoctor はすでに `<div class="page-break"></div>` として出力しており、単一 HTML にも届いている。足りないのはそのクラスに一致する規則だけである
- [x] Markdown の `<div class="page-break"></div>` も同じように働く。`<div style="page-break-after: always"></div>` も同じマーカーとして受け、class 形へ正規化する。この綴りは Typora・各種 Markdown→PDF 変換器・MkDocs の PDF プラグイン・ブラウザの印刷がすでに理解するものであり、クラス名も monodocs が決めたものではなく Asciidoctor のものなので、規則 1 本で両形式に効く
- [x] Markdown が raw HTML を得るわけではない。`remark-rehype` の前に mdast の `html` ノードを 2 つの綴り（引用符と ASCII 空白の揺れは設定リファレンスに列挙する。1.0 が凍結するため）と突き合わせ、出力へ届く要素は monodocs が組み立てる（`div` ひとつ、クラスひとつ、子は無し）。入力を出力し直さないので、属性やスクリプトが便乗して入ることはない
- [x] `<DIV>`、`class="page-break foo"`、2 つ目の属性、`<div class="page-break"/>`、タグの間の空白、それ以上を含む `style`、そして引用・リスト項目・表のセル・見出しの中のマーカーは、修復せずに拒否し、他の raw HTML と同じく破棄したままにする。`<script>` が引き続き破棄されることをテストで固定する
- [x] `break-before` ではなく `break-after: page` を使う。実測による。マーカーは空のボックスなので、その手前で改ページするとボックス自身が新しい紙へ移り、1 ページ目の末尾にマーカーがある 2 ページの文書は `break-before` で 3 枚、`break-after` で 2 枚になる。それ以外の場合はどちらでも同じ枚数で、後ろに何も無いマーカーはどちらでも空白の紙を 1 枚残す——それがこのマーカーの求めているものである（[roadmap.md](roadmap.md) 24.7）

**`pdf.pageBreakLevel`**（[roadmap.md](roadmap.md) 24.7）

- [x] `false`（既定）または 2〜6 を取る。数値は新しい紙を始める最も深い見出しレベルで、`2` は h2 だけ、`6` は h2 から h6 まで。h1 が題するファイルはすでに改ページ済みなので h1 は含まない。`"off"` ではなく `false` にするのは、機能を無効化する値として `pdf.header` / `pdf.footer` が既に `false` を使っているからである（`fontCheck: warn | error | off` は動作モードの列挙であり、これはそれではない）
- [x] その見出しより前に描画されるものが何も無いか、あるのがページの h1 だけであるときだけ除外する。「そのページで最初の見出し」は誤った規則である。タイトル・導入文・最初のセクションと続くページでは、そのセクションの前で改ページしなければならない。導入文はタイトルの紙に載るものだからである
- [x] `break-inside: avoid` の付いたブロック——表・図・コードブロック・admonition・引用（[roadmap.md](roadmap.md) 24.3.1）——の中の見出しは対象にしない。「まとめて置け」と「その中で必ず割れ」を Chromium に同時に求めないためである
- [x] 改ページする見出しは post-process で `data-monodocs-pdf-break-before` を付けて示し、規則はその属性 1 つに一致させる。CSS だけのセレクタでは Markdown の平坦な本文と Asciidoctor の `.sect1`〜`.sect5` の入れ子を両方列挙することになり、それでも h1 の無いページや最初の見出しが h3 のページを読み違える。属性に名前空間を付けるのは、カスタムテーマも AsciiDoc の passthrough も見出しに属性を付けられるからである

**規則の置き場所**

- [x] マーカーの規則は core が印刷用スタイルシートに、密度の規則と並べて書き出し、`#content` と `.page` の両方を名指す。`style.css` の差し替えで構文機能が消えないようにするためである（[roadmap.md](roadmap.md) 24.6）
- [x] 見出しの規則も同じ形で書き出す
- [x] 既定の `false` では見出しの規則を 1 つも出力せず、どちらの規則も画面用スタイルシートへは漏れない

**推測せず実測するもの**

- [x] マーカーの直後に改ページ対象の見出しが来ても、その間に空白の紙は生じない。実測: Chromium は隣接する 2 つの強制改ページを畳まない（マーカーを 2 つ続けると間に紙が 1 枚できる）。したがって post-process は、直前の描画内容がマーカーである見出しには印を付けない
- [x] 紙の先頭に来た見出しの上の空きを `pdf.density` と突き合わせて実測した。Chromium は強制改ページを越えて余白を残し、同じ文書で `relaxed` は `normal` より見出しが 15.8pt 下がる。したがって規則で `margin-top: 0` にする（密度の規則が書くのと同じプロパティ）。紙に届く値は推測で決めないという [roadmap.md](roadmap.md) 24.6 の基準である

**計測中に見つかったもの**（[roadmap.md](roadmap.md) 24.3.4）

- [x] 1 枚に収まる文書が 1 枚で出る。以前は 2 枚になり、2 枚目はページ番号だけの空白だった。画面を埋めるための `html, body { height: 100% }` と `#app { min-height: 100vh }` が、`pdf.bookmarks` の差し込む宛先アンカーと紙の上で出会うためである。実測では、印刷時にどちらか一方を解除しても 2 枚のままで、両方を解除して初めて 1 枚になる。49 枚の文書は枚数が変わらず、これが「空白の紙が減った」のであって「内容が消えた」のではないことを示す

**テストとドキュメント**

- [x] PDF の検証は、生成した PDF から読み取った枚数で行う（密度のテストが既に採っている形）。`h1 → h2 → 本文 → h2` を `pageBreakLevel: 2` で組むとちょうど 2 枚になり、1 枚なら機能が死んでいること、3 枚なら先頭見出しの規則が誤っていることが同時に分かる。同じ文書を既定で組むと 1 枚になる。両形式について確認する
- [x] [syntax.md](syntax.md) の「Markdown の raw HTML は例外なく破棄する」という記述を改め、改ページの 2 綴りだけを制御構文として認識し正規化すること、入力そのものは出力へ届かないことを書く。[architecture.md](architecture.md) にも同じ境界を記録する
- [x] 公式サイトの設定リファレンスが、マーカーとキーを日本語ミラーとともに記載し、[testing.md](testing.md) が新しいテストを載せる。サイトに記法のページは無く、その仕様はリポジトリの [syntax.md](syntax.md) が持つ（上で更新済み）

**仕様がコードの言うことを言う**（[roadmap.md](roadmap.md) 12.1）

- [x] [roadmap.md](roadmap.md) 12.1 の YAML を取り出して `loadConfig` に通すテストがあり、存在しないツールを説明した例はそこで落ちる。実際にずれていた——`sources.markdown.enabled` / `gfm` / `frontmatter`、`sources.asciidoc.enabled` / `safeMode` / `attributes`、`sidebar.collapsible`、`html.selfContained` / `routeMode` / `darkMode`、`pdf.enabled`、`search.enabled` の 12 個はスキーマに無く、[roadmap.md](roadmap.md) 12.2 が全オブジェクトを strict にした以上、このプロジェクト自身の例を写すと `Unrecognized key` になる
- [x] そもそも設定できなかった 2 つの挙動が、キーのあった場所でそう述べる。GFM と frontmatter は常時有効、Asciidoctor の safe mode と base ディレクトリは固定である
- [x] [architecture.md](architecture.md) が、別ファイルのアンカーについてコードが持つ挙動——対象ページの接頭辞付き要素 ID へ解決し、存在しなければ警告してページ先頭へ落とす——を述べる。以前の「アンカーを除去して警告する」ではない。[syntax.md](syntax.md) は既にそう書いており、両者が一致する
- [x] v0.11 のチェックが全部埋まったあとも planned と言い続けている、この表を直す

**1.0 が凍結するもの**（[roadmap.md](roadmap.md) 12.4）

- [x] 約束を書き下す。1.x のリリースは、1.0 が受理した設定キー・コマンド・オプション・記法を削除も改名も再定義もしない。既定値の変更はメジャーのみ。新しい任意キー・コマンド・オプション・既存の文書には現れ得ない記法の追加はマイナーで許される
- [x] 約束しないことも書き下す。翻訳され書き直される警告の文言は凍結しない。バージョン間のバイト同一も約束しない——約束するのは、同じ入力・同じ設定・同じバージョンなら同じバイト列になることだけである
- [x] 機械可読な形式は自身のスキーマバージョンを持ち、利用側が固定するのはそれである
- [x] 非推奨化は `sidebar.exclude` が既に従っている形を取る。古い綴りは動き続け、警告し、置き換え先を名指し、削除は早くても次のメジャーである

**診断**（[roadmap.md](roadmap.md) 27.3）

- [x] すべてのエラーと警告が安定した `code` を持ち、パイプラインが知っている場合は `path` と位置を持つ。`formatSourceRef` は既にファイルと位置を散文に組み立てており、位置は存在していて出口で潰されている
- [x] コード無しで診断を足したらテストが落ちる
- [x] メッセージカタログとコード集合は別物のままにする。メッセージキーは文言を選び、コードは所見を識別する。2 つのメッセージが 1 つのコードを共有してよく、コードを持たないメッセージがあってよい

**`validate`**（[roadmap.md](roadmap.md) 25.5）

- [x] `monodocs validate --format json` が、スキーマバージョンと診断の配列を持つオブジェクトを標準出力にそれだけ出す。人間向けの出力は、警告だけだった実行に付くサマリ 1 行を除いて変わらない
- [x] エラーはコマンドを失敗させ、警告はさせない。`--strict` を付けると警告でも失敗する。終了コードは報告が公開する severity に従うので、マイナーリリースで足した検査がそれ自体で緑のジョブを赤にすることはない（[roadmap.md](roadmap.md) 25.5）。既定の変更はメジャーでしか行わないため、1.0 より前に反転させた
- [x] 見出しレベルの飛び（`h2` の次が `h4`）を報告する
- [x] `alt` 属性の無い画像を報告し、明示的な空の `alt=""` は報告しない。後半をテストが主張する。それが装飾画像を示す書き方だからである
- [x] 既にビルド時に警告している、解決できない別ファイルのアンカーが、コード付きの診断として現れる
- [x] 外部リンクは検査せず、孤立ページも報告しない。それぞれ理由を記録する（[roadmap.md](roadmap.md) 25.5）

**文書のメタデータ**（[roadmap.md](roadmap.md) 13.5）

- [x] `document.version` / `date` / `authors` が、既に書いている `setTitle` の隣で PDF の Author / Subject / Keywords へ、そして HTML・PDF 双方の branding フッタへ届く
- [x] ビルドは自前の日付を埋め込まない。同じ入力を 2 回ビルドすると HTML は同一のバイト列になり、それをテストが主張する。PDF はその外である（実測）。Chromium が自分の作成日時と更新日時を書き、monodocs は日付を足しもせず、それを削りもしない（[roadmap.md](roadmap.md) 12.4）
- [x] `title` は `document` へ移さずトップレベルに残る

**ドキュメント**

- [x] 公式サイトの設定リファレンスと日本語ミラーが `document` と JSON 出力を載せ、[testing.md](testing.md) が新しいテストを列挙する

**リリース**

- [x] `next` tag で `0.11.0-beta.1` を npm へ公開し、`verify-published.yml` により Linux x64 / Windows x64 で検証する。0.11 を必要とする手順はインストールされたバージョンで切り替え、0.10 の検証も従来どおり行えるようにする。`v0.11.0-beta.1` タグから CI で provenance 付きで公開し、実行ログの `SUPPORTS_V011: true` が示すとおり、診断 JSON・終了コード・`document`・HTML のバイト再現性を、レジストリからインストールしたパッケージに対して両プラットフォームで確認した
- [x] リリースバイナリを両プラットフォームの `verify-release-binaries.yml` で検証した。各 16 項目が PASS し、`.sha256` による資産の検証と、長時間動作する `serve` / `watch` を含む
- [x] Node.js の無い実機で両方のスクリプトを実行した。バイナリ配布が主張しているのはまさにその環境であり、このリポジトリのどの CI ジョブも用意できないものである（[maintenance.md](maintenance.md)）。公開済みの `v0.11.0-beta.1` の資産に対して [`scripts/verify-linux-binary.sh`](../../scripts/verify-linux-binary.sh) と [`scripts/verify-windows-binary.ps1`](../../scripts/verify-windows-binary.ps1) がそれぞれ 16 項目すべて PASS。Windows では空白と日本語を含むパスからのビルドも含む
- [x] 生成 HTML のブラウザ確認を、目視ではなく操作して行った。Linux のリリースバイナリが出力した成果物を Chromium で開き、12 項目を確認した——サイドバーの描画と遷移、前後ナビ、検索が結果を返し開いたページで本文をハイライトすること、`Escape` で検索が消えてツリーが戻ること、ダークモード、375px でドロワーがトグルから開きリンク追従で閉じること。その成果物のフッタは `monodocs v0.11.0-beta.1` であり、ローカルビルドではなく検証対象のリリースそのものである
- [ ] 人にしか答えられない部分（Windows）: 生成 HTML が Edge でどう見えるか（とりわけ日本語）、`serve --open` が既定のブラウザを起動すること、スクリプト経由ではなくブラウザで取得した資産に対する Mark of the Web と SmartScreen。バイナリは方針として未署名なので（[roadmap.md](roadmap.md) 8.5）警告が出るのが想定どおりである。v0.8 と v0.10 も同じ留保を残している
- [x] stable `0.11.0` を公開・検証し、公式サイトの CI ガイドの固定バージョンを英日とも `0.11.0` に合わせた。`v0.11.0` タグから CI で provenance 付きで公開し、`latest` dist-tag が指す。`verify-published.yml` と `verify-release-binaries.yml` により Linux x64 / Windows x64 で検証済みで、CI ガイドは `monodocs@0.11.0` を固定する

### v0.12: 入力と route

[roadmap.md](roadmap.md) がこのマイルストーンを定義し、以下がそれを追跡する。

**入力のルート**（[roadmap.md](roadmap.md) 12.5）

- [x] `root: .` と `sources.include: ["README.md", "docs/**"]` が、リポジトリが実際に取っている形のまま 1 つの文書を組み、画像・リンク・`monodocs.config.yml` を `root` から解決する。route は `root` からの相対パスで作るので、そうした文書では `docs/index.md` は `/` ではなく `/docs` になる
- [x] `sources.exclude` は最後に差し引く。下書きを除くパターンが、それを含む include に打ち消されない。組み込みの除外リストも引き続き効く
- [x] どちらのキーも無い設定は今日とまったく同じに振る舞い、この変更の前に存在していた 531 件のテストが 1 つも変えずに通る。`rootDir` は入力ディレクトリへ、単一ファイル入力ならそれを含むディレクトリへ解決される
- [x] `input` は改名も非推奨化もしない。両方書けるのは同じディレクトリを指すときだけで、これは「`root` の外ならエラー」より厳しい。`root` の内側を指す `input` は、include を長く書き下したものか、姿を変えた 2 つ目のルートのどちらかでしかないからである（[roadmap.md](roadmap.md) 12.5）。規則はコマンドラインにも及ぶので、`root: "."` に対する `monodocs build ./docs` はどちらかを選ばずに止まる
- [x] どの include パターンも届かないディレクトリは走査しない。`root: "."` のリポジトリで、`node_modules` に何も無いと判断するためにその中まで降りることはない。読めないディレクトリを置き、走査すれば失敗することで主張している
- [x] CLI には可変長の入力リストを足さない。コマンドラインに 2 つのパスを並べれば、設定ファイルの場所・route の基準・画像を読んでよいディレクトリに答えなければならない（[roadmap.md](roadmap.md) 25.2）

**route の別名**（[roadmap.md](roadmap.md) 15.5）

- [x] frontmatter の `aliases:` と AsciiDoc の `:sd-aliases:` により、古い hash route がページを描画し、hash が現在の route に置き換わる。アドレスバーには次回も生きているリンクが残る。置換は `replaceState` で行うので、死んだ別名が戻るボタンの停留所にならない
- [x] アンカーは置換をまたいで残る。アンカーはパスではなく見出しに属するからである。ルーターは別名に限らずすべての route で hash を route とアンカーに分けるようになったので、`#/route#heading` は先頭ページへ落ちるのではなく見出しに着く
- [x] 2 つのページが 1 つの別名を主張したらエラー。実在の route と衝突したら警告して実在の route が勝つ。判定の前に別名は正規化される——先頭のスラッシュ、拡張子の除去、`index` はディレクトリ。隠蔽の判定が先なので、実在の route でもある別名を 2 ページが主張した場合は警告 2 件でエラーにはならない。どちらも落ちたあとには曖昧なものが残らないからである
- [x] 別名はサイドバーにも検索索引にも前後ナビゲーションにも届かない。`hidden` なページも別名を保つ。誰かが既に持っているリンクはナビゲーションではないからである
- [x] クライアントは、どのページにも当たらなかった hash のときだけ対応表を引く。したがって対応表を手で書き換えた文書でも別名がページを隠すことはなく、引くときは継承されたオブジェクトのプロパティを別名と誤認しない
- [x] リポジトリの履歴から別名を生成しない。文書のリンク表が、どのクローンでビルドしたかに依存しないためである

**AsciiDoc の属性と読み込みの境界**（[roadmap.md](roadmap.md) 17.5）

- [x] `sources.asciidoc.attributes` が `sectnums` のような体裁の属性と書き手独自の属性を、ロックではなく**既定値**として設定する。したがって自分で指定した文書が勝つ——Asciidoctor の API の挙動とは逆であり、設定ファイルが意味すべきことである。すべての値には Asciidoctor 自身の soft set の印である末尾の `@` が付く（#110 で実測）
- [x] `allow-uri-read` / `docinfo` / `backend` / `data-uri` / `imagesdir` / `source-highlighter` / `sd-*` は属性名と理由を告げて拒否する。`safe` と `base_dir` はそもそも受理しない。設定ファイルから広げられるサンドボックスは名ばかりだからである。あわせて `docdir` / `docfile` / `docname` / `docfilesuffix` / `outdir` / `showtitle` も受理しない。パスの解決先を決めるか、monodocs がページタイトルと要素 ID を組み立てる元だからである。unset は提供せず、末尾が `@` の値も拒否する
- [x] 実体パスが入力ルートの外へ解決される `include::` と画像を、解決先のパスを示して拒否する。Asciidoctor の safe mode がシンボリックリンクを解決しないため、テストは実際のシンボリックリンクを使う——この検査の前は、リンクされたファイルもリンクされたディレクトリも外部の内容を出力へ持ち込めた。include の検査は include processor の `handles` の中で行う。Asciidoctor 自身の処理が読もうとしているすべての include について展開済みの target とともに呼ばれ、`normalizeSystemPath` で解決するので、safe mode が jail の外のパスを復旧することを推測せずに追随する。属性参照から組み立てた target も覆え、安全なものは `lines` / `tag` / `tags` を保ったまま Asciidoctor へ見送る。見えないのは、他の include processor がこの境界を追い越す場合と、別の場所を読む場合であり、自身の CLI ではどちらも起きない（[roadmap.md](roadmap.md) 17.5）
- [x] [architecture.md](architecture.md) が、safe mode がすることとこの検査がすることを書き分ける。safe mode が外部アクセスを防ぐとは主張しない
- [x] Markdown には変数展開を足さない。理由は [roadmap.md](roadmap.md) 17.5 に記録する——エスケープ、未定義の名前、コードブロック、再帰の決定を背負うテンプレート言語だからである

### v0.13: 単一ファイルの予算

[roadmap.md](roadmap.md) がこのマイルストーンを定義し、以下がそれを追跡する。

**出力を測る**（[roadmap.md](roadmap.md) 20.5）

- [ ] ビルドが出力サイズと内訳——埋め込み画像、inline の Mermaid ランタイム、`siteDataJson`、その他——を出す。内訳の合計がファイルと一致し、それをテストが主張する
- [ ] Shiki の行は無い。出力にランタイムを残さない——ハイライトはビルド時に行われる——からである
- [ ] 最大の埋め込み画像がサイズとともに名指しされる。内訳は行動されるためにある
- [ ] どちらの数字も、ファイルが完成したあとにディスクへ書いたバイト数を測ったものであり、ビルド中の積算見積りではない

**予算**（[roadmap.md](roadmap.md) 20.5）

- [ ] `assets.budget: 10MB` が超過時に警告し、`assets.onBudget: error` がビルドを失敗させる。既定が `warn` なのは、キーを足しただけで既に超えているビルドが落ちてはならないからである
- [ ] 未設定なら何も変わらず、既存のビルドが警告し始めない
- [ ] 画像を再エンコードしないという決定を、理由——CJS バンドルと SEA バイナリが載せられないネイティブ依存、HTML だけのビルドが獲得してはならない Chromium 依存、失う再現性、そして品質・色空間・EXIF の向き・アニメーション・SVG がそれぞれ必要とする規則——とともに記録する。画像が本当に大きすぎる文書への答えは `onLargeImage: external` のままである

**透かし**（[roadmap.md](roadmap.md) 24.10）

- [ ] `pdf.watermark: "DRAFT"` が、PDF とブラウザ印刷の全ページで本文の背後に斜めの 1 行を印字し、画面には何も出さない
- [ ] 文字列は挿入ではなくエスケープする。マークアップを含む値はその文字列として現れる
- [ ] 規則は core が印刷用スタイルシートへ出し、`style.css` を差し替えたテーマでビルドしても残る。テーマが、文書の要求した「社外秘」を消せてはならない
- [ ] 画像もページごとの制御もフォント・角度・不透明度のキーも無い。閉じたキー集合について [roadmap.md](roadmap.md) 24.6 が述べた理由による

**段落内の改行**（[roadmap.md](roadmap.md) 12.6）

- [ ] `sources.lineBreak` が `space`（既定）/ `break` / `join` を取り、`sources.markdown` ではなく `sources` の直下に置かれる。`join` は構文ではなく文字についての規則で両形式に効くため、Markdown にしか届かないキーは混在文書の半分だけを別の読み方にしてしまう
- [ ] 既定の `space` が直前のリリースと同じバイトを出し、既存の fixture をそのままビルドするテストがそれを示す。既定を `lang` から導かない。日本語だと宣言した文書は、Markdown の意味が変わる文書ではない
- [ ] `break` が両形式で段落内の改行を `<br>` にする。AsciiDoc では `hardbreaks-option` を `@` サフィックスで soft set するので、`:hardbreaks-option!:` と書いた文書はそれでも勝つ。[roadmap.md](roadmap.md) 17.5 が要求する仕組みであり、このキーがその最初の利用者になる
- [ ] `join` が、East Asian Width が F / W / H でどちらもハングルでない文字に挟まれた改行だけを取り除き、それ以外はそのままにし、改行が書き手の引いた行である `pre` と `code` には触れない。範囲は Unicode のデータファイルから生成し、バージョンを記録し、テーブルがそれと一致し続けることをテストが主張する
- [ ] `join` が適用する規則を、あるがままに記録する。CSS Text Level 3 §4.1.3 も Level 4 も、空白にするか削除するかを UA 定義のままにしており、F / W / H の規則が規範だったのは 2013 年の Working Draft である。そしてエンジンの実装は割れている——`segment-break-transformation-rules` の 49 件のうち 9 件が Chrome 152 と Safari 26.6 で失敗し、Firefox 154 では 1 件も失敗しない。開発イメージでの実測では、一文一行で書かれた日本語の段落は文と文のあいだに 3.58px の空白を抱えており、`examples/ja` が現に影響を受けている
- [ ] どちらの値も、ページのテキストを収集する前に renderer の内側で適用する。`postprocessPages` は `page.text` を作り直さないためである。3 つの値のいずれでも `page.text` と HTML が一致し、検索結果がページに無いテキストを指すことがない
- [ ] 検索を値ごとに確かめる。`break` は text ノードを分割するので、結果リストは分割をまたいで一致する一方、本文ハイライト（[roadmap.md](roadmap.md) 22.5）はそこを marking できない。`join` はページのテキストを収集する前に改行を取り除くので、現在 `hast-util-to-text` がその改行を畳んで作っている空白を、インデックスが持たなくなる
- [x] [syntax.md](syntax.md) が「改行」と並べるだけでなく規則を述べる。段落の中の改行は両形式とも行を繋ぐこと、明示的な改行は Markdown では行末スペース 2 つとバックスラッシュ、AsciiDoc では ` +` / `[%hardbreaks]` / `:hardbreaks-option:` であること、Markdown で行末空白を削るエディタでも残るのはバックスラッシュのほうであること。どの書き方も仕様からではなくパイプラインを通して実測した。形式横断の項には、東アジアの文字に挟まれた空白を Firefox は消し Chromium と WebKit は残すので PDF には出ることを記録した
- [ ] サイトの設定リファレンスとその日本語ミラーがキーを載せる

### v0.14: 紙の版面を仕上げる

[roadmap.md](roadmap.md) がこのマイルストーンを定義し、以下がそれを追跡する。

**見出し番号**（[roadmap.md](roadmap.md) 19.1）

- [ ] `numbering.sections: 3` が文書全体を通して見出しに番号を振る。どちらかのレンダラーでファイルごとにではなく、共有の `Page` モデルの上で決める——AsciiDoc の `:sectnums:` はファイルごとに振り直し、Markdown には何も無い
- [ ] 番号はサイドバー順に従い、ディレクトリが 1 階層を提供し、`h1` は見出しの番号ではなくページ自身の番号を持つ
- [ ] route・page ID・見出し ID は変わらず、それをテストが主張する。並べ替えで変わるアドレスは、これまでにコピーされたすべてのリンクを壊す
- [ ] 番号は見出しの中の要素であり、サイドバーとページ内目次に現れ、検索で語に勝たない
- [ ] 番号付けが有効なとき、文書内の `:sectnums:` は設定キーを名指して拒否される

**表紙**（[roadmap.md](roadmap.md) 24.8）

- [ ] `pdf.cover.enabled: true` が、`document` の題名・版・日付・作成者を載せた 1 枚目を作る。書かせるのではなく生成するので、表紙が PDF 自身の文書情報と食い違えない
- [ ] 表紙にページ番号は無く、次の紙が 1 になり、PDF のページラベルが印字された番号と一致する
- [ ] 1 回の描画で 1 枚だけフッタを抑制できるかを実測する。できなければ表紙を単独の PDF として作り、既に完成したバイト列を書き換えている処理の上で連結する
- [ ] キーは `true | "./cover.md"` ではなくオブジェクトにする。書き手が用意する表紙を後から 2 つ目のフィールドとして足せるようにするためである
- [ ] HTML に表紙は付けない

**紙の上の目次**（[roadmap.md](roadmap.md) 24.9）

- [ ] 目次に載り得るすべての見出しに名前付き destination（`h-{id}`）を付ける。ページには既に `page-{id}` が付いている
- [ ] `pdf.toc.enabled: true` が、1 回目ではなく実際に渡される PDF から読んだページ番号を持つ目次を印字する
- [ ] 差し替え後に destination を読み直し、印字した番号と比較する。食い違えば有限回まで再試行し、収束しない文書は**失敗する**。もっともらしい一覧を出荷しない——だいたい合っているページ番号は、無いより悪い
- [ ] プレースホルダは取り得る最大のページ番号の幅を予約し、欄は等幅数字で組む。番号が桁を増やしても、それが指すページを動かせない
- [ ] 2 回目の描画のコストを、100 枚規模の文書について Linux と Windows で、CJK テキストと client モードの Mermaid を含めて測り、記録する。`pdf.toc` は既定で off のままにする
- [ ] `pageBreakLevel`・表紙・目次・番号付けをすべて有効にした文書で、4 つが互いに一致する。目次の番号が、その節が始まる紙である
- [ ] 走りヘッダは実装しない。2 回描画の機構がそこへ届かない理由——Chromium は `string-set` も `string()` も実装しておらず、自身のヘッダテンプレートは固定のクラスしか差し込まない——を [roadmap.md](roadmap.md) 24.9 が記録する

**数式**（[roadmap.md](roadmap.md) 6.4）

- [ ] 実際の数式を並べた見本文書を、出力に JavaScript もスタイルシートも入れない KaTeX の MathML のみの出力で、対応する両プラットフォームの HTML と PDF に組む
- [ ] その結果として、数式が 1.x の機能になって記法を公開の場で決めるか、[syntax.md](syntax.md) が、成り立たなくなった依存の議論に代えて実測に基づく制限の理由を記録するか、どちらかになる
- [ ] どちらに転んでも、フォント依存はぼかさず明示する。MathML は OpenType MATH フォントで描かれ、フォント欠落の検査（[roadmap.md](roadmap.md) 24.3.3）がそれを対象に加える必要がある

## 対応記法

Markdown / AsciiDoc の対応記法と、単一 HTML 化に伴う非対応・制限は [syntax.md](syntax.md) に
仕様としてまとめている（脚注の ID 衝突回避・ページ内アンカー処理を含む）。Markdown の GFM alerts
（`> [!NOTE]` など）と AsciiDoc の admonition は共通の `.admonition` 構造へ正規化して表示する。

## 既知の未対応 / 制限（今後のバージョンで対応）

- コードハイライト（shiki）に対応（`highlight.enabled: false` で無効化可。dual theme でダークモード追従）
- 見出し単位のファイル間リンク（`file.md#見出し` / `xref:other.adoc#sec`）に対応（リンク先ページの
  prefix 済み要素 ID へ解決する。アンカーはリンク先ファイルが生成する ID と照合するため、Markdown から
  AsciiDoc の見出しを指すには Asciidoctor が生成する ID（例: `_details`）を書く。存在しないアンカーは
  ページ先頭へフォールバックし警告する）
- 検索は部分一致で、複数キーワード（AND）・フィールド別スコアリング・見出し単位の結果・
  ハイライトに対応（v0.8）。部分一致のため日本語に分かち書きは不要。畳み込みは大文字小文字・
  全角英数字に加えて、カタカナ／ひらがなと、ダッシュ・チルダの書き分けにも対応する（v0.9）。
  意図的に畳まないのは、文字列長が変わるもの（ハイライトと抜粋の位置を原文と共有しているため）。
  すなわち半角カタカナ（`ｶﾞ`）、送り仮名の揺れ（`引き渡し` / `引渡し`。数 MB の辞書が必要）、
  英語のステミングで、`install` は `installing` を含むページに一致するが、`installing` は
  `install` としか書かれていないページには一致しない（[roadmap.md](roadmap.md) 22.3 章）
- `watch` / `serve` の監視は `fs.watch`（可能なら recursive）を利用。設定で `input` を
  変更した場合は再起動が必要。カスタムテーマのディレクトリも監視し、設定でのテーマ切り替えには
  追従するが、ディレクトリが既に存在している必要がある（監視中に作成・再作成した場合は、次に
  ソースか設定が変わったときに拾う）。親ディレクトリを監視する案は、無関係な変更や自分の出力にまで
  反応して再ビルドが循環しうるため採らない
- PDF 出力に対応（v0.5。`--format pdf` / `both`）。ヘッドレス Chromium を使うため実行環境に
  Chromium が必要で、バンドル版 CLI（単一 `.cjs` / 単一実行ファイル）では利用不可（パッケージ
  インストール版が必要）。Mermaid を `cdn` runtime にした場合、PDF 化時はネットワークが必要
  （オフライン確実にするには `inline` または `pre-render` を使う）
- **PDF のフォントは実行環境のシステムフォントを使う**。本文に出す文字種のフォントが無いと
  PDF で豆腐（□ / ☒）になる（例: 絵文字 ✅ は絵文字フォントが必要）。開発用 Docker には
  `fonts-noto-cjk`（日本語）＋ `fonts-noto-color-emoji`（絵文字）を同梱済み。自前環境で PDF を
  出す場合は使う文字種に応じたフォントを入れる（HTML はブラウザのフォントで表示するため影響なし）。
  v0.10 からはビルドが文書の必要とするものを実測し、危ない文字とそれを収録するフォントの例を挙げて
  警告する（`fontCheck: warn | error | off`、既定 `warn`。[roadmap.md](roadmap.md) 24.3.3）。
  フォントを入れ忘れたままビルドが黙って成功し、PDF だけが読めない、ということはもう起きない。
  ただしブラウザのフォールバックに対するヒューリスティックであることに変わりはなく、既定を
  失敗ではなく警告にしてあるのはそのためである。HTML が影響を受けないのは読者のフォントで
  描かれるからであり、`mermaid.mode: pre-render` はビルドマシンのフォントを SVG に焼き込むため
  この限りではない（同じ検査の対象になる）
- 入力は信頼できるドキュメントを前提（AsciiDoc の生 HTML をサニタイズしない。
  詳細は [development.md](development.md)）
