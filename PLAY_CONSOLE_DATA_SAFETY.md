# Google Play Console — Data Safety Form Declaration Guide

**Application:** DrawRush  
**Package:** `com.drawrush.app`  
**Version:** 1.0.0 (versionCode: 1)  
**Target SDK:** 35 (Android 15)  
**Verification Date:** October 16, 2026

Use this reference when completing the Google Play Console **App Content → Data safety** questionnaire.

---

## 1. Overview Questions

| Question | Answer | Rationale |
|---|---|---|
| **Does your app collect or share any of the required user data types?** | **Yes** | App collects user credentials (Google UID, email, nickname) for authentication and multiplayer profiles. |
| **Is all of the user data collected by your app encrypted in transit?** | **Yes** | All network traffic uses TLS (HTTPS / WSS). `usesCleartextTraffic="false"` is enforced in AndroidManifest.xml. |
| **Do you provide a way for users to request that their data be deleted?** | **Yes** | Users can request permanent deletion by emailing `support@drawrush.app`. |
| **Do you provide a link for users to request data deletion?** | **Yes** | Policy URL: `https://drawrush-510809.web.app/privacy.html#deletion` |

---

## 2. Data Types Breakdown

### A. Personal Info

#### 1. Name (Display Name / Nickname)
- **Collected:** Yes
- **Shared:** No (Transmitted to players inside private game rooms; not shared with external third parties)
- **Required or Optional:** Required (Player chooses nickname or imports from Google account)
- **Purposes:**
  - App functionality (Displaying player name in lobby and game scoreboard)
  - Account management
- **Encrypted in transit:** Yes
- **Deletion requestable:** Yes

#### 2. Email Address
- **Collected:** Yes
- **Shared:** No
- **Required or Optional:** Required for Google Sign-In; optional for guest players
- **Purposes:**
  - Account management
  - User authentication (Firebase Authentication verification)
- **Encrypted in transit:** Yes
- **Deletion requestable:** Yes

#### 3. User IDs (Firebase UID / Google Subject ID)
- **Collected:** Yes
- **Shared:** No
- **Required or Optional:** Required
- **Purposes:**
  - App functionality
  - Account management (Associating friend list, unique player tag, game statistics)
- **Encrypted in transit:** Yes
- **Deletion requestable:** Yes

---

### B. Messages

#### In-game Chat Messages
- **Collected:** Yes (Processed ephemerally in RAM)
- **Shared:** No (Visible only to participants inside the specific game room)
- **Required or Optional:** Optional (Used during guessing/chatting)
- **Purposes:**
  - App functionality (Evaluating word guesses and in-game communication)
- **Stored persistently:** **No** (Processed in server memory; discarded immediately upon room closure)
- **Encrypted in transit:** Yes

---

### C. Photos and Videos (Avatar Icons)

#### Profile Photo / Selected Avatar Icon
- **Collected:** Yes
- **Shared:** No
- **Required or Optional:** Optional (Default animal emoji avatar assigned)
- **Purposes:**
  - App functionality (Displaying avatar in lobby and match)
- **Encrypted in transit:** Yes
- **Deletion requestable:** Yes

---

### D. App Activity & Performance

#### Gameplay Actions (Drawing strokes, guesses, points)
- **Collected:** Yes (In-memory game state)
- **Shared:** No
- **Purposes:**
  - App functionality (Synchronizing drawing canvas in real-time)
- **Stored persistently:** **No** (Memory buffer purged when round/game concludes)
- **Encrypted in transit:** Yes

---

## 3. Categories Explicitly NOT Collected

The following items must be marked **NO** on the Google Play Console form:
- Location (Approximate or Precise location)
- Financial info (Credit card, bank account, purchase history)
- Health and fitness info
- Contacts (Phone contacts or address book)
- Audio recordings (Voice or audio files)
- Files and docs
- Calendar events
- Web browsing history
- Device or other IDs (Advertising ID is NOT requested or tracked)
- Analytics SDKs / Third-party trackers (None integrated)
