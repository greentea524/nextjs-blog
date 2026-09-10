---
title: "No server by design: Firestore rules as the whole backend"
date: "2026-09-10"
excerpt: "Logbook is a Flutter web app with no functions directory and no plans for one. Staying on Firebase's free tier is not a cost saving here — it is the constraint that decided the data model, the security rules, and the deploy order."
tags: ["Firebase", "Flutter", "Architecture", "PWA"]
---

[Logbook](https://github.com/greentea524/home-app) is a shared private record of
the things you do to the things you own — furnace filter, smoke alarm batteries,
car battery, oil change, gutters. Not a to-do list. A record of what was done and
when, so that "did anyone already do this?" has an answer.

It is a Flutter web app on Firebase. What makes it worth writing about is what it
does not have: there is no `functions/` directory, and there is not meant to be
one.

That single decision — stay on the Spark (free) plan, which means no server-side
code at all — turns out to reach into almost every other part of the design. This
is a tour of where it lands.

## Three layers, and only two of them run code

**Frontend.** Flutter web, with Riverpod for state and `go_router` for
navigation. Structured in the usual layers: pure domain modules (`scheduling/`,
`maintenance/`, `export/`) that know nothing about Firebase, repository
interfaces above them, Firestore implementations of those interfaces, Riverpod
providers, then screens.

**Backend.** `firestore.rules`. That is the entire list.

**Hosting.** Firebase Hosting, serving a release Flutter build, with the auth
helper deliberately pulled onto the same origin.

The interesting consequence of having no middle tier is that *policy has nowhere
to hide*. Anything a server would normally enforce has to be expressible either
in the client or in a rules file — and the rules language is far more limited
than most people expect until they hit its edges.

## What "no push notifications" really bought

The visible trade is that overdue items surface as an in-app banner computed on
the device, rather than a notification. The README is honest about the cost: a
banner only fires if something already got you into the app, and nobody opens a
maintenance app unprompted.

The invisible trade is the one that matters. Push would mean Cloud Messaging,
which means Cloud Functions, which means the Blaze plan, which means a billing
account, a server-side runtime to deploy and version, tokens to store and expire,
and a whole second place where bugs live. The due/overdue calculation is
identical either way:

```
nextDue = lastCompletion + interval
```

So the nudge can be added later without rework, and until then the project has
one runtime instead of two.

You can see the discipline in the rules file, which notes that there is no
`fcmTokens` collection anywhere and there should not be — the field does not
exist because the feature does not.

## History is the product, so it is not a cached field

Each completion is its own document:

```
households/{householdId}
  subjects/{subjectId}                  name, notes
    tasks/{taskId}                      name, notes, interval?
      completions/{completionId}        completedAt, completedBy, notes?
  appointments/{appointmentId}          title, scheduledFor, subjectId?
```

The obvious optimisation is to cache `lastCompletedAt` on the task so the log
screen does not have to walk the history. It is rejected, and for a reason
specific to this app: a denormalised field can drift from the history it
summarises, and the history is the thing the app exists to keep. "Last done" is
computed from the completions instead.

With no server, that choice has teeth. There is no function to keep a cached
field in step, so the alternative would have been a client writing two documents
and hoping — which is exactly the failure mode you cannot debug from a phone in a
basement.

Appending rather than editing also removes conflict handling. Two phones that log
the same job offline produce two rows when they reconnect, which is a truthful
record of what happened rather than a merge conflict to resolve.

## The rules constraint that shaped the data model

This is the part I found most instructive, because it runs backwards from how
schema decisions usually go.

Firestore evaluates a `list` (query) by proving, from the query itself, that
every document it *could* return is permitted. It cannot run the rule per result
and filter. So any rule that needs a lookup — "is this caller a member of that
household?" — is unprovable for a query, and the whole query is refused rather
than narrowed.

Access has two tiers:

- `allowedUsers/{email}` — hand-created in the console, gating who may *start* a
  household.
- `households/{id}/invites/{email}` — created in-app by an owner. The invite is
  itself the grant; an invitee needs no allowlist entry.

Which raises the question an invitee faces on first sign-in: *which household am
I in?* Households cannot be listed, and there is no way to guess an id. The
answer is a collection group query across every `invites` collection, scoped hard
to the caller's own address:

```
match /{path=**}/invites/{invitedEmail} {
  allow read: if resource.data.email == email();
}
```

Note what that rule matches on. The invited address is already the document id —
but a collection group query filters on *fields*, and a rule about the document
id is unprovable from a `where` clause. So the address is stored a second time as
an `email` field, and the create rule enforces that the two agree:

```
allow create, update: if ownerOf(householdId)
  && request.resource.data.email == invitedEmail;
```

A duplicated field that looks like sloppy normalisation is in fact load-bearing,
and the rule keeping it honest exists because an invite that lied about its own
address would be invisible to the person it was for.

The same constraint explains why `list` on households is *narrower* than `get`:

```
allow get:  if resource.data.ownerEmail == email() || invitedTo(householdId);
allow list: if resource.data.ownerEmail == email();
```

The invitee branch cannot appear in `list` — it needs a per-document lookup, so
including it would deny every query instead of allowing the useful one.

And it explains the shape of the reads. The repository listens to the tree with a
listener per collection rather than issuing one collection group query over
completions, which would be the cheaper read. That query would have to prove
household membership, which is a lookup. So: more listeners, simpler rules,
provably safe.

Rules this load-bearing need tests, and there is an emulator-backed suite in
`rules-tests/` that runs in CI against a dummy project id, so it can never reach
production.

## The index nothing creates for you

That collection group query needs a single-field index scoped to
`COLLECTION_GROUP`. Firestore's automatic indexes are collection-scoped only, so
this one is declared by hand in `firestore.indexes.json`.

Missing it fails in a way that is genuinely hard to read. Riverpod retries a
failed provider with a backoff, so the provider reports *loading* far more often
than *error* — and a permanent failure renders as a permanent spinner. The
screens now check errors before asking "is it loading?", and print the reason on
screen, because on a phone there is no console and a screenshot is the whole bug
report.

## Deploy order is a consequence of having no server

With no middle tier to coordinate a migration, the client and the rules have to
be rolled forward in an order that is safe at every intermediate moment. The
project has worked out three components with two different answers:

1. **Indexes first**, ahead of everything. They are purely additive — an index
   nothing queries yet costs nothing — while a query whose index is missing fails
   outright.
2. **Then the app.**
3. **Then the rules.** Rules validate writes, so rules stricter than the running
   client reject writes that client still believes are fine. Shipping the app
   first leaves the old rules briefly looser than necessary, which is
   recoverable. The reverse breaks writing for everyone in between, which is not.

The CI workflow encodes this, and one detail is worth stealing. The index step is
`continue-on-error`, with a separate step at the end of the job that fails the
build if it did not succeed:

```yaml
- name: Deploy Firestore indexes
  id: indexes
  continue-on-error: true
  run: npx --yes firebase-tools@14 deploy --only firestore:indexes --non-interactive
```

That is not laziness about a flaky step. It is there because it already went
wrong once: the deploy credential lacked permission to write index config, the
step failed, and a release that fixed a broken screen never left the building. An
app that ships against a missing index degrades and says so on screen; an app
that does not ship helps nobody. So the failure is carried to the end of the job
rather than blocking the front of it, and the run still goes red.

## Hosting: making the auth helper a first-class citizen

Firebase Auth on the web does its work through a helper served at `/__/auth/` on
the project's `authDomain`. As generated by `flutterfire configure`, that is
`home-1d666.firebaseapp.com` — which is a *third party* to a page served from
`home-1d666.web.app` or a custom domain.

Safari partitions third-party storage by default, and Firebase Auth keeps its
session in IndexedDB. On an iPhone that surfaced as `Database is closing/hidden`,
an error naming neither the cause nor the cure.

The fix is to point `authDomain` at whatever host is serving the page, taken from
`Uri.base` rather than hard-coded:

```dart
String authHostFor({required String pageHost, required String fallback}) {
  // A dev server is not Firebase Hosting and serves no helper of its own, so
  // localhost keeps the generated domain.
  if (pageHost.isEmpty || _isLocal(pageHost)) return fallback;
  return pageHost;
}
```

Firebase Hosting serves `/__/auth/` on every site in the project, so this makes
the helper same-origin and is right by construction when a custom domain is
added. The generated `firebase_options.dart` is left untouched — it is a
generated file, and anything hand-edited into it is lost the next time somebody
runs `flutterfire configure`.

The catch is that moving `authDomain` moves the OAuth redirect URI with it, and
two consoles then have to know every host the app is served from. The one that
catches people: Firebase registers only the `firebaseapp.com` handler when it
creates the OAuth client, never the `web.app` twin, so an app served from
`web.app` gets `Error 400: redirect_uri_mismatch` until someone adds
`https://<host>/__/auth/handler` by hand in Google Cloud Console.

### Two more hosting choices worth copying

**Bundle CanvasKit rather than fetching it.** The build runs with
`--no-web-resources-cdn`, which costs a few MB of hosting and buys a cold start
with no third-party runtime dependency. For an app whose whole point is working
in a basement with no signal, a first paint that has to reach `gstatic.com` is
not a first paint.

**`Cache-Control: no-cache` on everything.** That is revalidation, not "never
cache" — unchanged files still come back as 304s, while a new release is picked
up immediately instead of after a stale `index.html` expires.

The boot screen is inline in `index.html` — markup, styles and artwork in the one
file — so it paints on the first response with no stylesheet or image to wait on.
That matters more here than in most apps, because the Flutter bundle is several
megabytes before first paint and an unstyled blank page for that long reads as
broken.

## Failing loudly, on a device with no console

A theme worth pulling out on its own: almost every defensive path in this app
exists because the failure it covers is *silent*.

`main()` wraps Firebase initialisation in both a try/catch and a 15-second
timeout, because the failure that actually happens does not throw —
`firebase_core` fetches its JavaScript at run time, and when that host is
unreachable the initialisation future simply never completes. Without a deadline
the app never calls `runApp`, never paints a first frame, and the HTML loading
screen stays up forever.

Offline persistence is single-tab on purpose. Multi-tab coordination is a lock
held in IndexedDB across browser contexts, and IndexedDB in an installed iPhone
web app is the least reliable storage the app touches — when the client cannot
open it, queries neither answer nor fail. The log screen gives up after a timeout
and offers a reload without the cache, which is both a way in and the only way to
find out the cache was the problem.

Even the iOS meta tags carry this: `apple-mobile-web-app-status-bar-style` is
`black` rather than `black-translucent`, because translucent puts the web view
under the status bar while Flutter web reports no safe-area insets — so the app
bar ends up beneath the clock, where the system takes the taps, and the settings
button cannot be pressed at all.

None of these throw. All of them look like the app being broken.

## What the constraint actually bought

Reading it as a whole, "stay on the free tier" did not read as a limitation so
much as a forcing function. There is one runtime, not two. Authorisation lives in
one file with its own test suite, rather than being split between rules and
whatever a function decided. There is no cached state to drift, no token store to
expire, no server to version against the client.

What it costs is real and stated plainly in the README: no push, so the nudge
depends on someone opening the app. That is a genuine product weakness, not a
clever trade.

The part I would take to another project is the ordering rule. When there is no
server between the client and the database, "which of these do I deploy first?"
stops being an ops detail and becomes a design constraint you can reason about —
additive things first, the client next, the things that reject writes last.
