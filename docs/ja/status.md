# 実装状況

[English](../status.md)

最終更新: 2026-07-23

## 対応状況

| 機能                                | 状態      | 対象バージョン |
| ----------------------------------- | --------- | -------------- |
| 開発環境（devcontainer / monorepo） | ✅ 完了   | -              |
| Markdown → 単一 HTML（MVP）         | ✅ 完了   | v0.1           |
| AsciiDoc 対応・混在対応             | ✅ 完了   | v0.2           |
| リンク変換 / 画像埋め込み / Mermaid | ✅ 完了   | v0.3           |
| 検索 / 目次 / watch / serve         | ✅ 完了   | v0.4           |
| PDF 出力                            | ✅ 完了   | v0.5           |
| npm / GitHub Actions                | 🚧 進行中 | v0.6           |
| VS Code 拡張                        | 🚧 予定   | v0.7           |

## 完了条件の達成状況

### v0.1: Markdown 単一 HTML MVP

- [x] `monodocs build ./docs -o ./dist/manual.html` が動作する
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

- [x] `monodocs build --format pdf -o ./dist/manual.pdf` で単一 HTML を経由して PDF を生成できる（ヘッドレス Chromium。print 用レイアウトで全ページを縦展開）
- [x] `--format both` で HTML と PDF を同時出力できる（`-o` はディレクトリ扱いで `manual.html` / `manual.pdf` を出力）
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

- [x] 公開方針、対応環境、npm package 境界、0.x のサポート方針を定義
- [x] コントリビューション・セキュリティ方針、bug・feature・pull request template を用意
- [x] Linux x64 / Windows x64 の Pull Request CI で format、build、typecheck、test、bundle、dependency audit、license notice を検証
- [x] Linux x64 / Windows x64 の CI で HTML、validate、PDF、Mermaid pre-render を smoke test
- [x] `workspace:*` 依存を含まない allowlist 方式の npm tarball staging を生成
- [x] staged `0.6.0-beta.1` tarball をローカルインストールし HTML、PDF、validate、Mermaid pre-render、serve を smoke test
- [x] Linux x64 / Windows x64 の CI で実際の npm tarball を install・smoke test
- [x] version/tag validation、release approval、OIDC、provenance を備えた GitHub Release 起点の npm publish workflow を準備
- [ ] リポジトリの security・branch protection 設定を完了
- [ ] npm Trusted Publishing、release approval、provenance、maintainer 2FA を設定
- [ ] `next` tag で `0.6.0-beta.1` を公開・検証
- [ ] stable `0.6.0` を公開・検証

## 対応記法

Markdown / AsciiDoc の対応記法と、単一 HTML 化に伴う非対応・制限は [syntax.md](syntax.md) に
仕様としてまとめている（脚注の ID 衝突回避・ページ内アンカー処理を含む）。Markdown の GFM alerts
（`> [!NOTE]` など）と AsciiDoc の admonition は共通の `.admonition` 構造へ正規化して表示する。

## 既知の未対応 / 制限（今後のバージョンで対応）

- コードハイライト（shiki）に対応（`highlight.enabled: false` で無効化可。dual theme でダークモード追従）
- 見出し単位のファイル間リンク（`file.md#見出し` / `xref:other.adoc#sec`）はファイル単位までの解決
  （別ファイルの見出しアンカーは未対応。同一ページ内のアンカー・脚注は機能する）
- 検索は部分一致のみ（スコアリング・複数キーワード・日本語分かち書きは v0.8 で改善予定）
- `watch` / `serve` の監視は `fs.watch`（可能なら recursive）を利用。設定で `input` を
  変更した場合は再起動が必要
- PDF 出力に対応（v0.5。`--format pdf` / `both`）。ヘッドレス Chromium を使うため実行環境に
  Chromium が必要で、バンドル版 CLI（単一 `.cjs` / 単一実行ファイル）では利用不可（パッケージ
  インストール版が必要）。Mermaid を `cdn` runtime にした場合、PDF 化時はネットワークが必要
  （オフライン確実にするには `inline` または `pre-render` を使う）
- **PDF のフォントは実行環境のシステムフォントを使う**。本文に出す文字種のフォントが無いと
  PDF で豆腐（□ / ☒）になる（例: 絵文字 ✅ は絵文字フォントが必要）。開発用 Docker には
  `fonts-noto-cjk`（日本語）＋ `fonts-noto-color-emoji`（絵文字）を同梱済み。自前環境で PDF を
  出す場合は使う文字種に応じたフォントを入れる（HTML はブラウザのフォントで表示するため影響なし）
- 入力は信頼できるドキュメントを前提（AsciiDoc の生 HTML をサニタイズしない。
  詳細は [development.md](development.md)）
