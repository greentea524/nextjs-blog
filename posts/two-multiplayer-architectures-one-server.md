---
title: "Two multiplayer architectures, one server: Ghost relays and authoritative card games"
date: "2026-08-25"
excerpt: "How a single Node.js Socket.io server powers two completely different multiplayer models: a dumb 15 Hz ghost relay for action games and a strictly authoritative state machine for Big 2."
---

Real-time multiplayer games generally fall into one of two categories: fast-paced
action games where local responsiveness is everything, and turn-based games where
rules and hidden information must be protected from cheating.

In the [Web Arcade](https://github.com/greentea524/vite-project) project, a single
lightweight Node.js and Socket.io server hosts three distinct multiplayer games:

- **Platformer** — a competitive speedrun race to the goal flag.
- **Alien Invasion** — a top-down arcade space shooter with shared boss fights.
- **Big 2** — a classic 4-player climbing card game with poker-hand combinations.

Rather than forcing all three games into a one-size-fits-all networking model,
the server implements two opposite multiplayer paradigms side by side.

| Aspect | 🏎️ Platformer & Alien Invasion | 🃏 Big 2 (Card Game) |
| :--- | :--- | :--- |
| **Model** | **Dumb Ghost Relay** (Client-Authoritative) | **Server-Authoritative State Machine** |
| **Server Logic** | Zero game logic; sanitizes & relays snapshots | Full game engine (deals, verifies hands, scores) |
| **Data Flow** | Broadcasts 15 Hz coordinate & animation packets | Private hand events (`big2:hand`) + public trick state |
| **Latency Strategy** | 100ms past-interpolation & velocity extrapolation | Turn-based state updates; zero physics latency |
| **Disconnects** | Remote ghost fades from the room | Seamless bot takeover (`chooseBotMove`) mid-game |
| **Anti-Cheat** | Token-bucket rate limiting & payload sanitization | Information hiding (opponent cards never sent to clients) |

---

## 1. The Dumb Ghost Relay (Platformer & Alien Invasion)

For fast-action 2D games, standard authoritative physics servers introduce input
delay, rubber-banding, or complex rollback reconciliation.

Because *Platformer* and *Alien Invasion* are casual co-op or race games, the
server acts as a **dumb relay** (`server/relay.js`). It maintains ephemeral
rooms identified by 4-letter room codes (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`),
executes a synchronized 3-second countdown start, and broadcasts player state
without inspecting gameplay rules.

```
Client A (Local Physics) ──[15 Hz State Snapshot]──> Relay Server
                                                          │
Client B (Renders Ghost) <──[Sanitized Broadcast]─────────┘
```

### Snapshot interpolation and extrapolation

Every client runs its own 60 FPS physics simulation locally. At 15 Hz (~66 ms),
it emits a compact snapshot containing coordinates `(x, y)`, velocity `(vx)`,
facing direction, avatar animation, and cosmetic bullet arrays (`shots`).

On remote clients, `ghosts.js` stores snapshots in a sliding buffer and renders
opponents **100 ms in the past**:

```js
// ghosts.js: Snapshot interpolation
const render_t = now - 100.0;

// If packet arrives late, extrapolate forward along last known velocity
if (render_t >= lastSnap.t) {
  const ahead = Math.min(render_t - lastSnap.t, 200.0) / 1000.0;
  return {
    x: lastSnap.x + (lastSnap.vx ?? 0) * ahead,
    y: lastSnap.y,
  };
}

// Otherwise, smoothly lerp between the two bracketing snapshots
const span = nextSnap.t - prevSnap.t;
const f = span > 0 ? (render_t - prevSnap.t) / span : 0;
return {
  x: prevSnap.x + (nextSnap.x - prevSnap.x) * f,
  y: prevSnap.y + (nextSnap.y - prevSnap.y) * f,
};
```

If network packets jitter, remote racers don't freeze or hitch; they glide
forward along their last known velocity for up to 200 ms until the next packet
lands.

---

## 2. Server-Authoritative Card Engine (Big 2)

A card game requires the exact opposite approach. If the client decided what
cards it held or whether a play was legal, modified browser clients could peek
at opponents' hands or forge winning combinations.

For *Big 2*, `server/big2.js` runs a complete, authoritative game engine:

1. **Information Hiding:** The server shuffles and deals the 52-card deck. It
   sends each player *only* their private hand via a targeted socket event:
   ```js
   io.to(seat.socketId).emit("big2:hand", { seat: i, hand: g.state.hands[i] });
   ```
   The public room broadcast (`big2:state`) receives only card counts, current
   turn index, and the active trick on the table. Opponents' cards literally do
   not exist in client memory until the round ends.

2. **Rule Enforcement:** When a player submits cards via `big2:play`, the server
   validates that the combination is legal (singles, pairs, triples, straights,
   flushes, full houses, quads, or straight flushes) and beats the current
   trick. Invalid plays are rejected privately (`big2:rejected`).

### Seamless bot takeover on disconnect

In multiplayer card games, a player abandoning a match usually ruins the game
for the remaining three players.

In this architecture, empty lobby seats and disconnected players are seamlessly
handed over to an integrated AI bot (`chooseBotMove`):

```js
function scheduleBot(io, code, room) {
  const g = room.big2;
  const seat = g.seats[g.state.turn];
  if (seat.socketId) return; // Human turn

  const delay = 800 + Math.random() * 400; // Human-like thinking delay
  g.timer = setTimeout(() => {
    const move = chooseBotMove(g.state.hands[g.state.turn], g.state.trick?.cards);
    if (move.pass) {
      passTurn(g);
    } else {
      playCards(g, move.cards);
    }
    afterAction(io, code, room);
  }, delay);
}
```

If Player 3 loses Wi-Fi mid-match, the server immediately marks their seat as a
bot, schedules moves with realistic 800–1200 ms thinking delays, and allows the
remaining human players to finish the game without disruption.

---

## 3. Defense-in-depth on an unauthenticated wire

Because the relay server is public and runs on free-tier infrastructure, it must
protect itself against abuse and memory exhaustion:

### Token bucket rate limiting
Legitimate action clients broadcast at ~15 Hz, but send a burst on terminal
game-over. A naive minimum interval would drop critical game-over events. The
relay implements an in-memory token bucket per socket:

```js
function withinRate(socket, key, perSecond, burst) {
  const now = Date.now();
  const bucket = (socket.data[key] ??= { tokens: burst, at: now });
  bucket.tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 1000) * perSecond);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}
```

### Strict payload sanitization
Nothing crosses the relay without being sanitized through a strict whitelist:
- Strings are clamped (`MAX_NAME = 16`, `MAX_SHORT_STRING = 24`).
- Non-finite numbers (`NaN`, `Infinity`) are stripped.
- Arrays (like cosmetic ghost bullets) are capped to 32 elements.

---

## Conclusion

Good multiplayer architecture isn't about finding the "one true networking
model" — it's about choosing the right authority boundary for the mechanics:

- When **responsiveness** matters most, use a dumb relay with client-side
  interpolation and zero server physics.
- When **fairness and hidden information** matter most, keep state strictly
  authoritative on the server and stream only what the client needs to see.
