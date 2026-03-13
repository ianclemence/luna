import { musicService, Playlist, Track } from "./music-service";
import { storageService } from "./storage-service";

interface ImportOptions {
  strictArtistMatch: boolean;
  albumMatch: boolean;
}

interface ImportItem {
  type: "track" | "album" | "artist";
  title?: string;
  artist?: string;
  album?: string;
  isrc?: string;
  originalValues?: any;
}

interface ImportProgress {
  playlistId: string;
  current: number;
  total: number;
  status: "parsing" | "searching" | "completed" | "failed";
  currentItem?: string;
}

type ProgressCallback = (progress: ImportProgress) => void;

function isFuzzyMatch(str1: string, str2: string) {
  if (!str1 || !str2) return false;

  const clean = (s: string) => {
    try {
      return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    } catch (e) {
      return s.toLowerCase().replace(/[^a-z0-9]/g, "");
    }
  };

  try {
    const s1 = str1.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const s2 = str2.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    // console.log(`[FuzzyMatch] Comparing "${s1}" with "${s2}"`);
    if (s1.includes(s2) || s2.includes(s1)) return true;
  } catch (e) {
    // Continue to fallback
  }

  const s1 = clean(str1);
  const s2 = clean(str2);
  return s1.includes(s2) || s2.includes(s1);
}

function findBestMatch(
  items: Track[],
  targetArtist: string,
  targetAlbum: string,
  options: ImportOptions
) {
  if (!items || items.length === 0) return null;
  if (!options?.strictArtistMatch && !options?.albumMatch) return items[0];

  return (
    items.find((item) => {
      let artistOk = true;
      let albumOk = true;

      if (options.strictArtistMatch && targetArtist) {
        const itemArtist =
          item.artist?.name || item.artists?.[0]?.name || "Unknown";
        if (!isFuzzyMatch(itemArtist, targetArtist)) {
            // console.log(`[BestMatch] Rejected artist: "${itemArtist}" vs "${targetArtist}"`);
            artistOk = false;
        }
      }

      if (options.albumMatch && targetAlbum) {
        const itemAlbum = item.album?.title;
        if (itemAlbum && !isFuzzyMatch(itemAlbum, targetAlbum)) {
             // console.log(`[BestMatch] Rejected album: "${itemAlbum}" vs "${targetAlbum}"`);
             albumOk = false;
        }
      }

      return artistOk && albumOk;
    }) || null
  );
}

const HEADER_MAPPINGS: any = {
  track: ["track name", "title", "song", "name", "track", "track title"],
  artist: [
    "artist name(s)",
    "artist name",
    "artist",
    "artists",
    "creator",
    "artist names",
  ],
  album: ["album", "album name"],
  type: ["type", "category", "kind"],
  isrc: ["isrc", "isrc code"],
  spotifyId: ["spotify - id", "spotify id", "spotify_id", "spotifyid"],
  playlistName: ["playlist name", "playlist", "playlist title"],
  duration: ["duration", "length", "time"],
};

function normalizeHeader(header: string) {
  return header
    .replace(/\uFEFF/g, "")
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, " ");
}

function mapHeaders(rawHeaders: string[]) {
  const mapped: any = {};
  rawHeaders.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    for (const [key, aliases] of Object.entries(HEADER_MAPPINGS)) {
      if ((aliases as string[]).includes(normalized)) {
        mapped[key] = index;
        break;
      }
    }
  });
  return mapped;
}

function detectCSVFormat(mappedHeaders: any) {
  const hasType = mappedHeaders.type !== undefined;
  const hasTrack = mappedHeaders.track !== undefined;
  const hasArtist = mappedHeaders.artist !== undefined;
  const hasAlbum = mappedHeaders.album !== undefined;

  if (hasTrack && hasArtist) {
    return {
      format: "library",
      hasMultipleTypes: hasType,
      supportsTracks: true,
      supportsAlbums: hasAlbum,
      supportsArtists: hasArtist && !hasTrack,
    };
  }

  if (hasArtist && !hasTrack) {
    return {
      format: "artists",
      hasMultipleTypes: false,
      supportsTracks: false,
      supportsAlbums: false,
      supportsArtists: true,
    };
  }

  return {
    format: "playlist",
    hasMultipleTypes: false,
    supportsTracks: true,
    supportsAlbums: false,
    supportsArtists: false,
  };
}

class PlaylistImportManager {
  private queue: {
    playlistId: string;
    items: ImportItem[];
    options: ImportOptions;
    playlist: Playlist & { tracks: Track[] };
  }[] = [];
  private isProcessing = false;
  private listeners: ProgressCallback[] = [];

  private getPrimaryArtist(artist?: string) {
    if (!artist) return "";
    const separators = [",", "&"];
    let result = artist;
    for (const sep of separators) {
      if (result.includes(sep)) {
        result = result.split(sep)[0];
      }
    }
    return result
      .replace(/\s+feat\.?.*$/i, "")
      .replace(/\s+ft\.?.*$/i, "")
      .replace(/\s+featuring.*$/i, "")
      .trim();
  }

  private cleanTitle(title?: string) {
    if (!title) return "";
    return title
      .replace(/\s*\(.*?\)/g, "")
      .replace(/\s*\[.*?\]/g, "")
      .replace(/\s+feat\.?.*$/i, "")
      .replace(/\s+ft\.?.*$/i, "")
      .replace(/\s+featuring.*$/i, "")
      .trim();
  }

  private buildQueries(item: ImportItem) {
    const title = item.title?.trim() || "";
    const artist = item.artist?.trim() || "";
    const album = item.album?.trim() || "";
    const primaryArtist = this.getPrimaryArtist(artist);
    const cleanTitle = this.cleanTitle(title);
    const queries = new Set<string>();

    if (title && artist) {
      if (album) {
        queries.add(`"${title}" ${artist} ${album}`);
      }
      queries.add(`"${title}" ${artist}`);
      if (primaryArtist && primaryArtist !== artist) {
        queries.add(`"${title}" ${primaryArtist}`);
      }
      queries.add(`${title} ${primaryArtist || artist}`);
    }

    if (cleanTitle) {
      const baseArtist = primaryArtist || artist;
      if (baseArtist) {
        queries.add(`"${cleanTitle}" ${baseArtist}`);
        queries.add(`${cleanTitle} ${baseArtist}`);
      } else {
        queries.add(cleanTitle);
      }
    }

    if (title) queries.add(title);
    return Array.from(queries).filter(Boolean);
  }

  subscribe(listener: ProgressCallback) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(progress: ImportProgress) {
    this.listeners.forEach((l) => l(progress));
  }

  async parseCSV(csvText: string): Promise<ImportItem[]> {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const parseLine = (text: string) => {
      const values: string[] = [];
      let current = "";
      let inQuote = false;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (char === '"') {
          if (inQuote && text[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuote = !inQuote;
          }
        } else if (char === "," && !inQuote) {
          values.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current);
      return values.map((v) =>
        v
          .trim()
          .replace(/^"|"$/g, "")
          .trim()
      );
    };

    const rawHeaders = parseLine(lines[0]);
    const mappedHeaders = mapHeaders(rawHeaders);
    const rows = lines.slice(1);
    const items: ImportItem[] = [];

    for (const row of rows) {
      if (!row.trim()) continue;
      const values = parseLine(row);

      const trackName =
        mappedHeaders.track !== undefined
          ? values[mappedHeaders.track]
          : undefined;
      const artistName =
        mappedHeaders.artist !== undefined
          ? values[mappedHeaders.artist]
          : undefined;
      const albumName =
        mappedHeaders.album !== undefined
          ? values[mappedHeaders.album]
          : undefined;
      const isrc =
        mappedHeaders.isrc !== undefined ? values[mappedHeaders.isrc] : "";

      if (trackName || artistName) {
        items.push({
          type: "track",
          title: trackName,
          artist: artistName,
          album: albumName,
          isrc: isrc,
        });
      }
    }
    return items;
  }

  async startImport(
    title: string,
    description: string,
    csvContent: string,
    options: ImportOptions
  ) {
    const items = await this.parseCSV(csvContent);
    const playlistId = `local:${Date.now()}`;
    console.log("[PlaylistImport] Parsed items:", items.length);

    const newPlaylist: Playlist & { tracks: Track[] } = {
      id: playlistId,
      title,
      description: description || `Imported from CSV - ${items.length} items`,
      provider: "tidal",
      trackCount: 0,
      tracks: [],
      imageUrl: undefined,
      isImporting: true,
      importProgress: {
        current: 0,
        total: items.length,
      },
    };

    await storageService.saveUserPlaylist(newPlaylist);

    this.queue.push({
      playlistId,
      items,
      options,
      playlist: newPlaylist,
    });

    this.processQueue();
    return playlistId;
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const task = this.queue[0];
    const { items, options, playlist } = task;
    let tracksAdded = 0;

    this.notify({
      playlistId: task.playlistId,
      current: 0,
      total: items.length,
      status: "searching",
    });

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let foundTrack: Track | null = null;

      try {
        if (item.isrc) {
          const res = await musicService.search(`isrc:${item.isrc}`);
          const items = res.tracks || [];
          if (items.length > 0) {
            foundTrack =
              items.find((t: any) => t.isrc === item.isrc) || items[0];
          }
        }

        if (!foundTrack && (item.title || item.artist)) {
          const queries = this.buildQueries(item);
          for (const query of queries) {
            const res = await musicService.search(query);
            const items = res.tracks || [];

            if (items.length > 0) {
              foundTrack = findBestMatch(
                items,
                item.artist || "",
                item.album || "",
                options,
              );
              if (foundTrack) break;
            }
          }
        }

        if (foundTrack) {
          playlist.tracks.push(foundTrack);
          tracksAdded++;
          if (!playlist.imageUrl && foundTrack.album?.coverUrl) {
            playlist.imageUrl = foundTrack.album.coverUrl;
          }
          console.log(
            `[PlaylistImport] Matched ${tracksAdded}/${items.length}:`,
            foundTrack.title,
            "-",
            foundTrack.artist?.name,
          );
        } else {
          console.log(
            `[PlaylistImport] No match for ${item.title || "Unknown Title"} - ${
              item.artist || "Unknown Artist"
            }`,
          );
        }
      } catch (e) {
        console.warn(`Error importing item ${i}:`, e);
      }

      if (i % 5 === 0 || i === items.length - 1) {
        playlist.importProgress = {
          current: i + 1,
          total: items.length,
        };
        playlist.trackCount = playlist.tracks.length;
        
        await storageService.saveUserPlaylist(playlist);
        
        this.notify({
            playlistId: task.playlistId,
            current: i + 1,
            total: items.length,
            status: "searching",
            currentItem: item.title
        });
      }

      await new Promise(r => setTimeout(r, 200));
    }

    playlist.isImporting = false;
    playlist.importProgress = undefined;
    playlist.trackCount = playlist.tracks.length;
    await storageService.saveUserPlaylist(playlist);
    console.log(
      "[PlaylistImport] Completed import:",
      playlist.id,
      playlist.trackCount,
    );

    this.notify({
        playlistId: task.playlistId,
        current: items.length,
        total: items.length,
        status: "completed"
    });

    this.queue.shift();
    this.isProcessing = false;
    this.processQueue();
  }
}

export const playlistImporter = new PlaylistImportManager();
