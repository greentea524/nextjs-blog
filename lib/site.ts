/**
 * Single source of truth for site-wide strings.
 *
 * `url` must include the GitHub Pages project sub-path and stay in sync with
 * `basePath` in next.config.ts — it is what `metadataBase` resolves Open Graph
 * and canonical URLs against.
 */
export const siteConfig = {
  name: "David Phong",
  title: "David Phong — Notes",
  description:
    "Notes on building things for the web — frontend frameworks, static site generation, and the occasional backend detour.",
  url: "https://greentea524.github.io/nextjs-blog",
  github: "https://github.com/greentea524",
  language: "en",
} as const;

/**
 * Absolute URL for a site-root-relative path, including the project sub-path.
 *
 * Next resolves `metadataBase` for us inside `metadata` exports, but sitemap
 * entries, the RSS feed, and JSON-LD are plain strings that have to carry the
 * full origin themselves.
 *
 * `path` is expected to start with "/" and, because `trailingSlash` is on, to
 * end with one for anything that maps to a page.
 */
export function siteUrl(path: string): string {
  return `${siteConfig.url}${path}`;
}

/** Canonical absolute URL for a post, matching the exported directory index. */
export function postUrl(slug: string): string {
  return siteUrl(`/posts/${slug}/`);
}

/**
 * RSS autodiscovery link for the document head.
 *
 * Next replaces the whole `alternates` object at each metadata level instead
 * of merging it, so every page that declares a canonical URL has to spread
 * this in alongside — otherwise the layout's copy is dropped for that route.
 */
export const feedAlternates = {
  types: {
    "application/rss+xml": [{ url: "/feed.xml", title: siteConfig.title }],
  },
};
