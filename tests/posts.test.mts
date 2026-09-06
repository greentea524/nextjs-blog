import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

// Pin a timezone west of Greenwich. A date normalized with local-time
// accessors instead of UTC ones would come out a day early here, and the
// assertion below proves the pin took effect.
process.env.TZ = "America/Los_Angeles";
assert.ok(
  new Date("2026-03-04T00:00:00Z").getTimezoneOffset() > 0,
  "expected the test process to run behind UTC",
);

const repoRoot = process.cwd();
const fixturesRoot = path.join(
  fileURLToPath(new URL(".", import.meta.url)),
  "fixtures",
);

/**
 * The reader resolves `posts/` against the working directory on every call, so
 * pointing it at a fixture is a matter of changing directory first.
 */
function useFixture(name: string): void {
  process.chdir(path.join(fixturesRoot, name));
}

afterEach(() => {
  process.chdir(repoRoot);
});

// Imported dynamically so the timezone above is in place first.
const {
  formatDate,
  getAdjacentPosts,
  getAllTags,
  getPostBySlug,
  getPostSlugs,
  getSortedPosts,
} = await import("../lib/posts.ts");

describe("getPostSlugs", () => {
  test("lists every markdown file without its extension", () => {
    useFixture("site");

    assert.deepEqual(getPostSlugs().sort(), [
      "alpha-post",
      "beta-post",
      "gamma-post",
      "long-post",
      "short-post",
    ]);
  });

  test("ignores files that are not markdown", () => {
    useFixture("site");

    assert.ok(!getPostSlugs().some((slug) => slug.includes("notes")));
  });
});

describe("getSortedPosts ordering", () => {
  test("returns posts newest first", () => {
    useFixture("site");

    const dates = getSortedPosts().map((post) => post.date);
    assert.deepEqual(dates, [
      "2026-03-04",
      "2026-03-04",
      "2026-02-15",
      "2026-02-01",
      "2026-01-02",
    ]);
  });

  test("keeps posts that share a date in directory order", () => {
    useFixture("site");

    const [first, second] = getSortedPosts();
    assert.equal(first.date, second.date);
    assert.deepEqual([first.slug, second.slug], ["alpha-post", "beta-post"]);
  });

  test("is deterministic across calls", () => {
    useFixture("site");

    const once = getSortedPosts().map((post) => post.slug);
    const twice = getSortedPosts().map((post) => post.slug);
    assert.deepEqual(once, twice);
  });
});

describe("frontmatter parsing", () => {
  test("normalizes a bare YAML date and a quoted one the same way", () => {
    useFixture("site");

    const posts = getSortedPosts();
    const alpha = posts.find((post) => post.slug === "alpha-post");
    const beta = posts.find((post) => post.slug === "beta-post");

    // alpha-post writes `date: 2026-03-04`, which YAML hands over as a Date;
    // beta-post quotes it, so it arrives as a string.
    assert.equal(alpha?.date, "2026-03-04");
    assert.equal(beta?.date, "2026-03-04");
  });

  test("keeps string tags and drops everything else", () => {
    useFixture("site");

    const posts = getSortedPosts();
    assert.deepEqual(
      posts.find((post) => post.slug === "alpha-post")?.tags,
      ["Testing", "Markdown"],
    );
    // beta-post declares ["Testing", 7, "  "].
    assert.deepEqual(
      posts.find((post) => post.slug === "beta-post")?.tags,
      ["Testing"],
    );
    assert.deepEqual(posts.find((post) => post.slug === "gamma-post")?.tags, []);
  });

  test("rejects a missing title, naming the file", () => {
    useFixture("missing-title");

    assert.throws(() => getSortedPosts(), {
      message:
        'no-title.md: frontmatter "title" is required and must be a non-empty string',
    });
  });

  test("rejects a whitespace-only excerpt, naming the file", () => {
    useFixture("empty-excerpt");

    assert.throws(() => getSortedPosts(), {
      message:
        'blank-excerpt.md: frontmatter "excerpt" is required and must be a non-empty string',
    });
  });

  test("rejects a date that is not a YYYY-MM-DD calendar date", () => {
    useFixture("bad-date");

    assert.throws(() => getSortedPosts(), {
      message:
        'bad-date.md: frontmatter "date" must be a YYYY-MM-DD calendar date, received "04-03-2026"',
    });
  });
});

describe("reading time", () => {
  test("counts words at 200 a minute", () => {
    useFixture("site");

    // long-post.md carries exactly 400 words of body.
    const long = getSortedPosts().find((post) => post.slug === "long-post");
    assert.equal(long?.readingMinutes, 2);
  });

  test("never reports less than a minute", () => {
    useFixture("site");

    // short-post.md carries five words.
    const short = getSortedPosts().find((post) => post.slug === "short-post");
    assert.equal(short?.readingMinutes, 1);
  });
});

describe("getAllTags", () => {
  test("counts tags and sorts by frequency then name", () => {
    useFixture("site");

    assert.deepEqual(getAllTags(), [
      { tag: "Testing", count: 4 },
      { tag: "Markdown", count: 1 },
    ]);
  });
});

describe("getPostBySlug", () => {
  test("returns null for a slug with no file", async () => {
    useFixture("site");

    assert.equal(await getPostBySlug("no-such-post"), null);
  });

  test("slugifies heading ids and counts repeats", async () => {
    useFixture("site");

    const post = await getPostBySlug("alpha-post");

    assert.deepEqual(post?.toc, [
      { id: "shared-heading", text: "Shared heading", level: 2 },
      { id: "cart-crate", text: "Cart & Crate", level: 3 },
      { id: "shared-heading-1", text: "Shared heading", level: 2 },
      { id: "the-touchend-trap", text: "The touchEnd trap", level: 2 },
    ]);
  });

  test("puts those same ids on the headings it renders", async () => {
    useFixture("site");

    const post = await getPostBySlug("alpha-post");

    for (const item of post?.toc ?? []) {
      assert.ok(
        post?.contentHtml.includes(`id="${item.id}"`),
        `expected rendered HTML to carry id="${item.id}"`,
      );
    }
  });

  test("renders GFM tables", async () => {
    useFixture("site");

    const post = await getPostBySlug("alpha-post");

    assert.match(post?.contentHtml ?? "", /<table>/);
    assert.match(post?.contentHtml ?? "", /<th>Column<\/th>/);
  });

  test("highlights fenced code, including fences with no language", async () => {
    useFixture("site");

    const post = await getPostBySlug("alpha-post");
    const html = post?.contentHtml ?? "";

    assert.match(html, /data-language="ts"/);
    assert.match(html, /data-language="plaintext"/);
    // Shiki writes a colour per theme onto each token as an inline variable.
    assert.match(html, /--shiki-light:/);
    assert.match(html, /--shiki-dark:/);
  });
});

describe("getAdjacentPosts", () => {
  test("walks the sorted order", () => {
    useFixture("site");

    const { prev, next } = getAdjacentPosts("short-post");

    // Sorted order is alpha, beta, short, long, gamma.
    assert.equal(prev?.slug, "beta-post");
    assert.equal(next?.slug, "long-post");
  });

  test("reports no neighbour past either end", () => {
    useFixture("site");

    assert.equal(getAdjacentPosts("alpha-post").prev, null);
    assert.equal(getAdjacentPosts("gamma-post").next, null);
  });

  test("returns nothing for a slug that is not a post", () => {
    useFixture("site");

    assert.deepEqual(getAdjacentPosts("no-such-post"), {
      prev: null,
      next: null,
    });
  });
});

describe("formatDate", () => {
  test("renders a calendar date in UTC", () => {
    // Written as January 15 even though the pinned timezone is still on
    // January 14 at UTC midnight.
    assert.equal(formatDate("2026-01-15"), "January 15, 2026");
  });
});

describe("the site's own posts", () => {
  test("all parse, and come back newest first", () => {
    const posts = getSortedPosts();

    assert.ok(posts.length > 0, "expected the site to have posts");
    for (let i = 1; i < posts.length; i += 1) {
      assert.ok(
        posts[i - 1].date >= posts[i].date,
        `${posts[i - 1].slug} (${posts[i - 1].date}) should not precede ${posts[i].slug} (${posts[i].date})`,
      );
    }
  });
});
