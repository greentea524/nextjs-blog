---
title: "Building 5 Game Boy games in one web shell"
date: "2026-08-25"
excerpt: "How a Vite multi-entry build, pinned Phaser vendor chunks, and a shared touch runtime let five retro cartridges live together under a single GitHub Pages deployment."
tags: ["Game Dev", "Phaser", "Vite", "Architecture"]
---

Most web game prototypes live in isolated repositories. Each has its own
bundler config, its own asset pipeline, its own deploy target, and its own
touch-control implementation. That setup works for one game, but when you build
five, the operational overhead dwarfs the time spent on gameplay.

In the [Web Games](https://github.com/greentea524/games) project, five
Game Boy Color–styled games share a single repository and a unified shell:

- **Static** — a top-down mystery adventure with dual-world TV portals.
- **Windup** — an energy platformer driven by a decaying windup key.
- **Lantern Keeper** — a light-and-shadow Metroidvania with ability gating.
- **Pocket Dungeon** — a turn-based procedural roguelite dungeon crawler.
- **Cart & Crate** — a Sokoban puzzle courier game with a built-in solver.

Here is the architectural plumbing that lets five distinct Phaser cartridges
run under one React dashboard on GitHub Pages without bundle bloat.

## Multi-entry Vite without a monorepo

Rather than reaching for Turborepo or npm workspaces, the project uses a single
Vite config with multiple HTML entrypoints:

```ts
// vite.config.ts
export default defineConfig({
  base: '/games/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        'static': fileURLToPath(new URL('./static/index.html', import.meta.url)),
        'windup': fileURLToPath(new URL('./windup/index.html', import.meta.url)),
        'lantern-keeper': fileURLToPath(new URL('./lantern-keeper/index.html', import.meta.url)),
        'pocket-dungeon': fileURLToPath(new URL('./pocket-dungeon/index.html', import.meta.url)),
        'cart-crate': fileURLToPath(new URL('./cart-crate/index.html', import.meta.url)),
      },
    },
  },
})
```

Running `vite build` emits a clean directory structure into `dist/`: the React
hub at the root, and each game nestled under its own subpath (`/games/static/`,
`/games/windup/`, etc.).

Each game is its own standalone HTML page with its own `<canvas>`, but they all
compile through the same TypeScript configuration and share the same asset
pipeline.

## Pinning the 1.2 MB Phaser chunk

Phaser 3 is roughly 1.2 MB uncompressed. In a multi-entry build, Rollup attempts
to split shared code automatically, but its naming heuristic derives chunk
names from arbitrary importing modules. If two games share a utility, Rollup
might rename the massive Phaser chunk after that utility module, obfuscating
network waterfalls.

Pinning the vendor chunk explicitly guarantees that all five cartridges share
the exact same cached asset across browser visits:

```ts
output: {
  manualChunks(id: string) {
    if (id.includes('node_modules/phaser')) {
      return 'phaser'
    }
  },
}
```

When a player navigates from *Static* to *Lantern Keeper*, the browser fetches
only the small game-specific bundle; the engine is already cached in memory.

## The shared cartridge runtime

Game code is isolated per directory, but repetitive platform concerns live in a
`shared/` layer:

| Module | Responsibility |
| :--- | :--- |
| `shared/dpad.ts` | Multi-touch virtual D-pad and action buttons for mobile |
| `shared/noZoom.ts` | Defeats iOS double-tap zoom and pinch-to-zoom gestures |
| `shared/completion.ts` | Cross-game progress tracking surfaced on the React hub |
| `shared/storage.ts` | Namespaced `localStorage` persistence for save states |
| `shared/lighting.ts` | Canvas darkness masks and dynamic lantern glow shaders |

### Mobile touch without layout hijacking

Running retro canvas games on mobile web has notoriously sharp edges. iOS
Safari insists on zooming into double-taps, pulling the canvas off-center, or
triggering swipe-to-navigate gestures.

The `noZoom.ts` module binds non-passive event listeners to `touchstart`,
`touchend`, and `gesturestart` on the viewport wrapper:

```ts
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('dblclick', (e) => e.preventDefault())
```

Paired with `shared/dpad.ts`, this gives players a responsive virtual D-pad
with touch identifiers tracking simultaneous thumb presses for diagonal walking
and jump-dashing without fighting the browser.

## The React hub & cross-game progression

The root page is a lightweight React 19 dashboard. When the hub mounts, it reads
local save markers across all games to display completion badges in real time:

```tsx
const statuses = useMemo(() => readStatuses(), [])
// Renders "✔ 100% lit" for Lantern Keeper or "✔ Floor 10 Cleared" for Pocket Dungeon
```

Because games run in their own window contexts under identical domain storage,
progress written to `localStorage` in a game immediately reflects on the main
hub when returning.

## Automated playthroughs with Playwright

Retro games are hard to test with conventional unit tests because game feel
depends on state machines and physics frames. The repository includes two
automated QA runners:

1. **`npm run qa:static`** — A headless Playwright script that performs a full
   scripted playthrough of *Static*, verifying map reachability, NPC dialogue
   triggers, and dual-world portals without human intervention.
2. **`npm run qa:touch`** — Dispatches real Chrome DevTools Protocol (CDP)
   multi-touch events against mobile viewports to verify virtual D-pad contact
   tracking.
3. **`npm run qa:units`** — Runs pure logic checks for *Pocket Dungeon* floor
   modifiers and the *Cart & Crate* Sokoban solver using `tsx`.

## The takeaway

By treating individual web games as multi-entry cartridges inside a shared Vite
and Phaser runtime, you get the best of both worlds: each game stays small and
focused, while the build, testing, deployment, and mobile controls are solved
once for all of them.
