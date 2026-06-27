# 設定

`single-docs.config.yml` を置くと挙動をカスタマイズできます。

```yaml
title: "サンプルドキュメント"
input: "./docs"
output:
  format: "html"
  path: "./dist/manual.html"
```

設定が無い場合はデフォルト値（入力 `./docs`、出力 `./dist/manual.html`）が使われます。
