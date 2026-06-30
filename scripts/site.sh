#!/usr/bin/env bash
#
# monodocs 公式サイト（VitePress / site/）を専用 Docker イメージ内で実行するヘルパー。
# ホストに Node / npm を入れずに dev / build / preview できる。
#
# site/ は app/ の pnpm workspace とは独立した npm パッケージなので、scripts/dev.sh とは
# 別に -w /work/site で実行する（イメージは pnpm 焼き込みの monodocs-dev を流用。Node 22
# 同梱なので npm がそのまま使える）。
#
# 例:
#   scripts/site.sh npm install
#   scripts/site.sh npm run docs:dev        # http://localhost:5173/
#   scripts/site.sh npm run docs:build      # site/.vitepress/dist/
#   scripts/site.sh npm run docs:preview    # http://localhost:4173/
#
# project pages 等でサブパス配信する場合は SITE_BASE を渡す:
#   SITE_BASE=/monodocs/ scripts/site.sh npm run docs:build
set -euo pipefail

IMAGE="monodocs-dev"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# イメージが無ければ Dockerfile.dev からビルドする（scripts/dev.sh と同一イメージ）。
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE from Dockerfile.dev ..." >&2
  docker build -f "$ROOT/Dockerfile.dev" -t "$IMAGE" "$ROOT"
fi

# 生成物（node_modules / dist 等）をホストユーザー所有で書き込むため呼び出しユーザーで実行し、
# HOME は任意 uid でも書き込める /tmp に向ける（npm のキャッシュ等用）。
args=(run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp)

# SITE_BASE を渡されていればコンテナへ引き継ぐ（VitePress の base 切替）。
if [ -n "${SITE_BASE:-}" ]; then args+=(-e "SITE_BASE=${SITE_BASE}"); fi

# 対話端末があれば -it、無ければ（CI 等）-i のみ。
if [ -t 0 ] && [ -t 1 ]; then args+=(-it); else args+=(-i); fi

# dev / preview のときだけ VitePress のポートを公開する（build がポート競合で失敗しないように）。
for arg in "$@"; do
  case "$arg" in
    docs:dev) args+=(-p 5173:5173) ;;
    docs:preview) args+=(-p 4173:4173) ;;
  esac
done

args+=(-v "$ROOT:/work" -w /work/site "$IMAGE" "$@")

exec docker "${args[@]}"
