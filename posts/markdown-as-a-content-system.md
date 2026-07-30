---
title: "Markdown as a content system"
date: "2026-02-02"
excerpt: "Frontmatter plus a directory of .md files is a real content model. It just happens to be one you can read in a terminal and diff in a pull request."
---

"Content management system" usually means a database, an admin panel, and a
login. For a personal site, a directory of markdown files does the same job with
a fraction of the moving parts.

## The schema is the frontmatter

Every post opens with a small YAML block:

```yaml
---
title: "Markdown as a content system"
date: "2026-02-02"
excerpt: "Frontmatter plus a directory of .md files is a real content model."
---
```

Three fields, all required. That is the entire schema, and it is enforced at
build time rather than by a form.

## Validate at the boundary

The one real weakness of file-based content is that nothing stops you from
committing a typo in a field name. So the loader treats frontmatter as untrusted
input and fails loudly:

```ts
function requireString(value: unknown, field: string, fileName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${fileName}: frontmatter "${field}" is required and must be a non-empty string`,
    );
  }

  return value;
}
```

A missing `excerpt` breaks the build with the filename in the message, instead
of rendering `undefined` into a meta tag that nobody notices for a month.

## Dates are the sharp edge

YAML converts an unquoted `date: 2026-02-02` into a date object, and a quoted
one into a string. Those take different code paths, and if you format the date
object in local time, anyone west of Greenwich sees the post a day early. Pin
the formatting to UTC and normalize both shapes on the way in.

## What you get for free

Because posts are files in the repository, the tooling you already use applies:

| Want to…              | Use                                  |
| --------------------- | ------------------------------------ |
| See what changed      | `git diff`                           |
| Review before publish | A pull request                       |
| Restore a deletion    | `git revert`                         |
| Find a phrase         | `grep`                               |
| Write offline         | Any text editor                      |

None of that had to be built. It came along with storing content the same way
you store code.
