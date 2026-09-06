/**
 * Tag helpers that are safe to import from client components.
 *
 * `lib/posts.ts` reads the filesystem and so can never be pulled into a client
 * bundle. The slug function lives here instead, so the home page's filter and
 * the server-rendered archive pages derive tag URLs the same way.
 */

/** URL form of a tag: "Game Dev" -> "game-dev", "Next.js" -> "nextjs". */
export function tagSlug(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
