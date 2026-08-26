import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { remark } from "remark";
import gfm from "remark-gfm";
import html from "remark-html";

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

export type Post = PostMeta & {
  /** Rendered markdown body. */
  contentHtml: string;
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

export function getPostBySlug(slug: string): Post | null {
  const fileName = `${slug}.md`;

  if (!postFileNames().includes(fileName)) {
    return null;
  }

  const { meta, content } = readPostFile(fileName);
  // GFM adds tables, strikethrough, and autolinks on top of CommonMark —
  // without it a markdown table renders as raw pipe characters.
  //
  // Posts are local files written by the site author, so the markdown is
  // trusted and rendered without sanitization.
  const processed = remark().use(gfm).use(html).processSync(content);

  return { ...meta, contentHtml: processed.toString() };
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
