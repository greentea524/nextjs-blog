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

const postsDirectory = path.join(process.cwd(), "posts");

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

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  }
  return [];
}

function readPostFile(fileName: string) {
  const slug = fileName.replace(/\.md$/, "");
  const fullPath = path.join(postsDirectory, fileName);
  const { data, content } = matter(fs.readFileSync(fullPath, "utf8"));

  const meta: PostMeta = {
    slug,
    title: requireString(data.title, "title", fileName),
    date: normalizeDate(data.date, fileName),
    excerpt: requireString(data.excerpt, "excerpt", fileName),
    readingMinutes: readingMinutes(content),
    tags: parseTags(data.tags),
  };

  return { meta, content };
}

function postFileNames(): string[] {
  return fs
    .readdirSync(postsDirectory)
    .filter((fileName) => fileName.endsWith(".md"));
}

export function getPostSlugs(): string[] {
  return postFileNames().map((fileName) => fileName.replace(/\.md$/, ""));
}

/** Every post's metadata, newest first. */
export function getSortedPosts(): PostMeta[] {
  return postFileNames()
    .map((fileName) => readPostFile(fileName).meta)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
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
    theme: { light: "github-light", dark: "github-dark" },
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

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const fileName = `${slug}.md`;

  if (!postFileNames().includes(fileName)) {
    return null;
  }

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
