import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { watchSite } from "./watch";
import { serveSite } from "./serve";

describe("watchSite", () => {
  it("builds once initially and rebuilds on source change", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-watch-"));
    const docs = join(dir, "docs");
    const out = join(dir, "dist", "manual.html");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "index.md"), "# First\n");

    let rebuilds = 0;
    let resolveNext: (() => void) | null = null;
    const handle = await watchSite(
      { inputDir: docs, outputFile: out },
      {
        onRebuild: () => {
          rebuilds++;
          if (resolveNext) {
            const r = resolveNext;
            resolveNext = null;
            r();
          }
        },
      },
    );

    // 初回ビルドは watchSite の解決時点で完了している。
    expect(rebuilds).toBe(1);
    expect(await readFile(out, "utf8")).toContain("First");

    const next = new Promise<void>((res) => {
      resolveNext = res;
    });
    await writeFile(join(docs, "index.md"), "# Second\n");
    await next;

    expect(rebuilds).toBeGreaterThanOrEqual(2);
    expect(await readFile(out, "utf8")).toContain("Second");

    handle.close();
    await rm(dir, { recursive: true, force: true });
  }, 15000);

  it("rejects when the input directory does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-watch-missing-"));
    await expect(
      watchSite({ inputDir: join(dir, "nope"), outputFile: join(dir, "out.html") }),
    ).rejects.toThrow(/Input directory not found/);
    await rm(dir, { recursive: true, force: true });
  });

  it("does not self-trigger when the output lives inside the watched input", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-watch-loop-"));
    const docs = join(dir, "docs");
    // 出力を入力ディレクトリ配下に置く（再ビルドのたびに書き込まれる）。
    const out = join(docs, "manual.html");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "index.md"), "# Loop\n");

    let rebuilds = 0;
    let resolveNext: (() => void) | null = null;
    const handle = await watchSite(
      { inputDir: docs, outputFile: out },
      {
        onRebuild: () => {
          rebuilds++;
          if (resolveNext) {
            const r = resolveNext;
            resolveNext = null;
            r();
          }
        },
      },
    );

    // 出力書き込みのイベントが収まるのを待つ。ループしていなければ初回の 1 回のまま。
    await new Promise((r) => setTimeout(r, 800));
    expect(rebuilds).toBe(1);

    // 実ソースの変更は引き続き再ビルドを起こす。
    const next = new Promise<void>((res) => {
      resolveNext = res;
    });
    await writeFile(join(docs, "index.md"), "# Loop 2\n");
    await next;
    expect(rebuilds).toBe(2);

    handle.close();
    await rm(dir, { recursive: true, force: true });
  }, 15000);
});

describe("serveSite", () => {
  it("serves the built HTML with the live-reload script injected", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-serve-"));
    const docs = join(dir, "docs");
    const out = join(dir, "dist", "manual.html");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "index.md"), "# Served Page\n");

    // port 0 でエフェメラルポートを使い、テストの衝突を避ける。
    const handle = await serveSite({ inputDir: docs, outputFile: out, port: 0 });
    try {
      const res = await fetch(handle.url);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain("Served Page");
      expect(html).toContain("__monodocs-livereload");
    } finally {
      await handle.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);

  it("serves HTML even when the config requests pdf/both output (no Chromium)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-serve-both-"));
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "index.md"), "# Preview Page\n");
    // 設定は both（既定出力はディレクトリ ./dist）。serve は HTML に固定して配信するはず。
    await writeFile(join(docs, "monodocs.config.yml"), "output:\n  format: both\n");

    // port 0 でエフェメラルポート。format を渡さず、設定の both を serve が上書きすること。
    const handle = await serveSite({ inputDir: docs, port: 0 });
    try {
      const res = await fetch(handle.url);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain("Preview Page");
      expect(html).toContain("__monodocs-livereload");
      // 設定ファイルは docs/ 配下なので dist もその配下に解決される。
      // HTML が書かれ、PDF は生成されない（Chromium 不使用）。
      expect(existsSync(join(docs, "dist", "manual.html"))).toBe(true);
      expect(existsSync(join(docs, "dist", "manual.pdf"))).toBe(false);
    } finally {
      await handle.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);

  it("serves manual.html for both-mode with an explicit existing directory path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-serve-bothdir-"));
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "index.md"), "# Dir Both\n");
    // both + 明示ディレクトリ path。ディレクトリを事前に用意して EISDIR の再現条件を作る。
    await writeFile(join(docs, "monodocs.config.yml"), "output:\n  format: both\n  path: ./out\n");
    await mkdir(join(docs, "out"), { recursive: true });

    const handle = await serveSite({ inputDir: docs, port: 0 });
    try {
      const res = await fetch(handle.url);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain("Dir Both");
      // ディレクトリ path はそのまま HTML ファイルにされず、中の manual.html に解決される。
      expect(existsSync(join(docs, "out", "manual.html"))).toBe(true);
      expect(existsSync(join(docs, "out", "manual.pdf"))).toBe(false);
    } finally {
      await handle.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);

  it("honours an explicit --output HTML file even under a pdf config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-serve-explicit-"));
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "index.md"), "# Explicit Out\n");
    await writeFile(join(docs, "monodocs.config.yml"), "output:\n  format: pdf\n");

    const explicit = join(dir, "preview.html");
    const handle = await serveSite({ inputDir: docs, outputFile: explicit, port: 0 });
    try {
      const res = await fetch(handle.url);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain("Explicit Out");
      // 明示 -o がそのまま HTML 出力先になる（manual.html へ流されない）。
      expect(existsSync(explicit)).toBe(true);
      expect(existsSync(join(dir, "manual.html"))).toBe(false);
    } finally {
      await handle.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);
});
