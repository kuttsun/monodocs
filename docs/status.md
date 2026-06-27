# 実装状況

最終更新: 2026-06-27

## 対応状況

| 機能                                | 状態    | 対象バージョン |
| ----------------------------------- | ------- | -------------- |
| 開発環境（devcontainer / monorepo） | ✅ 完了 | -              |
| Markdown → 単一 HTML（MVP）         | ✅ 完了 | v0.1           |
| AsciiDoc 対応・混在対応             | ✅ 完了 | v0.2           |
| リンク変換 / 画像埋め込み / Mermaid | 🚧 予定 | v0.3           |
| 検索 / 目次 / watch / serve         | 🚧 予定 | v0.4           |
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

## 既知の未対応 / 制限（今後のバージョンで対応）

- ファイル間のリンク変換（Markdown の `.md`/`.adoc` リンク、AsciiDoc のファイル間 xref）は未対応（v0.3）
- 画像の data URI 埋め込みは未対応（v0.3）
- Mermaid のレンダリングは未対応（コードブロックとして表示）（v0.3）
- frontmatter / `:sd-*:` による order・hidden・description 制御は未対応（v0.3）
- PDF 出力は未対応（v0.5）
- 出力形式は HTML のみ（`--format pdf` / `both` はエラー）
