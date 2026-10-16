# DrawRush 🎨

**Original real-time multiplayer drawing-and-guessing game for Android**

> DrawRush is a completely original game — not derived from, not affiliated with, and not copying Skribbl.io or any other drawing game. All artwork, word lists, branding, sound effects, and game logic are original.

---

## Features

- 🎮 **Real-time multiplayer** — up to 20 players per room
- 🔐 **Firebase Anonymous Auth** — no account required
- 🎨 **High-performance drawing canvas** — smooth strokes with stylus/finger support
- 📡 **Server-authoritative game logic** — scores, timers, and word validation are all on the server
- 🔒 **Secret word protection** — guessers can never see the word through any client-side channel
- 💬 **Real-time chat** — with rate limiting and mute enforcement
- 💡 **Progressive hints** — masked word pattern with gradual letter reveals
- ⏱️ **Speed-based scoring** — faster correct guesses earn more points
- 🔄 **Automatic reconnection** — with exponential backoff and canvas reconstruction
- 👑 **Host migration** — if the host disconnects, another player becomes host
- 🚫 **Moderation** — kick, mute, ban players (by Firebase UID)
- 🔗 **Deep links** — `drawrush://room/ABC123` and `https://drawrush.app/room/ABC123`
- 🌙 **Dark mode** — automatic system theme support
- ♿ **Accessibility** — content descriptions on all interactive elements
- 📱 **Responsive** — phone portrait and landscape, tablet split-screen

## Originality / Legal Notice

DrawRush is an original creation:
- **Brand, logo, and name**: original, not derived from any other game
- **Color palette and UI**: custom-designed (primary `#6C5CE7` violet, secondary `#00B894` mint)
- **Word database**: hand-authored, original, family-safe word list in multiple categories
- **Game logic and scoring**: original formula implemented server-side
- **Sound effects**: synthesized programmatically, not sampled from any game
- **No source code** from Skribbl.io, Gartic Phone, or any other game has been copied

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Android App (Kotlin + Jetpack Compose + Hilt)        │
│  ┌────────────┐  ┌───────────┐  ┌─────────────────┐  │
│  │ ViewModels │  │ SocketMgr │  │  DrawingCanvas  │  │
│  └────────────┘  └─────┬─────┘  └─────────────────┘  │
│                        │ Socket.IO                     │
└────────────────────────┼──────────────────────────────┘
                         │
┌────────────────────────▼──────────────────────────────┐
│  Backend (Node.js + TypeScript + Fastify + Socket.IO)  │
│  ┌─────────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ GameEngine  │  │ RateLimiter│  │ Firebase Admin │  │
│  │ (authorita- │  │ (per-player│  │ (token verify) │  │
│  │  tive state │  │  buckets)  │  │                │  │
│  │  machine)   │  └────────────┘  └────────────────┘  │
│  └─────────────┘                                       │
│  Redis (room state snapshots, reconnection data)       │
└────────────────────────────────────────────────────────┘
```

### Server-authoritative guarantees
- All scoring calculated server-side using `max(50, round(1000 * remaining / total))`
- Artist rotation enforced server-side; clients cannot self-assign artist role
- Secret word sent **only** to the artist's specific socket — never broadcast
- Timer starts and expires on server; client only renders a countdown
- Rate limiting: 10 chat messages/5s, 60 drawing events/second per player
- Bans tracked by Firebase UID (not nickname)

---

## Repository Structure

```
DrawRush/
├── android-app/          # Android Studio project (Kotlin + Compose)
│   ├── app/src/main/
│   │   ├── java/com/drawrush/app/
│   │   │   ├── data/
│   │   │   │   ├── model/         # Serializable data classes
│   │   │   │   ├── network/       # SocketManager, SocketEvent
│   │   │   │   ├── preferences/   # DataStore preferences
│   │   │   │   └── repository/    # GameRepository (auth + socket)
│   │   │   ├── di/                # Hilt modules
│   │   │   ├── ui/
│   │   │   │   ├── components/    # DrawingCanvas, etc.
│   │   │   │   ├── screens/       # Home, Lobby, Game, Results…
│   │   │   │   └── theme/         # Colors, Typography, Theme
│   │   │   └── viewmodel/         # GameViewModel, HomeVM, LobbyVM
│   │   └── res/                   # Icons, strings, themes
│   └── gradle/                    # Gradle wrapper + version catalog
├── backend/               # Node.js TypeScript backend
│   ├── src/
│   │   ├── auth/          # Firebase Admin token verification
│   │   ├── config/        # Zod-validated environment config
│   │   ├── game/          # GameEngine — authoritative state machine
│   │   ├── middleware/    # Socket.IO event handlers (all validation)
│   │   ├── protocol/      # Event names, types, error codes
│   │   ├── rooms/         # Room model and in-memory store
│   │   ├── scoring/       # Pure scoring functions (unit tested)
│   │   ├── utils/         # Logger (with redaction), rate limiter, helpers
│   │   └── words/         # Original word database (200+ words)
│   └── tests/
│       ├── unit/          # scoring, helpers, wordDatabase
│       └── integration/   # gameEngine state machine tests
├── shared/protocol/       # Shared event names, types, error codes
├── docker-compose.yml     # Backend + Redis for local dev
├── .env.example           # Backend environment template
├── local.properties.example  # Android local config template
└── keystore.properties.example  # Android signing template
```

---

## Setup

### Prerequisites

| Tool | Required Version |
|------|-----------------|
| Android Studio | 2024.x+ (Ladybug or newer) |
| Android SDK | API 36 (compile), API 26+ (min) |
| JDK | 17 or 21 (Android Studio JBR recommended) |
| Node.js | 20+ |
| npm | 10+ |
| Redis | 7+ (optional for dev — state is in-memory by default) |
| Docker | 20+ (optional, for `docker-compose`) |

---

## Firebase Anonymous Authentication Setup

1. Go to [Firebase Console](https://console.firebase.google.com) → Create project
2. Authentication → Sign-in methods → Enable **Anonymous**
3. Project settings → Your apps → Add Android app
   - Package: `com.drawrush.app`
   - Download `google-services.json` → place in `android-app/app/`
4. Project settings → Service accounts → Generate new private key (for backend)
   - Copy `project_id`, `client_email`, `private_key` to `backend/.env`

> For local development without Firebase, set `DEV_AUTH=true` in `backend/.env` and `DEV_AUTH=true` in Android build config. The app will use `"dev:<uid>"` tokens.

---

## Backend Setup

```bash
cd backend

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set DEV_AUTH=true for local dev

# 3. Run development server (auto-reloads on changes)
npm run dev

# 4. Run tests
npm test

# 5. Type check
npm run typecheck

# 6. Build for production
npm run build
npm start
```

### Backend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP/Socket.IO port | `3001` |
| `NODE_ENV` | `development` / `production` / `test` | `development` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | — |
| `FIREBASE_CLIENT_EMAIL` | Service account email | — |
| `FIREBASE_PRIVATE_KEY` | Service account private key | — |
| `DEV_AUTH` | Skip Firebase verification (dev only!) | `false` |
| `DISCONNECT_GRACE_MS` | Grace period before removing disconnected player | `15000` |
| `ARTIST_DISCONNECT_GRACE_MS` | Grace before ending round on artist disconnect | `5000` |
| `HOST_MIGRATE_GRACE_MS` | Grace before migrating host | `8000` |
| `COUNTDOWN_MS` | Pre-game countdown duration | `3000` |
| `WORD_SELECTION_TIMEOUT_MS` | Time for artist to choose word | `15000` |
| `ROUND_RESULT_MS` | Time to show round results | `5000` |
| `CHAT_RATE_LIMIT_TOKENS` | Max chat messages per window | `10` |
| `CHAT_RATE_LIMIT_WINDOW_MS` | Chat rate limit window | `5000` |

---

## Redis Setup

```bash
# Using Docker (recommended for dev):
docker run -d --name drawrush-redis -p 6379:6379 redis:7-alpine

# Or with Docker Compose (starts both backend + Redis):
docker-compose up -d
```

Without Redis, the backend still works — room state is held in-memory. Redis is used for state persistence and multi-instance deployments.

---

## Android App Setup

```bash
cd android-app

# 1. Set SDK path (create if it doesn't exist)
echo "sdk.dir=C:/Users/<YOU>/AppData/Local/Android/Sdk" > local.properties
echo "BACKEND_URL=http://10.0.2.2:3001" >> local.properties
# Note: 10.0.2.2 is the emulator's localhost address

# 2. Place google-services.json (from Firebase Console) in:
#    android-app/app/google-services.json

# 3. Open in Android Studio and sync Gradle

# 4. Run on emulator or device
```

### Configure Backend URL

Edit `android-app/local.properties`:
```properties
sdk.dir=C:\Users\YOU\AppData\Local\Android\Sdk
BACKEND_URL=http://10.0.2.2:3001   # emulator localhost
# or for device on same network:
# BACKEND_URL=http://192.168.1.100:3001
```

---

## Android Build Commands

```bash
cd android-app

# Set JAVA_HOME to Android Studio's JBR (Java 21)
# Windows:
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"

# Debug APK
.\gradlew.bat assembleDebug

# Release APK (requires keystore.properties)
.\gradlew.bat assembleRelease

# Run unit tests
.\gradlew.bat test

# Run lint
.\gradlew.bat lint
```

### APK Output Paths

| Build Type | Path |
|-----------|------|
| Debug | `android-app/app/build/outputs/apk/debug/app-debug.apk` |
| Release | `android-app/app/build/outputs/apk/release/app-release.apk` |

---

## Release Signing

Create `android-app/keystore.properties` (not committed to source control):
```properties
KEYSTORE_FILE=../drawrush.jks
KEYSTORE_PASSWORD=your_keystore_password
KEY_ALIAS=drawrush
KEY_PASSWORD=your_key_password
```

Generate a keystore:
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore drawrush.jks \
  -alias drawrush -keyalg RSA -keysize 2048 -validity 10000
```

---

## Multiplayer Testing

### 2-device local test
1. Start backend: `cd backend && npm run dev`
2. Find your machine's LAN IP (e.g., `192.168.1.100`)
3. In `local.properties`: `BACKEND_URL=http://192.168.1.100:3001`
4. Build and install on both devices
5. Device A: enter nickname → Create Room
6. Device B: enter nickname → Join Room (type room code from Device A)

### Emulator test
1. Start backend on `localhost:3001`
2. `BACKEND_URL=http://10.0.2.2:3001` (default) — `10.0.2.2` maps to host's localhost
3. Run two emulators (or emulator + physical device on same network)

### Deep link testing
```bash
# Test via ADB
adb shell am start -W -a android.intent.action.VIEW \
  -d "drawrush://room/ABC123" com.drawrush.app.debug
```

---

## Automated Test Commands

```bash
# Backend unit + integration tests
cd backend
npm test

# Backend TypeScript type check
npm run typecheck

# Android JVM unit tests
cd android-app
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat test

# Android lint
.\gradlew.bat lint
```

---

## Backend API Reference

### Key Events (Client → Server)

| Event | Description |
|-------|-------------|
| `createRoom` | Create a new room (host) |
| `joinRoom` | Join by room code |
| `leaveRoom` | Explicitly leave |
| `setReady` | Toggle ready state |
| `startGame` | Host starts game (requires 2+ players) |
| `selectWord` | Artist selects their word |
| `strokeStart` | Drawing stroke started |
| `strokeBatch` | Batched stroke points |
| `strokeEnd` | Drawing stroke ended |
| `clearCanvas` | Artist clears canvas |
| `undoStroke` | Artist undoes last stroke |
| `submitGuess` | Player submits a guess |
| `chatMessage` | Non-guess chat message |
| `kickPlayer` | Host kicks a player |
| `mutePlayer` | Host mutes/unmutes player |
| `banPlayer` | Host bans player (by UID) |
| `requestState` | Request current game state (for reconnect) |

### Key Events (Server → Client)

| Event | Description |
|-------|-------------|
| `roomCreated` | Confirmation after room creation |
| `roomUpdated` | Full room state update |
| `playerJoined` | A player joined |
| `playerLeft` | A player left or disconnected |
| `countdownStarted` | Pre-game countdown |
| `wordChoices` | Word choices sent ONLY to artist |
| `drawingStarted` | Drawing phase started |
| `strokeStart/Batch/End` | Relayed drawing events |
| `canvasCleared` | Canvas was cleared |
| `guessResult` | Private: was your guess correct? |
| `playerGuessedCorrectly` | Public: player X guessed correctly (no word) |
| `hintUpdated` | New letter revealed in word pattern |
| `roundEnded` | Round result with answer |
| `scoreUpdated` | Score changes |
| `gameEnded` | Final rankings |
| `reconnectState` | Full state for reconnecting players |
| `hostChanged` | Host migrated |
| `error` | Structured error with error code |

### Error Codes

```
ROOM_NOT_FOUND, ROOM_FULL, GAME_ALREADY_STARTED,
NOT_AUTHORIZED, NOT_HOST, NOT_IN_ROOM, NOT_ENOUGH_PLAYERS,
INVALID_PHASE, NOT_YOUR_TURN, RATE_LIMITED, BANNED,
INVALID_PAYLOAD, NICKNAME_INVALID, NICKNAME_TAKEN,
CUSTOM_WORD_INVALID, MUTED
```

---

## Scoring Formula

```
// Guess points (server-side only)
guessPoints = max(50, round(1000 * remainingTimeMs / totalDrawingTimeMs))

// Artist reward
artistPoints = numberOfCorrectGuessers * 25
```

---

## Security Notes

1. **Firebase ID tokens** are verified server-side on every connection
2. **DEV_AUTH=true** must never be used in production — it bypasses all authentication
3. **Secret words** are never sent in broadcast events — only to the artist's specific socket
4. **Scores** are never trusted from the client — all score changes happen server-side
5. **Redis** credentials are server-only — never exposed to clients
6. **Rate limiting** is enforced per player per action type (token bucket)
7. **Bans** are by Firebase UID — renaming or reconnecting won't bypass a ban
8. **Drawing events** are validated: correct phase, correct artist, payload size, coordinate range
9. **Custom words** are validated server-side and never sent to non-artist players
10. **All API payloads** are validated with Zod schemas before processing

---

## Troubleshooting

### Android build fails with "useAndroidX not enabled"
→ Ensure `android-app/gradle.properties` exists with `android.useAndroidX=true`

### Cannot connect to backend from emulator
→ Use `BACKEND_URL=http://10.0.2.2:3001` (not `localhost`) in `local.properties`

### Firebase token verification fails
→ For local dev, set `DEV_AUTH=true` in `backend/.env`

### Gradle wrapper not found
→ Run from `android-app/` directory; `gradlew.bat` must exist there

### KSP/Hilt compilation error
→ Ensure `ksp` and `hilt` plugin versions match in `libs.versions.toml`

---

## Known Limitations

- Redis is currently used for configuration but room state is kept in-memory; restart = lost rooms
- No persistent leaderboard or cross-session statistics
- Sound effects are not yet implemented (toggle is present in settings)
- Landscape mode is enabled but not optimized for tablet split-screen yet
- No admin dashboard or content moderation beyond in-room host controls
- The custom word unsafe-word filter is not implemented (documented as a future enhancement)

---

## Deployment

### Production checklist
- [ ] `DEV_AUTH=false` in production `.env`
- [ ] Firebase credentials set (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
- [ ] Redis URL configured
- [ ] HTTPS/WSS enabled (reverse proxy such as Nginx or Caddy)
- [ ] Release APK signed with production keystore
- [ ] `google-services.json` with production Firebase project
- [ ] Android `BACKEND_URL` points to production server
