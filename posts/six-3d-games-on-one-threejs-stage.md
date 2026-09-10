---
title: "Six 3D games on one three.js stage"
date: "2026-09-09"
excerpt: "three.js draws the scene and stops there. Six small games later, every hard problem turned out to be a number that had to be derived rather than tuned — and the derivation belongs in a module with no WebGL in it."
tags: ["Game Dev", "Three.js", "WebGL", "Architecture"]
---

The [Web Games](https://github.com/greentea524/games) repository started as five
Game Boy–styled Phaser cartridges sharing one shell. It now also carries six 3D
games built on three.js:

- **Tower Stacker** — drop sliding slabs, keep the overlap.
- **Tube Runner** — rotate around the inside of a tube through gaps in rings.
- **Tilt Maze** — lean a board, roll a marble to the goal.
- **Minigolf** — three holes, putt to the cup.
- **Anomaly Room** — one room, look around, spot what changed behind your back.
- **Voxel Digger** — excavate a block of rock to identify what is buried in it.

Phaser is a game framework: it has a scene graph, an input system, a physics
option, an asset loader, and a main loop. three.js is not. It is a renderer with
a scene graph attached. Everything above `renderer.render(scene, camera)` — the
loop, the input, the rules, the camera, the lighting — is yours.

That sounds like a lot of missing batteries, and it is. What it is not is a lot
of *shared* missing batteries. Here is what six games actually had in common,
and what each of them had to derive alone.

## The shared part is smaller than it looks

`shared/stage3d.ts` is the whole of the common runtime, and it compiles to 1.29 kB.
It owns four things:

- A `WebGLRenderer` sized to its parent element, with the device pixel ratio
  capped at 2. A phone at DPR 3 asks for nine times the fragments of DPR 1 for a
  difference almost nobody can see on a moving scene.
- A `ResizeObserver` — not a `window.resize` listener. The parent can change size
  without the window doing so, and a window listener sleeps through all of it.
- Camera aspect tracking, which is the single most-forgotten line in a three.js
  resize handler. Its symptom is that everything is subtly stretched, which is
  remarkably easy to look at without seeing.
- A DOM overlay above the canvas for the game's HUD, `pointer-events: none` so it
  cannot eat the canvas's input.

What is deliberately **not** in there: the camera, the lighting, the controls,
and the HUD's contents. A minigolf camera and a tilt-maze camera have nothing in
common, and a module that tried to serve both would be a worse version of
three.js.

The DOM overlay deserves a note, because it is a real advantage of leaving the
retro shell behind. The 2D games render their HUD into a 160×144 framebuffer,
so text is drawn pixels. Here it is text: crisp at any resolution, selectable,
and reachable by a screen reader.

## The bug that cost four games

three.js applies `BRDF_Lambert` — which is `RECIPROCAL_PI * diffuseColor` — to
the ambient term as well as the direct one. A light of intensity `i` therefore
contributes `i / π` to the image. Write a lighting rig from the brightness you
actually want and you get a third of it: a scene that looks like night when it
was meant to look like a lit room.

This is now a one-line helper in the shared stage:

```ts
export function lambertIntensity(fraction: number): number {
  return fraction * Math.PI
}
```

It exists because the same misunderstanding landed four separate times. Tower
Stacker found it first, by measuring a framebuffer that had collapsed to a
single tone. Tube Runner inherited the fix. Tilt Maze rediscovered it as a board
too dark to see. Minigolf met it again.

Every one of those looked like a *lighting choice* rather than a bug, which is
the entire reason it kept surviving review. Nobody reads "this scene is dimmer
than I intended" as a units error.

### Lighting as a contrast guarantee

The 2D games in this repo have a signature defect: six sprites have shipped
invisible because the Game Boy ramp has four tones, three games draw their
background in the lightest one, and a sprite reaching for the same tone lands on
ground of its own colour. Every one passed every functional check and was caught
only by screenshot.

The 3D equivalent would be a block face rendered at the sky's value, punching a
hole in the tower. Tower Stacker handles it structurally rather than by
inspection — the rig is arranged so it *cannot* happen. With the light at a
fixed direction and the camera seeing only the +X, +Y and +Z faces:

| face | n·l | luminance |
| --- | --- | --- |
| +Y | 0.838 | 0.58 × (0.42 + 1.20 × 0.838) = **0.827** |
| +X | 0.461 | 0.58 × (0.42 + 1.20 × 0.461) = **0.564** |
| +Z | 0.293 | 0.58 × (0.42 + 1.20 × 0.293) = **0.448** |

Against a sky at 0.076, the dimmest face any block can present is six times the
background's luminance, and no lighting angle can close that gap.

The base luminance every block is normalised to — 0.58 — is also chosen so
nothing clips. A saturated hue puts most of its luminance in one channel, and if
that channel reaches 1.0 on the brightest face, everything past 1.0 is lost and
the face comes back *darker* than the table says. Measured during development: a
red block's top face returned 0.74 instead of 0.83.

Tube Runner does the same trick with geometry instead of colour. The light points
straight down the tube, so an obstacle ring is a flat annulus facing the camera
(`n·l = 1`) while the tube wall and its ribs are cylinders about that same axis
(`n·l = 0`). Three surfaces land in three separated tones *by their orientation
alone*, with nobody eyeballing colours.

## Aspect ratio is a gameplay bug, not a visual one

The Game Boy build had one aspect ratio, sized by eye, correct forever. A canvas
that is whatever shape the window is does not work that way, and getting it wrong
does not look wrong — it makes the game unplayable.

The shared stage holds the frustum *height* on resize, which is right for a game
whose action is vertical. On a 390×844 phone that gives Tower Stacker a frustum
1.66 world units wide, against a block slide that needs 3.04. The block leaves
the screen at both ends of every pass.

So the framing is derived, in a module with no three.js in it:

```ts
export function frustumFor(width: number, height: number) {
  const aspect = height > 0 ? width / height : 1
  return {
    halfWidth: Math.max(HALF_WIDTH, HALF_HEIGHT * aspect),
    halfHeight: Math.max(HALF_HEIGHT, HALF_WIDTH / Math.max(aspect, 1e-6)),
  }
}
```

Whichever half-extent is binding wins: a narrow window shows more sky, a wide one
shows more to the sides, and neither ever crops the slide. `HALF_WIDTH` itself
comes from projecting the base block's corners at both ends of both slide axes
onto the camera's right vector — which, under an orthographic camera, is
horizontal, so the block's *height* never enters into it.

That is four lines of vector arithmetic written out longhand rather than done
with a library, specifically so the test that checks the result does not share a
bug with the code producing it.

## The rules go in a file that has never heard of WebGL

This is the pattern that made the six games tractable, and it is not a three.js
technique at all — it is what you do *because* three.js is only a renderer.

Every game splits into a rules module and a renderer. `stack.ts` holds all of
Tower Stacker's overlap, slice, perfect-drop and speed arithmetic. `track.ts`
holds Tube Runner's generator and collision test. `instances.ts` holds Voxel
Digger's instance bookkeeping. None of them import three.

The payoff is that the interesting part runs under `tsx` in milliseconds, with no
browser and no WebGL context. A check that has to stand up a GPU to exercise the
overlap arithmetic is a check nobody runs.

It also makes reworks attributable. Tower Stacker and Tube Runner were both
originally built inside the Game Boy shell — a 160×144 target, a four-tone post
pass, a composited 8px HUD — on the assumption that a 3D game belonged in the
bezel. When that assumption was reversed and both games moved to the standalone
stage, their rules modules and tests were not touched at all. Any regression was
therefore, by construction, a rendering regression.

### Deriving fairness instead of tuning it

Tube Runner's whole difficulty is that a gap resolves late: it foreshortens as it
approaches and only reads clearly once it is close. That is what earns the third
dimension, and it is also what makes the generator dangerous — a randomly placed
ring sequence will sometimes be unreadable and feel cheap.

The fix is not to tune the randomness until it feels fair. It is to derive the
bound from the numbers that decide whether the player can physically get there:

```ts
export function reachableDelta(speed: number): number {
  return Math.min(Math.PI, ROTATE_SPEED * (RING_SPACING / speed) * REACTION_FRACTION)
}
```

At `speed`, consecutive rings are `RING_SPACING / speed` seconds apart; in that
time the player covers `ROTATE_SPEED` radians per second. `REACTION_FRACTION` is
0.75, and the quarter held back is reaction time — spending the whole budget
produces sequences that are exactly reachable by a player who reacted with no
delay at all, which is nobody. The cap at π is there because that is the furthest
two angles can be apart; a "bound" larger than π would not bound anything.

Minigolf's at-rest detector is derived the same way, and it is a good example of
the obvious answer being wrong in a way that is hard to see. "Speed below a
threshold" is also true of a ball rolling *slowly down a ramp*, which has not
stopped and is about to speed up. So the timer is derived from the gentlest slope
the holes actually author:

```ts
export const REST_TIME = (REST_SPEED / (GRAVITY * Math.sin(MIN_SLOPE))) * REST_MARGIN
```

Wait longer than a ball needs to accelerate from a dead stop through
`REST_SPEED`, and a ball on any authored slope is guaranteed to break the
threshold before the timer completes. The test asserts the *relationship* rather
than the number, so changing the slope or gravity moves it and stays correct.

## Physics: 23 kB versus 1059 kB

Both Tilt Maze and Minigolf need rigid-body simulation. The two candidates were
measured rather than argued about — a minimal "one sphere, two static boxes, one
step" program bundled with esbuild:

| library | minified | gzipped |
| --- | --- | --- |
| cannon-es | 80 kB | **23 kB** |
| @dimforge/rapier3d-compat | 2786 kB | **1059 kB** |

Rapier is 46 times larger gzipped, and 94% of that bundle is one inlined base64
WASM blob. For scale, the entire Phaser chunk shared by the five 2D games is
319 kB gzipped — a physics engine for a single rolling marble would have cost
more than three times the whole 2D game framework.

The second reason would have settled it at equal size. Rapier reaches its WASM
through `WebAssembly.instantiate`, which under a Content-Security-Policy requires
`'wasm-unsafe-eval'` in `script-src`. This repo's policy is `'self'` plus a single
hash and nothing else, and there is a QA suite whose entire job is keeping it
that way.

cannon-es is adequate here for the honest reason: this is one sphere on static
geometry, and nothing in either game needs a solver that could do more.

### The tunnelling defence, and the setting that did nothing

cannon-es integrates discretely. A ball moving at `v` jumps `v · dt` between
collision tests, and if that jump exceeds the thinnest wall it is on the far side
before anything noticed. The defence is the fixed timestep and nothing else: at
1/120, a ball at terminal speed moves 0.19 of a cell per step.

Terminal speed is derived, not guessed, because the whole argument depends on it.
At full tilt the ball accelerates at `GRAVITY · sin(MAX_TILT)` and damping removes
velocity in proportion to speed, so the two balance at `a / damping`. The test
fires a ball at a wall at multiples of that: it holds up to three times terminal
and goes through somewhere between three and three and a half.

That is the only honest way to test the defence. A ball at a speed the game
cannot produce proves the margin; one at a speed it can barely reach proves
nothing.

There was a second line of defence, briefly. cannon-es exposes `ccdSpeedThreshold`
and `ccdIterations` on a body, described as swept-sphere testing that catches what
the step missed. They were set, then measured — and they do *nothing*. On and off
give bit-identical results at every speed from one to four times terminal, and the
boundary sits in the same place either way.

They were removed rather than left in looking like protection. The danger of a
setting that does nothing is not the setting; it is the person who later loosens
the timestep trusting it.

## InstancedMesh, and why a slot is not a cube

Voxel Digger draws a 13×13×13 block of rock as a single `InstancedMesh` — a
thousand-odd cubes in one draw call. Digging removes one, and there are two ways
to do that:

1. Scale the instance to nothing. Cheap to write, and it leaves the vertex work
   in place forever.
2. Move the last live instance into the freed slot and shrink `count`, keeping the
   draw exactly as small as the block is.

The second is right, and it has a trap in it. `instanceId` from a raycast is a
**slot**, not a cube, and swapping changes which cube is in which slot. Get the
bookkeeping wrong and the game still runs, still draws the right number of cubes,
and deletes the wrong one when you tap.

That bug looks exactly like a raycasting problem, and it is not one. So the
bookkeeping lives in `instances.ts` with no three.js in it, and is checked
directly rather than through the renderer:

```
ok  slots and cubes stay in step through a thousand digs and undos — 400 cells
ok  and shrinking the count without swapping is caught — slot 4 draws cell 12, which is gone
ok  removing the last instance needs no swap — slot 2
ok  removing any other moves the last one into its slot — slot 0 now draws 30
```

## Using the frustum as a game rule

Anomaly Room is the one game where a three.js class is load-bearing for the
*rules* rather than the drawing. The whole illusion rests on never mutating
something the player is currently looking at. Break it and the game stops being
"something is different" and becomes "I watched a chair jump" — which is not the
same game, and cannot be un-seen.

So a round picks only from candidates whose bounds are entirely outside the
camera's frustum, using three.js's own `Frustum` against the same projection the
renderer draws with. Not a re-derived cone with its own idea of the aspect ratio:
the point is that the check and the picture cannot disagree.

There is a second half that is easy to miss. The room is lit by one hard
directional key, so everything throws a shadow — and an object standing *behind*
the player can lay its shadow across the floor in front of them, where a change to
it is as visible as the object itself. Frustum-culling the object alone leaves the
player watching a shadow jump. The light is therefore written down once, as data,
because two very different things read it: the renderer places it, and the round
picker projects each object's shadow along it.

The converse constraint is the interesting one. Every mutation has to be
*visible* from where the player stands — they never move, so there is exactly one
eye point, and a change nothing can see is an unwinnable round. Growing a picture
that is flush against a wall along the wall's normal grows it *into* the wall.
The test raycasts rather than reading the numbers, which is why it also catches
the cases nobody thought of:

```
ok  a change that happens inside a wall is caught — growing the shelf into the wall shows 0.32x the floor
ok  while the same growth along the wall is not — 8.0x the floor
ok  and so is a change behind a larger object — 0.38x the floor
ok  a turn too small to find is caught — 0.19x the floor, and not zero
```

## Every check proves it can fail

Notice what those two listings have in common: each one contains a case that is
supposed to be *caught*. That is a house rule in this repo, and it earned its
place — several checks here passed for the wrong reason when first written. One
asserted that a fall speed was capped, against a player standing still on the
ground.

So the modules carry deliberate escape hatches used by nothing but their tests.
Voxel Digger's index takes a `swap: false` option that reintroduces the
slot-bookkeeping bug. Minigolf's simulation accepts overridden rest thresholds so
the test can degrade the detector and watch it misfire. Anomaly Room's test turns
the frustum filter off and confirms the check goes red.

Where the defect is known, reintroduce it and watch the check fail before
trusting it.

## What it costs

The whole thing builds to:

| chunk | raw | gzipped |
| --- | --- | --- |
| three | 496.65 kB | 123.80 kB |
| cannon | 81.48 kB | 23.55 kB |
| phaser | 1198.00 kB | 319.08 kB |

three.js and Phaser are never loaded by the same page, so those are two
alternative vendor chunks rather than two costs on one page. Both are pinned by
name in the Rollup config, for an unglamorous reason: Rollup names a shared chunk
after one of the modules inside it, and the vendor chunk was called `phaser` only
by luck. Adding a second dependency shared by every game renamed it to that
module, which makes a network waterfall very hard to read.

The games themselves are small — 8.23 kB for Tilt Maze up to 13.26 kB for Anomaly
Room, before gzip. That ratio is the honest summary of what three.js is. The
library is most of the bytes and almost none of the decisions.

Everything that made these six games work — the fairness bound, the frustum, the
rest detector, the tunnelling margin, the instance bookkeeping — lives in files
that do not import it.
