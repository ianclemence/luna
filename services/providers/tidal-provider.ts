import { apiService } from "../api-service";
import { hifiClient } from "../hifi-client";
import { Album, Artist, Playlist, Track } from "../types";
import { MusicProvider, SearchResults } from "./types";
import { getCoverUrl, getArtistImageUrl } from "../../lib/images";

export class TidalProvider implements MusicProvider {
  id = "tidal";
  name = "Tidal";

  async search(query: string, options?: { signal?: AbortSignal }): Promise<SearchResults> {
    const [tracksData, albumsData, artistsData, playlistsData] = await Promise.all([
      apiService.searchTidalTracks(query, { signal: options?.signal }),
      apiService.searchTidalAlbums(query, { signal: options?.signal }),
      apiService.searchTidalArtists(query, { signal: options?.signal }),
      apiService.searchTidalPlaylists(query, { signal: options?.signal }),
    ]);

    return {
      tracks: apiService.normalizeSearchResponse(tracksData, 'tracks').map((t: any) => this.transformTrack(t)),
      albums: apiService.normalizeSearchResponse(albumsData, 'albums').map((a: any) => this.transformAlbum(a)),
      artists: apiService.normalizeSearchResponse(artistsData, 'artists').map((a: any) => this.transformArtist(a)),
      playlists: apiService.normalizeSearchResponse(playlistsData, 'playlists').map((p: any) => this.transformPlaylist(p)),
    };
  }

  async getTrack(id: string): Promise<Track | null> {
    const data = await apiService.getTidalTrackInfo(id);
    return data ? this.transformTrack(data) : null;
  }

  async getAlbum(id: string): Promise<Album | null> {
    const data = await apiService.getTidalAlbum(id);
    return data ? this.transformAlbum(data) : null;
  }

  async getArtist(id: string): Promise<Artist | null> {
    const data = await apiService.getTidalArtist(id);
    return data ? this.transformArtist(data) : null;
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    const data = await apiService.getTidalPlaylist(id);
    return data ? this.transformPlaylist(data) : null;
  }

  async getStreamUrl(id: string, quality: string = "HI_RES_LOSSLESS"): Promise<string | null> {
    const data = await apiService.getTidalTrackManifests(id, quality);
    return data?.data?.attributes?.uri || null;
  }

  private transformTrack(t: any): Track {
    const mainArtist = t.artist || (Array.isArray(t.artists) && t.artists.length > 0 ? t.artists[0] : null) || { id: "0", name: "Unknown Artist" };
    const artists = Array.isArray(t.artists) && t.artists.length > 0 
      ? t.artists.map((a: any) => ({ id: String(a.id), name: a.name })) 
      : [{ id: String(mainArtist.id), name: mainArtist.name }];

    return {
      id: `t:${t.id}`,
      title: t.title,
      artist: { id: String(mainArtist.id || ""), name: mainArtist.name || "Unknown Artist" },
      artists: artists,
      album: { 
        id: String(t.album?.id || t.albumId || ""), 
        title: t.album?.title || "Unknown Album", 
        coverUrl: getCoverUrl(t.album?.cover || t.album?.id || t.albumId, "tidal") 
      },
      duration: t.duration * 1000,
      isrc: t.isrc,
      explicit: t.explicit,
      quality: t.audioQuality || t.quality,
      provider: "tidal",
    };
  }

  private transformAlbum(a: any): Album {
    return {
      id: `t:${a.id}`,
      title: a.title,
      artist: { id: String(a.artist?.id || ""), name: a.artist?.name || "" },
      coverUrl: getCoverUrl(a.cover || a.id, "tidal"),
      releaseDate: a.releaseDate,
      trackCount: a.numberOfTracks,
      provider: "tidal",
    };
  }

  private transformArtist(a: any): Artist {
    return {
      id: String(a.id),
      name: a.name,
      imageUrl: getArtistImageUrl(a.picture || a.id, "tidal"),
      provider: "tidal",
    };
  }

  private transformPlaylist(p: any): Playlist {
    return {
      id: p.uuid || p.id,
      title: p.title,
      description: p.description,
      imageUrl: p.image?.startsWith("http") ? p.image : getCoverUrl(p.image, "tidal"),
      trackCount: p.numberOfTracks,
      provider: "tidal",
    };
  }
}
