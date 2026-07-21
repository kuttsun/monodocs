# 技術スタック

[English](../tech-stack.md)

| 区分                | 採用                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| 言語 / ランタイム   | TypeScript 6（NodeNext / strict）、Node.js 22 LTS                                                         |
| パッケージ管理      | pnpm 11 workspace（corepack 経由）                                                                        |
| Markdown 変換       | unified / remark-parse / remark-gfm / remark-frontmatter / remark-rehype / rehype-slug / rehype-stringify |
| AsciiDoc 変換       | @asciidoctor/core 4（ネイティブ ESM・async API）+ rehype-parse による後処理                               |
| HTML / テキスト処理 | hast-util-to-text / unist-util-visit / mdast-util-to-string                                               |
| 設定ファイル        | yaml + zod                                                                                                |
| ファイル走査        | picomatch（除外 glob）                                                                                    |
| テスト              | vitest 4（DOM テストは happy-dom）                                                                        |
| 整形                | Prettier 3                                                                                                |

## バージョン方針

- Node.js は LTS（現在 22）に合わせる。`@types/node` も同系列（`^22`）に揃える。
- 依存は基本的に caret（`^`）で指定し、`pnpm-lock.yaml` で固定する。
- pnpm は `app/package.json` の `packageManager` フィールドで固定し、corepack で解決する。
- pnpm 11 のサプライチェーン保護によりビルドスクリプトは既定で拒否されるため、
  必要なものだけ `app/pnpm-workspace.yaml` の `allowBuilds` で明示許可する（例: `esbuild`）。

## 補足

- TypeScript 6 では Node グローバル型が自動取り込みされないため、
  `app/tsconfig.base.json` で `types: ["node"]` を明示している。
- テーマアセット（`*.html` / `*.css` / `*.js`）は tsc がコピーしないため、
  build 時に `app/packages/core/scripts/copy-theme.mjs` で `dist/` へコピーする。
- HTML テンプレート `template.html` はプレースホルダ（`{{appJs}}` 等）を
  Prettier が壊すため、整形対象から除外している。
