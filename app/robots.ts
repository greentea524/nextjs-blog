import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Emitted as a static out/robots.txt at build time.
export const dynamic = "force-static";

/**
 * Note: crawlers only read robots.txt from the domain root, and this is a
 * GitHub Pages *project* site, so the emitted file lands at
 * /nextjs-blog/robots.txt and is not consulted automatically. It is still
 * correct to publish — it documents intent, becomes live if the site ever
 * moves to a custom domain or user-site root, and the sitemap can be submitted
 * to Search Console directly in the meantime.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
