import type { MetadataRoute } from "next";
import { getSortedPosts, getTagBySlug, getTagSlugs } from "@/lib/posts";
import { postUrl, siteUrl, tagUrl } from "@/lib/site";

// Emitted as a static out/sitemap.xml at build time.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getSortedPosts();

  return [
    {
      url: siteUrl("/"),
      // The index changes whenever the newest post does.
      lastModified: posts[0]?.date,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...posts.map((post) => ({
      url: postUrl(post.slug),
      lastModified: post.date,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    // A tag archive changes when its newest post does.
    ...getTagSlugs().map((slug) => ({
      url: tagUrl(slug),
      lastModified: getTagBySlug(slug)?.posts[0]?.date,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
