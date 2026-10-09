# 実装状況

[English](../status.md)

最終更新: 2026-10-09

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
| 出力サイズと予算 / 透かし / 表紙 / 改行 | ✅ 完了   | v0.13          |
| 見出し番号 / 紙の目次               | ✅ 完了   | v0.14          |
| Mermaid ランタイムの表記 / Mermaid 12 / 数式 | ✅ 完了   | v0.15          |
| チェックリスト / 幅の広いアクセント / asciimath / 検索の畳み込み / 表面の列挙 | 🚧 予定   | v0.16 |
| `sidebar.exclude` の削除 / 表面の凍結 | 🚧 予定   | 1.0            |

VS Code 拡張は凍結しており、着手予定はない。需要が分からず、リリースと Marketplace の運用が単独
メンテナンス体制に対して重く、拡張と `@monodocs/core` の境界も未決定であるため。理由は
[roadmap.md](roadmap.md) の v0.7 に記録している。代わりに着手した v0.8 と、それに続く v0.9・v0.10・v0.11・v0.12・v0.13・v0.14・v0.15 は
いずれもリリース済みである。

0.14.0 はリリース済みである——見出し番号（`numbering.sections`）、紙の目次（`pdf.toc`）、数式の実測。
どちらの機能も既存の設定がビルドするものを変えないので、0.13.0 と同じくプレリリースを経ずに出し、公開
パッケージ、リリースバイナリ、それらが生成する HTML は `latest` を動かしたあとに検証した。Windows ホストでの
スクリプト実行と、Windows で人が行う確認は、0.13.0 と同じく 0.14.0 でも未了である。

0.15.0 はリリース済みである。1.0 の前に置く理由は [roadmap.md](roadmap.md) にある。含むのは、
inline の Mermaid ランタイムの表記、mermaid 12、Markdown と AsciiDoc の数式（ビルド時に MathML に描き、
コピー、検索、数式を見るフォント検査を含む）である。既存の文書がビルドするものを変えるものが 2 つある。すべての図を
mermaid 12 が描くことと、GitHub が描く Markdown の 4 つの数式の形、AsciiDoc の latexmath と latexmath を意味する
`stem` が数式として描かれることである。AsciiDoc の asciimath は文字のままだが警告が出るようになり、
`validate --strict` を失敗させる。`math.enabled: false` でどちらも止められる。そのため、まずプレリリース
（`0.15.0-beta.1`）を `next` に出した。プレリリースで確かめたのは、`verify-published.yml` に
よる Linux と Windows での公開パッケージの検証、mermaid 12 でのすべての図の目視、Cambria Math を使う Windows
での数式のフィクスチャの確認で、どれも済んだ。0.15.0 は、CI ガイドをそれに固定して `latest` に出し、公開
パッケージ、リリースバイナリ、それらが生成する HTML は `latest` を動かしたあとに検証した。Windows ホストでの
スクリプト実行と、Windows で人が行う確認の一部は、0.14.0 と同じく未了である。v0.16 は、それらを
0.16.0 について行うことで置き換える。

v0.16 は、これまでのマイルストーンが先送りしたものを片付け、1.0 が凍結するものを列挙する。1.0 には
`sidebar.exclude` の削除と最後の確認が残る（[roadmap.md](roadmap.md)）。

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
- [x] リンクのない装飾目的以外の本文画像と Mermaid 図をキーボードでも操作できる lightbox で拡大表示（`html.imageLightbox`、既定 true。リンク付き画像と明示的な装飾画像は元の意味を維持し、印刷および PDF では非表示）
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

**リリース**

- [x] `next` tag で `0.12.0-beta.1` を npm へ公開し、`verify-published.yml` により Linux x64 / Windows x64 で検証する。0.12 を必要とする手順はインストールされたバージョンで切り替え、0.11 の検証も従来どおり行えるようにする。`v0.12.0-beta.1` タグから CI で provenance 付きで公開した。実行は `0.12.0-beta.1` をインストールし、ログの `SUPPORTS_V012: true` が示すとおり、入力のルートと `sources.include`、否定パターンの拒否、route の別名、AsciiDoc の属性を、レジストリからインストールしたパッケージに対して両プラットフォームで確認した。include の読み取り境界は Linux だけで走る。Windows ランナーでシンボリックリンクを作るには、ジョブが持たない権限が要るからである（[maintenance.md](maintenance.md)）
- [x] リリースバイナリを両プラットフォームの `verify-release-binaries.yml` で検証した。各 16 項目が PASS する
- [x] Windows 11 のホストで、公開済みの `v0.12.0-beta.1` の資産に対して [`scripts/verify-windows-binary.ps1`](../../scripts/verify-windows-binary.ps1) を実行し、16 項目すべて PASS した。このホストは社内プロキシの内側にあり、プロキシが `127.0.0.1` への要求に代わって応答したため、バイナリに問題が無いのに `serve` の 2 項目が 503 になっていた。#122 でループバックの確認がプロキシを通らないようにし、再実行で 16 項目すべて PASS した
- [ ] Node.js の無い Linux x64 ホストで [`scripts/verify-linux-binary.sh`](../../scripts/verify-linux-binary.sh) を実行する。バイナリ配布が主張しているのはまさにその環境であり、このリポジトリのどの CI ジョブも用意できないものである（[maintenance.md](maintenance.md)）。このリリースではそうしたホストを用意できなかった。`PATH` に Node.js がある Linux x64 ホストでは公開済みの `v0.12.0-beta.1` の資産に対して 16 項目すべて PASS し、`verify-release-binaries.yml` も公開のたびにこのスクリプトを走らせるが、どちらもその環境ではない。0.12.0 はこの項目を未了のまま出す
- [x] 生成 HTML のブラウザ確認を、目視ではなく操作して行った。`.sha256` で照合した Linux のリリースバイナリが出力した成果物を Chromium で開き、14 項目を確認した——サイドバーの描画・遷移・現在ページの表示、前後ナビ、検索が結果を返し開いたページで本文をハイライトすること、`Escape` で検索が消えてツリーが戻ること、ダークモードが再読み込みをまたいで残ること、375px でドロワーがトグルから開きリンク追従で閉じること、スクリプトエラーが出ないこと。このマイルストーンで加わったのは 2 項目で、別名がページを描画して hash を書き換えること、別名がアンカーを保つこと——`#/old/setup#guide-install` が `#/guide#guide-install` に着き、見出しまでスクロールする。その成果物のフッタは `monodocs v0.12.0-beta.1` であり、ローカルビルドではなく検証対象のリリースそのものである
- [ ] 人にしか答えられない部分（Windows）: 生成 HTML が Edge でどう見えるか（とりわけ日本語）、`serve --open` が既定のブラウザを起動すること、スクリプト経由ではなくブラウザで取得した資産に対する Mark of the Web と SmartScreen。バイナリは方針として未署名なので（[roadmap.md](roadmap.md) 8.5）警告が出るのが想定どおりである。v0.11 も同じ留保を残している
- [x] stable `0.12.0` を公開・検証し、公式サイトの CI ガイドの固定バージョンを英日とも `0.12.0` に合わせた。`v0.12.0` タグから CI で provenance 付きで公開し、`latest` dist-tag が指す。`verify-published.yml` と `verify-release-binaries.yml` により Linux x64 / Windows x64 で検証済みで、CI ガイドは `monodocs@0.12.0` を固定する。リリースバイナリは各プラットフォームで 16 項目が PASS する。`verify-published.yml` の 1 回目は Linux のブラウザ自動検出の手順で失敗した——`PUPPETEER_EXECUTABLE_PATH` なしで見つけた Chrome が 30 秒以内にエンドポイントを報告しなかった。直前の、同じブラウザをパスで起動する PDF の手順は通っており、失敗したジョブを再実行するとすべての手順が通った。beta の後に入った #120（既定テーマのコードの表示）もこのリリースに載る

### v0.13: 単一ファイルの予算

[roadmap.md](roadmap.md) がこのマイルストーンを定義し、以下がそれを追跡する。

**出力を測る**（[roadmap.md](roadmap.md) 20.5）

- [x] ビルドが出力サイズと内訳——埋め込み画像、inline の Mermaid ランタイム、`siteDataJson`、その他——を出す。内訳の合計がファイルと一致し、それをテストが主張する
- [x] Shiki の行は無い。出力にランタイムを残さない——ハイライトはビルド時に行われる——からである
- [x] 最大の埋め込み画像がサイズとともに名指しされる。内訳は行動されるためにある
- [x] どちらの数字も、ファイルが完成したあとにディスクへ書いたバイト数を測ったものであり、ビルド中の積算見積りではない

**予算**（[roadmap.md](roadmap.md) 20.5）

- [x] `assets.budget: 10MB` が超過時に警告し、`assets.onBudget: error` がビルドを失敗させる。既定が `warn` なのは、キーを足しただけで既に超えているビルドが落ちてはならないからである
- [x] 未設定なら何も変わらず、既存のビルドが警告し始めない
- [x] 画像を再エンコードしないという決定を、理由——CJS バンドルと SEA バイナリが載せられないネイティブ依存、HTML だけのビルドが獲得してはならない Chromium 依存、失う再現性、そして品質・色空間・EXIF の向き・アニメーション・SVG がそれぞれ必要とする規則——とともに記録する。画像が本当に大きすぎる文書への答えは `onLargeImage: external` のままである

**透かし**（[roadmap.md](roadmap.md) 24.10）

- [x] `pdf.watermark: "DRAFT"` が、PDF とブラウザ印刷の全ページで本文の背後に斜めの 1 行を印字し、画面には何も出さない
- [x] 文字列は挿入ではなくエスケープする。マークアップを含む値はその文字列として現れる
- [x] 規則は core が印刷用スタイルシートへ出し、`style.css` を差し替えたテーマでビルドしても残る。テーマが、文書の要求した「社外秘」を消せてはならない
- [x] 画像もページごとの制御もフォント・角度・不透明度のキーも無い。閉じたキー集合について [roadmap.md](roadmap.md) 24.6 が述べた理由による

**表紙**（[roadmap.md](roadmap.md) 24.8）

- [x] `pdf.cover.enabled: true` が、`document` の題名・版・日付・作成者を載せた 1 枚目を作る。書かせるのではなく生成するので、表紙が PDF 自身の文書情報と食い違えない
- [x] 表紙にページ番号は無く、次の紙が 1 になり、PDF のページラベルが印字された番号と一致する。表紙のラベルは UI ラベル `cover` なので、`lang` と `html.labels` に従う
- [x] 1 回の描画で 1 枚だけフッタを抑制できるかを実測した。できない。`@page :first { margin: 0 }` を与えた 1 枚目にもフッタは描かれ、`pageNumber` / `totalPages` もその紙を数えた。したがって表紙は帯の無い単独の PDF として描画し、既に完成したバイト列を書き換えている処理の上で、しおりを付ける前に本文の前へ挿入する
- [x] キーは `true | "./cover.md"` ではなくオブジェクトにする。書き手が用意する表紙を後から 2 つ目のフィールドとして足せるようにするためである
- [x] HTML に表紙は付けない

**段落内の改行**（[roadmap.md](roadmap.md) 12.6）

- [x] `sources.lineBreak` が `space`（既定）/ `break` / `join` を取り、`sources.markdown` ではなく `sources` の直下に置かれる。`join` は構文ではなく文字についての規則で両形式に効くため、Markdown にしか届かないキーは混在文書の半分だけを別の読み方にしてしまう
- [x] 既定の `space` が直前のリリースと同じバイトを出す。どちらのレンダラーのパイプラインにも処理を足さず、`examples/ja` の fixture をキーを省いた場合と `space` と書いた場合でビルドし、バイト単位で一致することをテストで確かめる。既定を `lang` から導かない。日本語だと宣言した文書は、Markdown の意味が変わる文書ではない
- [x] GFM のアラートのマーカーを、直後の強制改行とともに取り除く。`break` より先に入れる。`break` のもとでは `> [!NOTE]` の後ろの改行が `<br>` として後処理に届き、マーカーの文字列だけを取り除くとすべてのアラートが空行から始まる。この形は 0.12.0 でもマーカー行の末尾がバックスラッシュかスペース 2 つのときに起きており、3 つそれぞれをテストが確かめる
- [x] `break` が両形式で段落内の改行を `<br>` にする。AsciiDoc では `hardbreaks-option` を `@` サフィックスで soft set するので、`:hardbreaks-option!:` と書いた文書はそれでも勝つ。[roadmap.md](roadmap.md) 17.5 が要求する仕組みであり、このキーがその最初の利用者になる
- [x] `join` が、East Asian Width が F / W / H でどちらもハングルでない文字に挟まれた改行だけを取り除き、それ以外はそのままにし、改行が書き手の引いた行である `pre` と `code` には触れない。範囲は Unicode のデータファイルから生成し、バージョンを記録し、テーブルがそれと一致し続けることをテストが主張する
- [x] `join` が適用する規則を、あるがままに記録する。CSS Text Level 3 §4.1.3 も Level 4 も、空白にするか削除するかを UA 定義のままにしており、F / W / H の規則が規範だったのは 2013 年の Working Draft である。そしてエンジンの実装は割れている——`segment-break-transformation-rules` の 49 件のうち 9 件が Chrome 152 と Safari 26.6 で失敗し、Firefox 154 では 1 件も失敗しない。開発イメージでの実測では、一文一行で書かれた日本語の段落は文と文のあいだに 3.58px の空白を抱えており、`examples/ja` が現に影響を受けている
- [x] どちらの値も、ページのテキストを収集する前に renderer の内側で適用する。`postprocessPages` は `page.text` を作り直さないためである。3 つの値のいずれでも `page.text` と HTML が一致し、検索結果がページに無いテキストを指すことがない
- [x] 検索を値ごとに確かめる。`break` は text ノードを分割するので、結果リストは分割をまたいで一致する一方、本文ハイライト（[roadmap.md](roadmap.md) 22.5）はそこを marking できない。`join` はページのテキストを収集する前に改行を取り除くので、現在 `hast-util-to-text` がその改行を畳んで作っている空白を、インデックスが持たなくなる
- [x] [syntax.md](syntax.md) が「改行」と並べるだけでなく規則を述べる。段落の中の改行は両形式とも行を繋ぐこと、明示的な改行は Markdown では行末スペース 2 つとバックスラッシュ、AsciiDoc では ` +` / `[%hardbreaks]` / `:hardbreaks-option:` であること、Markdown で行末空白を削るエディタでも残るのはバックスラッシュのほうであること。どの書き方も仕様からではなくパイプラインを通して実測した。形式横断の項には、東アジアの文字に挟まれた空白を Firefox は消し Chromium と WebKit は残すので PDF には出ることを記録した
- [x] サイトの設定リファレンスとその日本語ミラーがキーを載せる

**リリース**

- [x] プレリリースを経ず `latest` tag で `0.13.0` を npm へ公開し、`verify-published.yml` により Linux x64 / Windows x64 で検証する。入力は既定の `next` ではなく `dist_tag: 0.13.0` とする——`next` は後述の項目で移すまで 0.12.0 を指しており、0.13 の手順をすべて飛ばしたまま成功してしまう。ログが `verifying monodocs 0.13.0` を示し、0.13 が必要な手順——`sources.lineBreak`、出力サイズの表示と `assets.budget`、`pdf.watermark`、Mermaid の lightbox のマークアップ——が飛ばされずに実行されたことを確かめる。`v0.13.0` タグから CI で provenance 付きで公開し、`latest` dist-tag が付いた。`dist_tag: 0.13.0` での実行はログに `verifying monodocs 0.13.0` を示し、0.13 の 4 つの手順は Linux x64 / Windows x64 の両方で実行されて成功した
- [x] リリースバイナリを両プラットフォームの `verify-release-binaries.yml` で検証する。リリースが起動した実行で、両プラットフォームとも 16 項目が PASS した
- [ ] 公開済みの `v0.13.0` の資産に対し、Windows 11 ホストで [`scripts/verify-windows-binary.ps1`](../../scripts/verify-windows-binary.ps1) を実行する——0.16.0 の確認で置き換える（v0.16）
- [x] Node.js の無い Linux x64 ホストで [`scripts/verify-linux-binary.sh`](../../scripts/verify-linux-binary.sh) を実行する（[maintenance.md](maintenance.md)）。Linux x64 ホスト上の、Node.js を入れていない `debian:stable-slim` コンテナで、公開済みの `v0.13.0` の資産に対して実行し、16 項目すべて PASS した。素のホストではなくコンテナだが、この項目が問うている環境——バイナリが自前のランタイム以外を持たない環境——であり、0.12.0 が未了で残した項目をこれで閉じる
- [x] リリースされた Linux バイナリが生成した HTML を、目視ではなく操作して確かめる。このマイルストーンで新たに加わる 2 つ——Mermaid 図が lightbox で開き、閉じると元に戻ること、`sources.lineBreak: join` でビルドした日本語の段落が文と文のあいだに空白なく読めること——を含む。資産を `.sha256` と照合し、最小限の環境で実行して、その出力を Chromium で 13 項目確かめた——サイドバーの表示、ページの移動と現在ページの印、前後ナビ、検索結果と開いたページ内のハイライト、`Escape` による検索欄のクリアと目次の復帰、再読み込み後も保たれるダークモード、375px でトグルから開きリンクの後に閉じるドロワー、別名がページを表示して hash を書き換えること、別名がアンカーを保つこと、フッターの `monodocs v0.13.0`、スクリプトエラーが無いこと、そして新しい 2 つ——Mermaid 図が lightbox で全幅に開き、閉じるとブロックに戻ること、`join` でビルドした `examples/ja` で日本語の文と文のあいだに改行が残らず、書き手が書いた明示的な改行と、英字が続く文の改行は残ること
- [ ] Windows で人にしかできない確認——生成した HTML が Edge でどう見えるか（とりわけ日本語）、透かし入りの PDF を開いて印刷したときの見え方、`serve --open` が既定のブラウザを開くこと、ブラウザでダウンロードした資産に対する Mark of the Web と SmartScreen——0.16.0 の確認で置き換える（v0.16）
- [x] `next` dist-tag を `0.13.0` へ移し、公式サイトの CI ガイドの固定バージョン（英日とも）をそれに合わせる。`next` と `latest` はどちらも `0.13.0` を指し、CI ガイドは `monodocs@0.13.0` を固定している

### v0.14: 紙の版面を仕上げる

[roadmap.md](roadmap.md) がこのマイルストーンを定義し、以下がそれを追跡する。

**見出し番号**（[roadmap.md](roadmap.md) 19.1）

- [x] `numbering.sections: 3` が文書全体を通して見出しに番号を振る。どちらかのレンダラーでファイルごとにではなく、共有の `Page` モデルの上で決める——AsciiDoc の `:sectnums:` はファイルごとに振り直し、Markdown には何も無い
- [x] 番号はサイドバー順に従い、ディレクトリが 1 階層を提供し、`h1` は見出しの番号ではなくページ自身の番号を持つ
- [x] route・page ID・見出し ID は変わらず、それをテストが主張する。並べ替えで変わるアドレスは、これまでにコピーされたすべてのリンクを壊す
- [x] 番号は見出しの中の要素であり、サイドバーとページ内目次に現れ、検索で語に勝たない
- [x] 番号付けが有効なとき、文書内の `:sectnums:` は設定キーを名指して拒否される

**紙の上の目次**（[roadmap.md](roadmap.md) 24.9）

- [x] 目次に載り得るすべての見出しに名前付き destination（`h-{id}`）を付ける。ページには既に `page-{id}` が付いている——実装では、しおりの `mdpdf-{n}` と同じく、行き先ごとに ASCII の `mdtoc-{n}` にした（[roadmap.md](roadmap.md) 24.9）
- [x] `pdf.toc.enabled: true` が、1 回目ではなく実際に渡される PDF から読んだページ番号を持つ目次を印字する
- [x] 差し替え後に destination を読み直し、印字した番号と比較する。食い違えば有限回まで再試行し、収束しない文書は**失敗する**。もっともらしい一覧を出荷しない——だいたい合っているページ番号は、無いより悪い
- [x] プレースホルダは取り得る最大のページ番号の幅を予約し、欄は等幅数字で組む。番号が桁を増やしても、それが指すページを動かせない
- [x] 2 回目の描画のコストを、100 枚規模の文書について Linux と Windows で、CJK テキストと client モードの Mermaid を含めて測り、記録する。`pdf.toc` は既定で off のままにする——Linux（2.13 秒 → 3.06 秒）と GitHub の Windows ランナー（3.88 秒 → 6.09 秒）で測り、[roadmap.md](roadmap.md) 24.9 に記録した
- [x] `pageBreakLevel`・表紙・目次・番号付けをすべて有効にした文書で、4 つが互いに一致する。目次の番号が、その節が始まる紙である
- [x] 走りヘッダは実装しない。2 回描画の機構がそこへ届かない理由——Chromium は `string-set` も `string()` も実装しておらず、自身のヘッダテンプレートは固定のクラスしか差し込まない——を [roadmap.md](roadmap.md) 24.9 が記録する

**数式**（[roadmap.md](roadmap.md) 6.4）

- [x] 実際の数式を並べた見本文書を、出力に JavaScript もスタイルシートも入れない KaTeX の MathML のみの出力で、対応する両プラットフォームの HTML と PDF に組む——Linux で測った。Windows では Linux でビルドした HTML を Edge から印刷した（monodocs 自体は Windows で実行していない）。[roadmap.md](roadmap.md) 6.4 に記録した
- [x] その結果として、数式が 1.x の機能になって記法を公開の場で決めるか、[syntax.md](syntax.md) が、成り立たなくなった依存の議論に代えて実測に基づく制限の理由を記録するか、どちらかになる——1.x の機能とすることに決めた。条件は [roadmap.md](roadmap.md) 6.4 に記録した
- [x] どちらに転んでも、フォント依存はぼかさず明示する。MathML は OpenType MATH フォントで描かれ、フォント欠落の検査（[roadmap.md](roadmap.md) 24.3.3）がそれを対象に加える必要がある

**リリース**

- [x] `0.14.0` をプレリリースなしで npm の `latest` タグに公開し、`verify-published.yml` を `dist_tag: 0.14.0` で実行して Linux x64 と Windows x64 で検証する——既定の `next` ではない。`next` は下で動かすまで 0.13.0 を指しており、0.14 の段をすべて飛ばしたまま通ってしまう。ログが `verifying monodocs 0.14.0` と言い、0.14 で切り替わる段（見出し番号と紙の目次。#150 が追加するので、実行前にマージしておく）が飛ばされずに実行されたことを確かめる。`npm` 環境の承認を経て `v0.14.0` タグから CI で provenance 付きで公開し、`latest` の dist-tag が付いた。`dist_tag: 0.14.0` での実行はログに `verifying monodocs 0.14.0` と出し、0.14 の 2 つの段は Linux x64 と Windows x64 の両方で実行されて通った。`:sectnums:` は `numbering/sectnums` として報告され、紙の目次は両方で Alpha 2、Alpha one 2、Alpha two 4、Beta 5、Beta one 7 と読め、いずれも見出しの載る紙と一致した
- [x] `verify-release-binaries.yml` でリリースバイナリを両プラットフォームで検証する。リリースが起動した実行は、どちらも 16 項目を通過した
- [ ] 公開した `v0.14.0` のアセットに対して、Windows 11 のホストで [`scripts/verify-windows-binary.ps1`](../../scripts/verify-windows-binary.ps1) を実行する——0.16.0 の確認で置き換える（v0.16）
- [x] Node.js の無い Linux x64 ホストで [`scripts/verify-linux-binary.sh`](../../scripts/verify-linux-binary.sh) を実行する（[maintenance.md](maintenance.md)）。Linux x64 ホスト上の、Node.js の入っていない `debian:stable-slim` コンテナで、公開した `v0.14.0` のアセットに対して実行し、16 項目すべて通過した。0.13.0 と同じく素のホストではなくコンテナだが、バイナリは自分以外のランタイムを持たず、それがこの項目の対象である
- [x] リリースした Linux バイナリが生成した HTML を、目視ではなく操作して確かめる。このマイルストーンで新しいもの——`numbering.sections` を有効にしたとき、見出し・サイドバー・ページ内目次の番号が一致し、節番号で検索するとその節が開く——を含める。アセットを `.sha256` で確かめ、最小限の環境で `examples/en` を `numbering.sections: 3` でビルドし、出力を Chromium で操作した。20 ページすべてで、サイドバーと h1、本文の h2/h3 とページ内目次の項目が同じ番号を持ち（79 見出し、不一致なし）、`1.1` を検索するとその節が先頭に出て `Enter` で開き、語の検索は結果を返し、前後ナビとダークモードは働き、フッタは `monodocs v0.14.0` と読め、スクリプトエラーは無かった
- [ ] Windows で人にしか答えられないこと。Edge で生成 HTML がどう見えるか（とりわけ日本語）、`pdf.toc` と番号付けを有効にした PDF を開いて印刷し、目次の番号が紙と一致すること、`serve --open` が既定のブラウザを開くこと、ブラウザでダウンロードしたアセットの Mark of the Web と SmartScreen——0.16.0 の確認で置き換える（v0.16）
- [x] `next` の dist-tag を `0.14.0` へ動かす。ドキュメントサイトの CI ガイド（英語・日本語とも）は、サイトがリリースからデプロイされるようになったので、版の変更そのものの中で `monodocs@0.14.0` に固定する。0.14.0 の代わりに修正版を出す場合は、その版の変更で固定し直す。`next` と `latest` はどちらも `0.14.0` を指し、デプロイされた CI ガイドは英語・日本語とも `monodocs@0.14.0` を固定している

### v0.15: Mermaid ランタイムと数式

[roadmap.md](roadmap.md) がこのマイルストーンを定義し、以下の一覧がそれを追跡する。

**inline の Mermaid ランタイムの表記**（[roadmap.md](roadmap.md) 21.3、#134）

- [x] `mermaid.mode: client` と `mermaid.runtime: inline` で図を含む文書をビルドすると、出力 HTML がランタイムの第三者表記をちょうど 1 回持つ。`cdn`、`pre-render`、図を含まない文書では持たない。表記はランタイム自身の `<script>` の先頭にある `/*! */` コメントに入れるので、ランタイムを出力するコードだけが出力する。`build.mermaid-notices.test.ts` が inline、`cdn`、`pre-render`、図を含まない文書を確かめる
- [x] 表記は、`node_modules` が解決するものではなく、ビルド済みの `mermaid.min.js` が含むパッケージとバージョンを挙げ、パッケージからも `embeddedAssets` からも読める。`generate-mermaid-notices.mjs` がランタイムのソースマップを読み（mermaid 11.17.2 では 86 コンポーネント。いくつかのパッケージの 2 つの版と、事前バンドルされたパーサーの中で esbuild が名指す部品を含む）、すべてのライセンスと NOTICE ファイルをその版から、pnpm ストアか integrity を照合した npm の tarball から取る。パッケージ自身のビルド済みファイルの中はソースマップから見えないので、大きなソースやビルド済みのソースを持つコンポーネントは、その版ごとに人が監査する。roughjs は 4 パッケージを、cytoscape は devDependencies の 3 パッケージと出典付きの MIT のコード 4 件（jQuery のイベントオブジェクトを含む）を、venn.js は fmin（BSD-3-Clause）を、パーサー内の vscode-uri は path-browserify を、layout-base は JamaJS（Apache-2.0）のコードを含み、mermaid 自身の src/utils.ts は entity-decode を写し、生成されたパーサーは jison と jison-lex のランタイムを持ち、cytoscape・cytoscape-fcose・layout-base は Babel のヘルパーを、katex は React（Apache-2.0）から改変した 2 関数を、layout-base と mermaid のガントチャートの描画は、それぞれ Stack Overflow の回答から改変した断片を含んでいた。後者 2 件は、投稿日に Stack Overflow が適用していた CC BY-SA の版で帰属を示す。ランタイムのソースのコメントが挙げる URL は、すべて「帰属を示した」か「参照」として記録し、記録の無い URL はどちらのモードでも失敗する。コードの出どころとして帰属を示したものには、khroma の Dart Sass からの移植、cytoscape の 3 件目の Stack Overflow の回答、W3C Software and Document License の全文を添えた WICG の解説文書、ライセンスを示していない出典 4 件（cytoscape と khroma が使う Michael Jackson の色変換、venn.js のラベル折り返しのブログ記事、cytoscape の Inigo Quilez の距離関数）を含む。後者はその旨を書いて帰属を示す。ソースは、大きさ、minify、パス、バンドラーの痕跡で判定し、パーサーの esbuild の区間は 1 つずつ判定する。中身を読めないソースは失敗にする。監査していない版、挙げも説明もされていない実行時の依存、ライセンス文の無いコンポーネントは、どれも生成を失敗させる（fastdom は名指しで README から取る）。`--check` はテストの中でオフラインで動き、一覧がランタイムと食い違うとき、監査を持つ生成スクリプトが表記の生成後に変わったとき、表記が手で書き換えられたときに失敗する。ファイルは生成スクリプトのハッシュと、自身の全文のダイジェストを記録している。同一のライセンス文は 1 つのブロックにまとめ、97 KB（gzip で 12.7 KB）になった。`bundle.mjs` がこのファイルを `embeddedAssets` に埋め込み、そちらを先に読む。差し替えた埋め込みからのビルドをテストが確かめる。npm パッケージとバイナリも同じランタイムを再配布するので、`THIRD-PARTY-NOTICES.txt`（とそれから作るバイナリの `monodocs-NOTICES.txt`）は、`node_modules` の mermaid の依存ツリーをたどる代わりに、この表記を末尾の節として持つ
- [x] 表記はカスタムテーマと `branding: false` でも残り、npm パッケージからのビルドでもスタンドアロンバイナリからのビルドでも入り、どの表記の文面もそれを収めるコメントを閉じられない。コメントは `*/`、`</script`、`<!--` をエスケープし、その結果をテストが構文解析する。`ci:check` のテストは一時的な文書をビルドし、`package:verify` と PR ワークフローのバンドル版 CLI と単一実行ファイルの確認が、`examples/en` のビルドに表記が 1 回だけ現れることを確かめる
- [x] サイズの報告（[roadmap.md](roadmap.md) 20.5）は、表記を inline の Mermaid ランタイムの行に数える。報告がランタイムとして測る文字列の中にあり、それをテストが確かめる
- [x] 表記を入れた状態で、図が実際のブラウザで描かれる。実 Chromium のテストが、ビルドしたファイルから図を描き、ページエラーが無いことを確かめる

**Mermaid 12**（[roadmap.md](roadmap.md) 21.3、#134）

- [x] ELK の対応するソース——`elkjs` のバージョンと、それを生成した ELK のリビジョンとビルド設定——をバージョンとコミットで特定し、取得できることを確かめ、ランタイムの表記と `THIRD-PARTY-NOTICES.txt` に挙げる：`elkjs@0.9.3`。elkjs のタグ 0.9.3（`a8304cf`）で、ELK の master の `9bc93474` から、GWT 2.10.0、EMF for GWT 2.12.4、Guava 31.1-jre、Xtext 2.28.0、そして同じ ELK のツリーにソースがある ELK 自身のメタコンパイラとともにビルドされ、いずれも公開されている。バンドルは ELK のコミットを記録していない。ワーカーが master の `7ca51784` を含むので、リリース v0.9.1 ではない。そこから `9bc93474` までの変更はメタコンパイラだけである。ランタイムの表記はこれと、ELK の著作権表示、GWT が一緒にコンパイルしたもの（Xtext は EPL-2.0、EMF for GWT は EPL-1.0 で全文とソースの入手先つき、その中の Xerces 由来の部分は Apache Software License 1.1 で全文と求められる謝辞つき、Guava と GWT のランタイムは Apache-2.0）を書き、`THIRD-PARTY-NOTICES.txt` は末尾に同じ表記を持つ
- [x] `mermaid` を 12 にし、CDN ランタイムは `inline` と `pre-render` が使うのと同じ完全なバージョンを、`@12` ではなく固定して読み込む：`mermaid@^12.1.0`、CDN の URL は `mermaid@12.1.0`
- [x] 12.0.0 で取った [roadmap.md](roadmap.md) 21.3 の実測——`lodash-es`、サイズ、ELK——を、採用する 12.x の版で測り直して記録する（12.1.0 は `lodash-es` に依存しない）：[roadmap.md](roadmap.md) 21.3 に記録した。ランタイムが含むのは `lodash-es@4.18.1` だけで、無圧縮で 5.49 MB、gzip で 1.57 MB、表記は無圧縮で 153 KB、gzip で 25 KB を加える
- [x] `pnpm audit` が通る。脆弱な `lodash-es` がまだ解決されるなら、範囲を限った override のもとで通す。下限は `>=4.18.0`、コメントは GHSA-r5fr-rjxr-66jc と GHSA-f23m-r3pf-42rh と削除の条件を挙げ、[development.md](development.md) に英語と日本語で書く：`lodash-es` の override 無しで通るので、加えていない
- [x] ビルド済みの `mermaid.min.js` について、ソースマップのファイル一覧ではなく生成されたコードに対して、2 つの勧告が述べる実装を含まないこと、修正版だけを含むこと、またはどのコード経路からも到達しないことを示す：モジュール一覧とパーサーのチャンクのパスコメントは template・unset・omit のモジュールを挙げず、生成された `mermaid.min.js` には `_.template` の文字列リテラル（`templateSettings`、`sourceURL`）が無く、cytoscape が取り込む `lodash@4.17.21` は `debounce`、`memoize` とその補助である
- [x] サイトのライセンスのページ、`README.md`、`README.ja.md`、npm の README のライセンスの記述が、monodocs は MIT であり、同梱の Mermaid ランタイムは EPL-2.0 の `elkjs` を含み、inline ランタイムでビルドした HTML はそれを表記とともに埋め込み、文書の内容は影響を受けない、と書く。あわせて、ランタイムの中のいくつかのコードはライセンスを示していない出典から来ていることも書く
- [x] [roadmap.md](roadmap.md) 21.2 とサイトの設定リファレンスが、mermaid 12 とその inline の実測サイズを書く：表記を含めて gzip で 1.6 MB。21.2 は mermaid 12 を挙げる
- [x] [maintenance.md](maintenance.md) が、ロックファイルの監査はビルド済みバンドルの中を見られないことを書き、公開している見本があるので「`site/` は配布されない」とはもう書かない
- [x] サイトの見本を再生成し、表記を持つことを確かめる。`deploy-site.yml` が `scripts/site-build.sh` を通して、リリースタグからビルドした CLI（`packages/cli/dist/index.js`）で生成する。その CLI はテストが確かめているのと同じランタイムのスクリプトを出力する。リリースのデプロイ後に確かめる——デプロイされた両言語の `sample.html` は `monodocs v0.15.0` で生成され、`mermaid@12.1.0` の表記をちょうど 1 回持つ

**数式**（[roadmap.md](roadmap.md) 6.4）

- [x] v0.14 が測った数式を Markdown と AsciiDoc のフィクスチャとしてコミットし、以下の条件をどのマシンでも確かめられるようにする——`examples/math`。2 つのページは同じ 21 の数式を出し、警告なしにビルドされる（`build.math.test.ts`）
- [x] Markdown のインライン数式と別行立て数式の記法、および AsciiDoc の対応物を公開の場で決め、候補とそれが退けられた理由とともに [roadmap.md](roadmap.md) 6.4 に記録する。[roadmap.md](roadmap.md) 6.4 に表として挙げたお金の書き方は、記法自身の規則によって表の分類どおり（文字は文字のまま、数式は数式）になり、それを記法が従うレンダラに照らして確かめ、既存の文書が含みえて、選んだ記法によって意味が変わる書き方はすべてそこに挙げる。数式を既定で認識するかキーの後ろに置くかを理由とともにそこで決め、`asciimath` をどう扱うかを決めて書く：GitHub の 4 つの書き方（`$...$`、``$`...`$``、`$$...$$`、言語が `math` のフェンス）を GitHub の規則で読む。remark-math はそれを違って読むので、テストが固定する正解は 2026-10-06 に取得した GitHub の出力とする。`$5 and $10`、`$4.50/$5`、`$HOME and $PATH` は文字のまま残り、なお数式になる `Between $5 and 10$` などの形は表にした。`\$` は数式を区切らない（数式の外では `$`、中では TeX の `\$`）。GitHub と意図して食い違う点の 1 つで、GitHub の逃がし方は `<span>$</span>` だけだが、monodocs は生 HTML を捨てる。``$`...`$`` の外に `\$` を含む入力は GitHub に固定しないテストになる。GitHub 自身の `<span>$</span>` も、引き続き `$` を文字のまま残す。取得したのは GitHub のコメントの描き方で、API はファイルについて数式を描かない。AsciiDoc は `latexmath` を常に、`stem` は latexmath を意味するときに描く。既定で有効で、`math.enabled: false` で以前の出力に戻る。`asciimath` は診断を出して文字のまま残し、1.x の変換はキーの後ろに限る。その後、同じ日に取得した 2,782 件の入力で規則を測り、パーサは取得したすべてのケースを、明示した 2 つの食い違い（`\$` と、GitHub が記法を数式の中に書き換える、記法が混ざった `$$` の段落）と、monodocs が捨てる生 HTML を除いて再現する。GitHub と同じく、バックスラッシュのエスケープは数式を読む前に解決され、数式は空白の後に置く必要がある。[roadmap.md](roadmap.md) 6.4 に、候補とそれが退けられた理由、意味が変わる書き方を記録した
- [x] KaTeX のライセンスと、CLI バンドルとスタンドアロンバイナリに対するサイズを、追加する前に確かめて記録する。あわせて、その版を Mermaid ランタイムがすでに内包する KaTeX と揃えるかどうかと、表記がそれをどう挙げるかを記録する：KaTeX 0.16.47、MIT。Mermaid ランタイムが内包する版と同じで、テストが揃っていることを確かめ、`THIRD-PARTY-NOTICES.txt` とランタイムの告知に挙がる。Linux x64 で CLI バンドルと単体バイナリがそれぞれ 0.50 MiB 増える。[roadmap.md](roadmap.md) 6.4 に記録した
- [x] 数式はビルド時に MathML だけに描かれ、出力にスクリプトもスタイルシートも入らない。図も選んだ区切り記号も含まない既存のフィクスチャは以前と同じにビルドされ、それをテストが主張する——Markdown と AsciiDoc で完了（`build.math.test.ts` が `examples/ja` を数式の有効・無効でバイト単位で同じにビルドし、既存のテストは変えずに数式を既定で有効にしたまま通る。取り込んだ時点で `main` と比べると、`examples/ja` と `examples/en` の違いは、検索のハイライトが `MATH` を飛ばすようになったテーマのスクリプトだけで、後に、画面で別行立ての数式に横スクロールを与え、数式の背景を印刷するスタイルシートが加わった）
- [x] `\mathbf`、`\mathbb`、`\mathcal` など、KaTeX が `mathvariant` として書く書体は、その書体と文字に対応する Unicode の数学用英数字があれば、それとして出力される。無いとき（たとえば `\mathit{123}` の斜体の数字）は、黙って書体を失うのではなく、その数式が診断になる。どの書体と文字範囲を変換するかを [roadmap.md](roadmap.md) 6.4 に記録し、変換できる組み合わせ、変換できない組み合わせ、`normal` 以外の `mathvariant` が出力に届かないことを、テストが確かめる——両形式が共有する描画（`sources/mathRender.ts`）で完了し、[roadmap.md](roadmap.md) 6.4 に記録した。AsciiDoc の数式もそこへ届く
- [x] フォント検査が、Chromium が数式に描く文字を測り、`math` に選ばれたフォントが OpenType MATH テーブルを持たないときに報告する。数式のフィクスチャを MATH フォントの無い環境（v0.14 が測ったときの開発用イメージ）でビルドすると報告される——検査は完了した。1 文字の `math-auto` のトークンは MathML Core のイタリックの対応で描かれる文字として測り、描かれる数式が計算するフォントの並びごとに括弧が伸びるかを測って、伸びなければ `font/no-math-table` として報告する。開発用イメージでは数式の文字と MATH テーブルの不在が報告され、Latin Modern Math（CTAN の配布物一式を、テスト用に `app/packages/core/test-fixtures/fonts` に置く）では何も報告されない（`build.fontcheck.test.ts`）。数式のフィクスチャは、開発用イメージでビルドすると両方が報告され（`build.fontcheck.test.ts`）、Latin Modern Math ではどちらも報告されない
- [x] 数式には MATH フォントが要ることを、印刷するマシンと読者のブラウザの両方について、CI ガイドが CJK と絵文字のフォントを書いている場所に、英語と日本語で書く——CI ガイドは CJK と絵文字のフォントと並べて `fonts-lmodern` を入れ、その理由を書いた。設定のページは、`math` の下にこの要件を、`fontCheck` の下にフォント検査が数式の何を測るかを書いた
- [x] 読者が数式から何をコピーし、検索が何を索引するかを設計し、[roadmap.md](roadmap.md) 6.4 に記録し、テストする——設計を [roadmap.md](roadmap.md) 6.4 に記録した。コピーは各数式の書いたとおりのソースを運び（AsciiDoc は、Asciidoctor がその時点で `stem` を解決しているので `latexmath` として）、検索はその TeX を索引し、見出しの ID は Markdown なら TeX から、AsciiDoc なら Asciidoctor が作り、どちらも従来のままになる。実装してテストした：ページのスクリプトが、Markdown でも AsciiDoc でも、数式を含むコピーを自ら書き（選択が途中で始まる・終わる数式は全体を取り、コピーは表示中のページに限り、テキストは各数式のソース、別行立ての数式は独立した行、HTML は MathML を含む）、ページのデータは各数式の TeX とその節を挙げ、数式に一致した検索はその節を開く（`build.math.test.ts`、`build.math-chromium.test.ts`、`app.search.test.ts`）
- [x] KaTeX が解釈できない数式は、KaTeX のエラー表示ではなく、ファイルと数式を名指す診断になる——Markdown は完了（`math/parse-failed`、行を含む。KaTeX が `trust` の後ろに置くコマンドには `math/command-not-allowed`）。AsciiDoc でも完了（Asciidoctor の HTML は行を示せないので、行は付かない）
- [x] 数式のフィクスチャを、MATH フォントを入れた Linux と Windows で HTML と PDF に組み、どちらでも、変数とギリシャ文字に豆腐が無く、`\mathbb` と `\mathbf` が通常の変数と区別でき、伸びる括弧と根号が伸びる。v0.14 が測ったアクセントのずれと `aligned` の隙間は、直すか、受け入れたものとして [roadmap.md](roadmap.md) 6.4 に記録する——Latin Modern Math を入れた Linux では、[roadmap.md](roadmap.md) 6.4 に記録したとおり、豆腐は無く、書体の付いた文字は見分けられ、括弧と根号は伸び、`aligned` の隙間は無くなり、アクセントのずれは受け入れた（`\vec` は KaTeX が書く結合文字の矢印を Latin Modern Math が描く位置、ほかは Chromium がアクセントを文字の箱の中央に置くため）。Cambria Math の Windows で npm の `0.15.0-beta.1` でビルドしたもの：PDF は Cambria Math を埋め込み、文字に豆腐は無く、書体の付いた文字は見分けられ、括弧と根号は伸び、フィクスチャのアクセントはどれも文字の上に来て（`\vec` の矢印は中央、`\bar` は Latin-1 のアクセント）、`aligned` に隙間は無く、`、` で始まる行も無い。HTML は Edge で見た
- [x] [syntax.md](syntax.md) が、英語と日本語で記法を説明する——Markdown と AsciiDoc の形とその規則、出力が何で、何を要するか（MATH フォント）、描かないものを書いた

**リリース**

mermaid 12 では図を含む既存の文書がすべて違うものにビルドされるので、このリリースは 0.13.0 や 0.14.0 と違い、ベータを経る。

- [x] ドキュメントサイトの CI ガイド（英語・日本語とも）は、サイトがリリースからデプロイされるので、`v0.15.0` タグを作る前に、版の変更そのものの中で `monodocs@0.15.0` に固定する——`site/docs/ci.md` と `site/ja/docs/ci.md` の 4 か所ずつを、CLI を 0.15.0 に上げる変更の中で固定した
- [x] `verify-published.yml` に 0.15 のゲートと、ランタイムの表記と数式の段を加え、以下のどれよりも先にマージする——インラインのランタイムの script の中に表記が 1 回あり mermaid 12 を名指すこと、CDN のランタイム・pre-render・図の無いページには無いこと。Markdown と AsciiDoc の 5 つの数式が KaTeX のマークアップもスタイルシートも無い MathML になり、`mathvariant` は `normal` だけ、`\mathbb` はその文字になり、それぞれソースを持ち、`math.enabled: false` では無いこと、PDF が組めること、asciimath が `validate` を失敗させずに `math/asciimath-not-rendered` として報告されること。どちらもマージ前にここでビルドした CLI で走らせた
- [x] `0.15.0-beta.1` を npm の `next` タグに公開し、`verify-published.yml` を `dist_tag: next` で実行して Linux x64 と Windows x64 で検証する。ログが `verifying monodocs 0.15.0-beta.1` と出し、0.15 の段が飛ばされずに実行されたことを確かめる——`npm` 環境を承認したあと `v0.15.0-beta.1` タグで CI から provenance 付きで公開し、`next` を付けた（`latest` は 0.14.0 のまま）。`dist_tag: next` の実行は Linux x64 と Windows x64 で `verifying monodocs 0.15.0-beta.1` を出力し、0.15 の 2 つの段は両方で実行されて通った。PDF のフォント検査は、Linux では MATH テーブルの不在を警告し、MATH テーブルを持つ Cambria Math のある Windows では何も言わなかった。`verify-release-binaries.yml` は両プラットフォームで通った
- [x] ベータの間に、このリポジトリが公開している文書——`examples/en`、`examples/ja`、サイトの見本——をベータでビルドし、mermaid 12 でのすべての図を見る。読めなくなった図は、`0.15.0` を出す前に直すか記録する——ベータで `examples/en` と `examples/ja` をビルドし、それぞれ 3 つの図を Chromium で描いて 0.14.0 と比べた。どれも読める。mermaid 12 は、0.14.0 の薄紫の箱と曲線の代わりに、白地に濃い枠線の箱と直角に曲がる線を描き、横長の処理の流れの図ではラベルの一部を折り返し、SVG の幅が狭くなる（0.14.0 の 2,055px に対して 1,704px）ので、段の幅に縮めると文字が少し大きくなる。図が枠の左に寄ることと、横長の図が段の幅に縮むことは以前と同じ。直すものは無く、見た目の変化はリリースノートに書く。単一ファイルのサイトの見本は同じ examples から作る
- [x] 図の変化とライセンスの変化を書いたリリースノートとともに `0.15.0` を `latest` タグに公開し、`dist_tag: 0.15.0` で同じように検証する——`npm` 環境の承認後に `v0.15.0` タグで CI から provenance 付きで公開し、`latest` を付けた。リリースノートには図の変化とライセンスの変化を書いた。`dist_tag: 0.15.0` の実行は Linux x64 と Windows x64 で `verifying monodocs 0.15.0` を出力し、0.15 の 2 つの段は両方で実行されて通った
- [x] `verify-release-binaries.yml` で `v0.15.0` のリリースバイナリを両プラットフォームで検証する——公開時に走り、Linux x64 と Windows x64 で通った
- [ ] 公開した `v0.15.0` のアセットに対して、Windows 11 のホストで [`scripts/verify-windows-binary.ps1`](../../scripts/verify-windows-binary.ps1) を実行する——0.16.0 の確認で置き換える（v0.16）
- [x] 公開した `v0.15.0` のアセットに対して、Node.js の無い Linux x64 ホストで [`scripts/verify-linux-binary.sh`](../../scripts/verify-linux-binary.sh) を実行する（[maintenance.md](maintenance.md)）——Node.js の無い `debian:stable-slim` のコンテナで、公開した `v0.15.0` のアセットに対して実行し、16 項目すべて通った
- [x] リリースした Linux バイナリが生成した HTML を、目視ではなく操作して確かめる。このマイルストーンで新しいもの——mermaid 12 で図が描かれ、ソースに表記があること、MATH フォントで数式が描かれること——を含む——公開したアセットを `.sha256` で確かめ、最小の環境と Node.js 無しで `examples/en` と `examples/math` をビルドし、`fonts-lmodern` を入れた Chromium で出力を操作して 11 項目を確かめた。サイドバーの描画（20 のリンク）、リンクでの移動と現在のページの印、次へ、`mermaid` の検索（結果 4 件、開いたページでのハイライト 4 つ）、`Escape` による検索欄のクリア、再読み込み後のダークモード、375px でのドロワーの開閉、フッターの `monodocs v0.15.0`、スクリプトのエラーが無いこと、そして新しい 2 つ——mermaid 12 で描かれた図とソース中に 1 回の `mermaid@12.1.0` の表記、Latin Modern Math で描かれた 21 の数式（CDP の `getPlatformFontsForNode` で確認。行列の括弧は 3.2em に伸びた）
- [ ] Windows で人にしか答えられないこと。Edge で生成 HTML がどう見えるか（とりわけ日本語と数式）、数式を含む PDF を開いて印刷すること、`serve --open` が既定のブラウザを開くこと、ブラウザでダウンロードしたアセットの Mark of the Web と SmartScreen——一部は済んだ。ベータの間に、数式のフィクスチャの HTML を Edge で見て、数式を含む PDF を開いた（上記）。その印刷、`serve --open`、Mark of the Web と SmartScreen はまだである——0.16.0 の確認で置き換える（v0.16）
- [x] `next` の dist-tag を `0.15.0` へ動かし、デプロイされた CI ガイドが英語・日本語とも `monodocs@0.15.0` に固定されていることを確かめる——`next` と `latest` はどちらも `0.15.0` を指し、デプロイされた CI ガイドは両言語とも 4 か所で `monodocs@0.15.0` に固定されている

### v0.16: 1.0 の前に残っているもの

このマイルストーンは [roadmap.md](roadmap.md) が定義し、以下の一覧で追跡する。

**チェックリストとサンプル文書**（[roadmap.md](roadmap.md) 24.3.3）

- [x] AsciiDoc のチェックリストの各項目が、Markdown のタスクリストの項目と同じ要素と属性のチェックボックス（`<input type="checkbox" disabled>`、チェック済みなら `checked` 付き）を持ち、Asciidoctor の `❏` や `✓` が出力に届かない。`[%interactive]` が何を出すかを決めて書く。テストが両方を確かめ、[syntax.md](syntax.md) が英語と日本語でそう書く——renderer が、構文解析した文書のすべてのチェックリスト（入れ子のリストと `a|` セルの中を含む）に Asciidoctor の `interactive` オプションを付けて文字ではなく `<input>` を書かせ、そのチェックボックスに Markdown と同じ属性を与える。`[%interactive]` も無効にして描く。単一のファイルにはチェックを保存する場所が無いからである。`✓` で始まるように書いた項目は文字のまま残る（`sources/asciidoc/checklist.test.ts`）
- [x] Latin Modern Math を Chromium から使えるようにして PDF にビルドした `examples/en`、`examples/ja`、`examples/math` がフォントの警告を出さず、テストがそれを確かめる。意図して MATH フォントを入れていない開発用イメージでそのままビルドしたときは、残るフォントの報告が数式のものだけであり、テストがそれも確かめる。`examples/*/pdf.md` は `☒` そのものを書かず、[development.md](development.md) の注記は `☒` と `❏` を挙げる代わりにそう書く。英語と日本語で直す——`build.fontcheck.test.ts` が `examples/en` と `examples/ja` を両方の条件でビルドし（`examples/math` は以前から確かめている）、以前の `☒` や Asciidoctor の `❏` があると失敗する。`pdf.md` は豆腐を言葉で説明するようにした

**幅の広いアクセント**（[roadmap.md](roadmap.md) 6.4）

- [ ] 数式のフィクスチャが、Markdown と AsciiDoc の両方で `\acute`、`\grave`、`\widehat`、`\widetilde`、`\widecheck`、`\utilde`、`\overrightarrow`、`\overbrace` と `\underbrace` を含む
- [ ] Linux で Latin Modern Math を使って HTML と PDF にビルドし、[roadmap.md](roadmap.md) 6.4 の記録をフィクスチャの上で確かめ直す。6.4 に記録の無いもの（`\grave`、`\overrightarrow`、`\overbrace`、`\underbrace`）は、基底の上（または下）に来るか基底にわたるかを確かめ、そうならないものはそこに記録する
- [ ] Windows で Cambria Math を使って HTML と PDF にビルドし、どのアクセントも基底の上（`\utilde` と `\underbrace` は下）に来て、幅の広いものは基底の幅いっぱいに伸びるか、そうならないものを [roadmap.md](roadmap.md) 6.4 に記録する
- [ ] 直したものと受け入れたものを、[roadmap.md](roadmap.md) 6.4 と英語・日本語の [syntax.md](syntax.md) に書く

**asciimath**（[roadmap.md](roadmap.md) 6.4）

- [ ] 変換器のライセンス、CLI のバンドルとスタンドアロンバイナリでのサイズ、扱えない asciimath の形を、足す前に [roadmap.md](roadmap.md) 6.4 に記録し、`THIRD-PARTY-NOTICES.txt` に載せる
- [ ] asciimath を KaTeX を通して MathML に描き、latexmath と同じものを持つ。`mathvariant` の変換、書かれたとおりのソースのコピー、検索、変換できない数式への診断である。`math.enabled: false` は latexmath とともに asciimath も止める
- [ ] 既定で有効にするかを理由とともに [roadmap.md](roadmap.md) 6.4 で決め、`math/asciimath-not-rendered` をどうするかも、コードについての [roadmap.md](roadmap.md) 27.3 の約束のもとで決める。[syntax.md](syntax.md) が英語と日本語で説明する

**検索の畳み込み**（[roadmap.md](roadmap.md) 22.3）

- [ ] その場で畳む方式をトークンと原文の位置対応表に置き換え、v0.9 の畳み込みはそのまま成り立ち、半角カタカナを文書化した境界として一致させないテストは反転する
- [ ] 検索で `ｶﾞｲﾄﾞ` から `ガイド` が、`引き渡し` から `引渡し` が、それぞれ逆向きにも見つかり、`installing` と `installed` から `install` が見つかる。ハイライトと抜粋はページに書かれたとおりの文字列に付く。送り仮名の畳み込みがキーの後ろにあるなら、キーを有効にしたときに成り立つ。テストがそれぞれの畳み込みとその上のハイライトを確かめる
- [ ] 送り仮名の揺れをどう畳むかを、ほかの案と退けた理由とともに [roadmap.md](roadmap.md) 22.3 で選び、サイズ報告の `page data` と合計を `examples/ja` で前後に測って記録する。既定で有効にするなら、足すのは 100 KB 未満とする。それを超える方法はキーの後ろに置き、そのキーを列挙に加える

**1.0 の表面**（[roadmap.md](roadmap.md) 12.4、27.3）

- [ ] 既定値付きのすべての設定キー、すべてのコマンドとオプション、すべての診断コード、CommonMark・GFM・AsciiDoc を超えて monodocs が認識する記法を、サイトのリファレンスの 1 ページに英語と日本語で列挙し、`sidebar.exclude` は非推奨で 1.0 で削除するものとして載せる。テストがそのページをスキーマ、CLI、`DIAGNOSTIC_CODES` と双方向に、既定値も含めて比べる
- [ ] 列挙は、CI ジョブが固定するものとして診断 JSON の `schemaVersion: 1` を名指し、それを定義するコマンドのリファレンスへリンクする

**テスト**

- [ ] [testing.md](testing.md) が、新しいテストと反転したテストを英語と日本語で載せる

**リリース**

AsciiDoc のチェックリストと検索結果が既存の文書で変わり、既定で有効なら asciimath も変わるので、このリリースは 0.15.0 と同じくベータを経る。Windows で人が行う確認は 0.16.0 について行い、上で 0.13.0 から 0.15.0 に残っているものは別に行わず、それで置き換える。

- [ ] ドキュメントサイトの CI ガイドが、英語・日本語とも、`v0.16.0` タグを作る前のバージョン変更そのものの中で `monodocs@0.16.0` に固定する
- [ ] `verify-published.yml` に 0.16 の判定と、チェックリストのマークアップ、新しい検索の畳み込み、asciimath の新しい挙動を確かめる手順を足し、v0.15 の asciimath の手順は 0.15 に限り、以下より前にマージする。asciimath が文字のまま残ることを確かめる単体テストは書き換える
- [ ] `0.16.0-beta.1` を `next` タグで公開し、`dist_tag: next` で走らせた `verify-published.yml` で Linux x64 と Windows x64 で検証する。0.16 の手順が飛ばされずに走ったことを確かめる
- [ ] ベータ中に `examples/en`、`examples/ja`、`examples/math`、サイトのサンプルをベータでビルドし、チェックリスト、数式、検索を見る。読めなくなったものは `0.16.0` を切る前に直すか記録する
- [ ] `0.16.0` を `latest` タグで公開し、リリースノートに既存の文書で変わるものを書き、`dist_tag: 0.16.0` で同じように検証する
- [ ] `v0.16.0` のリリースバイナリを `verify-release-binaries.yml` で両プラットフォームについて検証する
- [ ] Node.js の無い Linux x64 ホストで、公開した `v0.16.0` のアセットに [`scripts/verify-linux-binary.sh`](../../scripts/verify-linux-binary.sh) を実行する
- [ ] Windows 11 ホストで、公開した `v0.16.0` のアセットに [`scripts/verify-windows-binary.ps1`](../../scripts/verify-windows-binary.ps1) を実行する
- [ ] リリースした Linux バイナリが生成した HTML を、目視ではなく操作して確かめる。チェックリストと新しい検索の畳み込みを含める
- [ ] 人にしか答えられない Windows での確認。生成した HTML の Edge での見え方（とりわけ日本語と数式）、透かし、`pdf.toc`、見出し番号、数式を含む PDF を開いて印刷し、目次の番号がシートと一致すること、`serve --open` が既定のブラウザを開くこと、ブラウザでダウンロードしたアセットに対する Mark of the Web と SmartScreen
- [ ] `next` の dist-tag を `0.16.0` に移し、デプロイした CI ガイドが英語・日本語とも `monodocs@0.16.0` に固定していることを確かめる

### 1.0

このリリースは [roadmap.md](roadmap.md) が定義し、v0.16 のリリース後に始める。

- [ ] `sidebar.exclude` が、`sources.exclude` を名指すメッセージとともに未知のキーとして拒否され、列挙から消える
- [ ] 列挙のテストが通り、ドキュメントを英語と日本語でコードと突き合わせる。リファレンスにスキーマの持たないキーは無く、[architecture.md](architecture.md) にコードのしない挙動は無い

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
