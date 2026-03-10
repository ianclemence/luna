import AsyncStorage from "@react-native-async-storage/async-storage";
import { Album, Artist, Playlist, Track } from "./music-service";

const STORAGE_KEYS = {
  HISTORY: "music_history",
  FAVORITES_TRACKS: "favorites_tracks",
  FAVORITES_ALBUMS: "favorites_albums",
  FAVORITES_ARTISTS: "favorites_artists",
  FAVORITES_PLAYLISTS: "favorites_playlists",
};

type FavoriteType = "track" | "album" | "artist" | "playlist";
type FavoriteItem = Track | Album | Artist | Playlist;

class StorageService {
  private getStoreKey(type: FavoriteType): string {
    switch (type) {
      case "track":
        return STORAGE_KEYS.FAVORITES_TRACKS;
      case "album":
        return STORAGE_KEYS.FAVORITES_ALBUMS;
      case "artist":
        return STORAGE_KEYS.FAVORITES_ARTISTS;
      case "playlist":
        return STORAGE_KEYS.FAVORITES_PLAYLISTS;
    }
  }

  async toggleFavorite(
    type: FavoriteType,
    item: FavoriteItem,
  ): Promise<boolean> {
    try {
      const key = this.getStoreKey(type);
      const favorites = await this.getFavorites(type);
      const exists = favorites.some((i) => i.id === item.id);

      let newFavorites;
      if (exists) {
        newFavorites = favorites.filter((i) => i.id !== item.id);
      } else {
        const minified = this.minifyItem(type, item);
        newFavorites = [minified, ...favorites];
      }

      await AsyncStorage.setItem(key, JSON.stringify(newFavorites));
      return !exists;
    } catch (error) {
      console.error(`Failed to toggle favorite ${type}:`, error);
      return false;
    }
  }

  async getFavorites<T extends FavoriteItem>(type: FavoriteType): Promise<T[]> {
    try {
      const key = this.getStoreKey(type);
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error(`Failed to get favorites for ${type}:`, error);
      return [];
    }
  }

  async isFavorite(type: FavoriteType, id: string): Promise<boolean> {
    const favorites = await this.getFavorites(type);
    return favorites.some((i) => i.id === id);
  }

  private minifyItem(type: FavoriteType, item: any): any {
    const base = {
      id: item.id,
      addedAt: Date.now(),
      provider: item.provider,
    };

    if (type === "track") {
      const track = item as Track;
      return {
        ...base,
        title: track.title,
        duration: track.duration,
        explicit: track.explicit,
        artist: track.artist,
        artists: track.artists,
        album: {
          id: track.album.id,
          title: track.album.title,
          coverUrl: track.album.coverUrl,
        },
        quality: track.quality,
      };
    }

    if (type === "album") {
      const album = item as Album;
      return {
        ...base,
        title: album.title,
        artist: album.artist,
        coverUrl: album.coverUrl,
        trackCount: album.trackCount,
        releaseDate: album.releaseDate,
      };
    }

    if (type === "artist") {
      const artist = item as Artist;
      return {
        ...base,
        name: artist.name,
        imageUrl: artist.imageUrl,
      };
    }

    if (type === "playlist") {
      const playlist = item as Playlist;
      return {
        ...base,
        title: playlist.title,
        imageUrl: playlist.imageUrl,
        trackCount: playlist.trackCount,
        description: playlist.description,
      };
    }

    return item;
  }

  // Backward compatibility methods
  async toggleFavoriteTrack(track: Track) {
    return this.toggleFavorite("track", track);
  }

  async getFavoriteTracks(): Promise<Track[]> {
    return this.getFavorites<Track>("track");
  }

  async isFavoriteTrack(trackId: string): Promise<boolean> {
    return this.isFavorite("track", trackId);
  }

  async addToHistory(track: Track) {
    try {
      const history = await this.getHistory();
      const filtered = history.filter((t) => t.id !== track.id);
      const minified = this.minifyItem("track", track);
      const newHistory = [minified, ...filtered].slice(0, 50);
      await AsyncStorage.setItem(
        STORAGE_KEYS.HISTORY,
        JSON.stringify(newHistory),
      );
    } catch (error) {
      console.error("Failed to add to history:", error);
    }
  }

  async getHistory(): Promise<Track[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Failed to get history:", error);
      return [];
    }
  }

  async clearHistory() {
    await AsyncStorage.removeItem(STORAGE_KEYS.HISTORY);
  }
}

export const storageService = new StorageService();
