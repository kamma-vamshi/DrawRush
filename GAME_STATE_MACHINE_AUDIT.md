# DrawRush — Game State Machine & Timer Audit

**Document Date:** October 16, 2026  
**Audited Components:** [backend/src/game/gameEngine.ts](file:///d:/DrawRush/backend/src/game/gameEngine.ts), [backend/src/rooms/room.ts](file:///d:/DrawRush/backend/src/rooms/room.ts), [backend/src/middleware/socketHandlers.ts](file:///d:/DrawRush/backend/src/middleware/socketHandlers.ts)

---

## 1. Complete Lifecycle State Diagram

```
[LOBBY] 
   │  Host triggers `game:start`
   ▼
[COUNTDOWN] (3 seconds)
   │  Timer expires
   ▼
[WORD_SELECTION] (15 seconds)
   │  Artist selects word OR 15s timeout auto-picks
   ▼
[DRAWING] (60–80 seconds)
   │  ├─ Hint timer reveals letters periodically
   │  ├─ Guessers submit guesses
   │  ├─ If all guessers correct ──► terminate early (1s delay)
   │  └─ If drawingTime expires ──► terminate round
   ▼
[ROUND_RESULT] (5 seconds)
   │  Reveals secret word, awards points, displays scores
   │  Timer expires:
   │  ├─ More rounds remain ──► [WORD_SELECTION] (Next Artist)
   │  └─ All rounds done    ──► [GAME_OVER]
   ▼
[GAME_OVER] (15 seconds)
   │  Displays final winner & podium
   │  Timer expires
   ▼
[LOBBY] (Reset scores & ready states)
```

---

## 2. Comprehensive Timer Inventory

| # | Timer Identifier | Duration | Trigger Condition | State Transition | Broadcast Event | Process-Loss Vulnerability |
|---|---|---|---|---|---|---|
| **T1** | Countdown Timer | `3,000 ms` | Host clicks start in LOBBY | `LOBBY` ➔ `COUNTDOWN` ➔ `WORD_SELECTION` | `game:countdown`, `round:started`, `word:choices` | High: If process dies, match never transitions to Word Selection |
| **T2** | Word Selection Timer | `15,000 ms` | Round starts; 3 choices presented to artist | `WORD_SELECTION` ➔ `DRAWING` (Auto-selects choice[0] if unpicked) | `round:drawing_phase_started`, `artist:word_assigned` | High: Match hangs permanently if artist disconnects during selection |
| **T3** | Drawing Round Timer | `60,000–80,000 ms` | Word selected; artist begins drawing | `DRAWING` ➔ `ROUND_RESULT` | `round:ended` (`reason: "timeExpired"`) | Critical: Round drawing never terminates if timer drops |
| **T4** | Hint Reveal Timer | `(roundTime / (hintCount + 1))` | Recurring during `DRAWING` phase | Unreveals random letter in word pattern | `hint:revealed` | Medium: Hints cease appearing mid-round |
| **T5** | All Guessed Early End | `1,000 ms` | Last eligible guesser guesses word | `DRAWING` ➔ `ROUND_RESULT` | `round:ended` (`reason: "allGuessed"`) | Low: Falls back to main round timer |
| **T6** | Round Result Timer | `5,000 ms` | Round concludes | `ROUND_RESULT` ➔ Next `WORD_SELECTION` or `GAME_OVER` | `round:started` or `game:over` | Critical: Game remains stuck on scoreboard |
| **T7** | Game Over Reset | `15,000 ms` | Match completes | `GAME_OVER` ➔ `LOBBY` | `room:updated` | Low: Players can leave room |
| **T8** | Player Disconnect Grace | `15,000 ms` | Player socket disconnects | Marks player as abandoned; removes from room | `player:left`, `room:updated` | High: Player slot permanently reserved |
| **T9** | Artist Disconnect Grace | `5,000 ms` | Active drawing artist disconnects | `DRAWING` ➔ `ROUND_RESULT` (`reason: "artistDisconnected"`) | `round:ended` | Critical: Guessers left staring at frozen canvas |
| **T10**| Host Migration Grace | `8,000 ms` | Room host disconnects | Assigns oldest connected player as new host | `host:migrated`, `room:updated` | High: Room left without a host to start games |
| **T11**| Room Purge Interval | `300,000 ms` (5 min) | Continuous background interval | Clears rooms where `players.size === 0` | Internal memory cleanup | Medium: Memory leak if background interval halts |

---

## 3. Distributed Timestamp Architecture (The Solution)

To make this game engine resilient on Vercel:
1. **Never rely solely on an in-memory `setTimeout` handle for authoritative phase expiration.**
2. Store authoritative timestamps in shared state (Redis):
   ```typescript
   interface DistributedPhaseState {
     phase: GamePhase;
     phaseStartedAt: number; // Unix ms
     phaseEndsAt: number;    // Unix ms
     roundNumber: number;
     artistId: string;
   }
   ```
3. **Passive Expiration Evaluation:** Every incoming socket request (guess, ping, stroke, join) and a lightweight heartbeat tick checks:
   ```typescript
   if (Date.now() >= phaseEndsAt) {
     await gameEngine.tryAdvancePhase(roomCode, currentPhase);
   }
   ```
4. **Active Timers:** Warm connected instances still run `setTimeout` for instant responsive broadcasts, but if that instance is recycled, the next event or check immediately triggers the overdue transition without stalling the game.
