# DrawRush Privacy Policy

**Effective Date:** October 16, 2026  
**Application:** DrawRush (com.drawrush.app)  
**Public Policy URL:** https://drawrush-510809.web.app/privacy.html  
**Contact:** support@drawrush.app

---

## 1. Overview
This Privacy Policy outlines how DrawRush ("we", "us", or "our") handles player information when you use our Android mobile application. DrawRush is a real-time multiplayer drawing and guessing game.

---

## 2. Information Collected & Processing Purposes

| Data Type | Specific Data Points | Purpose | Storage & Retention |
|---|---|---|---|
| **Account Credentials** | Google Account ID (UID), Email, Display Name, Avatar | User authentication via Google Credential Manager, player profile, and friends network | Stored securely in Cloud Firestore (Firebase). Retained while account is active. |
| **Player Profile** | Nickname, selected avatar emoji, unique player tag (e.g., #1234) | Displaying player identity in game lobbies, scoreboards, and friend lists | Stored in Cloud Firestore and local device preferences. |
| **Gameplay Actions** | Drawing coordinates (strokes, color, width), submitted guesses, points | Real-time synchronization of game canvas and turn-based scoring during multiplayer matches | In-memory on game servers during match. Discarded upon game end; NOT archived. |
| **Chat Messages** | Text chat sent in room sessions | In-game communication and guess evaluation | Processed in server RAM. Discarded when game room closes. |
| **Friendships** | Friend IDs, friend request status | Allowing players to add friends and join games together | Stored in Cloud Firestore. |
| **Technical Data** | Socket connection ID, network state | Handling reconnection grace periods (15 seconds) when network drops | Server RAM during active session only. |

---

## 3. Data We Do NOT Collect
- **No Location Data:** No fine, coarse, or background location access.
- **No Financial / Payment Data:** No credit card, payment details, or purchases processed.
- **No Contacts / Phone / SMS:** No address book or device phone state access.
- **No Third-Party Advertising Trackers:** Zero ad networks or tracking brokers.

---

## 4. Third-Party Infrastructure
- **Google Sign-In / Credential Manager:** Secure authentication token exchange.
- **Google Firebase Authentication:** Cryptographic ID token verification.
- **Google Cloud Firestore:** Database with server-mediated access rules (client direct write access is disabled).

---

## 5. Security & Encryption
- All network communications are encrypted via HTTPS / WSS (TLS).
- Cleartext network traffic is disabled (`usesCleartextTraffic="false"`).
- Database rules block all unauthorized client-side read/write operations.

---

## 6. Account Deletion & Data Rights
Players may request permanent deletion of their account, profile data, and friendship records at any time by emailing **support@drawrush.app** with their registered Google account email. All records are purged within 30 days.
