export interface Track {
  id: string;
  title: string;
  artist: { id: string; name: string };
  artists: { id: string; name: string }[];
  album: { id: string; title: string; coverUrl?: string };
  duration: number;
  provider: "tidal" | "qobuz";
  quality?: string;
  explicit?: boolean;
}

export interface Album {
  id: string;
  title: string;
  artist: { id: string; name: string };
  coverUrl?: string;
  provider: "tidal" | "qobuz";
  trackCount?: number;
  releaseDate?: string;
  similarAlbums?: Album[];
}

export interface Artist {
  id: string;
  name: string;
  imageUrl?: string;
  provider: "tidal" | "qobuz";
  biography?: string;
  socials?: any;
  similarArtists?: Artist[];
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  provider: "tidal" | "qobuz";
  trackCount?: number;
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
