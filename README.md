# 🐈‍⬛ Luna

> _Just music. No noise._

**Luna** is a simple, fast music player built for people who just want to listen to their music. It's clean, lightweight, and stays out of your way. I built this for my cat, Luna, who loves to listen to music with me.

---

## 💡 How It Works

- **Easy Search.** Find any song, album, or playlist instantly.
- **Synced Lyrics.** Read lyrics in real-time as the song plays.
- **Disc Animation.** A custom spinning disc that moves like a real CD player.
- **Offline Mode.** Download your favorite tracks and play them anywhere, even without internet.

---

## ✨ Key Features

- **⚡ Fast Streaming** — Get your music quickly with no loading screens.
- **🛠 Clean Design** — A sharp, simple look with no clutter and easy-to-read text.
- **🎤 Lyrics View** — A dedicated screen to follow along with the song.
- **🔒 Private** — No accounts, no tracking, and no data collection. Everything stays on your phone.
- **📊 Smooth Motion** — High-speed animations that make the player feel alive.

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (Preferred) or [Node.js](https://nodejs.org/) (Version 20+ or 22+ recommended)
- [Expo CLI](https://docs.expo.dev/)
- [Expo Go Mobile App](https://docs.expo.dev/get-started/set-up-your-environment/) (for local development)

### Local Development

1. **Clone the repository:**

    ```bash
    git clone https://github.com/ianclemence/luna.git
    cd luna
    ```

2. **Install dependencies:**

    ```bash
    bun install
    # or
    npm install
    ```

3. **Start the expo development server:**

    ```bash
    bunx expo start
    # or
    npx expo start
    ```

---

## 📦 Build & Deployment

Build for production using **Expo Application Services (EAS)**:

```bash
# Configure EAS Builds
bunx eas build:configure
bunx eas build --platform android
bunx eas build --platform ios

# Build for Preview (Android)
eas build --platform android --profile preview

# Build for Preview (iOS)
eas build --platform ios --profile preview

# Build for Production (Android)
eas build --platform android --profile production

# Build for Production (iOS)
eas build --platform ios --profile production

# OTA Updates for Preview builds (Android)
eas build --platform android --profile preview --non-interactive

# OTA Updates for Preview builds (iOS)
eas build --platform ios --profile preview --non-interactive

# OTA Updates for Production builds (Android)
eas build --platform android --profile production --non-interactive

# OTA Updates for Production builds (iOS)
eas build --platform ios --profile production --non-interactive

```


