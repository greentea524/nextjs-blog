# nextjs-blog

A statically-generated blog built with Next.js (App Router). Posts are local
markdown files; the build renders them to HTML and publishes to GitHub Pages.

Live at **https://greentea524.github.io/nextjs-blog/**

Tracked as [KAN-67](https://gtea524.atlassian.net/browse/KAN-67).

## Stack

| Layer     | Choice                                     |
| --------- | ------------------------------------------ |
| Framework | Next.js 16 (App Router)                    |
| Rendering | SSG via `generateStaticParams`             |
| Content   | Local `.md` files, gray-matter frontmatter |
| Markdown  | remark + remark-gfm + remark-html          |
| Styling   | Vanilla CSS with CSS Modules               |
| Hosting   | GitHub Pages (static export)               |

There is no backend. Everything runs at build time; the deployed site is a
folder of HTML, CSS, and JS.

## Local development

```bash
npm install
npm run dev     # http://localhost:3000/nextjs-blog
npm run build   # writes the static site to out/
npm run lint
```

The dev server and build both serve from the `/nextjs-blog` sub-path, matching
how GitHub Pages hosts a project site.

To preview a production build exactly as it will be served:

```bash
npm run build
mkdir -p .preview && ln -sfn "$PWD/out" .preview/nextjs-blog
python3 -m http.server 4173 --directory .preview
# http://localhost:4173/nextjs-blog/
```

## Writing a post

Add a `.md` file to `posts/`. The filename becomes the URL slug, so
`posts/my-post.md` is served at `/posts/my-post/`.

```markdown
---
title: "Your title"
date: "2026-07-30"
excerpt: "One or two sentences shown on the home page and in meta tags."
---

Body copy starts here. Start headings at `##` — the post title is the page's
only `<h1>`.
```

All three frontmatter fields are required and validated at build time: a
missing or malformed field fails the build with the filename in the error
rather than rendering `undefined` into a meta tag. Reading time is derived from
word count, not declared.

Commit and push to `main` — the workflow rebuilds and redeploys.

## Deployment

`.github/workflows/build-and-deploy.yml` runs on every push to `main`: install,
lint, build, then publish `out/` via `actions/deploy-pages`. It authenticates
with the built-in `GITHUB_TOKEN`, so there are no secrets to configure. The
first run enables Pages on the repository automatically.

Two configuration details make the static export work on Pages:

- **`basePath: "/nextjs-blog"`** in `next.config.ts` — a project site is served
  from a sub-path, and without this every asset URL would 404 against the
  domain root. It must stay in sync with `url` in `lib/site.ts`, which is what
  `metadataBase` resolves Open Graph and canonical URLs against.
- **`trailingSlash: true`** — emits `out/posts/<slug>/index.html` rather than
  `out/posts/<slug>.html`, so Pages resolves post URLs from the directory index.

`public/.nojekyll` is copied into `out/` at build time. The Actions deployment
path does not run Jekyll, but the file costs nothing and prevents the
underscore-prefixed `_next/` directory from being stripped if the repository is
ever switched to the legacy build-from-branch source.

## Notes

- Markdown is rendered without sanitization. Posts are local files written by
  the site author, so the input is trusted — reconsider if content ever comes
  from elsewhere.
- `npm audit` reports advisories in the dev toolchain (ESLint's `minimatch`
  chain and PostCSS). None are runtime dependencies, so nothing reaches the
  browser.
