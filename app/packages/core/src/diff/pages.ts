import type { Page } from "../types.js";

/**
 * Matching the pages of two versions (roadmap 7.3.3).
 *
 * Pages are matched by route. A new page whose `aliases` contain an old route that no new route
 * matched is taken to have moved there; a route match comes first. When a page's aliases name
 * several old routes — pages merged into one — it is compared with its route match if it has one,
 * else with the first of them as written, and the other pages are deleted, each naming the page that
 * took its route. A page matched by neither was added or deleted. Moves are not inferred from how
 * similar the content is: as with aliases, a move is stated by a line the author wrote.
 */
export type PageMatch =
  | { state: "matched"; new: Page; old: Page; movedFrom?: string }
  | { state: "added"; new: Page }
  | { state: "deleted"; old: Page; mergedInto?: Page };

export function matchPages(next: readonly Page[], old: readonly Page[]): PageMatch[] {
  const oldByRoute = new Map(old.map((page) => [page.route, page]));
  const newRoutes = new Set(next.map((page) => page.route));
  const taken = new Set<string>();
  const matches: PageMatch[] = [];
  const mergedInto = new Map<string, Page>();

  // Route matches first, so an alias never takes a route another page still has.
  const byRoute = new Map<Page, Page>();
  for (const page of next) {
    const match = oldByRoute.get(page.route);
    if (match !== undefined) {
      byRoute.set(page, match);
      taken.add(match.route);
    }
  }
  for (const page of next) {
    const route = byRoute.get(page);
    // The old routes this page's aliases name that no new page has and none took by route.
    const claimed = page.aliases.filter(
      (alias) => oldByRoute.has(alias) && !newRoutes.has(alias) && !taken.has(alias),
    );
    if (route !== undefined) {
      matches.push({ state: "matched", new: page, old: route });
      for (const alias of claimed) mergedInto.set(alias, page);
    } else if (claimed.length > 0) {
      const [first, ...rest] = claimed;
      matches.push({
        state: "matched",
        new: page,
        old: oldByRoute.get(first!)!,
        movedFrom: first!,
      });
      for (const alias of rest) mergedInto.set(alias, page);
    } else {
      matches.push({ state: "added", new: page });
      continue;
    }
    for (const alias of claimed) taken.add(alias);
  }
  for (const page of old) {
    const merged = mergedInto.get(page.route);
    if (merged !== undefined) matches.push({ state: "deleted", old: page, mergedInto: merged });
    else if (!taken.has(page.route)) matches.push({ state: "deleted", old: page });
  }
  return matches;
}
