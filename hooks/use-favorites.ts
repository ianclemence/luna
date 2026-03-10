import { useState, useEffect, useCallback } from 'react';
import { storageService } from '../services/storage-service';
import { Track, Album, Artist, Playlist } from '../services/music-service';

type FavoriteType = 'track' | 'album' | 'artist' | 'playlist';

export function useFavorites() {
  const [favoriteTracks, setFavoriteTracks] = useState<Track[]>([]);
  const [favoriteAlbums, setFavoriteAlbums] = useState<Album[]>([]);
  const [favoriteArtists, setFavoriteArtists] = useState<Artist[]>([]);
  const [favoritePlaylists, setFavoritePlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const [tracks, albums, artists, playlists] = await Promise.all([
        storageService.getFavorites<Track>('track'),
        storageService.getFavorites<Album>('album'),
        storageService.getFavorites<Artist>('artist'),
        storageService.getFavorites<Playlist>('playlist'),
      ]);
      setFavoriteTracks(tracks);
      setFavoriteAlbums(albums);
      setFavoriteArtists(artists);
      setFavoritePlaylists(playlists);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const toggleFavorite = async (type: FavoriteType, item: any) => {
    const isNowFavorite = await storageService.toggleFavorite(type, item);
    await loadFavorites();
    return isNowFavorite;
  };

  const isFavorite = (type: FavoriteType, id: string) => {
    switch (type) {
      case 'track': return favoriteTracks.some((t) => t.id === id);
      case 'album': return favoriteAlbums.some((a) => a.id === id);
      case 'artist': return favoriteArtists.some((a) => a.id === id);
      case 'playlist': return favoritePlaylists.some((p) => p.id === id);
    }
  };

  return {
    favoriteTracks,
    favoriteAlbums,
    favoriteArtists,
    favoritePlaylists,
    toggleFavorite,
    isFavorite,
    loading,
    refreshFavorites: loadFavorites,
  };
}
