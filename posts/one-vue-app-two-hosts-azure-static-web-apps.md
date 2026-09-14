---
title: "One Vue app, two hosts: adding Azure Static Web Apps next to GitHub Pages"
date: "2026-09-14"
excerpt: "The recipe finder already deployed to GitHub Pages. Putting it on Azure Static Web Apps as well took five files and no new code paths. Almost all of the work was removing a hardcoded base path, and deciding not to let Azure write the workflow."
tags: ["Azure", "CI/CD", "Vue", "Static Site"]
---

[vue-recipe-finder](https://github.com/greentea524/vue-recipe-finder) is a small
Vue 3 + Vite app that searches [TheMealDB](https://www.themealdb.com/api.php).
It has no backend, and it has lived on GitHub Pages since it was built.

The goal this time was to learn Azure's static hosting without giving that up.
The app now deploys to both on every push to `main`:

- GitHub Pages: [greentea524.github.io/vue-recipe-finder](https://greentea524.github.io/vue-recipe-finder/)
- Azure Static Web Apps: [zealous-rock-08fc77d10.6.azurestaticapps.net](https://zealous-rock-08fc77d10.6.azurestaticapps.net/)

The whole change was five files. None of it was hard, but most of it was not
what I expected going in.

## The wrong button comes first

I got as far as filling in **App Services → Create Web App** before noticing it
was the wrong form. That creates an **App Service**: a managed server that runs your
code, billed by plan. It is the right resource for an API. It is the wrong
resource for a folder of HTML, CSS and JS.

The resource you want is **Static Web Apps**. It is a CDN for built files with
routing rules, it is free on the Free plan, and it has no runtime to pick. If
the form asks for a runtime stack and an operating system, you are in the wrong
place.

## The real problem is the base path

A GitHub Pages project site is served from a sub-path, so the app was built
around `/vue-recipe-finder/`. Azure serves from the domain root. Build the same
app for both and one of them will be wrong unless nothing hardcodes the path.

Two places did.

**Vite's `base`**, which prefixes every asset URL. That one was easy to make
configurable, keeping the Pages value as the default so the existing deploy
didn't change:

```ts
export default defineConfig({
  base: process.env.VITE_BASE ?? "/vue-recipe-finder/",
  plugins: [vue()],
});
```

**The router**, which had its own copy of the same string, with a comment
saying the two must match:

```ts
// before
const BASE = "/vue-recipe-finder/";
export const router = createRouter({ history: createWebHistory(BASE), /* … */ });

// after
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  /* … */
});
```

The second one is the dangerous kind. Change only Vite's `base` and the Azure
build loads its assets fine, so the page looks correct. But every in-app link
is still built against `/vue-recipe-finder/`, so navigation breaks. A "keep
these in sync" comment is a bug waiting for a second deploy target. Reading
Vite's value removes the copy, so there is nothing left to keep in sync.

The fastest way to catch any copy you missed is to build with the new base and
search the output for the old one:

```bash
VITE_BASE=/ npm run build
grep -rn "/vue-recipe-finder/" dist || echo "no sub-path leftovers"
```

## Deep links need a different trick on each host

This is a single-page app. A cold request for `/recipe/52772` has no file
behind it, so the host must serve the app anyway and let Vue Router resolve the
route in the browser.

**GitHub Pages has no rewrite rules.** The existing workaround is a build step
that copies `index.html` to `404.html`. Pages serves that for any unknown path,
the app boots, and the route renders. It works, with one catch: the response
status really is **404**. A browser doesn't care; a crawler or uptime check
does.

**Azure has rewrites**, configured by a `staticwebapp.config.json` that I put in
`public/` so Vite copies it into the build:

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*"]
  }
}
```

The same deep link on Azure returns **200**. The `exclude` matters: without it,
a request for a missing JavaScript bundle could also get `index.html` back
with a 200, and the failure would show up as a confusing MIME-type error
instead of a clean 404.

Both builds contain both files. Each host ignores the one meant for the other,
so there is no per-host build logic for this.

## Why I didn't let Azure write the workflow

When you create a Static Web App, the portal offers to connect a GitHub repo
and commit a workflow for you. The ticket for this work even suggested it. I
chose **Deployment source: Other** instead, for three reasons:

1. **The generated workflow builds the app itself** using Azure's own build
   system. It knows nothing about `VITE_BASE`, so it would build with the Pages
   sub-path and break the Azure deploy.
2. **It wouldn't run the tests.** The Pages workflow does, and I wanted the
   same gate on both deploys.
3. **It commits to your repo.** I would rather review the workflow in a pull
   request than find it on `main`.

"Other" gives you a deployment token and nothing else. The token goes into a
repo secret, and a hand-written workflow does the rest.

## The workflow

The Azure deploy action can build for you. Here it only uploads, because the
build has already happened:

```yaml
- name: Build
  run: npm run build
  env:
    VITE_BASE: /

- name: Deploy
  uses: Azure/static-web-apps-deploy@v1
  with:
    azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
    action: upload
    app_location: dist
    skip_app_build: true
    skip_api_build: true
```

One more detail: the workflow should be able to land before the secret exists,
so it has to skip without failing. You can't reference `secrets` directly in a step's
`if:`, so the token is mapped to an environment variable and checked in a
first step:

```yaml
env:
  AZURE_TOKEN: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
steps:
  - name: Check for deployment token
    id: token
    run: |
      if [ -z "$AZURE_TOKEN" ]; then
        echo "::notice::AZURE_STATIC_WEB_APPS_API_TOKEN is not set; skipping Azure deploy."
        echo "present=false" >> "$GITHUB_OUTPUT"
      else
        echo "present=true" >> "$GITHUB_OUTPUT"
      fi
```

Every later step has `if: steps.token.outputs.present == 'true'`. Without a
token, the run passes with a notice instead of turning `main` red.

## A Windows gotcha that looks like a Vite bug

My first root build on Windows produced asset URLs like
`/Program%20Files/Git/assets/index.js`.

That wasn't Vite. Git Bash converts arguments and environment values that look
like POSIX paths into Windows paths, so `VITE_BASE=/` became the Git install
directory before Node ever saw it. The fix is to turn the conversion off for
that command:

```bash
MSYS_NO_PATHCONV=1 VITE_BASE=/ npm run build
```

It's worth knowing because the build succeeds. Nothing fails until you open the
page.

## What running two hosts actually costs

| | GitHub Pages | Azure Static Web Apps |
| --- | --- | --- |
| Served from | `/vue-recipe-finder/` | `/` |
| Deep links | `404.html` copy, status 404 | Rewrite rule, status 200 |
| Auth | Built-in `GITHUB_TOKEN` | Deployment token secret |
| Price | Free | Free plan |

The two workflows run in parallel and don't depend on each other, so one host
failing doesn't block the other. The price is that tests run twice per push,
and there are two dashboards to check when something looks off. For a side
project that's fine. If Azure only turns out to be an experiment, removing it
means deleting a workflow, a config file and a secret.

## Checking it for real

Local checks only prove so much here, because the interesting behaviour is the
host's. `vite preview` has its own SPA fallback, so a deep link working locally
says nothing about Azure's rewrite rule. So the checks after the first deploy
were against the live sites:

- A cold load of `/recipe/52772` on Azure: HTTP 200, the recipe rendered, styles
  applied.
- "Back to search" went to `/`, not `/vue-recipe-finder/`, and showed results.
- A request for a nonexistent file under `/assets/` returned a real 404.
- The Pages deep link still rendered, and its links still used the sub-path.

The code changes were small. Most of the value was in finding the second copy
of the base path, and in checking the rewrite rule on Azure rather than trusting
a local preview.
