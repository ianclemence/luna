export const TIDAL_UPTIME_URLS = [
  'https://tidal-uptime.geeked.wtf',
  'https://tidal-uptime.jiffy-puffs-1j.workers.dev/',
  'https://tidal-uptime.props-76styles.workers.dev/',
];

export const DEFAULT_TIDAL_INSTANCES = {
  api: [
    { url: 'https://hifi.geeked.wtf', version: '2.7' },
    { url: 'https://eu-central.monochrome.tf', version: '2.7' },
    { url: 'https://us-west.monochrome.tf', version: '2.7' },
    { url: 'https://api.monochrome.tf', version: '2.5' },
    { url: 'https://monochrome-api.samidy.com', version: '2.3' },
    { url: 'https://maus.qqdl.site', version: '2.6' },
    { url: 'https://vogel.qqdl.site', version: '2.6' },
    { url: 'https://katze.qqdl.site', version: '2.6' },
    { url: 'https://hund.qqdl.site', version: '2.6' },
    { url: 'https://tidal.kinoplus.online', version: '2.2' },
    { url: 'https://wolf.qqdl.site', version: '2.2' },
  ],
  streaming: [
    { url: 'https://hifi.geeked.wtf', version: '2.7' },
    { url: 'https://maus.qqdl.site', version: '2.6' },
    { url: 'https://vogel.qqdl.site', version: '2.6' },
    { url: 'https://katze.qqdl.site', version: '2.6' },
    { url: 'https://hund.qqdl.site', version: '2.6' },
    { url: 'https://wolf.qqdl.site', version: '2.6' },
  ],
};

// ─── Deezer ─────────────────────────────────────────────────────────────────
// Free public API — no auth required. Used for metadata, search, ISRC lookup.
export const DEEZER_API_BASE = 'https://api.deezer.com/2.0';

// ─── SongLink / odesli ──────────────────────────────────────────────────────
// Cross-platform ID resolution: Deezer ↔ Tidal ↔ Spotify etc.
export const SONGLINK_API_BASE = 'https://api.song.link/v1-alpha.1';

// Custom Spotify → all-platforms resolve proxy (faster than SongLink for Spotify URLs).
export const SONGLINK_RESOLVE_PROXY = 'https://api.zarz.moe/v1/resolve';

// ─── IDHS ───────────────────────────────────────────────────────────────────
// "I Don't Have Spotify" — SongLink fallback resolver. Community-run, 8 req/min.
export const IDHS_API_BASE = 'https://idonthavespotify.sjdonado.com/api';

// ─── MusicBrainz ────────────────────────────────────────────────────────────
// Open music metadata DB. Used for genre enrichment and artist social links.
export const MUSICBRAINZ_API_BASE = 'https://musicbrainz.org/ws/2';
export const MUSICBRAINZ_USER_AGENT = 'Luna/1.0.0 ( https://github.com/luna-music/luna )';

// ─── Lyrics ─────────────────────────────────────────────────────────────────
// LRCLib — open synced lyrics database. No auth required.
export const LRCLIB_BASE = 'https://lrclib.net/api';

// Paxsenix — community proxy for Apple Music, Spotify, Netease, YouTube,
// Kugou, Deezer, and Genius lyrics. All endpoints are GET with query params.
export const PAXSENIX_LYRICS_BASE = 'https://lyrics.paxsenix.org';

// ─── Storage Keys ───────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  API_INSTANCES: 'luna-api-instances-v1',
  RECENT_ACTIVITY: 'luna-recent-activity-v1',
  QUEUE: 'luna-queue-v1',
  SETTINGS: 'luna-settings-v1',
  LYRICS_CACHE: 'luna-lyrics-cache-v1',
};
