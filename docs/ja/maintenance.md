# メンテナンス

[English](../maintenance.md)

リリース後に回り続けるものと、人が確認しなければならないもの。[oss-npm-roadmap.md](oss-npm-roadmap.md) の
M6 の運用面にあたる。方針そのものはそちらに置く。

## 自動で回っているもの

| 対象                     | 仕組み                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------- |
| 通常のバージョン更新     | Dependabot（月次。`github-actions` / `app/`（pnpm）/ `site/`（npm））                 |
| 脆弱なバージョンの検知   | Dependabot alerts と automated security fixes（リポジトリ設定で有効）                 |
| 依存ツリーへの advisory  | `.github/workflows/scheduled-audit.yml`（週次。失敗時に Issue を作成）                |
| プルリクエストの検査     | `.github/workflows/pr-ci.yml`（両方の依存セットの audit も実行）                      |
| 公開済みパッケージの検証 | `.github/workflows/verify-published.yml`（dist-tag / バージョンを指定して手動実行）   |
| 棚卸しのリマインダ       | `.github/workflows/quarterly-review.yml`（四半期のチェックリストを Issue として作成） |

定期 audit を別に持つのは、PR CI の audit が PR のあるときしか走らないためである。インストールせずに
コミット済み lockfile を読むので、失敗はインストールの問題ではなく advisory を意味する。Dependabot
alert とは重複しない。alert が依存グラフと GitHub の advisory database を突き合わせるのに対し、
`pnpm audit` はこのリポジトリの `overrides` を効かせた実際の解決結果を見る。

## リリースバイナリの検証

`verify-published.yml` が見るのは公開済みの npm パッケージであり、リリースバイナリと長時間動作する
コマンドは対象外である。これらはリリースごとに実機の Windows x64 で検証する。要点は、公開した資材
そのものが Node.js 無しで動くことであり、これはこのリポジトリのどの CI ジョブも行っていない。

この検証は [`scripts/verify-windows-binary.ps1`](../../scripts/verify-windows-binary.ps1) が自動化
する。`monodocs-windows-x64.exe` を取得して公開済みの `.sha256` と照合し、CLI の確認に加えて
`serve` / `watch` を実行する。ライブリロードの確認は SSE エンドポイントを直接読むため、編集が再ビルド
に届くことの確認にブラウザを必要としない。各確認の結果を一覧で報告し、1 つでも失敗すれば非 0 で終了
する。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-windows-binary.ps1 -Version v0.9.0
```

次の 3 つは、スクリプトでは決着しないため手作業のまま残す。

- ブラウザでの表示。サイドバー、検索の操作、ダークモード、狭い画面でのドロワー。
- SmartScreen と Mark of the Web。スクリプトのダウンロードは Mark of the Web を付けないため、警告を
  試したことにはならない。バイナリは方針として署名しておらず（[roadmap.md](roadmap.md) 8.5）、
  サイトでも注意喚起している。[status.md](status.md) を参照。
- 既定のブラウザを開く `serve --open`。

## 四半期ごとの棚卸し

以下はいずれも自動化できないため、心がけではなく日付を持たせる。`quarterly-review.yml` が 1 月・
4 月・7 月・10 月の初日に、この一覧を写した Issue を作る。実施はその Issue 上で行い、結果が変わら
なかった項目も含めてすべて記録し、一覧を終えたら閉じる。その場で片付かないものは Issue を分け、
棚卸しの Issue を開いたままにしない。

一覧の原本はこの文書であり、Issue はある四半期のための写しである。作業内容が変わったときはここを
書き換える。次の Issue はそれを写す。

このリマインダは 1 項目目と同じ GitHub の cron で動くため、同じ理由で止まり得る。それは穴ではない。
四半期が過ぎても Issue が現れないことは、1 項目目が探している兆候そのものである。

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
- [ ] **dist-tag と EOL。** `latest` / `next` が意図した先を指し、`next` が `latest` より古くない
      こと。安定版を公開すると `next` は直前の prerelease を指したまま残るため、これを移すことは
      リリース手順の一部であり（[oss-npm-roadmap.md](oss-npm-roadmap.md) 10.1）、ここはその網である。
      [SECURITY.md](../../SECURITY.ja.md) の方針でサポート外になった minor は、リリースノートで
      その旨を告知済みであること。
- [ ] **優先順位。** open な Issue と npm のダウンロード数を見て、ロードマップだけでなくそれらに
      次の作業を決めさせる。

## audit や alert が上がったとき

1. 指摘なのか、実行が壊れただけなのかを切り分ける。定期 audit の Issue は checkout・ツール設定・
   レジストリのエラーを含むあらゆるジョブ失敗で作られ、どちらであるかは実行ログにしか出ない。
   インフラ側の失敗であれば依存については何も分かっていないので、再実行する。
2. その指摘が利用者に届くかを判断する。`site/` は配布物に入らず、`app/` にも dev 専用で公開バンドルに
   含まれない依存がある。その判断の根拠を残す。黙って閉じない。
3. [SECURITY.md](../../SECURITY.ja.md) のとおり、Critical / High を他の作業より優先する。
4. 修正版がまだ無い場合は、削除条件をコメントに書いた最小限の `overrides` を選び、上の四半期棚卸しの
   対象に加える。
5. 修正は patch としてリリースする。公開済みバージョンを作り直さない。
