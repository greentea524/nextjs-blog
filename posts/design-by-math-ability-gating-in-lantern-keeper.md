---
title: "Design by math: Metroidvania ability gating in Lantern Keeper"
date: "2026-08-25"
excerpt: "How a strict tile-movement budget, tuned coyote time, and formal anti-soft-lock rules made progression unbreakable in a Game Boy–style puzzle platformer."
tags: ["Game Dev", "Game Design", "Physics"]
---

In a Metroidvania, the world is the lock and player movement is the key. When
the player finds a new ability — a double jump, a dash, a wall-cling — previously
impassable chasms and sheer cliffs become reachable pathways.

The nightmare of Metroidvania level design is the **soft-lock**: a sequence of
jumps where a player slips into an area ahead of schedule, lacks the ability
required to climb back out, and is permanently stuck.

In [*Lantern Keeper*](https://github.com/greentea524/games/tree/main/lantern-keeper),
a 160×144 Game Boy Color–style puzzle platformer, soft-locks were eliminated by
treating movement reach as a formal mathematical budget rather than an
eyeballed visual guess.

## The linear progression chain

Lantern Keeper's map is divided into three distinct zones spanning five
ceremonial lanterns:

```
L1 Hearth ───> L2 Ember ───> L3 Gale ───> L4 Root ───> L5 Crown
(tutorial)    (double jump)   (air dash)  (wall-cling) (win state)
   Area 1: Forest Floor  |  Area 2: Mossy Hollows  |  Area 3: Rootspire
```

Every lantern lit permanently reveals more of the surrounding map and grants a
movement ability. To guarantee that sequence breaking is impossible by
construction, every physical gate is tuned against the exact kinematic ceiling
of all prior abilities.

## The tile movement budget

The physics engine runs at standard platformer constants: `gravity: 500`,
`jump_velocity: -150`, and `run_speed: 60` with an 8-pixel tile grid.

By measuring the peak arc of every ability combination, we established an
unbreakable **Gate Minimum** table:

| Capability | Maximum Measured Reach | Built Gate Minimum |
| :--- | :--- | :--- |
| **Baseline Jump** | ~2.8 tiles up / ~4.5 across | Double-jump ledges: **5+ tiles up** |
| **Double Jump** | ~5.6 tiles up / ~7.5 across (59px) | Dash gaps: **10+ tiles across** |
| **Air Dash** | +5 tiles horizontal (40px burst) | Goal blocks: **6+ tiles up** (DJ max is 45px) |
| **Wall-Cling / Jump** | Unbounded vertical | 12-tile chimney shaft |

Because a baseline jump reaches at most 2.8 tiles, placing the ledge to Area 2
at **5 vertical tiles** guarantees that no combination of frame-perfect inputs
can scale it without the double jump granted by Lantern 2.

Similarly, an air dash provides a 40px burst with zero vertical gain. Placing
the entrance to Rootspire behind a **10-tile chasm** makes it physically
impossible to clear with only a double jump (~7.5 tiles maximum reach).

## Platformer feel: Coyote time and buffers

Mathematically tight gates can easily feel punishing if player inputs are
dropped. To make the controls feel generous and responsive, the player state
machine incorporates three key timing buffers:

```ts
// Dash & jump feel constants
const COYOTE_TIME = 80;       // ms after leaving ledge where jump still fires
const JUMP_BUFFER = 100;      // ms prior to landing where jump input is queued
const DASH_SPEED = 400;       // px/sec during dash burst
const DASH_DURATION = 100;    // ms length of air dash
const DASH_COOLDOWN = 400;    // ms cooldown before next dash
const WALL_COYOTE = 80;       // ms to kick away after releasing wall
const WALL_LOCKOUT = 150;     // ms horizontal-input lockout on wall-jump kick
```

- **Coyote Time (80 ms):** When walking off a ledge, the game preserves the
  grounded state for 80 milliseconds. Players can hit jump slightly *after*
  leaving the cliff edge without plummeting.
- **Jump Buffering (100 ms):** If the player presses jump 100 ms before touching
  the floor, the input is buffered and executes the exact frame contact occurs.
- **Wall Kick-Away Lockout (150 ms):** Wall-jumping in a narrow chimney kicks
  the player outward at `(±100, -150)`. Disabling horizontal input for 150 ms
  prevents the player from immediately drifting back into the same wall and
  canceling their upward momentum.

## The anti-soft-lock rules

Beyond numerical gating, the game enforces five architectural invariants:

1. **Abilities are strictly permanent:** Nothing in the game strips an earned
   ability, ensuring the set of reachable states is strictly monotonically
   increasing.
2. **Strict single-step dependency:** Each gate requires *only* the ability
   unlocked at the immediately preceding lantern.
3. **No one-way drops ahead of abilities:** Any drop or pit has a return path
   traversable using the abilities held *at that exact step in the chain*.
4. **Lantern glow decay as a safe checkpoint:** Lantern Keeper features a decaying
   light radius. If the player's glow expires, they respawn at the last lit
   lantern — which by chain order is always on the *near* side of the next gate.
5. **Lantern travel budget:** Worst-case transit time between consecutive
   lanterns is budgeted to consume under 70% of a full glow timer, leaving ample
   margin for exploration.

## Why design by math matters

Game feel is often treated as purely artistic tuning. But in puzzle platformers
and Metroidvanias, **level geometry is game logic**.

By formalizing the movement budget in an explicit spec before laying out tiles,
we eliminated backtracking bugs, prevented sequence breaks, and delivered a
tight 15-minute speedrun experience that feels fluid and fair.
