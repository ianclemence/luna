import { Album, Artist, Playlist, Track } from "../types";

export interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
}

export interface MusicProvider {
  id: string;
  name: string;
  
  search(query: string, options?: { signal?: AbortSignal }): Promise<SearchResults>;
  
  getTrack(id: string): Promise<Track | null>;
  getAlbum(id: string): Promise<Album | null>;
  getArtist(id: string): Promise<Artist | null>;
  getPlaylist(id: string): Promise<Playlist | null>;
  
  getStreamUrl(id: string, quality?: string): Promise<string | null>;
}
