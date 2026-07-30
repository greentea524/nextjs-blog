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
} as const;
