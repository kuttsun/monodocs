#!/usr/bin/env node
// Drive the difference samples a release builds in a real browser: the view a document opens in,
// the four views, previous and next, the sidebar marks, and the list of changes.
//
// The release criteria ask for this pass to be driven rather than eyeballed, on the HTML a released
// monodocs builds from examples/diff/en and examples/diff/ja with `--diff-from-dir ../earlier`. It
// expects four files in --dir: en.html and ja.html built as the samples are configured, and
// en-inline.html and ja-inline.html built with `html.diffViewDefault: inline` added. They are served
// over HTTP, as a reader's browser would load a file from a web server, and each check is printed;
// the script exits non-zero if any failed. With --shots, it leaves a screenshot of each view of a
// changed page there, for a person to look over: whether it reads well is not something to assert.
//
// Usage:
//   node scripts/verify-diff-browser.mjs --dir <dir> --browser <chrome-or-edge-executable>
//       [--shots <dir>] [--puppeteer-from <dir>]
//
// `puppeteer-core` is not a dependency of this repository's root. It is taken from --puppeteer-from
// (a directory whose node_modules has it, such as an installed monodocs package or app/packages/core),
// and otherwise from wherever Node resolves it.
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    dir: { type: "string" },
    browser: { type: "string" },
    shots: { type: "string" },
    "puppeteer-from": { type: "string" },
  },
});
if (!values.dir || !values.browser) {
  console.error(
    "usage: node scripts/verify-diff-browser.mjs --dir <dir> --browser <executable> [--shots <dir>] [--puppeteer-from <dir>]",
  );
  process.exit(2);
}
const dir = resolve(values.dir);
const require = createRequire(join(resolve(values["puppeteer-from"] ?? process.cwd()), "noop.js"));
const puppeteer = require("puppeteer-core");
if (values.shots) mkdirSync(values.shots, { recursive: true });

// What the samples say in each language: their versions are 1.0 and 2.0.
const LANGUAGES = {
  en: {
    title: "Changes 1.0 → 2.0",
    sections: ["Added pages", "Moved pages", "Changed pages", "Deleted pages"],
    inline: "Inline",
  },
  ja: {
    title: "変更点 1.0 → 2.0",
    sections: ["追加されたページ", "移動したページ", "変更されたページ", "削除されたページ"],
    inline: "1 列",
  },
};
const SIGNS = { added: "+", deleted: "−", changed: "•", moved: "→" };
// The changes the samples hold, which Next has to reach: a count the page reports for itself would
// let a document that lost changes pass.
const CHANGES = 31;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const server = createServer((request, response) => {
  const file = resolve(dir, "." + decodeURIComponent(request.url.split("?")[0]));
  if (!file.startsWith(dir + sep) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  createReadStream(file).pipe(response);
});
await new Promise((listening) => server.listen(0, "127.0.0.1", listening));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({
  headless: true,
  executablePath: values.browser,
  args: ["--no-sandbox"],
});

let failures = 0;
try {
  for (const [lang, words] of Object.entries(LANGUAGES)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 900 });
    const errors = [];
    const failedRequests = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("requestfailed", (request) => failedRequests.push(request.url()));
    page.on("response", (response) => {
      if (response.status() >= 400) failedRequests.push(response.url());
    });
    const results = [];
    const check = (name, ok, detail = "") => {
      results.push({ ok, name, detail });
      if (!ok) failures++;
    };
    const state = () =>
      page.evaluate(() => ({
        view: document.documentElement.getAttribute("data-monodocs-diff-view"),
        pressed: document
          .querySelector('.monodocs-diff-views [aria-pressed="true"]')
          ?.getAttribute("data-monodocs-diff-view"),
        route: [...document.querySelectorAll("article.page")]
          .find((article) => !article.hidden)
          ?.getAttribute("data-route"),
        count: document.querySelector(".monodocs-diff-count")?.textContent.trim(),
      }));
    // A fresh load each time: a change of the hash alone keeps what the last view left.
    const open = async (file, route = "") => {
      await page.goto("about:blank");
      await page.goto(`${base}/${file}${route}`);
      await sleep(500);
    };
    const choose = async (view) => {
      await page.click(`[data-monodocs-diff-view="${view}"]`);
      await sleep(300);
    };

    // The list of changes, where a document opens by default.
    await open(`${lang}.html`);
    let now = await state();
    check(
      "opens side by side on the list of changes",
      now.view === "both" && now.pressed === "both" && now.route === "//changes",
      JSON.stringify(now),
    );
    const list = await page.evaluate(() => {
      const article = [...document.querySelectorAll("article.page")].find((a) => !a.hidden);
      return {
        title: article.querySelector("h1")?.textContent.trim(),
        sections: [...article.querySelectorAll("h2")].map((h) => h.textContent.trim()),
      };
    });
    check(`the list is titled ${words.title}`, list.title === words.title, list.title);
    for (const section of words.sections) {
      check(`the list has ${section}`, list.sections.includes(section), JSON.stringify(list.sections));
    }
    const changed = await page.evaluate((label) => {
      const article = [...document.querySelectorAll("article.page")].find((a) => !a.hidden);
      const heading = [...article.querySelectorAll("h2")].find((h) => h.textContent.trim() === label);
      let next = heading?.nextElementSibling;
      while (next && !next.querySelector("a")) next = next.nextElementSibling;
      return next?.querySelector("a")?.getAttribute("href") ?? null;
    }, words.sections[2]);
    if (changed) await page.click(`article.page:not([hidden]) a[href="${changed}"]`);
    await sleep(400);
    now = await state();
    check("a link in the list opens its page", changed !== null && `#${now.route}` === changed, `${changed} -> ${now.route}`);

    // The four views of that changed page.
    const columns = () =>
      page.evaluate(() => {
        const article = [...document.querySelectorAll("article.page")].find((a) => !a.hidden);
        const display = (selector) => {
          const element = article.querySelector(selector);
          return element ? getComputedStyle(element).display : "absent";
        };
        return {
          earlier: display(".monodocs-diff-earlier"),
          current: display(".monodocs-diff-current"),
          deletedInCurrent: [
            ...article.querySelectorAll('.monodocs-diff-current [data-monodocs-diff-block="del"]'),
          ].filter((element) => element.getBoundingClientRect().height > 0).length,
        };
      });
    const shown = (display) => display !== "none" && display !== "absent";
    const expected = {
      both: (c) => shown(c.earlier) && shown(c.current) && c.deletedInCurrent === 0,
      earlier: (c) => shown(c.earlier) && c.current === "none",
      current: (c) => c.earlier === "none" && shown(c.current) && c.deletedInCurrent === 0,
      inline: (c) => c.earlier === "none" && shown(c.current) && c.deletedInCurrent > 0,
    };
    for (const [view, holds] of Object.entries(expected)) {
      await choose(view);
      const seen = await columns();
      check(`the ${view} view shows its columns`, holds(seen), JSON.stringify(seen));
      if (values.shots) {
        await page.screenshot({ path: join(values.shots, `${lang}-${view}.png`), fullPage: false });
      }
    }

    // Next walks every change and comes round, and Previous steps back: side by side and in one
    // column, over the same number of changes. The count is written once the page has moved, so
    // each step is waited for rather than timed.
    const totals = {};
    for (const view of ["both", "inline"]) {
      await open(`${lang}.html`, "#//changes");
      if (view !== "both") await choose(view);
      // Each step waits for the count it should reach, and lands on a change the page rings.
      let ringless = 0;
      const step = async (direction, want) => {
        await page.click(`[data-monodocs-diff-go="${direction}"]`);
        let count;
        for (let tries = 0; tries < 50; tries++) {
          await sleep(100);
          count = (await state()).count;
          if (want.test(count ?? "")) break;
        }
        // The ring has to be on the page shown, and shown itself: a route switch that failed would
        // still ring a change inside a hidden page.
        const ringed = await page.evaluate(() => {
          const ring = document.querySelector(".monodocs-diff-change-current");
          const article = ring?.closest("article.page");
          return (
            ring !== null &&
            article !== null &&
            article !== undefined &&
            !article.hidden &&
            ring.getBoundingClientRect().height > 0
          );
        });
        if (!ringed) ringless++;
        return count;
      };
      const exactly = (text) => new RegExp(`^${text.replace(/[/]/g, "\\/")}$`);
      const first = await step(1, /^1 \/ \d+$/);
      const match = /^1 \/ (\d+)$/.exec(first ?? "");
      check(`${view}: Next starts at 1 / ${CHANGES}`, match !== null && Number(match[1]) === CHANGES, first);
      if (!match) continue;
      const total = Number(match[1]);
      totals[view] = total;
      let reached = `1 / ${total}`;
      for (let index = 2; index <= total; index++) {
        reached = await step(1, exactly(`${index} / ${total}`));
        if (reached !== `${index} / ${total}`) break;
      }
      check(`${view}: Next walks to ${total} / ${total}`, reached === `${total} / ${total}`, reached);
      const round = await step(1, exactly(`1 / ${total}`));
      check(`${view}: Next comes round to 1 / ${total}`, round === `1 / ${total}`, round);
      const back = await step(-1, exactly(`${total} / ${total}`));
      check(`${view}: Previous steps back to ${total} / ${total}`, back === `${total} / ${total}`, back);
      check(`${view}: every step lands on a ringed change on the page shown`, ringless === 0, `${ringless} without a ring`);
    }
    check(
      "one column walks as many changes as side by side",
      totals.both > 0 && totals.both === totals.inline,
      JSON.stringify(totals),
    );

    // The sidebar's marks.
    await open(`${lang}.html`, "#//changes");
    const marks = await page.evaluate(() => {
      const found = {};
      for (const item of document.querySelectorAll(
        '[data-monodocs-diff-sidebar="both"] .sidebar-page[data-monodocs-diff-page]',
      )) {
        const mark = item.querySelector(".monodocs-diff-mark");
        found[item.getAttribute("data-monodocs-diff-page")] = {
          sign: mark.textContent,
          colour: getComputedStyle(mark).color,
        };
      }
      return found;
    });
    for (const [state, sign] of Object.entries(SIGNS)) {
      check(`the sidebar marks a ${state} page ${sign}`, marks[state]?.sign === sign, JSON.stringify(marks[state]));
    }
    check(
      "the four marks have four colours",
      new Set(Object.keys(SIGNS).map((state) => marks[state]?.colour)).size === 4,
      JSON.stringify(marks),
    );

    // html.diffViewDefault: inline.
    await open(`${lang}-inline.html`);
    now = await state();
    const label = await page.evaluate(() =>
      document.querySelector('.monodocs-diff-views [data-monodocs-diff-view="inline"]').textContent.trim(),
    );
    check(
      "html.diffViewDefault: inline opens in one column on the list",
      now.view === "inline" && now.pressed === "inline" && now.route === "//changes",
      JSON.stringify(now),
    );
    check(`the one-column button reads ${words.inline}`, label === words.inline, label);

    check("no script error", errors.length === 0, errors.join(" | "));
    // A browser asks a server for its favicon by itself; the document asks for nothing.
    const unexpected = failedRequests.filter((url) => !url.endsWith("/favicon.ico"));
    check("no failed request but the browser's favicon.ico", unexpected.length === 0, unexpected.join(" "));

    console.log(`== ${lang}: ${results.filter((r) => r.ok).length} of ${results.length} passed`);
    for (const { ok, name, detail } of results) {
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failures > 0 ? 1 : 0);
