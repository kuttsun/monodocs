# 実装状況

[English](../status.md)

最終更新: 2026-07-28

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
| 高度な機能（検索・テーマ・バイナリ）| 🚧 進行中 | v0.8           |

VS Code 拡張は凍結しており、着手予定はない。需要が分からず、リリースと Marketplace の運用が単独
メンテナンス体制に対して重く、拡張と `@monodocs/core` の境界も未決定であるため。理由は
[roadmap.md](roadmap.md) の v0.7 に記録しており、次のマイルストーンは v0.8 とする。

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
  ハイライトに対応（v0.8）。部分一致のため日本語に分かち書きは不要だが、畳み込みは大文字小文字と
  全角英数字のみで、ひらがな／カタカナや送り仮名の揺れは吸収しない。英語のステミングも無いため、
  `install` は `installing` を含むページに一致するが、`installing` は `install` としか書かれていない
  ページには一致しない
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
  出す場合は使う文字種に応じたフォントを入れる（HTML はブラウザのフォントで表示するため影響なし）
- 入力は信頼できるドキュメントを前提（AsciiDoc の生 HTML をサニタイズしない。
  詳細は [development.md](development.md)）
