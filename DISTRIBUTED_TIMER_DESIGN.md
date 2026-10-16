# DrawRush — Distributed Timer & Concurrency Architecture

**Document Date:** October 16, 2026  
**Target Platform:** Vercel Compute / Multi-Instance Node.js / Redis

---

## 1. Problem Statement
In the original implementation, game phase transitions (Countdowns, Word Selection auto-pick, Round drawing limits, and Scoreboard transitions) relied exclusively on Node.js process-local `setTimeout` handles:
```typescript
room.phaseTimer = setTimeout(async () => { ... }, duration);
```
On Vercel and auto-scaling cloud environments:
1. Serverless instances freeze or terminate between request events.
2. If Instance 1 restarts or terminates while a 60-second round is underway, the in-memory timer handle is lost.
3. The match stalls indefinitely because no process ever fires the phase transition callback.
4. If multiple instances attempt to run timers simultaneously, duplicate round advancements or double-scoring can occur.

---

## 2. Distributed Timestamp Architecture

To eliminate reliance on fragile process-local timer handles, DrawRush introduces **Authoritative Distributed Timestamps**:

```typescript
interface PhaseTimestampState {
  phase: GamePhase;
  phaseStartedAt: number; // Unix timestamp in milliseconds
  phaseEndsAt: number;    // Unix timestamp in milliseconds
}
```

Every room transition records exact epoch milliseconds into shared state (Redis):
- **COUNTDOWN:** `phaseEndsAt = Date.now() + config.COUNTDOWN_MS` (3,000 ms)
- **WORD_SELECTION:** `phaseEndsAt = Date.now() + config.WORD_SELECTION_TIMEOUT_MS` (15,000 ms)
- **DRAWING:** `phaseEndsAt = Date.now() + (room.settings.drawingTimeSec * 1000)` (60,000–80,000 ms)
- **ROUND_RESULT:** `phaseEndsAt = Date.now() + config.ROUND_RESULT_MS` (5,000 ms)
- **GAME_OVER:** `phaseEndsAt = Date.now() + 15,000` (15,000 ms)

---

## 3. Dual-Trigger Execution Model

DrawRush uses a hybrid **Active + Passive** trigger strategy:

```
                  ┌──────────────────────────────────────────────┐
                  │ Authoritative State in Redis                │
                  │ phase: DRAWING, phaseEndsAt: 1729090060000   │
                  └──────────────────────┬───────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
                 ▼                                               ▼
     [Trigger Path A: Active]                        [Trigger Path B: Passive]
 Warm connected server runs local                Any incoming socket event (guess, stroke,
 setTimeout for zero-latency response.           ping, reconnect) checks:
                                                 if (Date.now() >= phaseEndsAt)
                 │                                               │
                 └───────────────────────┬───────────────────────┘
                                         ▼
                     ┌───────────────────────────────────────┐
                     │ Atomic Transition Guard (Redis NX)    │
                     │ SET lock:phase:<code丸:<phase> 1 NX EX 5│
                     └───────────────────┬───────────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         │                               │
                      Acquired                        Failed
                         │                               │
                         ▼                               ▼
                 Execute Transition              No-op (Another worker
             (e.g., endRound("timeExpired"))      already transitioned)
```

### Path A: Active Execution (Low-Latency Path)
When a server instance holds active socket connections for a room, it schedules a local `setTimeout`. This ensures normal turn progression occurs with zero latency without polling.

### Path B: Passive Evaluation (Resilience Path)
If the server that scheduled the timer crashes, restarts, or is terminated by Vercel:
1. Every inbound packet (`guess:submit`, `draw:stroke`, ping, or reconnect) calls `checkAndAdvancePhase(room)`.
2. If `Date.now() >= room.phaseEndsAt`, the system recognizes that the scheduled phase has expired.
3. The server immediately and safely executes the transition.
4. The match never freezes even if compute instances recycle.

---

## 4. Race Condition Prevention (Concurrency Controls)

### 4.1 Timer Race Prevention
When a timer fires on Instance 1 at the exact same millisecond that a player submits an action on Instance 2:
```typescript
const lockKey = `drawrush:lock:phase:${room.roomCode}:${room.phase}`;
const acquired = await redis.set(lockKey, "1", "NX", "EX", 5);
if (!acquired) {
  // Another instance is already executing this exact phase transition
  return;
}
```
- **Atomicity:** `SET ... NX EX 5` guarantees that exactly **one** worker advances the phase.
- **TTL (5s):** Automatically expires in case of an unhandled crash during transition.

### 4.2 Simultaneous Correct Guesses
When Guesser A and Guesser B submit the correct word within 5 milliseconds of each other:
1. Guesses are processed against the authoritative `round.secretWord`.
2. Points are computed based on `remainingMs = Math.max(0, round.endTimestamp - Date.now())`.
3. Player score updates are applied atomically.
4. If Guesser B was the last eligible guesser, early round termination checks:
   ```typescript
   if (room.eligibleGuessers.length === 0) {
     const endLock = await redis.set(`drawrush:lock:allguessed:${room.roomCode}`, "1", "NX", "EX", 3);
     if (endLock) {
       await this.endRound(room, "allGuessed");
     }
   }
   ```
   This prevents duplicate `round:ended` events.

---

## 5. Reconnection & Canvas History Restoration

1. **Drawing History Buffer:**
   - Stored in Redis List `drawrush:room:<roomCode>:drawing` with automatic trimming to `MAX_CANVAS_HISTORY = 500`.
   - When a disconnected player reconnects to **any** instance, the instance retrieves the vector history from Redis and replays the canvas.
2. **Player Identity & Seat Restoration:**
   - Player records are retrieved from `drawrush:room:<roomCode>:players`.
   - `player.connected` is flipped back to `true`, and any active disconnect grace timers are cancelled.
   - The player's existing score, host role, and guess status are completely preserved.
