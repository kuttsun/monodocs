#!/usr/bin/env bash
#
# monodocs 公式サイト（VitePress / site/）を開発モードでローカルプレビューするショートカット。
# 依存インストール（初回のみ）と併載デモ（単一 HTML サンプル・版面密度の比較）の生成（欠落時のみ）を
# 自動で済ませてから、HMR 付きの dev サーバを起動する。中身は scripts/site.sh /
# scripts/app.sh に委譲するので、Docker イメージのビルドやポート公開はそちらが面倒を見る。
#
# 本番相当（静的ビルド）を確認したいときは scripts/site-build.sh preview を使う。
#
# 例:
#   scripts/site-dev.sh                # 依存導入(初回) + デモ生成(欠落時) + dev サーバ起動
#   SITE_DEMOS=1 scripts/site-dev.sh   # 併載デモ(sample.html・密度サンプル)を毎回作り直してから起動
#   SITE_DEMOS=0 scripts/site-dev.sh   # デモ生成を完全にスキップ（サイト本文だけを素早く確認）
#
# 起動後、ホストのブラウザで http://localhost:5173/ を開く（止めるときは Ctrl+C）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/scripts/site.sh"
APP="$ROOT/scripts/app.sh"

# 依存が未インストールなら install（site/node_modules があればスキップ）。
# 依存を更新したいときは `scripts/site.sh npm install` を明示実行する。
if [ ! -d "$ROOT/site/node_modules" ]; then
  echo "[site-dev] site の依存をインストール"
  "$SITE" npm install
fi

# 併載デモ（CLI で生成する単一 HTML サンプル）の生成方針。
#   未指定(auto): 生成物が欠落しているときだけ作る（初回は完全・再実行は高速）
#   1: 毎回作り直す  /  0: 生成しない（サイト本文の確認だけ）
need_demos=0
case "${SITE_DEMOS:-auto}" in
  0) need_demos=0 ;;
  1) need_demos=1 ;;
  *)
    # 密度サンプルもここで見る。欠けていると設定リファレンスの比較が画像切れになる。
    # 数を数えるのではなく 16 個（4 密度 × 英日 × PDF と PNG）を名指しで確かめる。
    # 途中で失敗した生成を「済み」と読まないためであり、数え方だと古い置き忘れが
    # 欠落を埋めてしまうため。
    if [ ! -f "$ROOT/site/public/sample.html" ] || [ ! -f "$ROOT/site/public/ja/sample.html" ]; then
      need_demos=1
    fi
    for density in relaxed normal compact tight; do
      for dir in "site/public/density" "site/public/ja/density"; do
        for ext in pdf png; do
          if [ ! -f "$ROOT/$dir/$density.$ext" ]; then need_demos=1; fi
        done
      done
    done
    ;;
esac

if [ "$need_demos" = "1" ]; then
  echo "[site-dev] 併載デモを生成（英 -> sample.html / 日 -> ja/sample.html）"
  # CLI を動かすには app/ の依存も要る（app.sh は自動インストールしないため、
  # app-serve.sh / app-build.sh と同じく未インストール時だけ install する）。
  if [ ! -d "$ROOT/app/node_modules" ]; then
    echo "[site-dev] app の依存をインストール"
    "$APP" pnpm install
  fi
  "$APP" pnpm build
  mkdir -p "$ROOT/site/public/ja"
  # app.sh は /work/app 基準で動くため、examples も site もルート直下＝../ を付けて渡す。
  "$APP" node packages/cli/dist/index.js build ../examples/en -o ../site/public/sample.html
  "$APP" node packages/cli/dist/index.js build ../examples/ja -o ../site/public/ja/sample.html
  echo "[site-dev] 版面密度の比較サンプルを生成（PDF 4 段 + 1 ページ目のサムネイル）"
  "$ROOT/scripts/site-density.sh"
fi

echo "[site-dev] dev サーバを起動します（http://localhost:5173/）。Ctrl+C で停止。"
exec "$SITE" npm run docs:dev
