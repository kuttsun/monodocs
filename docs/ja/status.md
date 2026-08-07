# 実装状況

[English](../status.md)

最終更新: 2026-08-06

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
| 言語 / `init` / PDF の仕上げ        | 🚧 予定   | v0.10          |

VS Code 拡張は凍結しており、着手予定はない。需要が分からず、リリースと Marketplace の運用が単独
メンテナンス体制に対して重く、拡張と `@monodocs/core` の境界も未決定であるため。理由は
[roadmap.md](roadmap.md) の v0.7 に記録している。代わりに着手した v0.8 と、それに続く v0.9 は
いずれもリリース済みである。

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

- [ ] `--help`（`configureHelp` / `addHelpText` 経由で届く Commander 生成の `Usage:` / `Options:` / `Commands:` 見出しを含む）と全てのエラー・警告が既定で英語になり、`--lang ja` または `MONODOCS_LANG=ja` で日本語になる。フラグが環境変数に優先し、対応していない値は黙ってフォールバックせず対応する値を挙げて拒否する。`LANG` / `LC_ALL` は意図的に見ない。ビルドログを出力したマシンに依存させないため（[roadmap.md](roadmap.md) 25.6）
- [ ] カタログが monodocs 自身の出す全ての文字列を覆い、その外に新しい文字列を足すとテストが落ちる。包まれないまま利用者に届く依存パッケージ由来のメッセージ（Zod のパースエラー、Puppeteer のスタック）は対象外とし、monodocs が既に包んでいるものはその包み側を訳す。境界を文書に書く

**文書の言語と UI ラベル**（[roadmap.md](roadmap.md) 23.4）

- [x] トップレベルの `lang` キーが `<html lang>` と UI ラベルの両方を決め、既定は `en`。文書がある言語を宣言しながら別の言語を表示することが無くなる。これは [architecture.md](architecture.md) と [development.md](development.md) に記録されている「ラベルは英語に統一」の決定を覆すものであり、ロードマップと矛盾したまま残さず両方とも更新する。直書きされていた `<html lang="ja">` に依存していた利用者にはその属性が変わる破壊的変更であり、1.0 より前に行う
- [x] `lang` は構文的に妥当な BCP 47 タグを受理し、そうでない文字列は属性に書かず拒否する。照合は主要言語サブタグに対して大文字小文字を無視する（`en-GB` / `JA` → `en` / `ja`）。表を持たないタグ——照合すべきサブタグを持たない、タグ全体が私用の `x-…` や grandfathered tag を含む——は英語のラベルへフォールバックし、タグを名指ししてビルドごとに一度警告する
- [x] 表の解決と `html.labels` の適用は core が行い、結果を `{{siteDataJson}}` に公開する。`app.js` は自前の写しを持たずそれを消費するので、表と上書きがずれることがない
- [x] `en` / `ja` の表が、列挙されたキー集合を完全に覆う。どちらかに欠けたキーは黙ってフォールバックせずビルドを失敗させる。1.0 が凍結するのでキー集合は設定リファレンスに列挙する。未知の `html.labels` キーは無視されずに拒否される
- [x] ラベル値は行き先ごとにエスケープする。HTML のテキスト、`title` / `aria-label` などの属性値、`siteDataJson` の JSON はそれぞれ扱いが異なり、`<` や引用符を含む値が 3 つとも壊れずに届く
- [x] テーマへの保証を、ひとまとめにせず 4 段階として実装し文書化する。どのテーマも `{{siteDataJson}}` からデータとしてラベルを受け取る／既定の `app.js` は既定テンプレートの DOM hook に適用する／`app.js` を差し替えたテーマは自分で適用する／独自の `template.html` が自前で書いた静的な文字列はそのまま残る。`{{lang}}` は任意トークンなので、`<html lang>` を直書きしたテンプレートは書いたものが残る

**`monodocs init`**（[roadmap.md](roadmap.md) 25.1）

- [ ] 編集無しでビルドできる `monodocs.config.yml` と `docs/index.md` を書き出し、どちらかが既にある場合はどちらも書かずに見つけたものを名指しする。生成する設定は全キーのダンプではなくコメント付きの短い出発点にし、そのコメントはメッセージ言語に従う

**フォント検査**（[roadmap.md](roadmap.md) 24.3.3）

- [ ] 文書が必要とするフォントが無いマシンでのビルドが、危ういクラスタと、それを収録するフォントの例を組み込みの用字系→例フォント表から挙げて警告する（パッケージ名は挙げない。プラットフォームごとに異なるため）。そのマシンに無いものを必要としない文書では黙っている
- [ ] 単位は、コードポイントでも用字系ごとの代表文字でもなく、書記素クラスタと、それが現れる要素の計算後フォントの組である。構成コードポイントが全て単独では描ける異体字シーケンスや絵文字 ZWJ シーケンスも取り逃さない。検査は `document.fonts.ready` の後に走る
- [ ] 判定は `U+10FFFD` との比較で行い、当たったものをラスタライズで確認する。開発イメージでの実測で、描ける文字と描けない文字を分けられたのはこの 2 つだけだった。存在しない family 名との比較と CDP の `CSS.getPlatformFontsForNode` はいずれも実測して退けた。前者は何に対しても同じ幅を返し、後者は描けない文字に対しても `Liberation Sans:2` を報告するため
- [ ] 検査は自身の基準を別の面の私用領域コードポイントで検証し、そのマシンが私用領域を描く場合は指摘を出さずに「この環境では実行できない」と報告する
- [ ] `mermaid.mode: pre-render` は完成後の HTML ではなく自身の描画コンテキストで測る。埋め込まれた SVG を測り直してもそれを生んだフォント解決を再現できないため（[roadmap.md](roadmap.md) 21.2）。設定を `pdf.fontCheck` ではなくトップレベルの `fontCheck` に置く理由もそこにある
- [ ] `fontCheck: warn | error | off` の既定は `warn`。ヒューリスティックの誤検出が既定でビルドを壊せないようにするため。`error` は非ゼロで終了し、それを選ぶ人は誤検出でも CI が止まることを受け入れる

**PDF のページ番号**（[roadmap.md](roadmap.md) 24.5）

- [x] 生成した PDF が既定で中央にページ番号を持ち、その形式は翻訳を必要としない。ヘッダーとフッターは Chromium 自身の `pageNumber` / `totalPages` / `title` / `date` / `url` クラスを使う HTML 断片であり（`{{token}}` 構文は無い）、文書のスタイルを一切継承しないので自分でフォントを指定する
- [x] `pdf.header: false` と `pdf.footer: false` は、オプションの省略ではなく明示的に空の断片を渡す。`displayHeaderFooter` が on の状態で何も渡さないと Chromium は自前の日付とタイトルのヘッダーへフォールバックするため。差し替えた断片は上下どちらでも Chromium のクラスで描かれる
- [x] 既定のフッターに足りないマージンは警告する。閾値は選んだ数値ではなくその断片を描いた高さから取る。実測では、Chromium の組み込みテンプレートは 10 mm と 5 mm の間で描かれなくなるが、渡した断片（monodocs が使うのはこちら）は 0 mm でも描かれる。したがって失敗の形は、消えるフッターではなく紙端に貼り付いたフッターである。差し替えた断片は検査対象外であることを明記する。任意の HTML と CSS をマージン値だけからは判定できないため

**決定とドキュメント**

- [x] Docker を提供しない配布形態として、Homebrew / Scoop / winget を決着させたのと同じリリースごとの保守コストの論法とともに記録する（[roadmap.md](roadmap.md) 8.3）。`Dockerfile.dev` は影響を受けない
- [ ] ドキュメントサイト（コマンド・設定・CI ガイド）とその日本語ミラーを更新する。上記の項目はどれもサイトが記述している内容を変えるため
- [ ] `verify-published.yml` が、PDF が生成されたことだけでなく、新しい表面（メッセージの言語・`init`・ページ番号が実際に入った PDF）を実行して確かめる

**リリース**

- [ ] `next` tag で `0.10.0-beta.1` を npm へ公開し、`verify-published.yml` により Linux x64 / Windows x64 で検証する
- [ ] リリースバイナリを `verify-release-binaries.yml` と `scripts/verify-windows-binary.ps1` で検証する
- [ ] stable `0.10.0` を公開・検証し、公式サイトの CI ガイドの固定バージョンをそれに合わせる

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
  現状ビルド側は何も検査しないため、フォントの導入を忘れるとビルドは成功し PDF だけが読めなくなる。
  v0.10 で警告を出す（[roadmap.md](roadmap.md) 24.3.3）。HTML が影響を受けないのは読者のフォントで
  描かれるからであり、`mermaid.mode: pre-render` はビルドマシンのフォントを SVG に焼き込むため
  この限りではない
- 入力は信頼できるドキュメントを前提（AsciiDoc の生 HTML をサニタイズしない。
  詳細は [development.md](development.md)）
