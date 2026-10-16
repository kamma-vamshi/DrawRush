# Google Play Store Listing & Metadata Package

**App Title:** DrawRush  
**Package Name:** `com.drawrush.app`  
**Category:** Games &bull; Word / Trivia / Casual  
**Content Rating:** Everyone 10+ (Fantasy Violence: None; Interaction: Users Interact / In-Game Chat)  
**Target SDK:** 35 (Android 15)  
**Privacy Policy URL:** `https://drawrush-510809.web.app/privacy.html`  
**Support Email:** `support@drawrush.app`

---

## 1. Store Copy

### App Title (30 characters max)
```text
DrawRush: Draw & Guess Game
```

### Short Description (80 characters max)
```text
Fast-paced real-time multiplayer drawing and guessing game. Sketch, guess & win!
```

### Full Description (4000 characters max)
```text
Welcome to DrawRush — the ultimate fast-paced, real-time multiplayer drawing and guessing party game!

Unleash your creativity, race against the countdown clock, and challenge your friends or players worldwide in lively drawing battles. Whether you are a master artist or can only doodle stick figures, DrawRush guarantees non-stop laughs and competitive fun.

🌟 KEY FEATURES:

🎨 REAL-TIME MULTIPLAYER ACTION
Experience ultra-smooth, low-latency stroke synchronization. Every brush stroke, color shift, and canvas action appears instantly on every player's screen in real time.

⏱️ INTENSE ROUND-BASED GAMEPLAY
Take turns being the Artist while other players race to decipher the secret word. Guess quickly to earn maximum points before the timer runs out!

🔒 SECURE & SEAMLESS GOOGLE SIGN-IN
Sign in effortlessly with one tap using modern Google Credential Manager. Keep your stats, custom player tag, and profile synced securely across devices.

👥 FRIENDS & SOCIAL MATCHMAKING
Add friends using unique player tags, send and accept game invitations, and jump straight into private rooms together with single-tap deep links.

✏️ CUSTOM WORD PACKS
Hosts can craft custom word lists for customized party games, family trivia nights, or themed competitions. Non-host players cannot peek at the word list beforehand!

🔄 SEAMLESS RECONNECTION
Brief network interruption? No worries! DrawRush automatically restores your room session, canvas history, and score with zero game disruption.

🛡️ SAFE, PRIVATE & MODERATED
• Server-authoritative anti-cheat logic prevents unauthorized actions.
• Answer protection safeguards secret words from being leaked to non-artists.
• End-to-end TLS encryption keeps all communications private.

Download DrawRush today, grab your digital paintbrush, and see who among your crew is the ultimate sketch master!
```

---

## 2. Store Graphics & Media Requirements

| Asset | Specifications | Status |
|---|---|---|
| **App Icon** | 512 × 512 px, 32-bit PNG, max 1024 KB | Generated from mipmap launcher icons |
| **Feature Graphic** | 1024 × 500 px, JPG or 24-bit PNG | Specification provided in store checklist |
| **Phone Screenshots** | Min 2 screenshots, 16:9 or 9:16 aspect ratio (e.g., 1080 × 1920 or 1080 × 2400) | Screens: Lobby, Drawing Canvas, Guessing / Chat, Results Leaderboard |

---

## 3. Google Play Console Setup Steps

1. **Create App:** Select **DrawRush**, choose **Game**, and select **Free**.
2. **App Content Questionnaire:**
   - **Privacy Policy:** Paste `https://drawrush-510809.web.app/privacy.html`
   - **App Access:** Select "All functionality is available without special access restrictions" (or describe Google Sign-In / Guest option).
   - **Ads:** Select "No, my app does not contain ads".
   - **Content Rating:** Start questionnaire, select **Game**, indicate user interaction / chat enabled, submit for rating certificate.
   - **Target Audience:** Select 13+ (or 10+ depending on target).
   - **Data Safety:** Complete using [PLAY_CONSOLE_DATA_SAFETY.md](file:///d:/DrawRush/PLAY_CONSOLE_DATA_SAFETY.md).
   - **Financial Features:** Select "My app doesn't provide any financial features".
   - **Government Apps:** Select "No".
3. **Internal Testing Track:**
   - Navigate to **Testing → Internal testing**.
   - Create a new release.
   - Upload `DrawRush-release.aab`.
   - Add release notes: `Initial Production Release Candidate 1.0.0 — Real-time multiplayer drawing, Google Credential Manager authentication, Firestore friend system, and reconnect engine.`
   - Save and review release.
