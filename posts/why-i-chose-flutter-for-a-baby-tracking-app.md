---
title: "Why I chose Flutter for a baby tracking app"
date: "2026-08-22"
excerpt: "Flutter let me ship a multi-caregiver baby diary as a PWA with custom-painted growth charts, real-time sync, and a single Dart codebase — here is what worked and what I would reconsider."
---

I built a baby tracking app — feeds, sleep, growth charts, appointment
reminders, multiple caregivers syncing in real time. The kind of project where
the framework choice matters less than finishing, and finishing means one person
shipping to multiple platforms without burning out.

## One codebase, web first

Flutter compiles to web, iOS, and Android from the same Dart source. The app
currently runs as a PWA on Firebase Hosting. When native mobile builds make
sense, that is a build target change, not a rewrite.

React Native can target web through `react-native-web`, but it is a bolt-on.
Going fully native means three codebases. Flutter's web target is a first-class
output of the same compiler, with the same widget tree, the same state
management, the same tests.

## Drawing, not configuring

The growth screen plots weight and length against WHO percentile curves. No
charting library does that out of the box, and bending one to fit usually costs
more time than drawing it yourself.

Flutter's `CustomPainter` gives you a canvas and gets out of the way:

```dart
class GrowthChartPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    // Plot WHO percentile curves, then overlay the child's data points.
    // Full pixel control — axes, labels, hit-testing — no library opinions.
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
```

The same approach drives a small airplane animation on the home screen that
reflects how close the next feed is — cruising, descending, landed. An
`AnimationController` plus a painter costs nothing on the wire, unlike pulling
in Lottie or Rive for a single flourish.

## Reactive state without ceremony

Riverpod providers wrap Firestore streams. When a caregiver logs a feed on one
device, every other device rebuilds the relevant widget automatically. The
provider is the single source of truth:

```dart
final feedsProvider = StreamProvider.family<List<Feed>, String>((ref, babyId) {
  return FirebaseFirestore.instance
      .collection('babies/$babyId/feeds')
      .orderBy('timestamp', descending: true)
      .snapshots()
      .map((snap) => snap.docs.map(Feed.fromFirestore).toList());
});
```

No action types, no reducers, no dispatch. The stream drives the UI, and
Riverpod handles disposal when the widget unmounts.

## The Firebase fit

Flutter and Firebase share a parent company, and it shows. The `FlutterFire`
packages cover Auth, Firestore, Hosting, and Cloud Functions with first-party
Dart APIs. Multi-caregiver sync — invite codes, `memberUids` on documents,
membership-gated security rules — works identically on web and mobile because
the Firestore SDK is the same.

React Native's Firebase story is solid too, but it relies on community
wrappers. Flutter's is maintained by the Firebase team.

## Hot reload changes how you build

Sub-second reload is not a marketing bullet. It changed how the UI was built.
Tuning a `CustomPainter` curve or adjusting the padding on a feed card happens
in a tight visual loop — change, save, see. For the airplane animation, where
the work _is_ the visual tuning, it cut iteration time from minutes to seconds.

## Honest tradeoffs

Flutter earned its place in this project, but it is not free:

- **Bundle size.** `main.dart.js` is 1.1 MB gzipped. Cold start takes several
  seconds before Flutter paints the first frame. For a utility app opened a few
  times a day that is acceptable. For a content site it would not be.
- **Web maturity.** Some browser APIs need `dart:js_interop` wrappers. PWA
  features like home-screen shortcuts and share targets take extra plumbing
  that a vanilla web app gets for free.
- **Ecosystem size.** Dart's package ecosystem is smaller than JavaScript's.
  Sometimes you build what you would `npm install` elsewhere.
- **SEO.** Flutter web renders to canvas or shadow DOM, not native HTML. This
  blog is built with Next.js for exactly that reason.

## Would I pick it again?

For this kind of app — data-heavy, animation-rich, multi-platform ambition,
single developer — yes. The tradeoffs land in places I can absorb, and the
things I need most (custom painting, reactive state, one codebase) are the
things Flutter does best.

Flutter did not remove complexity. It moved it to a place where one person
could manage it.
