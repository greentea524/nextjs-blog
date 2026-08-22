---
title: "How this blog is built"
date: "2026-08-22"
excerpt: "Next.js 16, the App Router, static export, markdown files, CSS Modules, TypeScript, and GitHub Pages — every choice explained, and what was deliberately left out."
---

This site is a static blog. Every page is generated at build time, deployed to
a CDN, and served without a server. Here is every framework choice that makes
that work, and why alternatives were passed over.

## Next.js 16 with the App Router

The framework is Next.js 16 using the App Router — `app/` directory, server
components by default, `generateStaticParams` for dynamic routes. No Pages
Router, no `getStaticProps`.

The App Router was chosen over the Pages Router for one reason: it is where
Next.js is headed. Layout nesting, metadata generation, and loading states are
built into the file-system conventions instead of bolted on with per-page
exports.

The site could be built with Astro, Hugo, or Eleventy. Next.js was picked
because it is also the framework behind other projects in the portfolio, so one
set of conventions covers everything.

## Static export

`next.config.ts` sets `output: "export"`, which emits a plain `out/` directory
of HTML, CSS, and JS — no Node.js runtime required. This is the same output
model as a traditional static site generator.

The tradeoff: no server-side features. No API routes, no ISR, no middleware, no
image optimization. Every page must be known at build time. For a blog with a
handful of posts and no per-visitor state, that is not a tradeoff — it is a
simplification.

## Markdown as the content layer

Posts live in a `posts/` directory as `.md` files. Each file opens with YAML
frontmatter:

```yaml
---
title: "How this blog is built"
date: "2026-08-22"
excerpt: "A short description for the post list and SEO."
---
```

Three fields, all required, validated at build time. A missing `excerpt` breaks
the build with the filename in the error — not a silent `undefined` in a meta
tag.

The frontmatter is parsed by `gray-matter`. The markdown body is converted to
HTML by `remark` with `remark-gfm` for tables and strikethrough. No MDX — the
posts do not need interactive components, so the extra complexity is not
justified.

## TypeScript with strict mode

Every file is TypeScript. `strict: true` in `tsconfig.json` catches the things
that matter most in a small codebase: null access, missing properties, implicit
`any`. The build runs the type checker before generating pages, so type errors
are deployment blockers, not warnings.

## CSS Modules, no utility framework

Styling uses CSS Modules — colocated `.module.css` files scoped to each
component. No Tailwind, no CSS-in-JS, no design system library.

The reasoning: this site has two page layouts and a handful of typographic
styles. A utility framework would add a build step, a learning curve for
readers of the code, and hundreds of class names to express what a few dozen
CSS rules already cover. When the design is this small, plain CSS is the
faster option in both senses — less to load and less to maintain.

## Deployment to GitHub Pages

A GitHub Actions workflow runs on every push to `main`:

1. `npm ci` — install dependencies
2. `npm run lint` — ESLint with `core-web-vitals` and TypeScript rules
3. `npm run build` — static export to `out/`
4. Deploy `out/` to GitHub Pages

The site is served from `https://greentea524.github.io/nextjs-blog`, which
means `basePath` and `assetPrefix` in `next.config.ts` are both set to
`/nextjs-blog` so asset URLs resolve correctly under the project sub-path.

No Vercel, no Netlify, no paid hosting. GitHub Pages is free, backed by a CDN,
and the deployment is a `git push`.

## What was left out

Deliberate omissions, not oversights:

- **No database.** Content is files. Version history is git.
- **No CMS.** Publishing means committing a markdown file.
- **No image optimization.** `images.unoptimized: true` — the site has no
  images yet, and when it does, they can be optimized at the source.
- **No client-side JavaScript for interactivity.** Every page is static HTML.
  React hydrates the shell for client-side navigation, but there are no
  interactive widgets.
- **No analytics.** If that changes, it will be a single script tag, not a
  framework decision.

## The dependency count

The production `dependencies` list:

| Package | Purpose |
| ------------ | -------------------------------------------- |
| `next` | Framework and static export |
| `react` | Component model |
| `react-dom` | DOM rendering |
| `gray-matter` | Frontmatter parsing |
| `remark` | Markdown to HTML |
| `remark-gfm` | GitHub Flavored Markdown (tables, autolinks) |
| `remark-html` | HTML serializer for remark |

Seven packages. The site compiles in under twelve seconds on a laptop. That is
the advantage of choosing the smallest thing that works.
