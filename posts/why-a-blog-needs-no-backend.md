---
title: "Why a blog needs no backend"
date: "2026-01-15"
excerpt: "A blog is a read-mostly site with a handful of authors and no per-visitor state. That combination is the strongest possible case for shipping plain files."
---

Most blogs are built on a server that assembles the same HTML, from the same
database rows, for every visitor who asks. The result is identical each time.
That is a lot of moving parts to arrive at a fixed answer.

## What a server would actually do here

Walk through a request for a post on a database-backed blog:

1. Accept the connection and route the request.
2. Query the posts table for a row matching the slug.
3. Render the row into a template.
4. Return the HTML.
5. Repeat, identically, for the next visitor.

Steps two through four produce the same bytes every time until the author edits
the post. Doing that work per request is a cache with extra steps — so compute
the answer once, at build time, and serve the result.

## What you give up

Honesty about the tradeoff matters. Without a server there is no request-time
logic, which rules out comment threads, view counters, per-user content, and an
admin UI. Publishing means committing a file and waiting for a build.

> If your content changes on a human schedule rather than a per-request one,
> a build step is a fair price for deleting the entire runtime.

## What you get back

The list is longer than it first appears:

- **No cold starts.** Nothing sleeps, so nothing has to wake up.
- **No database.** Nothing to migrate, back up, or accidentally leave open.
- **No secrets.** A build with no credentials cannot leak any.
- **Trivial hosting.** Any static host will do, most of them free.
- **Real caching.** Immutable files sit happily on a CDN edge.

The interesting consequence is the security surface. A static site has no
request handler to confuse, no query to inject into, and no session to steal.
Whole categories of vulnerability simply do not apply.

## The rule of thumb

Ask what varies per request. For a blog the answer is nothing, so the server
has nothing to decide, and you can delete it.
