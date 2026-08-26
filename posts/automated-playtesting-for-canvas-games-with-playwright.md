---
title: "Automated playtesting for canvas games with Playwright"
date: "2026-08-25"
excerpt: "Why high-level test runners fail against HTML5 game canvases, and how Chrome DevTools Protocol multi-touch events caught real-world mobile regressions in CI."
tags: ["Testing", "Playwright", "Game Dev", "QA"]
---

Most frontend testing frameworks are designed for the DOM. You query for a
`button`, assert that a `div` contains text, and fire a synthetic `click` event.

When your game renders into a single HTML5 `<canvas>`, the DOM is opaque. There
are no buttons to query, no text nodes to inspect, and standard synthetic events
fail to simulate how game engines poll input frames.

In the [Web Games](https://github.com/greentea524/games) repository, five
Phaser 3 cartridges run under automated end-to-end playtesting with Playwright
and Chrome DevTools Protocol (CDP).

Here are the hard-won engineering lessons from building a test suite that
actually plays 2D canvas games in CI.

## Why standard browser automation fails on games

Traditional testing tools break on canvas games in three distinct ways:

1. **Phaser polls input per frame:** Phaser checks `Key.isDown` once every
   `requestAnimationFrame`. A zero-duration synthetic `keydown`/`keyup` pair
   emitted in the same JavaScript tick often falls between frames, and the engine
   never registers that the key was pressed.
2. **Untrusted synthetic PointerEvents:** Modern mobile touch engines rely on
   `Element.setPointerCapture()`. Browser security models mark events created
   via `document.dispatchEvent(new PointerEvent(...))` as untrusted (`isTrusted: false`),
   which causes browsers to ignore pointer captures on virtual D-pads.
3. **Multi-touch requires real contact tracking:** Testing a two-handed mobile
   platformer requires holding the left D-pad while simultaneously tapping jump
   or dash with the right thumb. Standard `page.touchscreen.tap()` is single-touch
   only and cannot hold a contact while dragging another.

## Dispatching multi-touch via Chrome DevTools Protocol

To test touch controls realistically without a physical phone, the test driver
communicates directly with Chromium's CDP session using `Input.dispatchTouchEvent`:

```js
// qa/touch/driver.mjs
const cdp = await page.context().newCDPSession(page);

export async function touchStart(points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: points.map(p => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
      id: p.id,
    })),
  });
}
```

This bypasses synthetic event sandboxes, generating genuine OS-level touch
contacts that Phaser's input manager and `shared/dpad.ts` process identically to
a physical screen.

### The `touchEnd` trap

One subtle trap with CDP: **`touchEnd` must carry the contacts being *released*,
not the ones that remain.**

If a player is holding Left (contact 1) and releases Jump (contact 2), sending
the remaining contact list tells the browser that contact 1 was lifted. The
symptom is indistinguishable from the game randomly dropping a held direction,
and was one of the trickiest testing bugs to isolate.

## Catching real touch-only regressions

Automated multi-touch testing caught regressions that keyboard tests could never
reproduce:

### 1. The double-level skip in *Cart & Crate*
In the Sokoban puzzle game, clearing a level displays a run summary overlay. On
desktop (keyboard), pressing `Z` dismisses the summary. On touch devices, the
overlay dismissed on `pointerdown`, but the subsequent `pointerup` leaked
through to the freshly loaded level underneath, triggering an instant second
level advance.

A keyboard test passed cleanly because `Z` emits no pointer events. The CDP
touch test caught the bug immediately by asserting the board advanced
**exactly one** level after dismissing the modal.

### 2. The wall-cling drop in *Lantern Keeper*
*Lantern Keeper* requires holding towards a wall while airborne to wall-cling.
When a player taps Jump to kick away, the virtual D-pad briefly tracks two
simultaneous touch contacts. An early implementation dropped the held direction
when the second contact registered, silently disabling wall-clinging exclusively
under touch.

## Scripted full playthroughs in *Static*

For the top-down mystery game *Static*, `npm run qa:static` executes a complete
headless playthrough:

```
✔ Boot game and load into Town overworld
✔ Walk to neighbor's house and trigger NPC dialogue tree
✔ Choose dialogue branches via direct canvas coordinate taps
✔ Enter protagonist's house and interact with the TV portal
✔ Transition into glitchy Static-side world and collect puzzle key
✔ Return through portal and verify state persistence
```

If any uncaught exception, texture loading failure, or audio decode error
occurs during the run, the CI build fails immediately with a non-zero exit code.

## The golden rule: Make checks prove they can fail

An automated test that cannot fail is worse than no test at all.

Early in development, our wall-cling test asserted that player falling velocity
was capped at `25 px/s`. The test passed on the first run — because the player
was standing motionless on the ground at `vy: 0`.

The assertion was rewritten to strictly require samples taken while the player
is **both airborne and actively pressing into the wall collider**.

> Where a defect is known, temporarily reintroduce the bug and watch the test
> turn red before trusting the green checkmark.

## Summary

Canvas games don't have to be a black box in automated testing. By driving real
CDP multi-touch streams and holding inputs across frame boundaries, you can test
game feel, touch interfaces, and full playthroughs reliably in CI.
