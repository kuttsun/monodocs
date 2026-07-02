# テスト

## 方針

- テストランナーは [vitest](https://vitest.dev/) を使用する。
- 種類:
  - **ユニットテスト**: route 生成 / format 判定 / 各 SourceRenderer / サイドバー生成 など
  - **e2e テスト**: 一時ディレクトリに Markdown / AsciiDoc を生成し、`buildSite()` で
    単一 HTML を出力して内容を検証する
  - **クライアントテスト**: happy-dom 上でテーマの `app.js` を実行し、hash route による
    ページ切り替え（encode/decode 整合）を検証する
- 検証はすべて Docker / devcontainer 内で実行し、ホスト環境を汚さない。

## 実行方法

専用イメージ（[development.md](development.md) 参照）でホストから実行する。

```bash
scripts/app.sh pnpm test         # 一括実行（vitest run）
scripts/app.sh pnpm test:watch   # ウォッチ
```

`docker run` を直接使う場合:

```bash
docker run --rm -v "$PWD":/work -w /work/app monodocs-dev pnpm test
```

devcontainer 内、またはコンテナのシェルに入っている場合は `app/` で `pnpm test` を直接実行できる。

## テスト結果（2026-06-27 時点）

| 項目         | 結果      |
| ------------ | --------- |
| Test Files   | 18 passed |
| Tests        | 82 passed |
| typecheck    | 通過      |
| format:check | 通過      |

主なテスト対象:

- `route.test.ts` … route / page id 生成
- `sources/detectFormat.test.ts` … 拡張子からの形式判定
- `sources/meta.test.ts` … frontmatter / `:sd-*:` メタデータの正規化
- `sources/markdown/renderer.test.ts` … Markdown 変換・H1 / frontmatter 抽出・見出し/脚注の ID prefix・GFM
- `sources/asciidoc/renderer.test.ts` … AsciiDoc 変換・タイトル / `:sd-*:` 抽出・xref 書き換え
- `sources/prefixIds.ts` … 全要素 ID の prefix・アンカー書き換え（Markdown/AsciiDoc 共通。各 renderer テストで間接検証）
- `scan.test.ts` … 拡張子マップによる走査・カスタム拡張子・除外
- `pipeline/buildPages.test.ts` … route / page id の重複検知
- `pipeline/buildSidebar.test.ts` … フォルダ構造サイドバー
- `pipeline/postprocess.test.ts` … リンク変換・画像 data URI 埋め込み・Mermaid 変換（client / pre-render の SVG 化・グローバル一意 id・複雑 SVG の verbatim 保持・図単位エラーのソースフォールバック・環境エラー `MermaidPrerenderSetupError` の fail fast・renderer 未注入エラー）・shiki コードハイライト・admonition / GFM alert の共通構造化
- `pipeline/renderSingleHtml.test.ts` … href エンコード・HTML エスケープ・クライアント用ページデータ（目次/検索）
- `themes/default/app.test.ts` … クライアント hash routing（happy-dom）
- `themes/default/app.v04.test.ts` … 検索・ページ内目次・前後ナビ・ダークモード・サイドバー折りたたみ・コードブロックのコピー/折り返しトグル（happy-dom）
- `build.test.ts` / `build.mixed.test.ts` / `build.v03.test.ts` … e2e（Markdown / 混在 / v0.3 機能・validate）
- `build.mermaid-prerender.test.ts` … Mermaid pre-render（偽レンダラ注入で config 連携・SVG 埋め込みを検証。実 Chromium がある環境でだけ end-to-end 描画とランタイム未注入ゲートを確認）
- `build.v04.test.ts` … e2e（`watchSite` の再ビルド・`serveSite` の配信とライブリロード注入）
