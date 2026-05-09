# 🐈 Luna

> _High-Fidelity Audio Telemetry. Listen to the music. Skip the noise._

**Luna** is a personal, minimalist music player for high-fidelity streaming. Named after my cat and inspired by [Monochrome](https://github.com/monochrome-music/monochrome), it’s built for the high-res purist who wants their music fast, clean, and without the clutter of traditional streaming apps.

The interface follows a **High-Contrast Technical** design system: zero border-radius, monochromatic aesthetics, and raw telemetry-style data readouts.

---

## 💡 How It Works

- **Hybrid Search.** Find tracks, albums, artists, or playlists across **Tidal** and **Qobuz** simultaneously.
- **Synchronized Lyrics.** Real-time, time-coded lyric synchronization with a technical CRT-style overlay.
- **Hardware-Inspired UI.** A custom "Now Playing" dashboard featuring real-time playback telemetry and a high-torque spinning disc animation (simulated at 500 RPM).
- **Offline First.** Full support for local track downloads, CSV playlist imports, and local metadata persistence.

---

## ✨ Key Features

- **⚡ Dual-Provider Streaming** — Native ISRC resolution between Tidal and Qobuz to ensure the highest possible bit-depth.
- **🛠 Technical Aesthetic** — High-contrast UI with sharp geometries, accent-colored brackets, and JetBrains Mono typography.
- **🎤 CRT Lyrics Modal** — A dedicated modal for synchronized lyrics with scanline overlays and real-time seek-syncing.
- **🔒 Zero-Cloud Architecture** — No accounts, no tracking, and no external servers. Your favorites, history, and downloads stay 100% local.
- **📊 High-Torque Animation** — A custom Reanimated-driven disc system that mimics the physics of a high-performance CD player.

---

## 🧱 Tech Stack

- **React Native (Expo 54)** – For high-performance cross-platform development.
- **Expo Audio (1.1.1)** – Utilizing the latest native audio API for seamless playback.
- **Reanimated 4** – For complex, 60fps UI-thread animations (Disc rotation, Telemetry).
- **AsyncStorage** – Heavy-duty local persistence for history, favorites, and metadata.
- **Expo FileSystem** – For managing the local audio download pipeline.
- **Lucide-React-Native** – Clean, technical iconography.

---

## 🚀 Getting Started

1. **Install Dependencies:**
   ```bash
   bun install
   ```
2. **Start the Engine:**
   ```bash
   bun start
   ```
3. **Build for Android (Preview):**
   ```bash
   eas build --platform android --profile preview
   ```

---

## 🗃 Architecture

Luna uses a sophisticated **Proxy Rotation** system to ensure 100% playback uptime. It automatically cycles through a list of healthy API instances (like `trypt-hifi-dl`) to resolve manifests and Akamaized audio streams, bypassing regional restrictions and rate-limiting.

---

_Named after a cat. Built for the listener._
