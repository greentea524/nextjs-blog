import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, mock, test } from "node:test";
import type { TestContext } from "node:test";
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
  mock.restoreAll();
});

/**
 * A throwaway site with its own posts, so a caching test starts against paths
 * nothing has read yet. The caches key on absolute path, so each temporary
 * directory is a cold cache.
 */
function useTemporarySite(posts: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nextjs-blog-test-"));
  fs.mkdirSync(path.join(root, "posts"));
  writePosts(root, posts);
  process.chdir(root);
  return root;
}

function writePosts(root: string, posts: Record<string, string>): void {
  for (const [fileName, body] of Object.entries(posts)) {
    fs.writeFileSync(path.join(root, "posts", fileName), body);
  }
}

function post(title: string): string {
  return `---\ntitle: "${title}"\ndate: "2026-03-04"\nexcerpt: "An excerpt."\n---\n\nBody.\n`;
}

/** A post with an explicit date, and optionally a `draft` line. */
function datedPost(title: string, date: string, draft?: string): string {
  const draftLine = draft === undefined ? "" : `draft: ${draft}\n`;
  return `---\ntitle: "${title}"\ndate: "${date}"\nexcerpt: "An excerpt."\n${draftLine}---\n\nBody.\n`;
}

/** A post with an explicit date and tags, and optionally a `draft` line. */
function taggedPost(
  title: string,
  date: string,
  tags: string[],
  draft?: string,
): string {
  const draftLine = draft === undefined ? "" : `draft: ${draft}\n`;
  const tagList = tags.map((tag) => `"${tag}"`).join(", ");

  return `---\ntitle: "${title}"\ndate: "${date}"\nexcerpt: "An excerpt."\ntags: [${tagList}]\n${draftLine}---\n\nBody.\n`;
}

/** A calendar date a given number of days from today, in UTC. */
function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The draft and future-date filters only apply to a production build, which is
 * what `next build` runs as; `next dev` shows everything.
 */
function buildAs(t: TestContext, mode: "production" | "development"): void {
  // Next declares NODE_ENV read-only for application code (next/types/global.d.ts),
  // which is right there and wrong here: a test has to be able to run the
  // module under test as both a build and a dev server.
  const env = process.env as { NODE_ENV?: string };
  const previous = env.NODE_ENV;

  env.NODE_ENV = mode;
  t.after(() => {
    env.NODE_ENV = previous;
  });
}

/** Counts reads of markdown files, ignoring anything else the runtime reads. */
function countMarkdownReads(): () => number {
  const spy = mock.method(fs, "readFileSync");
  return () =>
    spy.mock.calls.filter((call) =>
      String(call.arguments[0]).endsWith(".md"),
    ).length;
}

// Imported dynamically so the timezone above is in place first.
const {
  formatDate,
  getAdjacentPosts,
  getAllTags,
  getPostBySlug,
  getPostSlugs,
  getRelatedPosts,
  getSearchIndex,
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
  test("is the one in lib/format.ts, not a second copy", async () => {
    // The client-side filter imports lib/format.ts directly, because pulling
    // lib/posts.ts into the browser bundle would drag `node:fs` along. Two
    // copies of the formatter would be free to drift apart.
    const format = await import("../lib/format.ts");

    assert.equal(formatDate, format.formatDate);
  });

  test("renders a calendar date in UTC", () => {
    // Written as January 15 even though the pinned timezone is still on
    // January 14 at UTC midnight.
    assert.equal(formatDate("2026-01-15"), "January 15, 2026");
  });
});

describe("caching", () => {
  test("reads and parses each file once, however often it is asked", (t) => {
    const root = useTemporarySite({
      "one.md": post("One"),
      "two.md": post("Two"),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const markdownReads = countMarkdownReads();

    getSortedPosts();
    assert.equal(markdownReads(), 2, "a cold cache reads both files");

    getSortedPosts();
    getAllTags();
    getPostSlugs();
    assert.equal(markdownReads(), 2, "later calls read nothing further");
  });

  test("renders a post once and hands back the same result", async (t) => {
    const root = useTemporarySite({ "one.md": post("One") });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const first = await getPostBySlug("one");
    const second = await getPostBySlug("one");

    assert.ok(first, "expected the post to exist");
    assert.equal(first, second, "expected the rendered post to be reused");
  });

  test("picks up an edit to a post file", async (t) => {
    const root = useTemporarySite({ "one.md": post("Before") });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    assert.equal(getSortedPosts()[0].title, "Before");
    assert.equal((await getPostBySlug("one"))?.title, "Before");

    writePosts(root, { "one.md": post("After") });
    // Force a modification time the cache cannot mistake for the old one, which
    // a coarse filesystem clock might otherwise report for a quick rewrite.
    const later = new Date(Date.now() + 2000);
    fs.utimesSync(path.join(root, "posts", "one.md"), later, later);

    assert.equal(getSortedPosts()[0].title, "After");
    assert.equal((await getPostBySlug("one"))?.title, "After");
  });

  test("retries a post that failed rather than caching the failure", async (t) => {
    // A post with no date at all, which the frontmatter check rejects.
    const root = useTemporarySite({
      "one.md": '---\ntitle: "One"\nexcerpt: "An excerpt."\n---\n\nNo date.\n',
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    const markdownReads = countMarkdownReads();

    await assert.rejects(() => getPostBySlug("one"), /frontmatter "date"/);
    const afterFirstAttempt = markdownReads();

    await assert.rejects(() => getPostBySlug("one"), /frontmatter "date"/);
    assert.ok(
      markdownReads() > afterFirstAttempt,
      "expected the failed post to be read again rather than served from cache",
    );
  });
});

describe("drafts and future-dated posts", () => {
  test("a production build leaves out drafts and posts dated ahead", async (t) => {
    const root = useTemporarySite({
      "published.md": datedPost("Published", daysFromToday(-1)),
      "today.md": datedPost("Today", daysFromToday(0)),
      "draft.md": datedPost("Draft", daysFromToday(-1), "true"),
      "scheduled.md": datedPost("Scheduled", daysFromToday(1)),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    buildAs(t, "production");

    assert.deepEqual(
      getSortedPosts().map((entry) => entry.title).sort(),
      ["Published", "Today"],
      "a post dated today is published; a draft and tomorrow's post are not",
    );
    assert.deepEqual(getPostSlugs().sort(), ["published", "today"]);
    assert.equal(await getPostBySlug("draft"), null);
    assert.equal(await getPostBySlug("scheduled"), null);
  });

  test("development shows everything, so work in progress can be previewed", async (t) => {
    const root = useTemporarySite({
      "published.md": datedPost("Published", daysFromToday(-1)),
      "draft.md": datedPost("Draft", daysFromToday(-1), "true"),
      "scheduled.md": datedPost("Scheduled", daysFromToday(1)),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    buildAs(t, "development");

    assert.deepEqual(getPostSlugs().sort(), ["draft", "published", "scheduled"]);
    assert.equal((await getPostBySlug("draft"))?.title, "Draft");
    assert.equal((await getPostBySlug("scheduled"))?.title, "Scheduled");
  });

  test("an excluded post is absent from tags and adjacent navigation", (t) => {
    const root = useTemporarySite({
      "older.md": datedPost("Older", daysFromToday(-2)),
      "draft.md": datedPost("Draft", daysFromToday(-1), "true"),
      "newer.md": datedPost("Newer", daysFromToday(0)),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    buildAs(t, "production");

    // The draft sits between the two published posts by date, so it would show
    // up as a neighbour if the filter only covered the listing pages. The
    // sitemap, the feed and the tag archives all read the same two functions.
    assert.equal(getAdjacentPosts("newer").next?.slug, "older");
    assert.equal(getAdjacentPosts("older").prev?.slug, "newer");
    assert.deepEqual(getAdjacentPosts("draft"), { prev: null, next: null });
    assert.deepEqual(getAllTags(), []);
  });

  test("rejects a draft flag that is not a boolean", (t) => {
    const root = useTemporarySite({
      // Quoted, so YAML hands over the string "true" rather than a boolean.
      "quoted.md": datedPost("Quoted", daysFromToday(-1), '"true"'),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    buildAs(t, "production");

    assert.throws(() => getSortedPosts(), {
      message:
        'quoted.md: frontmatter "draft" must be true or false, received "true"',
    });
  });
});

describe("getSearchIndex", () => {
  test("carries the body text of every post, keyed by slug", () => {
    useFixture("site");

    const index = getSearchIndex();

    assert.deepEqual(Object.keys(index).sort(), [
      "alpha-post",
      "beta-post",
      "gamma-post",
      "long-post",
      "short-post",
    ]);
    assert.match(index["alpha-post"], /Body text for the alpha post\./);
  });

  test("indexes code, which is half of what a reader searches for", () => {
    useFixture("site");

    // alpha-post carries a fenced `const highlighted: boolean = true;`.
    assert.match(getSearchIndex()["alpha-post"], /const highlighted: boolean/);
  });

  test("keeps markup out and collapses whitespace", () => {
    useFixture("site");

    const text = getSearchIndex()["alpha-post"];

    assert.doesNotMatch(text, /<[a-z/]/i, "expected no markup in the index");
    assert.doesNotMatch(text, /\s\s|\n/, "expected whitespace to be collapsed");
    // Heading text is part of the body a reader searches.
    assert.match(text, /Shared heading/);
  });

  test("leaves out drafts and posts dated ahead, like every other reader", (t) => {
    const root = useTemporarySite({
      "published.md": datedPost("Published", daysFromToday(-1)),
      "draft.md": datedPost("Draft", daysFromToday(-1), "true"),
      "scheduled.md": datedPost("Scheduled", daysFromToday(1)),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    buildAs(t, "production");

    assert.deepEqual(Object.keys(getSearchIndex()), ["published"]);
  });
});

describe("getRelatedPosts", () => {
  test("ranks by shared tags, then by recency", (t) => {
    const root = useTemporarySite({
      // The subject carries Alpha and Beta.
      "subject.md": taggedPost("Subject", daysFromToday(-1), ["Alpha", "Beta"]),
      "both.md": taggedPost("Both", daysFromToday(-9), ["Alpha", "Beta"]),
      "one-old.md": taggedPost("One old", daysFromToday(-8), ["Alpha"]),
      "one-new.md": taggedPost("One new", daysFromToday(-2), ["Beta"]),
      "none.md": taggedPost("None", daysFromToday(-3), ["Gamma"]),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    assert.deepEqual(
      getRelatedPosts("subject").map((post) => post.title),
      // Two shared tags first, even though it is the oldest; then the
      // single-tag posts, newest of them first.
      ["Both", "One new", "One old"],
    );
  });

  test("never lists the post itself", (t) => {
    const root = useTemporarySite({
      "subject.md": taggedPost("Subject", daysFromToday(-1), ["Alpha"]),
      "other.md": taggedPost("Other", daysFromToday(-2), ["Alpha"]),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    assert.deepEqual(
      getRelatedPosts("subject").map((post) => post.slug),
      ["other"],
    );
  });

  test("falls back to recent posts when nothing overlaps", (t) => {
    const root = useTemporarySite({
      "subject.md": taggedPost("Subject", daysFromToday(-1), ["Alpha"]),
      "older.md": taggedPost("Older", daysFromToday(-5), ["Gamma"]),
      "newer.md": taggedPost("Newer", daysFromToday(-2), ["Delta"]),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    // Rather than an empty section: on an archive this small, what else is
    // recent is the useful answer.
    assert.deepEqual(
      getRelatedPosts("subject").map((post) => post.title),
      ["Newer", "Older"],
    );
  });

  test("returns at most the limit asked for", (t) => {
    const root = useTemporarySite({
      "subject.md": taggedPost("Subject", daysFromToday(-1), ["Alpha"]),
      "a.md": taggedPost("A", daysFromToday(-2), ["Alpha"]),
      "b.md": taggedPost("B", daysFromToday(-3), ["Alpha"]),
      "c.md": taggedPost("C", daysFromToday(-4), ["Alpha"]),
      "d.md": taggedPost("D", daysFromToday(-5), ["Alpha"]),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    assert.equal(getRelatedPosts("subject").length, 3, "three by default");
    assert.equal(getRelatedPosts("subject", 2).length, 2);
  });

  test("leaves out drafts and posts dated ahead", (t) => {
    const root = useTemporarySite({
      "subject.md": taggedPost("Subject", daysFromToday(-1), ["Alpha"]),
      "draft.md": taggedPost("Draft", daysFromToday(-2), ["Alpha"], "true"),
      "scheduled.md": taggedPost("Scheduled", daysFromToday(2), ["Alpha"]),
      "published.md": taggedPost("Published", daysFromToday(-3), ["Alpha"]),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    buildAs(t, "production");

    assert.deepEqual(
      getRelatedPosts("subject").map((post) => post.title),
      ["Published"],
    );
  });

  test("returns nothing for a slug that is not a post", (t) => {
    const root = useTemporarySite({
      "subject.md": taggedPost("Subject", daysFromToday(-1), ["Alpha"]),
    });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    assert.deepEqual(getRelatedPosts("no-such-post"), []);
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
