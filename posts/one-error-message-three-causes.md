---
title: "One error message, three causes: debugging a Firebase deploy"
date: "2026-09-01"
excerpt: "A GitHub Actions pipeline for Flutter web on Firebase Hosting kept failing with the same sentence. Two rounds of guessing at IAM roles found nothing; printing a single field found it in one run."
tags: ["CI/CD", "Firebase", "Debugging", "Flutter"]
---

I set up continuous deployment for a Flutter web app: analyze, test, and an
emulator-backed Firestore rules suite on every pull request, then a build and a
deploy to Firebase Hosting on every push to `main`. The workflow passed
`actionlint`, and I had run each job's commands locally first — including `npm
ci` rather than `npm install`, because that is what CI uses and it is what fails
on a stale lockfile.

The two test jobs passed on the first attempt. The deploy did not, and the
reasons were never where the error pointed.

## The generated file that ate my code

Before any Firebase configuration existed, `main.dart` still had to compile.
`Firebase.initializeApp` needs `lib/firebase_options.dart`, so I committed a
placeholder that threw a named exception, `FirebaseNotConfigured`, which `main`
caught in order to show a "run `flutterfire configure`" screen. That was
deliberate. Plausible-looking fake keys would have compiled and then failed
somewhere deep inside Firebase with a message about the project, which reads
like a bug in the app rather than like setup nobody has done yet.

Then `flutterfire configure` ran and did exactly what it is designed to do:
overwrite `lib/firebase_options.dart` wholesale. The generated file contains no
`FirebaseNotConfigured`, so `main.dart` was left catching a type that no longer
existed. `flutter analyze` failed on a line I had not touched, in a file that
looked fine, because of a change in a different file that a tool was supposed to
make.

The rule is old and I knew it: do not put hand-written code in a file a
generator owns. The interesting part is that the fix was not to move the class
somewhere safe. With real configuration present, `DefaultFirebaseOptions` cannot
throw, so the state that exception described is unreachable. The try/catch, the
screen, and its test were all dead code. Deleting them was the whole repair.

## The error message with three causes

With the app compiling, the deploy step failed:

```
Error: Failed to get Firebase project home-1d666. Please make sure the
project exists and your account has permission to access it.
```

That reads like permissions. So I granted the service account Firebase Hosting
Admin, Firebase Rules Admin, and Viewer. Same error, byte for byte. I added
Firebase Viewer and Service Usage Consumer. Same error, byte for byte.

That is the moment to stop. `firebase-tools` prints that sentence whenever one
particular API call fails, and at least three unrelated conditions produce it: a
disabled Google API, a missing IAM permission, and a credential belonging to a
different project. Three hypotheses, one string, and no way to tell them apart
from outside.

So instead of a third guess I added a temporary step to the workflow: print the
credential's own `client_email` and `project_id`, list the projects it can
actually see, and run the deploy with `--debug`.

## What the data said

The first debug run answered immediately, and not with permissions:

```
HTTP Error: 403, Firebase Management API has not been used in project
789039989392 before or it is disabled.
```

Two APIs — Firebase Management and Cloud Resource Manager — had simply never
been enabled. `reason: SERVICE_DISABLED`. No amount of role-granting would ever
have moved that.

Enabling them got further, and then failed differently. Google's own
`testIamPermissions` now returned `200` and named exactly what was missing:
`firebase.projects.get` and `firebasehosting.sites.update`. So this time it
*was* permissions — but the diagnostic explained why the roles had never helped:

```
client_email: action-deploy@home-507221.iam.gserviceaccount.com
project_id:  home-507221
...
No projects found.
```

The service account lived in a different project. Every role I had granted
landed on `home-1d666`, while the key doing the authenticating was a principal
from `home-507221` with access to nothing. It also explained the first failure
retroactively: those "disabled" APIs were disabled on the service account's own
project, which is the quota consumer, and never on the app's project at all.

A new key from a service account in the right project, and the deploy went
green — hosting, then rules.

## Cheap failure is a design decision

Two choices in the workflow made a long chain of failures tolerable.

The deploy job opens with a preflight that checks the secret exists and fails
with the secret's name and where to add it. It runs before the Flutter
toolchain and before the ninety-second release build. Three of the failures
cost one second each instead of three minutes, and none of them produced an
opaque auth error at the last step.

Hosting and rules deploy as sequential steps in one job rather than in
parallel. Rules validate what the client writes, so rules stricter than the
running app reject writes the app still believes are valid. Shipping the app
first leaves the old rules briefly looser than necessary, which is recoverable;
the reverse breaks writing for everyone in between, which is not. Because the
steps are sequential, every hosting failure skipped the rules step. Nothing was
ever published against an app that had failed to ship.

## What I would take from it

An error message is a hypothesis written by someone who could not see your
situation. When one string covers three conditions, iterating on hypotheses is
a random walk — and it is a seductive one, because each guess is plausible and
cheap enough to try. The two rounds of role-guessing cost more time than
everything else put together and moved nothing.

The step that ended it printed one field. It was six lines long and lived for
three commits.
