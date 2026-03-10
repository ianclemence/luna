# Luna Comparison Audit: Web vs. Mobile

## **Luna Overview**
Luna (originally Monochrome) is an open-source, privacy-respecting music streaming application designed to provide a minimalist, focus-oriented interface for high-quality audio. Its core purpose is to offer a clean alternative to cluttered mainstream streaming platforms while supporting high-fidelity (Hi-Res/Lossless) audio from providers like TIDAL and Qobuz.

---

## **Audit Findings: Feature Gaps**

### **High Priority (Core Experience & Stability)**
- **Account System & Syncing**: 
    - **Web**: Uses PocketBase for user accounts, cross-device sync of favorites, and profile management.
    - **Mobile**: Currently relies on local `AsyncStorage` via `storage-service.ts`. There is no integration with the web app's backend, meaning users cannot sync their library between devices.
    - **Why it matters**: A personal music app loses value if favorites and history aren't consistent across platforms.
- **Artist Detail Page**: 
    - **Web**: Full artist pages with biographies, similar artists, and categorized discography.
    - **Mobile**: The file `app/artist/[id].tsx` is missing. Although `search.tsx` attempts to route to it, the screen does not exist.
    - **Why it matters**: Discovery is broken if users can't explore an artist's full catalog after finding them in search.
- **Offline / Downloads**: 
    - **Web**: Supports track downloads with automatic metadata embedding via `downloads.js`.
    - **Mobile**: No download or offline mode implementation found.
    - **Why it matters**: Mobile users expect to save music for offline listening (commutes, flights, low data).

### **Medium Priority (Functional Parity)**
- **Recently Played Tracking**: 
    - **Web**: Full history tracking with dedicated pages and home screen integration.
    - **Mobile**: Only a placeholder exists in `app/(tabs)/library.tsx`.
    - **Why it matters**: Essential for quickly returning to recently discovered music.
- **Lyrics Support**: 
    - **Web**: Integrated Genius lyrics with a beautiful karaoke mode in `lyrics.js`.
    - **Mobile**: No lyrics button or display in `app/player/index.tsx`.
    - **Why it matters**: Lyrics are a major feature of the "minimalist focus" experience for many users.
- **Scrobbling Integrations**: 
    - **Web**: Supports Last.fm, ListenBrainz, and Maloja scrobbling.
    - **Mobile**: No scrobbling logic implemented in `audio-player.ts` or separate services.
    - **Why it matters**: Power users rely on scrobbling for their music statistics.
- **Local Music Support**: 
    - **Web**: Can play local files directly.
    - **Mobile**: Service architecture is currently strictly API-driven (Tidal/Qobuz).
    - **Why it matters**: Minimalist apps often appeal to users with curated local collections.

### **Low Priority (Identity & Power User Features)**
- **Audio Visualizers**: 
    - **Web**: Multiple unique visualizers (Butterchurn, Particles, etc.) in `js/visualizers/`.
    - **Mobile**: Completely absent.
    - **Why it matters**: These visualizers are a signature aesthetic of the web app.
- **Theme Store**: 
    - **Web**: Community-driven theme store with deep customization.
    - **Mobile**: Limited to basic Light/Dark system themes in `constants/theme.ts`.
    - **Why it matters**: Customization is a key part of the "Personal" app philosophy.
- **Unreleased Music (ArtistGrid)**: 
    - **Web**: Integration for tracker/unreleased music.
    - **Mobile**: No mention of ArtistGrid in `music-service.ts`.
    - **Why it matters**: A niche but important feature for some users.

---

## **Design & UX Observations**

### **Missing Patterns**
- **The "Dashed" Aesthetic**: The web version uses a very specific dashed border style for UI elements (e.g., `border-style: dashed`). While mobile uses this in some places (like `PlayerBar`), it's less consistently applied across list items and cards.
- **Micro-interactions**: The web app uses custom hover states and transitions (e.g., in `ui-interactions.js`) that haven't been translated to mobile touch interactions (long-press, swipe actions).
- **Navigation Flow**: Web uses a sidebar for flat navigation. Mobile uses tabs, but the nested navigation (e.g., `library/tracks.tsx` vs `(tabs)/library.tsx`) feels slightly fragmented compared to the web's unified sidebar approach.

---

## **Priority Ranking Summary**

| Feature | Priority | Missing In Mobile |
| :--- | :--- | :--- |
| **Cross-Device Sync (PocketBase)** | High | Yes |
| **Artist Detail Pages** | High | Yes |
| **Offline / Downloads** | High | Yes |
| **Recently Played** | Medium | Yes |
| **Lyrics / Karaoke Mode** | Medium | Yes |
| **Scrobbling (Last.fm, etc.)** | Medium | Yes |
| **Audio Visualizers** | Low | Yes |
| **Theme Store** | Low | Yes |
| **ArtistGrid Integration** | Low | Yes |
