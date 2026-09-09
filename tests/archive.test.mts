import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { PostMeta } from "../lib/posts.ts";
import {
  POSTS_PER_PAGE,
  clampPage,
  groupByYear,
  pageCount,
  pageSlice,
} from "../lib/archive.ts";

function post(slug: string, date: string): PostMeta {
  return {
    slug,
    title: slug,
    date,
    excerpt: "An excerpt.",
    readingMinutes: 1,
    tags: [],
  };
}

describe("groupByYear", () => {
  test("splits a date-ordered list into one group per year", () => {
    const groups = groupByYear([
      post("d", "2026-05-01"),
      post("c", "2026-01-02"),
      post("b", "2025-11-30"),
      post("a", "2024-06-15"),
    ]);

    assert.deepEqual(
      groups.map((group) => [group.year, group.posts.map((p) => p.slug)]),
      [
        ["2026", ["d", "c"]],
        ["2025", ["b"]],
        ["2024", ["a"]],
      ],
    );
  });

  test("keeps the order it was given", () => {
    const groups = groupByYear([
      post("newer", "2026-05-01"),
      post("older", "2026-01-02"),
    ]);

    assert.deepEqual(groups[0].posts.map((p) => p.slug), ["newer", "older"]);
  });

  test("returns nothing for an empty list", () => {
    assert.deepEqual(groupByYear([]), []);
  });

  test("does not merge a year that comes back later", () => {
    // Only possible if the list is not date-ordered, but a silently merged
    // group would be worse than an honest second one.
    const groups = groupByYear([
      post("a", "2026-05-01"),
      post("b", "2025-01-01"),
      post("c", "2026-02-01"),
    ]);

    assert.deepEqual(
      groups.map((group) => group.year),
      ["2026", "2025", "2026"],
    );
  });
});

describe("pageCount", () => {
  test("counts the pages a list needs", () => {
    assert.equal(pageCount(0), 1, "an empty list is still one page");
    assert.equal(pageCount(1), 1);
    assert.equal(pageCount(POSTS_PER_PAGE), 1, "an exact fit is one page");
    assert.equal(pageCount(POSTS_PER_PAGE + 1), 2);
    assert.equal(pageCount(11, 6), 2);
  });
});

describe("clampPage", () => {
  test("keeps a page that exists", () => {
    assert.equal(clampPage(2, 11, 6), 2);
  });

  test("pulls a page past the end back to the last one", () => {
    // A tag filter can shrink the list under a reader who is on page 3.
    assert.equal(clampPage(3, 11, 6), 2);
    assert.equal(clampPage(9, 2, 6), 1);
  });

  test("refuses anything a query string might carry", () => {
    for (const nonsense of [0, -4, Number.NaN, Number.POSITIVE_INFINITY, 1.7]) {
      const page = clampPage(nonsense, 11, 6);

      assert.ok(
        Number.isInteger(page) && page >= 1 && page <= 2,
        `clampPage(${nonsense}) returned ${page}`,
      );
    }
  });
});

describe("pageSlice", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  test("cuts the list into pages", () => {
    assert.deepEqual(pageSlice(items, 1, 6), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(pageSlice(items, 2, 6), [7, 8, 9, 10, 11]);
  });

  test("never returns an empty page for an out-of-range request", () => {
    assert.deepEqual(pageSlice(items, 99, 6), [7, 8, 9, 10, 11]);
    assert.deepEqual(pageSlice(items, -1, 6), [1, 2, 3, 4, 5, 6]);
  });

  test("returns everything when it fits on one page", () => {
    assert.deepEqual(pageSlice([1, 2], 1, 6), [1, 2]);
  });
});
