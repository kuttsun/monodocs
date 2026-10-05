// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { resolveLabels } from "../../labels.js";
import { loadTheme } from "../index";

type ClientHeading = { id: string; text: string; level: number; number?: string };
type ClientPage = {
  route: string;
  title: string;
  number?: string;
  hidden: boolean;
  headings: ClientHeading[];
  text: string;
};

/**
 * Section numbers in the client (roadmap 19.1): the in-page table of contents shows the number the
 * heading carries, and search finds a section by its number without digits weighing on words.
 */
async function mountClient(pages: ClientPage[]): Promise<void> {
  const theme = await loadTheme("default");
  const articles = pages
    .map(
      (p, i) =>
        `<article class="page" data-route="${p.route}"${i === 0 ? "" : " hidden"}>` +
        p.headings
          .map((h) => {
            // As core writes it into the body.
            const number = h.number ? `<span class="section-number">${h.number}</span> ` : "";
            return `<h${h.level} id="${h.id}">${number}${h.text}</h${h.level}>`;
          })
          .join("") +
        `</article>`,
    )
    .join("");
  document.body.innerHTML =
    `<div id="app">` +
    `<aside id="sidebar">` +
    `<div class="sidebar-tools"><input id="search-input" type="search" /></div>` +
    `<ul id="search-results" hidden></ul>` +
    `<nav id="sidebar-nav"><ul class="sidebar-list"></ul></nav>` +
    `</aside>` +
    `<main id="content">${articles}<nav id="page-nav"></nav></main>` +
    `<aside id="toc"><nav id="toc-nav"></nav></aside>` +
    `</div>`;
  (window as unknown as { __MONODOCS_DATA__: unknown }).__MONODOCS_DATA__ = {
    labels: resolveLabels("en").labels,
    initialRoute: pages[0]?.route,
    pages,
  };
  window.location.hash = "";
  new Function(theme.appJs)();
}

function typeQuery(query: string): void {
  const input = document.getElementById("search-input") as HTMLInputElement;
  input.value = query;
  input.dispatchEvent(new Event("input"));
}

function results(): { route: string | null; heading: string | null; html: string }[] {
  return Array.from(document.querySelectorAll("#search-results a")).map((a) => ({
    route: a.getAttribute("data-route"),
    heading: a.getAttribute("data-heading"),
    html: a.innerHTML,
  }));
}

const PAGES: ClientPage[] = [
  {
    route: "/",
    title: "Home",
    number: "1",
    hidden: false,
    headings: [
      { id: "index-overview", text: "Overview", level: 2, number: "1.1" },
      { id: "index-detail", text: "Detail", level: 3, number: "1.1.1" },
    ],
    text: "Home Overview Detail release 2.1 notes",
  },
  {
    route: "/guide/usage",
    title: "Usage",
    number: "2.1",
    hidden: false,
    headings: [{ id: "guide-usage-basics", text: "Basics", level: 2, number: "2.1.1" }],
    text: "Usage Basics",
  },
  {
    route: "/plain",
    title: "Plain",
    hidden: false,
    headings: [{ id: "plain-intro", text: "Intro", level: 2 }],
    text: "Plain Intro",
  },
];

describe("the in-page table of contents", () => {
  it("shows each heading's number in front of its text", async () => {
    await mountClient(PAGES);
    const items = Array.from(document.querySelectorAll("#toc-nav a")).map((a) => a.innerHTML);
    expect(items).toEqual([
      '<span class="section-number">1.1</span> Overview',
      '<span class="section-number">1.1.1</span> Detail',
    ]);
  });

  it("shows no number for a heading that has none", async () => {
    await mountClient([PAGES[2]!]);
    expect(document.querySelector("#toc-nav a")!.innerHTML).toBe("Intro");
  });
});

describe("search by section number", () => {
  it("finds a heading by its number, opens it, and marks the number", async () => {
    await mountClient(PAGES);
    typeQuery("2.1.1");
    const found = results();
    expect(found.map((r) => [r.route, r.heading])).toEqual([
      ["/guide/usage", "guide-usage-basics"],
    ]);
    expect(found[0]!.html).toContain(
      '<span class="section-number"><mark>2.1.1</mark></span> Basics',
    );
  });

  it("finds a page by its number, ranked above a page that only mentions it", async () => {
    await mountClient(PAGES);
    typeQuery("2.1");
    const found = results();
    // The page numbered 2.1 first; the home page only says "2.1" in its text.
    expect(found.map((r) => r.route)).toEqual(["/guide/usage", "/"]);
    expect(found[0]!.html).toContain('<span class="section-number"><mark>2.1</mark></span> Usage');
  });

  it("matches a number only as a whole", async () => {
    await mountClient(PAGES);
    // A prefix of a number is not that number: "1.1." is the start of 1.1.1 and finds nothing.
    typeQuery("1.1.");
    expect(results()).toEqual([]);
    typeQuery("2.1.");
    expect(results()).toEqual([]);
  });

  it("does not mark digits inside a number in the body", async () => {
    await mountClient(PAGES);
    typeQuery("1.1 overview");
    (document.querySelector("#search-results a") as HTMLElement).click();
    const article = document.querySelector('article[data-route="/"]')!;
    expect(article.querySelectorAll("mark").length).toBeGreaterThan(0);
    // "1.1" is inside both "1.1" and "1.1.1"; neither number is marked.
    expect(article.querySelectorAll(".section-number mark").length).toBe(0);
  });

  it("opens the heading whose number matched, not one whose text contains it", async () => {
    await mountClient([
      {
        route: "/r",
        title: "Releases",
        number: "3",
        hidden: false,
        headings: [
          { id: "r-old", text: "Release 13.2", level: 2, number: "3.1" },
          { id: "r-target", text: "Target", level: 2, number: "3.2" },
        ],
        text: "Releases Release 13.2 Target",
      },
    ]);
    typeQuery("3.2");
    expect(results().map((r) => r.heading)).toEqual(["r-target"]);
    // The page's own number opens the page, not a heading whose text happens to contain it.
    typeQuery("3");
    expect(results().map((r) => r.heading)).toEqual([null]);
  });

  it("does not let a number change how a word scores", async () => {
    // "basics" in a title, in a heading, and in body text, on three pages.
    const pages: ClientPage[] = [
      {
        route: "/text",
        title: "Text",
        hidden: false,
        headings: [{ id: "t-h", text: "Other", level: 2 }],
        text: "Text Other mentions basics once",
      },
      {
        route: "/heading",
        title: "Heading",
        hidden: false,
        headings: [{ id: "h-h", text: "Basics", level: 2 }],
        text: "Heading Basics",
      },
      {
        route: "/title",
        title: "Basics",
        hidden: false,
        headings: [{ id: "ti-h", text: "Intro", level: 2 }],
        text: "Basics Intro",
      },
    ];
    const numbered = (order: string[]) =>
      pages.map((page, i) => ({
        ...page,
        number: order[i],
        headings: page.headings.map((h) => ({ ...h, number: `${order[i]}.1` })),
      }));
    const ranking = async (list: ClientPage[]) => {
      await mountClient(list);
      typeQuery("basics");
      return results().map((r) => r.route);
    };

    const plain = await ranking(pages);
    expect(plain).toEqual(["/title", "/heading", "/text"]);
    expect(await ranking(numbered(["1", "2", "3"]))).toEqual(plain);
    expect(await ranking(numbered(["3", "1", "2"]))).toEqual(plain);
  });
});
