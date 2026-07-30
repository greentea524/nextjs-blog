---
title: "Static site generation, end to end"
date: "2026-03-12"
excerpt: "What actually happens between npm run build and a folder of HTML — dynamic routes, the export step, and the sub-path detail that breaks deploys."
---

Static site generation gets described as "rendering at build time," which is
accurate but skips the part that matters: how the build discovers which pages to
render in the first place.

## Routes come from the filesystem, twice

There are two filesystems in play. The first is `app/`, which defines the shape
of the routes:

```
app/
├── layout.tsx
├── page.tsx              → /
└── posts/
    └── [slug]/
        └── page.tsx      → /posts/:slug
```

The second is `posts/`, which decides how many pages `[slug]` becomes. The
bridge between them is one function:

```ts
export async function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}
```

The build calls it, gets a list of slugs, and renders the page component once
per slug. Three markdown files produce three HTML files. Add a fourth and the
next build produces a fourth — no route registration anywhere.

## The export step

With `output: "export"`, the build writes a directory of files and stops. No
server bundle, no runtime. Two configuration details matter more than they look:

- **`trailingSlash: true`** emits `posts/<slug>/index.html` rather than
  `posts/<slug>.html`, so any host resolves the URL from the directory index.
- **`basePath`** prefixes every generated link and asset URL.

That second one is the classic broken deploy. A project site is served from a
sub-path, not the domain root, so a build that assumes `/` requests its
JavaScript from `/_next/...`, gets a 404, and renders unstyled HTML. Set
`basePath` and the framework rewrites the links for you.

## Reading files during a render

Because the page component runs at build time on a machine with a filesystem,
it can just read one:

```ts
const post = getPostBySlug(slug);
```

No fetch, no API, no client-side loading state. The call happens once, during
the build, and its result is baked into the HTML. The same line at request time
would need a server; here it needs a directory.

## Where it stops working

The moment a page depends on the request — a signed-in user, a search query, a
live price — static generation cannot help, because the build has no request to
read. Everything else is a candidate.
