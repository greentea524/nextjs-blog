import { getPostBySlug, getSortedPosts } from "@/lib/posts";
import { postUrl, siteConfig, siteUrl } from "@/lib/site";

// Rendered once at build time into out/feed.xml — the static export has no
// server, and nothing here depends on the incoming request.
export const dynamic = "force-static";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Post bodies go in a CDATA section so the rendered HTML survives intact. The
 * one sequence CDATA cannot contain is its own terminator, so split any `]]>`
 * across two sections.
 */
function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/** RSS wants RFC 822 dates; posts carry a bare YYYY-MM-DD calendar date. */
function toRfc822(date: string): string {
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

export async function GET(): Promise<Response> {
  const posts = getSortedPosts();

  // Rendering a body is async because of syntax highlighting, so the items are
  // built in parallel; the feed's ordering comes from `posts`, not from
  // whichever render happens to finish first.
  const items = await Promise.all(
    posts.map(async (meta) => {
      const url = postUrl(meta.slug);
      const post = await getPostBySlug(meta.slug);
      const categories = meta.tags
        .map((tag) => `      <category>${escapeXml(tag)}</category>`)
        .join("\n");

      return [
        "    <item>",
        `      <title>${escapeXml(meta.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <pubDate>${toRfc822(meta.date)}</pubDate>`,
        `      <description>${escapeXml(meta.excerpt)}</description>`,
        categories,
        post
          ? `      <content:encoded>${cdata(post.contentHtml)}</content:encoded>`
          : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  );

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteConfig.title)}</title>
    <link>${escapeXml(siteUrl("/"))}</link>
    <description>${escapeXml(siteConfig.description)}</description>
    <language>${siteConfig.language}</language>
    <atom:link href="${escapeXml(siteUrl("/feed.xml"))}" rel="self" type="application/rss+xml" />
${posts[0] ? `    <lastBuildDate>${toRfc822(posts[0].date)}</lastBuildDate>\n` : ""}${items.join("\n")}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
