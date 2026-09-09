import type { PostMeta } from "./posts.ts";

/**
 * How many posts one page of the archive shows.
 *
 * Lives here rather than in the component so the tests and the pagination
 * controls read the same number.
 */
export const POSTS_PER_PAGE = 6;

export type YearGroup = {
  /** Calendar year, as it appears in a post's date. */
  year: string;
  posts: PostMeta[];
};

/**
 * Splits a date-ordered list into one group per year, keeping the order it was
 * given. Posts arrive newest first, so the groups come out newest year first
 * and each group holds its posts in the same order.
 */
export function groupByYear(posts: PostMeta[]): YearGroup[] {
  const groups: YearGroup[] = [];

  for (const post of posts) {
    const year = post.date.slice(0, 4);
    const current = groups.at(-1);

    if (current?.year === year) {
      current.posts.push(post);
    } else {
      groups.push({ year, posts: [post] });
    }
  }

  return groups;
}

/** How many pages a list of this length needs. Always at least one. */
export function pageCount(total: number, perPage = POSTS_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/**
 * A page number that exists, whatever the URL asked for. A filter that shrinks
 * the list can leave the reader past the end, and a hand-typed query string can
 * say anything at all.
 */
export function clampPage(
  page: number,
  total: number,
  perPage = POSTS_PER_PAGE,
): number {
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.min(Math.max(Math.trunc(page), 1), pageCount(total, perPage));
}

/** The slice of items belonging to one page. */
export function pageSlice<T>(
  items: T[],
  page: number,
  perPage = POSTS_PER_PAGE,
): T[] {
  const clamped = clampPage(page, items.length, perPage);

  return items.slice((clamped - 1) * perPage, clamped * perPage);
}
