import { renderOgImage } from "@/lib/og";
import { siteConfig } from "@/lib/site";

// Rendered once at build time into out/og.png.
//
// This is a route handler rather than the `opengraph-image` metadata
// convention so the exported file keeps its ".png" extension: GitHub Pages
// derives Content-Type from the extension alone, and an extensionless file is
// served as application/octet-stream, which social crawlers reject.
export const dynamic = "force-static";

export function GET(): Response {
  return renderOgImage({
    title: siteConfig.name,
    subtitle: siteConfig.description,
  });
}
