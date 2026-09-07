import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Element, Root } from "hast";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";
// Explicit ".ts" so this resolves under Node's test runner as well as the
// bundler — tsconfig enables allowImportingTsExtensions for the same reason.
import { tagSlug } from "./tags.ts";

/**
 * Resolved per call rather than once at import, so a test can point the reader
 * at a fixture directory by changing the working directory. A build never
 * changes it.
 */
function postsDirectory(): string {
  return path.join(process.cwd(), "posts");
}

const WORDS_PER_MINUTE = 200;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type PostMeta = {
  slug: string;
  title: string;
  /** ISO calendar date, YYYY-MM-DD. */
  date: string;
  excerpt: string;
  readingMinutes: number;
  tags: string[];
};

export type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

export type Post = PostMeta & {
  /** Rendered markdown body with heading ids. */
  contentHtml: string;
  /** Extracted table of contents items. */
  toc: TocItem[];
};

/**
 * YAML turns an unquoted `date: 2026-01-15` into a Date, while a quoted one
 * stays a string. Normalize both to YYYY-MM-DD, reading the Date in UTC so a
 * machine west of Greenwich doesn't shift the post back a day.
 */
function normalizeDate(value: unknown, fileName: string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string" && DATE_PATTERN.test(value)) {
    return value;
  }

  throw new Error(
    `${fileName}: frontmatter "date" must be a YYYY-MM-DD calendar date, received ${JSON.stringify(value)}`,
  );
}

function requireString(
  value: unknown,
  field: string,
  fileName: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${fileName}: frontmatter "${field}" is required and must be a non-empty string`,
    );
  }

  return value;
}

function readingMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * An unquoted `draft: true` is the only spelling that hides a post. A quoted
 * "true" is a string, and silently publishing a post its author believed was
 * hidden is the one failure worth being loud about.
 */
function parseDraft(value: unknown, fileName: string): boolean {
  if (value === undefined) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw new Error(
      `${fileName}: frontmatter "draft" must be true or false, received ${JSON.stringify(value)}`,
    );
  }

  return value;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  }
  return [];
}

type ParsedPost = { meta: PostMeta; content: string; draft: boolean };

/**
 * Parsed frontmatter and body, keyed by absolute path.
 *
 * `getSortedPosts()` runs once per page — home, tag aggregation, and adjacent
 * post navigation on every post — so without this each file is read and parsed
 * a number of times that grows with the number of posts. Entries carry the
 * modification time they were parsed at, so a build parses each file exactly
 * once while `next dev` still picks up an edit as soon as it lands.
 *
 * Cached values are handed out directly rather than copied. Nothing in the
 * site mutates a post, and copying on every read would undo the saving.
 */
const parsedPosts = new Map<string, { mtimeMs: number; parsed: ParsedPost }>();

function readPostFile(fileName: string): ParsedPost {
  const fullPath = path.join(postsDirectory(), fileName);
  const { mtimeMs } = fs.statSync(fullPath);

  const cached = parsedPosts.get(fullPath);
  if (cached?.mtimeMs === mtimeMs) {
    return cached.parsed;
  }

  const slug = fileName.replace(/\.md$/, "");
  const { data, content } = matter(fs.readFileSync(fullPath, "utf8"));

  const meta: PostMeta = {
    slug,
    title: requireString(data.title, "title", fileName),
    date: normalizeDate(data.date, fileName),
    excerpt: requireString(data.excerpt, "excerpt", fileName),
    readingMinutes: readingMinutes(content),
    tags: parseTags(data.tags),
  };

  const parsed: ParsedPost = {
    meta,
    content,
    draft: parseDraft(data.draft, fileName),
  };
  parsedPosts.set(fullPath, { mtimeMs, parsed });

  return parsed;
}

function postFileNames(): string[] {
  return fs
    .readdirSync(postsDirectory())
    .filter((fileName) => fileName.endsWith(".md"));
}

/** Today's calendar date in UTC, matching how post dates are normalized. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Whether a post belongs in the site being built.
 *
 * A draft, or a post dated after today, is left out of a production build but
 * kept in `next dev`, so work in progress can be committed and previewed
 * without going live. Every entry point reads posts through `getSortedPosts()`
 * or `getPostBySlug()`, so filtering here covers the home page, tag archives,
 * post pages, adjacent-post navigation, the sitemap, the feed and OG images
 * alike.
 */
function isPublished(parsed: ParsedPost): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return !parsed.draft && parsed.meta.date <= todayUtc();
}

/** Every slug that should be built, in the same order as `getSortedPosts()`. */
export function getPostSlugs(): string[] {
  return getSortedPosts().map((post) => post.slug);
}

/**
 * Every post's metadata, newest first.
 *
 * Posts sharing a date keep the order the directory listing gave them, which
 * is alphabetical by filename. Returning a non-zero comparison for equal dates
 * would leave the result at the mercy of the sort implementation.
 */
export function getSortedPosts(): PostMeta[] {
  return postFileNames()
    .map((fileName) => readPostFile(fileName))
    .filter(isPublished)
    .map((parsed) => parsed.meta)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Aggregates all unique tags with post counts, sorted by frequency then name. */
export function getAllTags(): { tag: string; count: number }[] {
  const posts = getSortedPosts();
  const counts = new Map<string, number>();

  for (const post of posts) {
    for (const tag of post.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Concatenates the text of a heading, dropping inline markup like `<code>`. */
function headingText(heading: Element): string {
  let text = "";
  visit(heading, "text", (node) => {
    text += node.value;
  });
  return text.trim();
}

/**
 * Maps each tag slug back to the tag it came from.
 *
 * Two distinct tags can slugify to the same string — "Next.js" and "NextJS"
 * both become "nextjs" — which would quietly serve one archive for both and
 * lose half the posts. That is a content mistake with an obvious fix, so fail
 * the build and name both tags rather than papering over it.
 */
function tagsBySlug(): Map<string, string> {
  const bySlug = new Map<string, string>();

  for (const { tag } of getAllTags()) {
    const slug = tagSlug(tag);
    const existing = bySlug.get(slug);

    if (existing !== undefined && existing !== tag) {
      throw new Error(
        `Tags "${existing}" and "${tag}" both produce the slug "${slug}" — rename one so each tag has its own archive URL.`,
      );
    }

    bySlug.set(slug, tag);
  }

  return bySlug;
}

export { tagSlug };

/** Every tag slug that should be built as an archive page. */
export function getTagSlugs(): string[] {
  return Array.from(tagsBySlug().keys());
}

export type TagArchive = {
  /** The tag as written in frontmatter, for display. */
  tag: string;
  slug: string;
  /** Posts carrying the tag, newest first. */
  posts: PostMeta[];
};

export function getTagBySlug(slug: string): TagArchive | null {
  const tag = tagsBySlug().get(slug);

  if (tag === undefined) {
    return null;
  }

  return {
    tag,
    slug,
    posts: getSortedPosts().filter((post) => post.tags.includes(tag)),
  };
}

/**
 * Injects ids on h2/h3 and collects the table of contents in the same pass,
 * leaving the result on the file so `getPostBySlug` can read it back.
 */
function rehypeHeadingIds() {
  return (tree: Root, file: VFile) => {
    const toc: TocItem[] = [];
    const slugCounts = new Map<string, number>();

    visit(tree, "element", (node) => {
      if (node.tagName !== "h2" && node.tagName !== "h3") {
        return;
      }

      const level = node.tagName === "h2" ? 2 : 3;
      const text = headingText(node);
      let id = slugify(text) || `section-${toc.length + 1}`;

      // Repeated heading text gets a counter suffix so every id stays unique.
      const count = slugCounts.get(id) ?? 0;
      slugCounts.set(id, count + 1);
      if (count > 0) {
        id = `${id}-${count}`;
      }

      node.properties.id = id;
      toc.push({ id, text, level });
    });

    file.data.toc = toc;
  };
}

declare module "vfile" {
  interface DataMap {
    toc: TocItem[];
  }
}

// GFM adds tables, strikethrough, and autolinks on top of CommonMark — without
// it a markdown table renders as raw pipe characters.
//
// Posts are local files written by the site author, so the markdown is trusted
// and rendered without sanitization.
//
// Shiki tokenizes code blocks here, at build time, emitting a light and a dark
// colour per token as inline CSS variables — no highlighting JavaScript is
// shipped to the reader. See `.prose pre` in the post stylesheet for the
// variable that each theme picks up.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeHeadingIds)
  .use(rehypePrettyCode, {
    // The -default pair carries GitHub's current token colours, whose dimmest
    // tokens (comments, parameters) hold far more contrast against the code
    // panel than the older github-light/github-dark pair did.
    theme: { light: "github-light-default", dark: "github-dark-default" },
    // The post stylesheet already gives `pre` its surface and border; taking
    // Shiki's background too would leave code blocks out of step with the
    // site's palette.
    keepBackground: false,
    // Line rows only matter for line highlighting, which posts don't use, and
    // a grid container breaks horizontal scrolling of long lines.
    grid: false,
    // Fences written without a language still get the same markup, so every
    // code block on the site is styled identically.
    defaultLang: { block: "plaintext" },
  })
  .use(rehypeStringify);

async function renderPost(fileName: string): Promise<Post> {
  const { meta, content } = readPostFile(fileName);
  // Shiki loads its themes and grammars asynchronously, so rendering a post is
  // async too. It all still happens during `next build`.
  const file = await processor.process(content);

  return {
    ...meta,
    contentHtml: String(file),
    toc: file.data.toc ?? [],
  };
}

/**
 * Rendered posts, keyed and invalidated exactly like `parsedPosts` above.
 *
 * Highlighting is the expensive half of rendering, and a post page asks for
 * its post twice — once for `generateMetadata`, once for the page itself.
 * Storing the promise rather than the result also means two concurrent callers
 * share one render instead of racing to do the same work twice.
 */
const renderedPosts = new Map<string, { mtimeMs: number; post: Promise<Post> }>();

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const fileName = `${slug}.md`;

  if (!postFileNames().includes(fileName)) {
    return null;
  }

  if (!isPublished(readPostFile(fileName))) {
    return null;
  }

  const fullPath = path.join(postsDirectory(), fileName);
  const { mtimeMs } = fs.statSync(fullPath);

  const cached = renderedPosts.get(fullPath);
  if (cached?.mtimeMs === mtimeMs) {
    return cached.post;
  }

  const post = renderPost(fileName).catch((error: unknown) => {
    // A failed render must not be pinned in the cache until the file changes.
    renderedPosts.delete(fullPath);
    throw error;
  });
  renderedPosts.set(fullPath, { mtimeMs, post });

  return post;
}

export type AdjacentPosts = {
  prev: PostMeta | null;
  next: PostMeta | null;
};

/**
 * Returns previous (newer) and next (older) post metadata relative to the given slug.
 */
export function getAdjacentPosts(slug: string): AdjacentPosts {
  const posts = getSortedPosts();
  const index = posts.findIndex((p) => p.slug === slug);

  if (index === -1) {
    return { prev: null, next: null };
  }

  return {
    prev: index > 0 ? posts[index - 1] : null,
    next: index < posts.length - 1 ? posts[index + 1] : null,
  };
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** Renders YYYY-MM-DD as "January 15, 2026", pinned to UTC for stable output. */
export function formatDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}
