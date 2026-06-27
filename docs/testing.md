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

`app/` ディレクトリで実行する。

```bash
cd app
pnpm test         # 一括実行（vitest run）
pnpm test:watch   # ウォッチ
```

Docker のみで実行する場合:

```bash
docker run --rm -v "$PWD":/work -w /work/app node:22-bookworm \
  bash -lc "corepack enable && pnpm install && pnpm test"
```

## テスト結果（2026-06-27 時点）

| 項目          | 結果        |
| ------------- | ----------- |
| Test Files    | 11 passed   |
| Tests         | 35 passed   |
| typecheck     | 通過        |
| format:check  | 通過        |

主なテスト対象:

- `route.test.ts` … route / page id 生成
- `sources/detectFormat.test.ts` … 拡張子からの形式判定
- `sources/markdown/renderer.test.ts` … Markdown 変換・H1 抽出・見出し ID prefix・GFM
- `sources/asciidoc/renderer.test.ts` … AsciiDoc 変換・タイトル抽出・xref 書き換え
- `pipeline/buildPages.test.ts` … route / page id の重複検知
- `pipeline/buildSidebar.test.ts` … フォルダ構造サイドバー
- `pipeline/renderSingleHtml.test.ts` … href エンコード・HTML エスケープ
- `themes/default/app.test.ts` … クライアント hash routing（happy-dom）
- `build.test.ts` / `build.mixed.test.ts` … e2e（Markdown 単体 / 混在）
