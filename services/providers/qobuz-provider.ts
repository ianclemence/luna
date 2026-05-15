import { apiService } from "../api-service";
import { Album, Artist, Playlist, Track } from "../types";
import { MusicProvider, SearchResults } from "./types";
import { getCoverUrl, getArtistImageUrl } from "../../lib/images";

export class QobuzProvider implements MusicProvider {
  id = "qobuz";
  name = "Qobuz";

  async search(query: string, options?: { signal?: AbortSignal }): Promise<SearchResults> {
    const [tracksData, albumsData, artistsData] = await Promise.all([
      apiService.searchQobuzTracks(query, 0, 20),
      apiService.searchQobuzAlbums(query, 0, 20),
      apiService.searchQobuzArtists(query, 0, 20),
    ]);

    return {
      tracks: (tracksData.data?.tracks?.items || []).map((t: any) => this.transformTrack(t)),
      albums: (albumsData.data?.albums?.items || []).map((a: any) => this.transformAlbum(a)),
      artists: (artistsData.data?.artists?.items || []).map((a: any) => this.transformArtist(a)),
      playlists: [],
    };
  }

  async getTrack(id: string): Promise<Track | null> {
    // Note: implementing full Qobuz detail fetch would require adding getQobuzTrack to apiService
    // For now, mirroring the existing MusicService capabilities.
    return null;
  }

  async getAlbum(id: string): Promise<Album | null> {
    const data = await apiService.getQobuzAlbum(id);
    return data ? this.transformAlbum(data) : null;
  }

  async getArtist(id: string): Promise<Artist | null> {
    const data = await apiService.getQobuzArtist(id);
    return data ? this.transformArtist(data) : null;
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    const data = await apiService.getQobuzPlaylist(id);
    return data ? this.transformPlaylist(data) : null;
  }

  async getStreamUrl(id: string, quality: string = "7"): Promise<string | null> {
    const data = await apiService.getQobuzStreamUrl(id, quality);
    return data?.data?.url || data?.url || null;
  }

  private transformTrack(t: any): Track {
    const mainArtist = t.artist || (Array.isArray(t.artists) && t.artists.length > 0 ? t.artists[0] : null) || { id: "0", name: "Unknown Artist" };
    const artists = Array.isArray(t.artists) && t.artists.length > 0 
      ? t.artists.map((a: any) => ({ id: String(a.id), name: a.name })) 
      : [{ id: String(mainArtist.id), name: mainArtist.name }];

    return {
      id: `q:${t.id}`,
      title: t.title,
      artist: { id: String(mainArtist.id || ""), name: mainArtist.name || "Unknown Artist" },
      artists: artists,
      album: { 
        id: String(t.album?.id || ""), 
        title: t.album?.title || "Unknown Album", 
        coverUrl: getCoverUrl(t.album?.image?.large || t.album?.image?.small || t.album?.id, "qobuz") 
      },
      duration: t.duration * 1000,
      isrc: t.isrc,
      explicit: t.parental_advisory,
      quality: t.maximum_bit_depth > 16 ? "HI_RES" : "LOSSLESS",
      provider: "qobuz",
    };
  }

  private transformAlbum(a: any): Album {
    return {
      id: `q:${a.id}`,
      title: a.title,
      artist: { id: String(a.artist?.id || ""), name: a.artist?.name || "" },
      coverUrl: getCoverUrl(a.image?.large || a.image?.small || a.id, "qobuz"),
      releaseDate: a.release_date_original || a.release_date_stream,
      trackCount: a.tracks_count,
      provider: "qobuz",
    };
  }

  private transformArtist(a: any): Artist {
    return {
      id: String(a.id),
      name: a.name,
      imageUrl: getArtistImageUrl(a.image?.large || a.image?.small || a.id, "qobuz"),
      provider: "qobuz",
    };
  }

  private transformPlaylist(p: any): Playlist {
    return {
      id: String(p.id),
      title: p.title,
      description: p.description,
      imageUrl: getCoverUrl(p.image?.large || p.image?.small || p.id, "qobuz"),
      trackCount: p.tracks_count,
      provider: "qobuz",
    };
  }
}
