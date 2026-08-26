---
title: "Building a 2D platformer in Godot 4: ASCII maps and ghost multiplayer"
date: "2026-08-25"
excerpt: "How ASCII level matrices, ENet ghost-race interpolation, and headless automated playtesting came together in a 12-level 2D platformer built with Godot 4."
tags: ["Game Dev", "Godot", "Multiplayer", "GDScript"]
---

Most 2D platformers are assembled by painting tiles in a visual editor and saving
monolithic scene files (`.tscn`). That workflow is intuitive in the GUI, but it
suffers the moment you want to review level diffs in a pull request, quickly
prototype hazards, or programmatically test mechanics.

In the [Platform Game](https://github.com/greentea524/godot-game) project, a
12-level platformer built with **Godot 4 (GL Compatibility renderer)**, the
entire game was built around three design constraints:

1. **ASCII-defined level matrices** for text-based level design and instant git diffs.
2. **LAN ghost-race multiplayer** with snapshot interpolation and velocity extrapolation.
3. **Headless regression testing** running in CI without a GPU.

Here is how those systems were engineered in GDScript.

## ASCII level layouts as code

Instead of clicking tiles in the 2D viewport, every level in the game is
expressed as a multi-line ASCII string in a lightweight GDScript file:

```gdscript
# scripts/levels/level_1_1.gd
extends "res://scripts/level.gd"

func _init() -> void:
	layout = """
..................................................
..................................................
..P........C.......B..........................F...
GGGGGG....GGGG...BBBBBB...SSSS...GGGGGGGGGGGGGGGGG
DDDDDD....DDDD............DDDD...DDDDDDDDDDDDDDDDD
"""
```

At runtime, `scripts/level.gd` iterates over the string matrix, placing tiles
on a `TileMapLayer` and instantiating dynamic scenes (`Player`, `Coin`, `Enemy`,
`Spikes`, `Checkpoint`, `Goal Flag`) based on character tokens:

```gdscript
func _place(ch: String, cell: Vector2i) -> void:
	var pos := Vector2(cell.x * TILE + TILE / 2.0, cell.y * TILE + TILE / 2.0)
	match ch:
		"G": # Grass ground with auto-backfilled dirt below
			tiles.set_cell(cell, 0, GRASS)
			tiles.set_cell(cell + Vector2i(0, 1), 0, DIRT)
			tiles.set_cell(cell + Vector2i(0, 2), 0, DIRT)
		"B":
			tiles.set_cell(cell, 0, BLOCK)
		"C":
			_spawn(COIN_SCENE, pos, "Coin", cell)
		"E":
			_spawn(ENEMY_SCENE, pos, "Enemy", cell)
		"S":
			_spawn(SPIKES_SCENE, pos, "Spikes", cell)
		"P":
			_player = PLAYER_SCENE.instantiate()
			_player.position = pos
			add_child(_player)
```

### Why this beats GUI map painting

- **Pull request reviews are readable:** Adding three spike tiles or moving a
  checkpoint is visible as a clean 2-line diff in git, rather than 400 lines of
  serialized Godot node UUIDs.
- **Auto-tiling logic is trivial:** Placing `G` automatically stamps two rows
  of `DIRT` below the surface, eliminating manual filler painting.
- **Rapid rebalancing:** Moving a platform three tiles to the left is just
  hitting backspace in a text editor.

## LAN ghost racing without desyncs

Multiplayer in platformers is notoriously fragile. Full authoritative physics
across network peers introduces input latency, rollbacks, and collision desyncs.

Because the game is a speed race to the goal flag, other players don't need
physical collision. The game uses an **ENet ghost-racing architecture**
(`scripts/net.gd`):

1. One player hosts an ENet server; peers join by local IP.
2. Every player runs a **100% authoritative local simulation**.
3. Clients broadcast their position, velocity, and animation state at **15 Hz**.
4. Remote racers appear as non-colliding **ghosts** rendered with transparency.

### Snapshot interpolation and extrapolation

Because network packets arrive with variable jitter at 15 Hz (every ~66 ms),
rendering remote positions immediately causes choppy movement.

`scripts/ghost_interp.gd` buffers snapshots and renders remote players **100 ms
in the past**, smoothly lerping between the two bracketing snapshots:

```gdscript
class_name GhostInterp
extends RefCounted

const INTERP_DELAY := 100.0     # ms render delay
const MAX_EXTRAPOLATE := 200.0  # ms velocity glide window

static func sample(buffer: Array, now: float, delay := INTERP_DELAY) -> Dictionary:
	if buffer.is_empty():
		return {}
	var render_t := now - delay
	var first: Dictionary = buffer[0]
	var last: Dictionary = buffer[buffer.size() - 1]

	# If past the newest snapshot (packet drop), extrapolate along last velocity
	if render_t >= last["t"]:
		var ahead: float = minf(render_t - last["t"], MAX_EXTRAPOLATE) / 1000.0
		var ext_view := last.duplicate()
		ext_view["x"] = last["x"] + last.get("vx", 0.0) * ahead
		return ext_view

	# Interpolate between bracketing snapshots
	var a: Dictionary = first
	var b: Dictionary = last
	for i in range(buffer.size() - 1):
		if buffer[i]["t"] <= render_t and render_t <= buffer[i + 1]["t"]:
			a = buffer[i]
			b = buffer[i + 1]
			break
	var span: float = b["t"] - a["t"]
	var f: float = (render_t - a["t"]) / span if span > 0.0 else 0.0
	var view := a.duplicate()
	view["x"] = a["x"] + (b["x"] - a["x"]) * f
	view["y"] = a["y"] + (b["y"] - a["y"]) * f
	return view
```

If a packet drops, the ghost doesn't freeze or teleport; it glides forward along
its last known velocity for up to 200 ms until the next packet arrives.

## Mechanics progression across 4 worlds

The 12 levels span four themed worlds that introduce new physics rules and
hazards:

| World | Setting | Core Mechanics & Modifiers |
| :--- | :--- | :--- |
| **World 1** | Grassland | Jump tuning, coyote time, jump buffering, enemy stomping |
| **World 2** | Forest | Moving platforms, double jump challenges, procedural scenery |
| **World 3** | Crystal Cave | Lava pits, bats, falling stalactites, crumbling platforms |
| **World 4** | Space | Low gravity (`gravity_scale = 0.55`), aliens, meteor showers |

Overriding world physics is as simple as setting properties in the base level
script (`gravity_scale = 0.55`, `meteors = true`), while the player's
kinematic body adapts instantly.

## Headless test automation in Godot

Game physics code often decays because testing requires manually playing through
levels. To prevent regressions, the project includes an automated test runner
that runs headlessly in CI:

```sh
godot --headless --path . res://tests/gameplay_test.tscn
```

The test script runs 48 assertions verifying:
- **Player movement:** Coyote time windows, double jump resets, and gravity scaling.
- **Combat math:** Stomp detection angles and spike collision hitboxes.
- **Interpolation math:** Buffer sampling, lerp accuracy, and extrapolation limits.

Multiplayer networking has its own two-process headless smoke test:

```sh
godot --headless --path . res://tests/net_smoke.tscn -- host
godot --headless --path . res://tests/net_smoke.tscn -- client
```

Both instances boot up, handshake over ENet, broadcast test snapshots, verify
roster synchronization, and write results before exiting.

## Takeaway

Godot 4's lightweight architecture makes it just as pleasant for text-first,
code-driven development as traditional engines are for GUI editors. By pairing
ASCII-defined levels with ENet ghost replication and headless test runs, you get
a platformer that is robust, multiplayer-ready, and easy to maintain in git.
