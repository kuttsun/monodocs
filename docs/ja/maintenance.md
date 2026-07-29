# メンテナンス

[English](../maintenance.md)

リリース後に回り続けるものと、人が確認しなければならないもの。[oss-npm-roadmap.md](oss-npm-roadmap.md) の
M6 の運用面にあたる。方針そのものはそちらに置く。

## 自動で回っているもの

| 対象                     | 仕組み                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------- |
| 通常のバージョン更新     | Dependabot（月次。`github-actions` / `app/`（pnpm）/ `site/`（npm））                  |
| 脆弱なバージョンの検知   | Dependabot alerts と automated security fixes（リポジトリ設定で有効）                  |
| 依存ツリーへの advisory  | `.github/workflows/scheduled-audit.yml`（週次。失敗時に Issue を作成）                 |
| プルリクエストの検査     | `.github/workflows/pr-ci.yml`（両方の依存セットの audit も実行）                       |
| 公開済みパッケージの検証 | `.github/workflows/verify-published.yml`（dist-tag / バージョンを指定して手動実行）    |

定期 audit を別に持つのは、PR CI の audit が PR のあるときしか走らないためである。インストールせずに
コミット済み lockfile を読むので、失敗はインストールの問題ではなく advisory を意味する。Dependabot
alert とは重複しない。alert が依存グラフと GitHub の advisory database を突き合わせるのに対し、
`pnpm audit` はこのリポジトリの `overrides` を効かせた実際の解決結果を見る。

## 四半期ごとの棚卸し

以下はいずれも自動化できないため、心がけではなく日付を持たせる。四半期に一度通しで実施し、結果は
各項目が指す場所に記録する。

- [ ] **定期ワークフローが止まっていないこと。** GitHub は 60 日 activity の無いリポジトリの cron を
      停止する。`Scheduled Audit` に直近の実行があるか確認し、止まっていれば再度有効にする。
- [ ] **Dependabot のプルリクエスト。** 1 サイクル以上放置されているものが無く、CI が黙って落ちて
      いるものも無いこと。
- [ ] **未対応の alert。** Dependabot alerts をトリアージし、open のまま残すものには理由を残す。
- [ ] **セキュリティ override。** [development.md](development.md) に記録した 2 件の override を
      削除条件と突き合わせ、結論が変わらなかった場合も「再点検した日付」を更新する。
- [ ] **npm の maintainer。** `monodocs` を publish できるアカウントが意図したものだけであり、
      いずれも 2FA が有効であること。
- [ ] **Trusted Publisher。** npm 側の設定が、現在のリポジトリ・`release.yml`・リリース用
      environment を指していること。3 つのいずれかを改名すると publish は黙って壊れ、次のリリース
      まで気づけない。
- [ ] **Node.js / Chromium のサポート範囲。** 下限は Node 22.12。Node 22 は 2027 年 4 月に LTS を
      終えるため、それまでに引き上げるかを決める。[ci.md](../../site/ja/docs/ci.md) に書いた Chromium の
      検出パスが、サポート対象プラットフォームの実際のインストール先と合っているかも確認する。
- [ ] **dist-tag と EOL。** `latest` / `next` が意図した先を指し、古い prerelease が `next` に
      残っていないこと。[SECURITY.md](../../SECURITY.ja.md) の方針でサポート外になった minor は、
      リリースノートでその旨を告知済みであること。
- [ ] **優先順位。** open な Issue と npm のダウンロード数を見て、ロードマップだけでなくそれらに
      次の作業を決めさせる。

## audit や alert が上がったとき

1. その指摘が利用者に届くかを判断する。`site/` は配布物に入らず、`app/` にも dev 専用で公開バンドルに
   含まれない依存がある。その判断の根拠を残す。黙って閉じない。
2. [SECURITY.md](../../SECURITY.ja.md) のとおり、Critical / High を他の作業より優先する。
3. 修正版がまだ無い場合は、削除条件をコメントに書いた最小限の `overrides` を選び、上の四半期棚卸しの
   対象に加える。
4. 修正は patch としてリリースする。公開済みバージョンを作り直さない。
