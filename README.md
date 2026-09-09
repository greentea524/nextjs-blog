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
| Markdown  | remark + remark-gfm → rehype + Shiki       |
| Styling   | Vanilla CSS with CSS Modules               |
| Tests     | node --test, no test dependencies          |
| Hosting   | GitHub Pages (static export)               |

There is no backend. Everything runs at build time; the deployed site is a
folder of HTML, CSS, and JS.

## Local development

```bash
npm install
npm run dev     # http://localhost:3000/nextjs-blog
npm run build   # writes the static site to out/
npm run lint
npm test        # unit tests for lib/posts.ts
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

Two frontmatter fields keep a post out of the published site:

- `draft: true` hides it. The value must be an unquoted boolean — a quoted
  `"true"` is a string, and the build fails rather than publish a post its
  author believed was hidden.
- A `date` after today hides it until that day, evaluated in UTC. Write a post
  ahead of time and the first build on or after its date picks it up.

Both apply to `next build` only. `next dev` shows every post, so a draft can be
written and previewed at its real URL before it goes live. A hidden post is
absent from everything the build emits: its own page, the home page, tag
archives, `sitemap.xml`, `feed.xml` and its OG image.

Each distinct value in `tags` gets its own statically-built archive at
`/tags/<slug>/`, where the slug is the lowercased, hyphenated tag
("Game Dev" becomes `game-dev`, "Next.js" becomes `nextjs`). Because that
mapping is lossy, two tags that differ only in punctuation or case would
collide on one URL and silently serve half their posts — so the build fails
and names both tags instead. Rename one and it passes.

That slug function lives in `lib/tags.ts`, separate from the `slugify` used
for heading anchors in `lib/posts.ts`, because the home page filter is a
client component and `lib/posts.ts` reads the filesystem. Both the filter and
the server-rendered archives have to derive the same URL.

`formatDate` is split for the same reason and lives in `lib/format.ts`, which
`lib/posts.ts` re-exports — one implementation, reachable from both sides.

The home page search box matches post bodies as well as titles, excerpts and
tags. Body text is emitted at build time as `search-index.json` (48 KB, 20 KB
over the wire) and fetched on the reader's first keystroke, so the page costs
nothing extra for anyone who never searches. If that fetch fails, searching
falls back to titles, excerpts and tags. Matches a reader can see on the card
rank above body-only matches.

All three frontmatter fields are required and validated at build time: a
missing or malformed field fails the build with the filename in the error
rather than rendering `undefined` into a meta tag. Reading time is derived from
word count, not declared.

Commit and push to `main` — the workflow rebuilds and redeploys.

## Feeds, SEO, and social previews

The build emits four things beyond the pages themselves:

| Output                       | Source                    | Notes                                        |
| ---------------------------- | ------------------------- | -------------------------------------------- |
| `/feed.xml`                  | `app/feed.xml/route.ts`   | RSS 2.0, full post HTML in `content:encoded` |
| `/sitemap.xml`               | `app/sitemap.ts`          | Home, every post, every tag archive          |
| `/robots.txt`                | `app/robots.ts`           | Points at the sitemap                        |
| `/og.png`, `/posts/*/og.png` | `app/**/og.png/route.tsx` | 1200×630 social cards rendered by `next/og`  |
| `/tags/<tag>/`               | `app/tags/[tag]/page.tsx` | One static archive per tag                   |

Two deployment details shape how these are built:

- **The social cards are route handlers, not the `opengraph-image` file
  convention.** GitHub Pages derives `Content-Type` from the file extension
  alone, and the metadata convention emits an extensionless `opengraph-image`
  file that Pages serves as `application/octet-stream` — which crawlers reject.
  Naming the route segment `og.png` gives the exported file a real extension.
  (`generateImageMetadata` can supply an extension at the app root, but it is
  not supported inside a dynamic segment under `output: export`.) Because a
  route handler does not inject `og:image` tags the way the file convention
  does, those tags are declared by hand in the `metadata` exports.
- **`robots.txt` is published but not consulted.** Crawlers only read
  `robots.txt` from the domain root, and a project site serves it from
  `/nextjs-blog/robots.txt`. It is still correct to ship — it documents intent
  and becomes live if the site ever moves to a custom domain. Submit
  `/nextjs-blog/sitemap.xml` to Search Console directly in the meantime.

Every page also carries JSON-LD: `BlogPosting` on articles, `Blog` on the
index, `CollectionPage` on tag archives. Note that Next replaces the whole `alternates` metadata object per
route rather than merging it, so any page declaring a canonical URL must also
spread in `feedAlternates` from `lib/site.ts` to keep RSS autodiscovery.

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
- The header toggle cycles System → Light → Dark. A choice is stored in
  `localStorage` and applied by a one-line script in `<head>`, so it lands
  before the first paint rather than after hydration. With nothing stored the
  attribute stays off and `prefers-color-scheme` decides — which is also what
  happens when JavaScript never runs. `lib/theme.ts` holds the storage key and
  that script, so the toggle and the markup cannot disagree.
- Parsed and rendered posts are memoized per process, keyed by file path and
  modification time. A build reads each markdown file once; `next dev` still
  picks up an edit as soon as it lands.
- Code blocks are syntax-highlighted by Shiki during `next build`. Each token
  carries a light and a dark colour as an inline CSS variable, so switching
  themes is a CSS-only swap and no highlighting JavaScript reaches the browser.
- `npm audit` reports advisories in the dev toolchain (ESLint's `minimatch`
  chain and PostCSS). None are runtime dependencies, so nothing reaches the
  browser.
