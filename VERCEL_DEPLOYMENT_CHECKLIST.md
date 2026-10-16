# DrawRush — Vercel Production Deployment Checklist

This document details the step-by-step checklist and operational requirements for deploying the production DrawRush backend to Vercel with shared, distributed state across serverless/Fluid Compute instances.

---

## 1. Required External Services

| Service | Purpose | Minimum Tier / Requirements |
|---|---|---|
| **Upstash Redis** (or AWS ElastiCache / Redis Cloud) | Authoritative room state, shared rate limits, player-to-room indexing, Socket.IO multi-instance pub/sub adapter | Redis 6.2+ / 7.0+ with standard TCP connection string (`rediss://...`) |
| **Firebase Project** | User authentication (ID token verification), Firestore user profiles & friends | Active Firebase project (`drawrush-510809`) with Authentication and Firestore enabled |

---

## 2. Required Environment Variables (Names Only)

The following variables must be configured in the **Vercel Project Settings > Environment Variables** (Production and Preview):

- `NODE_ENV`
- `DEV_AUTH`
- `USE_REDIS`
- `REDIS_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `MAX_CANVAS_HISTORY`
- `DISCONNECT_GRACE_MS`
- `ARTIST_DISCONNECT_GRACE_MS`
- `HOST_MIGRATE_GRACE_MS`
- `COUNTDOWN_MS`
- `WORD_SELECTION_TIMEOUT_MS`
- `ROUND_RESULT_MS`
- `CHAT_RATE_LIMIT_TOKENS`
- `CHAT_RATE_LIMIT_WINDOW_MS`
- `DRAW_RATE_LIMIT_TOKENS`
- `DRAW_RATE_LIMIT_WINDOW_MS`
- `MAX_PAYLOAD_BYTES`

> [!CRITICAL]
> In production:
> - `DEV_AUTH` must be set to `false`.
> - `USE_REDIS` must be set to `true`.
> - `NODE_ENV` must be set to `production`.

---

## 3. Secret Input Guidance (Zero Secret Exposure)

To protect your secrets from leaking in console outputs or version control:

1. **Firebase Private Key**:
   - In the Firebase Console, go to **Project Settings > Service accounts > Generate new private key**.
   - Copy the `private_key` field value (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`).
   - In the Vercel dashboard: Enter variable name `FIREBASE_PRIVATE_KEY` and paste the key. Alternatively, escape newlines with `\n` if uploading via CLI.
   - **Never print, commit, or echo this key.**

2. **Redis Connection URL**:
   - In the Upstash or Redis Cloud console, copy the connection URI (e.g. `rediss://default:xxxx@xxxx.upstash.io:6379`).
   - In the Vercel dashboard: Enter variable name `REDIS_URL` and paste the connection string.
   - **Never commit `REDIS_URL` with credentials to Git.**

---

## 4. Vercel Project & Runtime Configuration

1. **Framework Preset**: Other / None.
2. **Root Directory**: `backend` (or deploy `backend/` via CLI).
3. **Build Command**: `npm run build`
4. **Output Directory**: `dist`
5. **Install Command**: `npm install`
6. **Function Settings** (`vercel.json`):
   - `maxDuration`: `60` seconds (Vercel Fluid Compute / Pro plan).
   - Functions entrypoint: `api/index.ts` (routes all requests via `/(.*)`).
7. **Custom Domain**:
   - Set up your production domain (e.g., `api.drawrush.app`) under **Settings > Domains** and point DNS CNAME to `cname.vercel-dns.com`.

---

## 5. Post-Deployment Verification Commands & Procedure

Run these commands against the deployed URL (`https://<your-vercel-domain>`) to verify live health and protocol integrity:

### Step 1: Health Check Endpoint
```bash
curl -i https://<your-vercel-domain>/health
```
**Expected Response (HTTP 200)**:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "env": "production",
  "storage": "redis"
}
```

### Step 2: Protocol Version Check
```bash
curl -i https://<your-vercel-domain>/api/version
```
**Expected Response (HTTP 200)**:
```json
{
  "protocolVersion": "1.0.0",
  "minClientVersion": "1.0.0"
}
```

### Step 3: Categories Endpoint
```bash
curl -i https://<your-vercel-domain>/api/categories
```
**Expected Response (HTTP 200)**: List of active word categories with word counts.

### Step 4: Socket.IO Handshake Verification
```bash
curl -i "https://<your-vercel-domain>/socket.io/?EIO=4&transport=polling"
```
**Expected Response (HTTP 200)**: Engine.IO handshake payload starting with `0{"sid":"...","upgrades":["websocket"],"pingInterval":10000,"pingTimeout":20000}`.

### Step 5: Android Client Connection
1. Set the Android release backend URL:
   ```bash
   ./gradlew assembleRelease -PRELEASE_BACKEND_URL="https://<your-vercel-domain>"
   ```
2. Launch on test device, authenticate with Google Sign-In, and verify room creation, joining, drawing, and guessing.
