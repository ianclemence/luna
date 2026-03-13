import AsyncStorage from "@react-native-async-storage/async-storage";
import { Album, Artist, Playlist, Track } from "./types";

const STORAGE_KEYS = {
  HISTORY: "music_history",
  FAVORITES_TRACKS: "favorites_tracks",
  FAVORITES_ALBUMS: "favorites_albums",
  FAVORITES_ARTISTS: "favorites_artists",
  FAVORITES_PLAYLISTS: "favorites_playlists",
  PLAYER_STATE: "player_state",
  RECENT_ALBUMS: "recent_albums",
  RECENT_PLAYLISTS: "recent_playlists",
  RECENT_MIXES: "recent_mixes",
  DOWNLOADS: "downloads_metadata",
  USER_PLAYLISTS: "user_playlists",
  LYRICS: "lyrics_cache",
};

export type DownloadStatus = "pending" | "downloading" | "completed" | "error";

export interface DownloadMetadata {
  id: string;
  type: FavoriteType;
  localPath?: string;
  status: DownloadStatus;
  progress: number;
  addedAt: number;
  item: any; // The minified item
  parentId?: string;
}

export type FavoriteType = "track" | "album" | "artist" | "playlist";
type FavoriteItem = Track | Album | Artist | Playlist;
type FavoriteChangeListener = (
  type: FavoriteType,
  favorites: FavoriteItem[],
) => void;
type DownloadChangeListener = (downloads: DownloadMetadata[]) => void;
type HistoryChangeListener = (history: Track[]) => void;
type UserPlaylistChangeListener = (
  playlists: (Playlist & { tracks: Track[] })[],
) => void;

class StorageService {
  private listeners: FavoriteChangeListener[] = [];
  private downloadListeners: DownloadChangeListener[] = [];
  private historyListeners: HistoryChangeListener[] = [];
  private userPlaylistListeners: UserPlaylistChangeListener[] = [];

  subscribeToFavorites(listener: FavoriteChangeListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(type: FavoriteType, favorites: FavoriteItem[]) {
    this.listeners.forEach((listener) => listener(type, favorites));
  }
  private notifyDownloadListeners(downloads: DownloadMetadata[]) {
    this.downloadListeners.forEach((listener) => listener(downloads));
  }

  subscribeToDownloads(listener: DownloadChangeListener) {
    this.downloadListeners.push(listener);
    return () => {
      this.downloadListeners = this.downloadListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  subscribeToHistory(listener: HistoryChangeListener) {
    this.historyListeners.push(listener);
    return () => {
      this.historyListeners = this.historyListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  private notifyHistoryListeners(history: Track[]) {
    this.historyListeners.forEach((listener) => listener(history));
  }

  subscribeToUserPlaylists(listener: UserPlaylistChangeListener) {
    this.userPlaylistListeners.push(listener);
    return () => {
      this.userPlaylistListeners = this.userPlaylistListeners.filter(
        (l) => l !== listener,
      );
    };
  }

  private notifyUserPlaylistListeners(
    playlists: (Playlist & { tracks: Track[] })[],
  ) {
    this.userPlaylistListeners.forEach((listener) => listener(playlists));
  }

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
        const minified = this.getMinifiedItem(type, item);
        newFavorites = [minified, ...favorites];
      }

      await AsyncStorage.setItem(key, JSON.stringify(newFavorites));
      this.notifyListeners(type, newFavorites);
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

  async ensureFavorite(
    type: FavoriteType,
    item: FavoriteItem,
  ): Promise<boolean> {
    try {
      const key = this.getStoreKey(type);
      const favorites = await this.getFavorites(type);
      const exists = favorites.some((i) => i.id === item.id);
      if (exists) return false;
      const minified = this.getMinifiedItem(type, item);
      const newFavorites = [minified, ...favorites];
      await AsyncStorage.setItem(key, JSON.stringify(newFavorites));
      this.notifyListeners(type, newFavorites);
      return true;
    } catch (error) {
      console.error(`Failed to ensure favorite ${type}:`, error);
      return false;
    }
  }

  async removeFavorite(type: FavoriteType, id: string): Promise<boolean> {
    try {
      const key = this.getStoreKey(type);
      const favorites = await this.getFavorites(type);
      const exists = favorites.some((i) => i.id === id);
      if (!exists) return false;
      const newFavorites = favorites.filter((i) => i.id !== id);
      await AsyncStorage.setItem(key, JSON.stringify(newFavorites));
      this.notifyListeners(type, newFavorites);
      return true;
    } catch (error) {
      console.error(`Failed to remove favorite ${type}:`, error);
      return false;
    }
  }

  async isFavorite(type: FavoriteType, id: string): Promise<boolean> {
    const favorites = await this.getFavorites(type);
    return favorites.some((i) => i.id === id);
  }

  getMinifiedItem(type: FavoriteType, item: any): any {
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
      const minified = this.getMinifiedItem("track", track);
      const newHistory = [minified, ...filtered].slice(0, 50);
      await AsyncStorage.setItem(
        STORAGE_KEYS.HISTORY,
        JSON.stringify(newHistory),
      );
      this.notifyHistoryListeners(newHistory);
    } catch (error) {
      console.error("Failed to add to history:", error);
    }
  }

  async addAlbumToHistory(album: Album) {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_ALBUMS);
      const albums: Album[] = data ? JSON.parse(data) : [];
      const filtered = albums.filter((a) => a.id !== album.id);
      const minified = this.getMinifiedItem("album", album);
      const newHistory = [minified, ...filtered].slice(0, 10);
      await AsyncStorage.setItem(
        STORAGE_KEYS.RECENT_ALBUMS,
        JSON.stringify(newHistory),
      );
    } catch (error) {
      console.error("Failed to add album to history:", error);
    }
  }

  async addPlaylistToHistory(playlist: Playlist) {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_PLAYLISTS);
      const playlists: Playlist[] = data ? JSON.parse(data) : [];
      const filtered = playlists.filter((p) => p.id !== playlist.id);
      const minified = this.getMinifiedItem("playlist", playlist);
      const newHistory = [minified, ...filtered].slice(0, 10);
      await AsyncStorage.setItem(
        STORAGE_KEYS.RECENT_PLAYLISTS,
        JSON.stringify(newHistory),
      );
    } catch (error) {
      console.error("Failed to add playlist to history:", error);
    }
  }

  async addMixToHistory(mix: any) {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_MIXES);
      const mixes: any[] = data ? JSON.parse(data) : [];
      const filtered = mixes.filter((m) => m.id !== mix.id);
      const newHistory = [{ ...mix, addedAt: Date.now() }, ...filtered].slice(
        0,
        10,
      );
      await AsyncStorage.setItem(
        STORAGE_KEYS.RECENT_MIXES,
        JSON.stringify(newHistory),
      );
    } catch (error) {
      console.error("Failed to add mix to history:", error);
    }
  }

  async getRecentAlbums(): Promise<Album[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_ALBUMS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Failed to get recent albums:", error);
      return [];
    }
  }

  async getRecentPlaylists(): Promise<Playlist[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_PLAYLISTS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Failed to get recent playlists:", error);
      return [];
    }
  }

  async getRecentMixes(): Promise<any[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_MIXES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Failed to get recent mixes:", error);
      return [];
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
    this.notifyHistoryListeners([]);
  }

  async savePlayerState(state: any) {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.PLAYER_STATE,
        JSON.stringify(state),
      );
    } catch (error) {
      console.error("Failed to save player state:", error);
    }
  }

  async getPlayerState(): Promise<any | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.PLAYER_STATE);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Failed to get player state:", error);
      return null;
    }
  }

  // Download methods
  async saveDownloadMetadata(metadata: DownloadMetadata) {
    try {
      const downloads = await this.getAllDownloads();
      const existingIndex = downloads.findIndex((d) => d.id === metadata.id);

      let newDownloads;
      if (existingIndex >= 0) {
        newDownloads = [...downloads];
        newDownloads[existingIndex] = {
          ...newDownloads[existingIndex],
          ...metadata,
        };
      } else {
        newDownloads = [metadata, ...downloads];
      }

      await AsyncStorage.setItem(
        STORAGE_KEYS.DOWNLOADS,
        JSON.stringify(newDownloads),
      );
      this.notifyDownloadListeners(newDownloads);
    } catch (error) {
      console.error("Failed to save download metadata:", error);
    }
  }

  async getAllDownloads(): Promise<DownloadMetadata[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Failed to get all downloads:", error);
      return [];
    }
  }

  async getDownloadMetadata(id: string): Promise<DownloadMetadata | null> {
    const downloads = await this.getAllDownloads();
    return downloads.find((d) => d.id === id) || null;
  }

  async removeDownloadMetadata(id: string) {
    try {
      const downloads = await this.getAllDownloads();
      const newDownloads = downloads.filter((d) => d.id !== id);
      await AsyncStorage.setItem(
        STORAGE_KEYS.DOWNLOADS,
        JSON.stringify(newDownloads),
      );
      this.notifyDownloadListeners(newDownloads);
    } catch (error) {
      console.error("Failed to remove download metadata:", error);
    }
  }

  async isDownloaded(id: string): Promise<boolean> {
    const metadata = await this.getDownloadMetadata(id);
    return metadata?.status === "completed";
  }

  async getDownloadedTrackPath(id: string): Promise<string | null> {
    const metadata = await this.getDownloadMetadata(id);
    return metadata?.status === "completed" ? metadata.localPath || null : null;
  }

  // User Playlists
  async getUserPlaylists(): Promise<(Playlist & { tracks: Track[] })[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_PLAYLISTS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Failed to get user playlists:", error);
      return [];
    }
  }

  async saveUserPlaylist(
    playlist: Playlist & { tracks: Track[] },
  ): Promise<boolean> {
    try {
      const playlists = await this.getUserPlaylists();
      const existingIndex = playlists.findIndex((p) => p.id === playlist.id);

      let newPlaylists;
      if (existingIndex >= 0) {
        newPlaylists = [...playlists];
        newPlaylists[existingIndex] = playlist;
      } else {
        newPlaylists = [playlist, ...playlists];
      }

      await AsyncStorage.setItem(
        STORAGE_KEYS.USER_PLAYLISTS,
        JSON.stringify(newPlaylists),
      );
      this.notifyUserPlaylistListeners(newPlaylists);
      return true;
    } catch (error) {
      console.error("Failed to save user playlist:", error);
      return false;
    }
  }

  async deleteUserPlaylist(playlistId: string): Promise<boolean> {
    try {
      const playlists = await this.getUserPlaylists();
      const newPlaylists = playlists.filter((p) => p.id !== playlistId);
      await AsyncStorage.setItem(
        STORAGE_KEYS.USER_PLAYLISTS,
        JSON.stringify(newPlaylists),
      );
      this.notifyUserPlaylistListeners(newPlaylists);
      return true;
    } catch (error) {
      console.error("Failed to delete user playlist:", error);
      return false;
    }
  }

  async getUserPlaylist(
    playlistId: string,
  ): Promise<(Playlist & { tracks: Track[] }) | null> {
    const playlists = await this.getUserPlaylists();
    return playlists.find((p) => p.id === playlistId) || null;
  }
  async getLyrics(trackId: string): Promise<LyricsData | null> {
    try {
      const data = await AsyncStorage.getItem(
        `${STORAGE_KEYS.LYRICS}_${trackId}`,
      );
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async saveLyrics(trackId: string, lyrics: LyricsData): Promise<void> {
    try {
      await AsyncStorage.setItem(
        `${STORAGE_KEYS.LYRICS}_${trackId}`,
        JSON.stringify(lyrics),
      );
    } catch (error) {
      console.error("Failed to save lyrics:", error);
    }
  }
}

export const storageService = new StorageService();
