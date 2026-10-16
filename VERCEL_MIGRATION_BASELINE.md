# DrawRush — Vercel Migration Baseline

**Document Date:** October 16, 2026  
**Repository Branch:** `main` (commit `83af85a Initial DrawRush project`)  
**Baseline Test Status:** 105/105 Tests Passing (11/11 Test Files)  
**TypeScript Status:** 0 Diagnostics (`tsc --noEmit` PASS)

---

## 1. Current Architecture
- **Language & Runtime:** TypeScript 5.5, Node.js 20+ (ESM, `"type": "module"`)
- **HTTP Server Framework:** Fastify 4.28 (`@fastify/cors` 9.0)
- **Real-time Engine:** Socket.IO 4.7 attached to Fastify's underlying Node HTTP server (`fastify.server`)
- **Database & Identity:** Google Cloud Firestore & Firebase Admin SDK 12.7
- **In-Memory State:** `RoomStore` using a single-process `Map<string, Room>`
- **Packaging:** Multi-stage Dockerfile (`node:20-alpine`, non-root user `drawrush`) and `docker-compose.yml`

---

## 2. Current Startup Process
In [backend/src/index.ts](file:///d:/DrawRush/backend/src/index.ts):
1. `initFirebase()` initializes Firebase Admin with `cert()` or warns if `DEV_AUTH=true`.
2. Fastify instance created with `pino-pretty` logger.
3. CORS plugin registered (`origin: true`, methods: `GET, POST`).
4. HTTP routes registered (`/health`, `/api/categories`, `/api/version`).
5. `await fastify.ready()` completes plugin loading.
6. `new SocketIOServer(fastify.server, { ... })` instantiated with transports `["websocket", "polling"]`.
7. `registerSocketHandlers(io)` hooks socket middleware and events.
8. `await fastify.listen({ port: config.PORT, host: "0.0.0.0" })` binds to port 3001.
9. Process lifecycle handlers attached: `process.on("SIGTERM", shutdown)` and `process.on("SIGINT", shutdown)`.

---

## 3. Current REST Endpoints
| Endpoint | Method | Response Payload | Dependencies |
|---|---|---|---|
| `/health` | GET | `{ status: "ok", version: PROTOCOL_VERSION, env: config.NODE_ENV, timestamp, rooms: roomStore.size }` | In-memory `roomStore.size` |
| `/api/categories` | GET | `{ categories: [{ id, name, wordCount }] }` | In-memory `WORD_CATEGORIES` |
| `/api/version` | GET | `{ protocolVersion: "1.0.0", minClientVersion: "1.0.0" }` | Static constant |

---

## 4. Current Socket.IO Architecture
- **Transports:** `["websocket", "polling"]`
- **Adapter:** Default in-memory adapter (`socket.io-adapter`). Broadcasts are strictly process-local.
- **Handshake Auth:** `io.use(async (socket, next) => { ... })` verifies Firebase ID token via `verifyIdToken(token)`.
- **Rooms:** Handled via `socket.join(roomChannel(roomCode))` and `io.to(roomChannel(roomCode)).emit(...)`.
- **Payload & Heartbeat:** `maxHttpBufferSize: 65536` (64 KB), `pingTimeout: 20000` (20s), `pingInterval: 10000` (10s).

---

## 5. Current Room & Game Lifecycle
1. **Room Creation (`room:create`):** Host generates 6-character room code; creates `Room` instance; saves into `roomStore.set(room)`.
2. **Room Joining (`room:join`):** Validates room code in `roomStore.get(code)`; adds `ServerPlayer` to `room.players`.
3. **Lobby:** Host starts game (`game:start`); builds randomized artist rotation queue (`room.artistQueue`).
4. **Countdown Phase (3 seconds):** Broadcasts `game:countdown`; schedules `room.phaseTimer = setTimeout(..., 3000)`.
5. **Word Selection Phase (15 seconds):** Artist receives 3 secret word choices; schedules `room.phaseTimer = setTimeout(..., 15000)` (auto-picks if timeout expires).
6. **Drawing Phase (60–80 seconds):**
   - Artist sends `draw:stroke`, `draw:clear`, `draw:undo`. Server broadcasts to room and stores stroke history in `room.drawingHistory` (max 500 events).
   - Server schedules hints via `room.hintTimer = setTimeout(...)`.
   - Guessers send `guess:submit` or `chat:message`.
   - Correct guess calculates points based on remaining time (`calcGuessPoints`) and marks `player.hasGuessedCurrentWord = true`.
   - If all eligible guessers guess correctly, round terminates early.
   - Otherwise, `room.phaseTimer = setTimeout(..., drawingTimeSec * 1000)` terminates round.
7. **Round Result Phase (5 seconds):** Reveals secret word, updates cumulative scores, and schedules next round or game over.
8. **Game Over Phase:** Broadcasts final leaderboard and cleans up room state.

---

## 6. Current Timers
All timers are Node.js event-loop objects bound to process memory:
- `room.phaseTimer`: Manages countdowns, selection timeouts, round durations, round results.
- `room.hintTimer`: Manages periodic letter reveals during drawing.
- `player.disconnectTimers`: Array of `setTimeout` handles:
  - 15s player disconnect grace period before removal.
  - 5s artist disconnect grace period before ending round prematurely.
  - 8s host disconnect grace period before migrating host to next connected player.
- `roomStore.purgeEmpty()`: Run every 5 minutes via `setInterval` in [roomStore.ts](file:///d:/DrawRush/backend/src/rooms/roomStore.ts#L56).

---

## 7. Current Persistence Layer
- **Persistent (Firestore):** When `DEV_AUTH=false`, `FirestoreUserStore` stores user profiles (`users` collection) and `FirestoreFriendStore` stores friend requests and friendships (`friendRequests`, `friendships`).
- **Ephemeral (In-Memory):** Rooms, players, canvas drawing history, in-game chat, and scores are kept in memory and destroyed when the server restarts.

---

## 8. Current Redis Usage
- `ioredis` is installed as a package dependency (`^5.4.1`) in `package.json`.
- `REDIS_URL` is configured in `config.ts` (defaults to `redis://localhost:6379`).
- **Actual status:** Unused. There are 0 imports of `ioredis` in `src/`, and `@socket.io/redis-adapter` is not installed.

---

## 9. Current Rate Limiting
- Token bucket rate limiter implemented in [src/utils/rateLimiter.ts](file:///d:/DrawRush/backend/src/utils/rateLimiter.ts).
- `chatRateLimiter`: 10 tokens / 5 seconds.
- `drawRateLimiter`: 60 tokens / 1 second.
- State is held in process-local `Map<string, Bucket>`.

---

## 10. Current Android Backend Configuration
- Configured in [android-app/app/build.gradle.kts](file:///d:/DrawRush/android-app/app/build.gradle.kts#L63-L82):
  - Debug builds connect to `DEBUG_BACKEND_URL` / `http://10.0.2.2:3001`.
  - Release builds connect to `RELEASE_BACKEND_URL` / `https://api.drawrush.app`.
- Injected as `BuildConfig.BACKEND_URL` and consumed in `GameRepository.kt` and `HomeScreen.kt`.

---

## 11. Baseline Test Results
- **TypeScript Typecheck:** PASS (`tsc --noEmit` — 0 errors)
- **TypeScript Build:** PASS (`tsc` — outputs to `dist/`)
- **Unit & Integration Suite:** 105/105 PASS across 11 test suites:
  - `helpers.test.ts`: 28 passed
  - `wordDatabase.test.ts`: 15 passed
  - `scoring.test.ts`: 14 passed
  - `config.test.ts`: 6 passed
  - `devAuth.test.ts`: 1 passed
  - `security.test.ts`: 3 passed
  - `reconnect.test.ts`: 4 passed
  - `h1-leak.test.ts`: 5 passed
  - `h2-leak.test.ts`: 2 passed
  - `http.test.ts`: 2 passed
  - `friends.test.ts`: 25 passed

---

## 12. Known Migration Blockers for Vercel
1. Direct `fastify.listen({ port, host })` call prevents serverless function export.
2. In-memory `roomStore` breaks when players connect to different Vercel instances.
3. Event-loop `setTimeout` handles are dropped when serverless workers freeze or scale to zero.
4. Process-local Socket.IO broadcasting does not reach sockets on separate instances.
5. In-memory rate limiting becomes diluted across multiple instances.
