export interface Track {
  id: string;
  title: string;
  artist: { id: string; name: string };
  artists: { id: string; name: string }[];
  album: { id: string; title: string; coverUrl?: string };
  duration: number;
  provider: 'tidal' | 'deezer' | 'qobuz' | 'local';
  quality?: string;
  explicit?: boolean;
  isUnavailable?: boolean;
  addedAt?: number;
  trackNumber?: number;
  releaseDate?: string;
  isrc?: string;
  /** Local file URI for device-imported tracks. */
  localUri?: string;
  /** Audio quality metadata from the source provider. */
  maximumBitDepth?: number;
  maximumSamplingRate?: number;
  maximumChannelCount?: number;
  /** Resolved Tidal track ID when provider is "deezer" — used for playback. */
  resolvedTidalId?: string;
  /** ReplayGain normalization data (from Tidal/Amazon). */
  replayGain?: {
    trackGain: number;
    trackPeak: number;
    albumGain: number;
    albumPeak: number;
  };
}

export interface Album {
  id: string;
  title: string;
  artist: { id: string; name: string };
  coverUrl?: string;
  provider: 'tidal' | 'deezer' | 'qobuz';
  trackCount?: number;
  releaseDate?: string;
  similarAlbums?: Album[];
  addedAt?: number;
}

export interface Artist {
  id: string;
  name: string;
  imageUrl?: string;
  provider: 'tidal' | 'deezer' | 'qobuz';
  biography?: string;
  socials?: any;
  similarArtists?: Artist[];
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  provider: 'tidal' | 'deezer' | 'qobuz';
  trackCount?: number;
  updatedAt?: number;
  isImporting?: boolean;
  importProgress?: {
    current: number;
    total: number;
  };
}

export interface HomeData {
  trendingAlbums?: Album[];
  trendingTracks?: Track[];
  newAlbums?: Album[];
  jumpBackIn?: (Track | Album | Playlist | any)[];
  recommendedTracks?: Track[];
  recommendedAlbums?: Album[];
  newReleases: Album[];
  topTracks: Track[];
  featuredPlaylists: Playlist[];
  recommendations: Track[];
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsData {
  trackId: string;
  lines: LyricLine[];
  /** Provider name: "LRCLIB", "LRCLIB Search", "Paxsenix/Spotify",
   *  "Paxsenix/Apple Music", "Paxsenix/Netease" */
  provider: string;
  source: 'synced' | 'plain';
}

/** Result of a cross-platform track availability lookup. */
export interface TrackAvailability {
  tidal: boolean;
  tidalId?: string;
  tidalUrl?: string;
  deezer: boolean;
  deezerId?: string;
  deezerUrl?: string;
  spotify: boolean;
  spotifyId?: string;
}
