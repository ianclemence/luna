import { Platform } from 'react-native';
import type * as MediaLibraryType from 'expo-media-library';
import { Track } from './types';

type MediaLibraryModule = typeof MediaLibraryType;

const EXCLUDED = [
  'whatsapp', 'notification', 'ringtone', 'alarm',
  'voice recorder', 'voicerecorder', 'voice memo',
];

const AUDIO_EXTENSIONS = /\.(mp3|flac|aac|ogg|opus|m4a|wav|wma|aiff|alac|ape|dsf|dsd|mka)$/i;

// expo-media-library's native module (ExpoMediaLibraryNext) is not bundled in
// Expo Go, so importing it eagerly at module scope crashes the app there.
// Lazy-require it instead, mirroring the pattern used for expo-media-control.
let mediaLibraryModule: MediaLibraryModule | null | undefined;

function getMediaLibrary(): MediaLibraryModule | null {
  if (mediaLibraryModule === undefined) {
    let mod: MediaLibraryModule | null = null;
    try {
      mod = require('expo-media-library');
    } catch (e) {
      console.warn('[LocalMusic] expo-media-library not available (likely Expo Go)');
    }
    mediaLibraryModule = mod;
  }
  return mediaLibraryModule;
}

function parseFilename(filename: string): { title: string; artist: string } {
  const bare = filename.replace(/\.[^/.]+$/, '').trim();
  const sep = bare.indexOf(' - ');
  if (sep > 0) return { artist: bare.slice(0, sep).trim(), title: bare.slice(sep + 3).trim() };
  return { artist: 'Unknown Artist', title: bare };
}

function albumArtUri(assetUri: string): string | undefined {
  if (Platform.OS !== 'android') return undefined;
  // Append /albumart to the media content URI to get embedded art from MediaStore
  // e.g. content://media/external/audio/media/1234 → .../1234/albumart
  return `${assetUri}/albumart`;
}

export async function scanLocalMusic(
  onProgress?: (scanned: number, total: number) => void,
): Promise<Track[]> {
  const MediaLibrary = getMediaLibrary();
  if (!MediaLibrary) {
    throw new Error('Local music requires a development build — not available in Expo Go');
  }

  console.log('[LocalMusic] requesting permissions...');
  let permResult: MediaLibraryType.PermissionResponse;
  try {
    permResult = await MediaLibrary.requestPermissionsAsync();
  } catch (e) {
    console.error('[LocalMusic] requestPermissionsAsync threw:', e);
    throw e;
  }
  console.log('[LocalMusic] permission status:', permResult.status, 'granted:', permResult.granted);
  if (permResult.status !== 'granted') throw new Error('Media library permission denied');

  console.log('[LocalMusic] fetching total count...');
  let total = 0;
  try {
    const countPage = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.audio,
      first: 1,
    });
    total = countPage.totalCount;
    console.log('[LocalMusic] total audio assets:', total);
  } catch (e) {
    console.error('[LocalMusic] getAssetsAsync (count) threw:', e);
    throw e;
  }

  const results: Track[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  let pageNum = 0;

  do {
    pageNum++;
    console.log(`[LocalMusic] fetching page ${pageNum}, cursor: ${cursor ?? 'start'}`);
    let page: MediaLibraryType.PagedInfo<MediaLibraryType.Asset>;
    try {
      page = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 200,
        after: cursor,
      });
    } catch (e) {
      console.error(`[LocalMusic] getAssetsAsync page ${pageNum} threw:`, e);
      throw e;
    }
    console.log(`[LocalMusic] page ${pageNum}: ${page.assets.length} assets, hasNext: ${page.hasNextPage}`);

    for (const asset of page.assets) {
      scanned++;
      if (asset.duration <= 30) continue;
      if (!AUDIO_EXTENSIONS.test(asset.filename)) {
        console.log(`[LocalMusic] skipping non-audio: ${asset.filename}`);
        continue;
      }
      if (EXCLUDED.some(p => asset.uri.toLowerCase().includes(p))) continue;

      let playableUri = asset.uri;
      if (Platform.OS === 'ios') {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(asset);
          if (!info.localUri) continue;
          playableUri = info.localUri;
        } catch {
          continue;
        }
      }

      const { title, artist } = parseFilename(asset.filename);
      const coverUrl = albumArtUri(asset.uri);
      results.push({
        id: `local:${asset.id}`,
        title,
        artist: { id: '', name: artist },
        artists: [{ id: '', name: artist }],
        album: { id: asset.albumId ?? '', title: 'Local Files', coverUrl },
        duration: Math.round(asset.duration * 1000),
        provider: 'local',
        localUri: playableUri,
      });
    }

    onProgress?.(scanned, total);
    cursor = page.endCursor;
    if (!page.hasNextPage) break;
  } while (true);

  console.log(`[LocalMusic] scan complete. found: ${results.length} tracks`);
  return results;
}
