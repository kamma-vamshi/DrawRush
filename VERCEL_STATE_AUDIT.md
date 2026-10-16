# DrawRush — Backend State & Concurrency Audit

**Document Date:** October 16, 2026  
**Purpose:** Comprehensive inventory and classification of all application state across the DrawRush backend to ensure multi-instance correctness on Vercel.

---

## 1. State Classification Framework

Each piece of application state is categorized under one of four classifications:
- **Category A — Safe Local State:** Immutable or process-local transient state that does not need to cross instance boundaries (e.g., static word databases, socket file descriptors).
- **Category B — Dangerous Process-Local State:** State currently bound to process memory that causes race conditions, split-brain rooms, or dropped gameplay if traffic hits multiple instances.
- **Category C — Durable Shared Real-time State:** Authoritative state that must be stored externally (Redis/Firestore) so any compute instance can read and mutate it safely.
- **Category D — Derived State:** Transient values that can be deterministically recalculated on demand from Category C data without explicit storage.

---

## 2. Detailed State Inventory

### 2.1 `roomStore.rooms`
- **Location:** [backend/src/rooms/roomStore.ts:9](file:///d:/DrawRush/backend/src/rooms/roomStore.ts#L9) (`Map<string, Room>`)
- **Current Classification:** **Category B (Dangerous Process-Local)**
- **Target Classification:** **Category C (Durable Shared State)**
- **Why It Exists:** Global lookup table mapping 6-character room codes (`roomCode`) to active room instances.
- **Access Patterns:** Read on `room:join`, `game:start`, `draw:stroke`, `guess:submit`, `/health`. Written on `room:create`, `room:delete`, and periodic purge.
- **Multi-Instance Impact:** **Fatal.** If Host creates room on Instance 1 and Guest joins on Instance 2, Guest receives `ROOM_NOT_FOUND`.
- **Target Solution:** Move room metadata and index to Redis (e.g., Redis Hash `drawrush:room:<roomCode>:meta` and Set `drawrush:active_rooms`).

---

### 2.2 `Room.players`
- **Location:** [backend/src/rooms/room.ts:69](file:///d:/DrawRush/backend/src/rooms/room.ts#L69) (`Map<string, ServerPlayer>`)
- **Current Classification:** **Category B (Dangerous Process-Local)**
- **Target Classification:** **Category C (Durable Shared State)**
- **Why It Exists:** Tracks connected players, nick, avatar, role (host/artist), score, connection status, mute status.
- **Access Patterns:** Read by GameEngine during turn rotation and scoring. Mutated upon join, leave, score change, and disconnect.
- **Multi-Instance Impact:** **Fatal.** If a player on Instance 2 guesses correctly, Instance 1 (where the artist is connected) never sees the updated score or guess state.
- **Target Solution:** Store room players as a Redis Hash `drawrush:room:<roomCode>:players` mapping `playerId -> JSON(ServerPlayer)`.

---

### 2.3 `Room.currentRound` (Round State & Secret Word)
- **Location:** [backend/src/rooms/room.ts:70](file:///d:/DrawRush/backend/src/rooms/room.ts#L70) (`RoundInfo | null`)
- **Current Classification:** **Category B (Dangerous Process-Local)**
- **Target Classification:** **Category C (Durable Shared State)**
- **Why It Exists:** Authoritative record of active round number, secret word (redacted from clients), masked pattern, start/end timestamps, revealed hint indices, and correct guesser list.
- **Access Patterns:** Evaluated on every `guess:submit`. Updated when artist selects word and when guessers score points.
- **Multi-Instance Impact:** **Fatal.** Guessers on Instance 2 cannot validate guesses against the secret word held exclusively on Instance 1.
- **Target Solution:** Store active round data in Redis Hash `drawrush:room:<roomCode>:round`.

---

### 2.4 `Room.drawingHistory` (Canvas Replay Buffer)
- **Location:** [backend/src/rooms/room.ts:74](file:///d:/DrawRush/backend/src/rooms/room.ts#L74) (`DrawingHistoryEvent[]`)
- **Current Classification:** **Category B (Dangerous Process-Local)**
- **Target Classification:** **Category C (Durable Shared State with TTL)**
- **Why It Exists:** Stores vector stroke batches (up to `MAX_CANVAS_HISTORY = 500`) to replay the complete canvas when a player reconnects mid-round.
- **Access Patterns:** Appended on `draw:stroke`, `draw:clear`, `draw:undo`. Read on reconnect or room state request.
- **Multi-Instance Impact:** **High.** If a player drops and reconnects to Instance 2, Instance 2 has an empty array, sending a blank canvas to the reconnected player.
- **Target Solution:** Store as a Redis List `drawrush:room:<roomCode>:drawing` with `RPUSH` and `LTRIM` capped at 500 items, with TTL equal to room/round duration.

---

### 2.5 `Room.usedWordsThisGame`
- **Location:** [backend/src/rooms/room.ts:77](file:///d:/DrawRush/backend/src/rooms/room.ts#L77) (`Set<string>`)
- **Current Classification:** **Category B (Dangerous Process-Local)**
- **Target Classification:** **Category C (Durable Shared State)**
- **Why It Exists:** Ensures words are not picked twice during consecutive rounds of the same match.
- **Multi-Instance Impact:** **Medium.** Words may repeat if round transitions occur across instances.
- **Target Solution:** Store as a Redis Set `drawrush:room:<roomCode>:used_words`.

---

### 2.6 Timers & Phase Transitions
- **Location:** [backend/src/rooms/room.ts:78-79](file:///d:/DrawRush/backend/src/rooms/room.ts#L78-L79) (`phaseTimer`, `hintTimer`, `disconnectTimers`)
- **Current Classification:** **Category B (Dangerous Process-Local)**
- **Target Classification:** **Durable Timestamps + Resilient Evaluation**
- **Why It Exists:** Schedules game phase transitions (Countdown: 3s; Word Selection: 15s; Round Drawing: 60-80s; Round Result: 5s; Disconnect Grace: 15s).
- **Multi-Instance Impact:** **Critical.** Node.js `setTimeout` handles are tied to the local event loop. When a serverless function invocation completes or scales to zero, event loop timers freeze or disappear.
- **Target Solution:**
  1. Authoritative timestamps in Redis: `phaseStartedAt`, `phaseEndsAt`, `currentPhase`.
  2. Every inbound socket event or health check evaluates `Date.now() >= phaseEndsAt` and advances phase idempotently using a Redis atomic lock/transaction.
  3. Active persistent timers run in connected instances but are safe against instance loss.

---

### 2.7 Rate Limiter Buckets
- **Location:** [backend/src/utils/rateLimiter.ts:14](file:///d:/DrawRush/backend/src/utils/rateLimiter.ts#L14) (`Map<string, Bucket>`)
- **Current Classification:** **Category B (Dangerous Process-Local)**
- **Target Classification:** **Category C (Redis-backed Token Bucket)**
- **Multi-Instance Impact:** Clients connecting across different lambdas get separate buckets, diluting rate limits.
- **Target Solution:** Redis atomic sliding-window or token-bucket counter with TTL.

---

### 2.8 Word Database & Static Rules
- **Location:** [backend/src/words/wordDatabase.ts](file:///d:/DrawRush/backend/src/words/wordDatabase.ts)
- **Current Classification:** **Category A (Safe Local State)**
- **Why It Exists:** Immutable vocabulary lists, categories, and swear-filter word blocks.
- **Multi-Instance Impact:** **Zero.** Pure functions and static read-only memory.

---

### 2.9 User Profiles & Social Relationships
- **Location:** [backend/src/db/userStore.ts](file:///d:/DrawRush/backend/src/db/userStore.ts) & [friendStore.ts](file:///d:/DrawRush/backend/src/db/friendStore.ts)
- **Current Classification:** **Category C (Durable Shared State)**
- **Status:** Already implemented in Google Cloud Firestore (`FirestoreUserStore`, `FirestoreFriendStore`). Fully shared across all instances.
