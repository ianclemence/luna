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

// ─── MusicBrainz ────────────────────────────────────────────────────────────
// Open music metadata DB. Used for genre enrichment and artist social links.
export const MUSICBRAINZ_API_BASE = 'https://musicbrainz.org/ws/2';
export const MUSICBRAINZ_USER_AGENT = 'Luna/1.0.0 ( https://github.com/luna-music/luna )';

// ─── Lyrics ─────────────────────────────────────────────────────────────────
// LRCLib — open synced lyrics database. No auth required.
export const LRCLIB_BASE = 'https://lrclib.net/api';

// ─── Storage Keys ───────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  API_INSTANCES: 'luna-api-instances-v1',
  RECENT_ACTIVITY: 'luna-recent-activity-v1',
  QUEUE: 'luna-queue-v1',
  SETTINGS: 'luna-settings-v1',
  LYRICS_CACHE: 'luna-lyrics-cache-v1',
};
