# 🌙 Luna

> _Listen to the moon. Skip the noise._

**Luna** is a personal, minimalist music player for high-fidelity streaming. Inspired by [Monochrome](https://github.com/monochrome-music/monochrome) and named after my cat, it’s built for the high-res purist who wants their music fast, clean, and without the clutter of traditional streaming apps.

Built for the moment: late-night listening sessions, focused work, or just rediscovering your library. One app, two high-res providers, zero friction.

---

## 💡 How It Works

- **Search Anything.** Find tracks, albums, artists, or playlists across Tidal and Qobuz instantly.
- **Pure Playback.** Stream in high fidelity with a focus on the music. No ads, no social feeds, no distractions.
- **Dynamic Discovery.** Get recommendations based on your listening habits. Jump back into what you love or find something new.
- **Offline First.** Favorites and history are cached locally. Your music stays with you, even when the internet doesn't.

Everything lives on your phone. No accounts required for the core experience—just high-res audio and a beautiful interface.

---

## 🎨 Core Flow

### 🔍 Search

Find your vibe in seconds. Integrated search across multiple providers with instant results. No waiting, no loading screens—just the music you're looking for.

### 🎧 Listen

The player is the heart of Luna. Minimalist controls, sharp editorial design, and haptic feedback make every interaction feel intentional. High-res cover art and marquee text keep the focus where it belongs.

### 📚 Organize

Your library, your way. Save tracks, albums, and playlists to your favorites. Track your listening history and create custom playlists without ever needing a cloud account.

---

## ✨ Key Features

- **⚡ High-Res Streaming** — Native support for Tidal and Qobuz streaming.
- **🎨 Editorial Aesthetic** — A "retro-elegant" UI with sharp edges, bold typography, and a warm cream palette.
- **🔒 Privacy-First** — No tracking, no accounts, no data harvesting. Your library stays local.
- **📊 Smart Caching** — Intelligent API and data caching for a snappy, responsive experience.
- **🏁 Hard Minimalism** — Zero clutter. No "wrapped" features, no social graphs, no algorithm bloat.

---

## 🤝 Social by Design (or Lack Thereof)

Luna is built for **the listener**, not the network.

- Zero social features by design.
- No "invite your friends" or "see what others are listening to".
- No metrics on your listening habits shared with anyone but you.

The focus is entirely on the relationship between you and your music.

---

## 🧠 Why Luna?

Most music apps optimize for **engagement**.
Luna optimizes for **immersion**.

It delivers:

- Speed over precision (fast search, instant playback).
- Personal workflow (no login, no setup, just play).
- Aesthetic closure (a beautiful, finished interface that doesn't demand more of your time).

You don't need a "music social network"—you need a player that gets out of your way.

---

## 🧱 Tech Stack

- **React Native (Expo)** – for cross-platform mobile development
- **TypeScript** – for reliability and clean code
- **Expo Audio** – performant, native audio playback
- **Axios** – for efficient API communication with Tidal/Qobuz instances
- **AsyncStorage** – persistent on-device storage for favorites and history
- **Reanimated & Haptics** – for smooth animations and tactile feedback
- **Lucide** – for minimalist, consistent iconography

---

## 🧰 Requirements

- **Bun 1.0+**
- **Node.js 18+**
- **Expo CLI**
- **Android Studio** _(for Android emulator)_
- **Xcode** _(for iOS simulator, macOS only)_

---

## 🚀 Installation

Clone the repository:

```bash
git clone https://github.com/ianclemence/luna.git
```

Navigate to the project directory:

```bash
cd luna
```

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun start
```

---

## ⚙️ Environment Setup

Luna uses public/shared API instances, but you can configure your own if needed. Create a `.env` file in the project root:

```bash
# Optional: custom API instances
EXPO_PUBLIC_TIDAL_API_URL=https://your-instance.com
```

Notes:

- All environment keys must start with `EXPO_PUBLIC_` to be available in the app.
- Configuration is wired via `app.config.js` and read in code with `expo-constants`.

---

## 🗃 State & Persistence

- **Storage:** `@react-native-async-storage/async-storage` (local-only, no cloud sync).
- **State:** React Context and custom hooks for player, favorites, and history.

---

## 🧪 Testing

Run linting and type checks:

```bash
bun lint
bun tsc
```

---

## 📦 Build & Deployment

Build for production using **Expo Application Services (EAS)**:

```bash
# Configure EAS Builds
bunx eas build:configure

# Build for Android/iOS
bunx eas build --platform android
bunx eas build --platform ios
```

---

## 🗂 Project Structure

```
luna/
├── app/                    # Expo Router screens & layouts
│   ├── (tabs)/             # Main tab navigation
│   └── player/             # Fullscreen player experience
├── components/             # Reusable UI components (Haptics, Marquee, etc.)
├── services/               # Core logic (Audio, API, Music, Storage)
├── hooks/                  # Custom React hooks (Player, Favorites, Theme)
├── constants/              # App constants (API URLs, Theme/Palette)
├── assets/                 # Icons, fonts, and images
└── app.config.js           # Expo configuration
```

---

_Listen to the moon. Skip the noise._
