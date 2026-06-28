# 実装状況

最終更新: 2026-06-27

## 対応状況

| 機能                                | 状態    | 対象バージョン |
| ----------------------------------- | ------- | -------------- |
| 開発環境（devcontainer / monorepo） | ✅ 完了 | -              |
| Markdown → 単一 HTML（MVP）         | ✅ 完了 | v0.1           |
| AsciiDoc 対応・混在対応             | ✅ 完了 | v0.2           |
| リンク変換 / 画像埋め込み / Mermaid | ✅ 完了 | v0.3           |
| 検索 / 目次 / watch / serve         | ✅ 完了 | v0.4           |
| PDF 出力                            | 🚧 予定 | v0.5           |
| npm / Docker / GitHub Actions       | 🚧 予定 | v0.6           |
| VS Code 拡張                        | 🚧 予定 | v0.7           |

## 完了条件の達成状況

### v0.1: Markdown 単一 HTML MVP

- [x] `single-docs build ./docs -o ./dist/manual.html` が動作する
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
- [x] Markdown / AsciiDoc の Mermaid を表示できる（client mode、ランタイムは CDN / inline 切替）
- [x] frontmatter / `:sd-*:` により order・hidden・description を制御できる
- [x] validate でリンク切れ・画像欠落・タイトル欠落を検出できる

### v0.4: HTML ドキュメントサイト機能強化

- [x] HTML 内検索ができる（タイトル・見出し・本文の部分一致。サイドバーの検索ボックス）
- [x] ページ内目次（h2 / h3）が表示される
- [x] 前後ページナビゲーションを表示する（hidden ページは除外）
- [x] サイドバーを折りたたみできる（全体トグル＋ディレクトリ単位の開閉）
- [x] ダークモードに対応（OS 設定に追従。手動切替は localStorage に保存）
- [x] 印刷時に全ページを縦に展開する print 用レイアウト（`@media print`）
- [x] `single-docs watch` で入力・設定の変更を監視して再ビルドできる
- [x] `single-docs serve` でローカルプレビューできる（変更検出でライブリロード）

## 対応記法

Markdown / AsciiDoc の対応記法と、単一 HTML 化に伴う非対応・制限は [syntax.md](syntax.md) に
仕様としてまとめている（脚注の ID 衝突回避・ページ内アンカー処理を含む）。

## 既知の未対応 / 制限（今後のバージョンで対応）

- コードハイライト（shiki）に対応（`highlight.enabled: false` で無効化可。dual theme でダークモード追従）
- 見出し単位のファイル間リンク（`file.md#見出し` / `xref:other.adoc#sec`）はファイル単位までの解決
  （別ファイルの見出しアンカーは未対応。同一ページ内のアンカー・脚注は機能する）
- 検索は部分一致のみ（スコアリング・複数キーワード・日本語分かち書きは v0.8 で改善予定）
- `watch` / `serve` の監視は `fs.watch`（可能なら recursive）を利用。設定で `input` を
  変更した場合は再起動が必要
- PDF 出力は未対応（v0.5）。出力形式は HTML のみ（`--format pdf` / `both` はエラー）
- 入力は信頼できるドキュメントを前提（AsciiDoc の生 HTML をサニタイズしない。
  詳細は [development.md](development.md)）
