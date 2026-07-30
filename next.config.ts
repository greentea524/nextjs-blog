import type { NextConfig } from "next";

/**
 * Deployed to GitHub Pages as a project site, so everything is served from
 * https://greentea524.github.io/nextjs-blog rather than the domain root.
 * Keep this in sync with `url` in lib/site.ts.
 */
const basePath = "/nextjs-blog";

const nextConfig: NextConfig = {
  // Emit a plain HTML/CSS/JS bundle into out/ — GitHub Pages has no server runtime.
  output: "export",

  basePath,
  assetPrefix: basePath,

  // Emit out/posts/<slug>/index.html instead of out/posts/<slug>.html so Pages
  // resolves post URLs from the directory index without extension guessing.
  trailingSlash: true,

  // next/image's default loader needs a server to optimize on request.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
