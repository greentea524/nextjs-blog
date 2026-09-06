import type { MetadataRoute } from "next";
import { getSortedPosts } from "@/lib/posts";
import { postUrl, siteUrl } from "@/lib/site";

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
  ];
}
