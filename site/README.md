# monodocs site

monodocs 公式サイト（ランディング + ドキュメント）。**VitePress** で構築し、GitHub Pages / GitLab Pages のどちらでも配信できる静的出力を生成する。

`app/`（ツール本体の pnpm workspace）とは独立したスタンドアロン npm パッケージ。ビルドはすべて Docker 内で行い、ホストに Node / npm を入れる必要はない。

## 構成

```
site/
  .vitepress/config.ts   ロケール（英=ルート / 日=/ja/）・ローカル検索・base 切替
  index.md               英語ランディング
  ja/index.md            日本語ランディング
  docs/                  英語ドキュメント
  ja/docs/               日本語ドキュメント
  public/manual.html     monodocs 自身で生成する単一 HTML デモ（生成物・git 管理外）
```

## 言語

英語をルート（既定）ロケールにしているため、`/ja/` 以外のパスはすべて英語で配信される（日本語以外は英語にフォールバック）。

## 開発・ビルド（ホスト側 / Docker）

手軽にローカルプレビュー（依存導入・デモ生成・dev サーバ起動をまとめて実行）:

```bash
scripts/site-dev.sh                      # 開発サーバ http://localhost:5173/（HMR）
```

個別ステップで実行する場合:

```bash
scripts/site.sh npm install              # 依存インストール
scripts/site.sh npm run docs:dev         # 開発サーバ http://localhost:5173/
scripts/site.sh npm run docs:build       # 本番ビルド -> site/.vitepress/dist/
scripts/site.sh npm run docs:preview     # ビルド結果をプレビュー http://localhost:4173/
```

単一 HTML デモ（`public/manual.html`）も含めてまとめてビルドする:

```bash
scripts/site-build.sh                    # CLI ビルド -> manual.html 生成 -> VitePress ビルド
scripts/site-build.sh preview            # ↑ + プレビュー起動
```

## 公開先（base パス）

GitHub / GitLab の **project pages はサブパス配信**（例: `https://kuttsun.gitlab.io/monodocs/`）なので、ビルド時に `SITE_BASE` を渡す。独自ドメイン / user pages なら不要（既定 `/`）。

```bash
SITE_BASE=/monodocs/ scripts/site-build.sh
```
