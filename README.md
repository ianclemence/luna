# 🐱 Luna

> _Just music. No noise._

![Luna Screenshot](https://pub-375b04a9e98a45daa5f3d75ac8582453.r2.dev/luna/luna-mockup.png)

**Luna** is a React Native music player built for people who just want to listen to their music. It's clean, lightweight, and stays out of your way. With a single-screen UI and a sharp dark-mode aesthetic, it delivers a focused, gapless listening experience powered by multiple high-fidelity streaming backends.

---

## What We Do

Luna aggregates and streams music seamlessly from multiple providers (Tidal, Qobuz, Amazon Music) into a single, unified player. It automatically handles stream resolution, offline downloads, and gapless playback. If a track is unavailable on one platform, Luna intelligently auto-migrates to another.

---

## Features

- **Unified Streaming** — Connects to Tidal (via community HiFi proxies), Qobuz, and Amazon Music.
- **Gapless Playback & ReplayGain** — Smooth transitions and volume normalization for uninterrupted listening.
- **Synced Lyrics** — Real-time lyrics fetched from LRCLib and fallback sources.
- **Privacy First** — No accounts, no tracking, and no data collection. Everything stays on your device.
- **Offline Mode** — Download your favorite tracks directly to your device and play them anywhere.
- **Multi-Scrobbling** — Fans out to Last.fm, Libre.fm, ListenBrainz, and Maloja simultaneously.
- **Tactical Design** — A dark-mode exclusive, sharp, and simple look with no clutter and smooth motion.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (Preferred) or [Node.js](https://nodejs.org/) (Version 20+ or 22+ recommended)
- [Expo CLI](https://docs.expo.dev/)
- [Expo Go Mobile App](https://docs.expo.dev/get-started/set-up-your-environment/) _(for local development)_
- [Android Studio](https://developer.android.com/studio) _(for Android emulator)_
- [Xcode](https://developer.apple.com/xcode/) _(for iOS simulator, macOS only)_

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

4. **Run directly on a connected Android device:**

    ```bash
    bunx expo run:android --variant release
    ```

---

## Build & Deployment

### Local builds (EAS)

Build for production using **Expo Application Services (EAS)**:

1. **Configure EAS Builds:**

    ```bash
    bunx eas build:configure

    # Android
    bunx eas build --platform android

    # iOS
    bunx eas build --platform ios
    ```

2. **Build for Preview:**

    ```bash
    # Android
    eas build --platform android --profile preview

    # iOS
    eas build --platform ios --profile preview
    ```

3. **Build for Production:**

    ```bash
    # Android
    eas build --platform android --profile production

    # iOS
    eas build --platform ios --profile production
    ```

4. **OTA Updates:**

    ```bash
    # Push OTA update to staging channel
    eas update --channel staging --message "Testing new feature"

    # Or target a specific branch
    eas update --branch preview --message "Fix the playlist import bug"

    # Channel can be: development, preview, or production
    # depending on the build type of the app
    eas update --channel production --message "Bug fix release"
    ```

---

### GitHub Actions CI/CD

Luna uses `eas build --local` on GitHub-hosted runners — this does **not** consume EAS cloud build quota.

| Workflow | Trigger | Output |
|---|---|---|
| `android-ci.yml` | Push / PR to `master` | APK artifact (14-day retention) |
| `android-nightly.yml` | Daily at 02:00 UTC (skips if no new commits) | APK artifact (14-day retention) |
| `android-release.yml` | Push tag `v*.*.*` | APK published to **GitHub Releases tab** |

#### Required GitHub secret

Set this secret in your repository under **Settings → Secrets and variables → Actions**:

| Secret | Required | Description |
|---|---|---|
| `EXPO_TOKEN` | ✅ Yes | Authenticates EAS CLI for signing credential download |

Generate a token at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens).

#### Shipping a release

```bash
git tag v1.0.0
git push origin v1.0.0
# → android-release.yml builds the APK on the GitHub runner
# → APK appears on the Releases tab with auto-generated changelog
```

Beta / pre-release tags (`-beta`, `-alpha`, `-rc`) are automatically marked as pre-release on GitHub:

```bash
git tag v1.0.0-beta
git push origin v1.0.0-beta
```

