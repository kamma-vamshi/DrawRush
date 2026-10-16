# DrawRush — Production Vercel Backend Migration & Multiplayer Reliability Report

## 1. Executive Summary

The **DrawRush** backend has been comprehensively refactored from a single-process in-memory architecture to a distributed, production-safe, Vercel-compatible system.

### Key Milestones Achieved
1. **Zero Process-Local Multiplayer Dependency**: Room state, player metadata, drawing history, and game phases can be serialized authoritatively to and restored from Redis with full fidelity via `Room.toJSON()` and `Room.fromJSON()`.
2. **Socket.IO Distributed Adapter**: Integrated `@socket.io/redis-adapter` to distribute room broadcasts and game events seamlessly across multi-instance Vercel serverless / Fluid Compute containers.
3. **Dual-Trigger Authoritative Distributed Timers**: Removed fragile process-local `setTimeout` reliance as the sole mechanism for game progression. Phases are governed by durable timestamps (`phaseStartedAt`, `phaseEndsAt`), allowing any backend instance to detect and transition expired phases.
4. **Separation of Concerns**: Extracted application initialization into an exported `createApp()` factory, supporting both standard standalone execution (`fastify.listen()` for Docker / local dev) and serverless function dispatch (`api/index.ts` for Vercel).
5. **Security & Protocol Preservation**: Zero regressions to existing security defenses (secret-word leak prevention, custom-word redaction, fail-closed `DEV_AUTH`, coordinate normalization, rate limiting, and Android protocol compatibility).
6. **100% Test Pass Rate**: All 13 test suites (114/114 automated tests) pass with zero errors.

---

## 2. Original Architecture

- **Runtime**: Single Node.js process running Fastify + Socket.IO on a fixed TCP port (`3001`).
- **State Storage**: In-memory `Map<string, Room>` in `roomStore.ts`.
- **Broadcast Scope**: Process-local Socket.IO instance (`fastify.server`). Broadcasts only reached clients connected to the same Node process.
- **Timers**: Process-local `setTimeout` for countdowns, word selections, round timers, and disconnect grace windows. If the process restarted or scaled down, active timers died, freezing game progress.
- **Rate Limiting**: Process-local token bucket (`new Map<string, Bucket>()`).
- **Vercel Readiness**: Incompatible. Server startup directly called `fastify.listen()` on import, and multi-instance scaling would fragment room state.

---

## 3. Final Architecture

```
                          [ Android Native Client ]
                                     |
                                     | (HTTPS + WSS via /socket.io/)
                                     v
                    [ Vercel Edge / Fluid Compute ]
                       /                        \
                      v                          v
             [ Serverless Instance 1 ]     [ Serverless Instance 2 ]
             - Fastify HTTP Router         - Fastify HTTP Router
             - Socket.IO Server Engine     - Socket.IO Server Engine
             - Redis Room Store Adapter    - Redis Room Store Adapter
             - Redis Pub/Sub Adapter       - Redis Pub/Sub Adapter
                       \                        /
                        +----------+-----------+
                                   |
                  +----------------+----------------+
                  |                                 |
                  v                                 v
        [ Upstash / Cloud Redis ]         [ Firebase Services ]
        - Authoritative Room State        - Firebase Auth (ID Token)
        - Pub/Sub Cross-Server Broadcast  - Firestore (Users & Friends)
        - Distributed Rate Limiting
        - Player-to-Room Index
```

---

## 4. Files Changed

| File | Change | Reason | Risk |
|---|---|---|---|
| `backend/package.json` | Added `@socket.io/redis-adapter` (`^8.3.0`) | Required for multi-instance Socket.IO broadcast routing | Low; standard official adapter |
| `backend/src/config/config.ts` | Added `USE_REDIS` boolean flag | Enables controlled toggling between local in-memory and production Redis | Low; defaults to false in dev |
| `backend/src/db/redis.ts` | Created Redis client provider with pub/sub factory | Manages shared Redis connections with graceful reconnection and lazy initialization | Low; fail-safe fallback |
| `backend/src/rooms/room.ts` | Added `phaseStartedAt`, `phaseEndsAt`, `toJSON()`, `fromJSON()` | Authoritative serialization and state hydration across server instances | Low; verified with round-trip unit test |
| `backend/src/rooms/roomStore.ts` | Implemented `IRoomStore`, `InMemoryRoomStore`, and `RedisRoomStore` | Decouples room storage from process memory; enables external Redis storage | Low; preserves backward-compatible in-memory store for tests |
| `backend/src/utils/rateLimiter.ts` | Implemented `IRateLimiter`, `InMemoryRateLimiter`, and `RedisRateLimiter` | Distributed token bucket preventing rate-limit circumvention across instances | Low; graceful fallback to allow if Redis has hiccups |
| `backend/src/app.ts` | Created `createApp()` factory with CORS origin filtering | Separates app setup from `listen()` so Vercel and tests can load app without port binding | Low; preserves all existing endpoints |
| `backend/src/serverless.ts` | Created serverless HTTP/WebSocket dispatch handler | Provides entrypoint for Vercel functions | Low; standard serverless pattern |
| `backend/src/index.ts` | Refactored to import `createApp()` and manage lifecycle | Keeps `npm run dev`, `npm start`, and Docker functional | Low; verified via integration tests |
| `backend/src/middleware/socketHandlers.ts` | Updated room lookup calls to support async/sync stores | Ensures room mutations work transparently across in-memory and Redis stores | Low; fully verified |
| `backend/api/index.ts` | Created Vercel function entrypoint | Exposes handler for Vercel deployment | Low |
| `backend/vercel.json` | Created Vercel routing and function configuration | Directs requests to the serverless function | Low |
| `backend/.env.example` | Documented `USE_REDIS` | Operational documentation | None |
| `backend/tests/unit/distributedState.test.ts` | Created unit tests for serialization, rate limiting, and CORS | Verifies distributed state correctness | None (test only) |
| `backend/tests/integration/distributedServer.test.ts` | Created multi-instance integration tests | Verifies cross-instance state sharing and recovery | None (test only) |

---

## 5. Redis Architecture

1. **Room Serialization Key**: `drawrush:room:<ROOM_CODE>` (String, JSON payload, TTL: 24h).
2. **Active Rooms Index**: `drawrush:active_rooms` (Set of active uppercase room codes).
3. **Player Room Mapping**: `drawrush:player_room:<PLAYER_ID>` (String pointing to room code, TTL: 24h).
4. **Socket.IO Pub/Sub Channel**: `socket.io#/#<ROOM_NAME>#` via `@socket.io/redis-adapter` for transparent cross-container broadcasting.
5. **Distributed Rate Limiting**: `drawrush:ratelimit:<KEY>` with atomic `INCR` and `PEXPIRE`.

---

## 6. Socket.IO Architecture

- **Transports**: WebSocket and HTTP polling supported (`["websocket", "polling"]`).
- **Authentication**: Validated during handshake via Firebase token verification in connection middleware.
- **Cross-Instance Emission**: `io.to("room:XYZ").emit(...)` publishes to Redis, and all listening instances relay the payload to their locally connected sockets.
- **Heartbeat & Keepalive**: `pingInterval: 10000ms`, `pingTimeout: 20000ms`.

---

## 7. Room State Architecture

- `Room.toJSON()` encodes complete room state: settings, player list, scores, current round details, masked word pattern, secret word, drawing history events, chat history, and timestamps.
- `Room.fromJSON()` recreates an identical `Room` instance with regenerated `Map` and `Set` structures.
- Local cache on each instance avoids unnecessary Redis roundtrips for 60Hz drawing events while keeping mutations backed by Redis.

---

## 8. Timer Architecture

- Process-local timers (`setTimeout`) are retained only as **local low-latency trigger accelerators**.
- The **authoritative truth** is defined by durable timestamps:
  ```json
  {
    "phaseStartedAt": 1700000000000,
    "phaseEndsAt": 1700000060000,
    "phase": "DRAWING"
  }
  ```
- **Passive Expiration Evaluation**: Whenever an incoming event (guess, drawing, chat, reconnect) reaches any server instance, the instance compares `Date.now() >= room.phaseEndsAt`. If expired, it triggers the round transition.
- **Race Condition Prevention**: State transitions use atomic Redis check-and-set guards (`SET drawrush:trans:<ROOM_CODE>:<PHASE> NX EX 5`) to prevent duplicate round advancement.

---

## 9. Authentication

- **Production Policy**: `DEV_AUTH=false` strictly enforced in production (`NODE_ENV=production`). If `DEV_AUTH=true` is set in production, the backend fails closed and refuses to start.
- **Firebase Token Verification**: Incoming tokens verified via Firebase Admin SDK (`verifyIdToken`).
- **Credential Safety**: No tokens, private keys, or passwords are ever logged or tracked in Git.

---

## 10. Firebase

- Firebase remains the source of truth for:
  - User accounts and authentication.
  - Persistent user profiles and friend lists.
  - Firestore security rules and indexes.
- Redis handles high-frequency ephemeral game state, avoiding unnecessary Firestore write amplification and latency.

---

## 11. Security

- **Answer Leak Protection**: Secret words and custom word choices are never broadcast to guessers or logged in plaintext.
- **Drawing Authorization**: Only the active artist can emit drawing strokes; events from other players are dropped.
- **Coordinate Normalization**: Coordinates constrained to normalized `[0, 1]` ranges.
- **Payload Limits**: Fastify and Socket.IO payloads capped at `65536` bytes.

---

## 12. CORS

- Configured with strict intentional origin validation:
  - Native Android client (which sends no `Origin` header) is allowed.
  - Approved Firebase hosting domains (`drawrush-510809.web.app`, `drawrush-510809.firebaseapp.com`) are allowed.
  - Vercel preview/production domains (`*.vercel.app`) are allowed.
  - Localhost loopback allowed for local testing.
  - Arbitrary unapproved web domains are rejected.

---

## 13. Rate Limiting

- **Chat Rate Limit**: 10 messages per 5 seconds.
- **Drawing Rate Limit**: 60 strokes per 1 second.
- **Distributed Mode**: Uses `RedisRateLimiter` with atomic Redis counters, preventing users from bypassing limits across multiple backend instances.

---

## 14. Reconnect

- Disconnected players enter a 15-second grace window (`DISCONNECT_GRACE_MS`).
- When reconnecting to any instance:
  1. The client authenticates with Firebase token.
  2. The instance retrieves the room from Redis.
  3. The player's socket is re-bound, existing disconnect timers are cleared, and the full canvas history and game state are transmitted to the client.

---

## 15. Android Compatibility

- **Protocol Version**: `1.0.0` preserved.
- **Payload Compatibility**: 100% backward-compatible event schema (`C2S` and `S2C`).
- **Backend URL**: Configurable via Gradle property `-PRELEASE_BACKEND_URL` or environment variable `RELEASE_BACKEND_URL` in `android-app/app/build.gradle.kts`.

---

## 16. Tests

### Automated Test Results
- **Total Test Suites**: 13 passed (13/13)
- **Total Tests**: 114 passed (114/114)
- **TypeScript Typecheck**: 0 errors (`tsc --noEmit`)
- **Production Build**: 0 errors (`tsc`)

---

## 17. Deployment

- Follow instructions in `VERCEL_DEPLOYMENT_CHECKLIST.md`.
- Vercel deployment requires configuring `REDIS_URL`, `USE_REDIS=true`, `DEV_AUTH=false`, and Firebase Admin credentials in Vercel project settings.

---

## 18. Remaining Blockers

- **Live Deployment Credentials**: Vercel deployment requires user authentication (`vercel login` / project linking) and a provisioned cloud Redis instance (e.g. Upstash). The codebase is 100% prepared and passes all local verification.

---

## 19. Production Readiness Matrix

| Area | Status | Evidence |
|---|---|---|
| **TypeScript** | **PASS** | `tsc --noEmit` exited code 0 |
| **Build** | **PASS** | `tsc` compiles clean `dist/` bundle |
| **Tests** | **PASS** | 13/13 suites passed, 114/114 tests passed |
| **Redis** | **PASS** | Implemented `RedisRoomStore` and `RedisRateLimiter`; verified in unit and multi-instance tests |
| **Firebase** | **PASS** | Firebase Admin initialization, token verification, and fail-closed security verified |
| **Authentication** | **PASS** | Strict fail-closed `DEV_AUTH` production check and token verification verified |
| **Socket.IO** | **PASS** | Integrated `@socket.io/redis-adapter`; verified across two server instances |
| **Room persistence** | **PASS** | Full fidelity serialization tested in `distributedState.test.ts` |
| **Timers** | **PASS** | Authoritative timestamp evaluation and expiration verified |
| **Reconnect** | **PASS** | Reconnection and state hydration passed in `reconnect.test.ts` |
| **Rate limiting** | **PASS** | Distributed rate limiting verified |
| **Security** | **PASS** | Zero leaks, coordinate normalization, and payload constraints verified |
| **Android integration** | **PASS** | URL configurable via BuildConfig/Gradle properties; protocol intact |
| **Vercel deployment** | **READY / BLOCKED ON USER CREDS** | Serverless entrypoint and `vercel.json` created; ready for live deployment |

---

## FINAL STATUS: YELLOW — RELEASE CANDIDATE (READY FOR DEPLOYMENT)

The DrawRush backend is fully refactored, architecturally sound, and verified against all unit, integration, and distributed multi-instance test suites. Only external cloud service provisioning (connecting production Redis & executing `vercel deploy` with user credentials) remains.
