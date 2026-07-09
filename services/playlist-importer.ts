import { musicService, Playlist, Track } from "./music-service";
import { storageService } from "./storage-service";
import { qobuzService } from "./qobuz-service";

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
  status: "parsing" | "searching" | "completed" | "failed" | "cancelled";
  currentItem?: string;
  missingItems?: { type: string; title?: string; artist?: string; album?: string }[];
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
        .replace(/[^a-z0-9\s-]/g, "");
    } catch (e) {
      return s.toLowerCase().replace(/[^a-z0-9\s-]/g, "");
    }
  };

  try {
    const s1 = str1.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "");
    const s2 = str2.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "");
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
  if (!items || items.length === 0) {
    console.log(`[findBestMatch] No items to match`);
    return null;
  }

  console.log(`[findBestMatch] ${items.length} items, target artist: "${targetArtist}", target album: "${targetAlbum}"`);

  // Always validate artist match — never blindly return items[0]
  if (targetArtist) {
    const artistMatch = items.find((item) => {
      const itemArtist =
        item.artist?.name || item.artists?.[0]?.name || "Unknown";
      const match = isFuzzyMatch(itemArtist, targetArtist);
      if (!match) {
        console.log(`[findBestMatch] Artist mismatch: "${itemArtist}" vs "${targetArtist}"`);
      }
      return match;
    });
    if (artistMatch) {
      console.log(`[findBestMatch] Artist match found: "${artistMatch.artist?.name}"`);
      return artistMatch;
    }
  }

  // If no artist match found and album matching is enabled, try album
  if (options?.albumMatch && targetAlbum) {
    const albumMatch = items.find((item) => {
      const itemAlbum = item.album?.title;
      return itemAlbum && isFuzzyMatch(itemAlbum, targetAlbum);
    });
    if (albumMatch) {
      console.log(`[findBestMatch] Album match found: "${albumMatch.album?.title}"`);
      return albumMatch;
    }
  }

  // Last resort: return first item only if we have no artist to validate against
  if (!targetArtist) {
    console.log(`[findBestMatch] No artist provided, returning first item: "${items[0].title}"`);
    return items[0];
  }

  // Artist was provided but no match found — return null (don't force a wrong match)
  console.log(`[findBestMatch] No match found for artist "${targetArtist}"`);
  return null;
}

function getTrackArtists(track: Track): string {
  if (track.artists && track.artists.length > 0) {
    return track.artists.map((a) => a.name).join(", ");
  }
  return track.artist?.name || "Unknown Artist";
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function escapeXml(text: string): string {
  if (!text) return "";
  return text
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Export Functions ──────────────────────────────────────────────────────────

export function generateCSV(playlist: Playlist, tracks: Track[]): string {
  const streamingTracks = tracks.filter((t) => !t.localUri);
  const skippedLocal = tracks.length - streamingTracks.length;
  const headers = ["Track Name", "Artist Name(s)", "Album", "Duration"];
  let content = headers.map((h) => `"${h}"`).join(",") + "\n";

  if (skippedLocal > 0) {
    content += `# ${skippedLocal} local device track(s) omitted from export\n`;
  }

  streamingTracks.forEach((track) => {
    const title = (track.title || "").replace(/"/g, '""');
    const artist = getTrackArtists(track).replace(/"/g, '""');
    const album = (track.album?.title || "").replace(/"/g, '""');
    const duration = formatDuration(track.duration || 0);
    content += `"${title}","${artist}","${album}","${duration}"\n`;
  });

  return content;
}

export function generateM3U(playlist: Playlist, tracks: Track[]): string {
  const streamingTracks = tracks.filter((t) => !t.localUri);
  const skippedLocal = tracks.length - streamingTracks.length;
  let content = "#EXTM3U\n";
  content += `#PLAYLIST:${playlist.title || "Unknown Playlist"}\n\n`;

  if (skippedLocal > 0) {
    content += `# ${skippedLocal} local device track(s) omitted from export\n\n`;
  }

  streamingTracks.forEach((track) => {
    const duration = Math.round(track.duration || 0);
    const artist = getTrackArtists(track);
    const title = track.title || "Unknown Title";
    content += `#EXTINF:${duration},${artist} - ${title}\n`;
    content += `#EXTALB:${track.album?.title || ""}\n`;
    content += "\n";
  });

  return content;
}

export function generateXSPF(playlist: Playlist, tracks: Track[]): string {
  const streamingTracks = tracks.filter((t) => !t.localUri);
  const skippedLocal = tracks.length - streamingTracks.length;
  const date = new Date().toISOString();

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<playlist xmlns="http://xspf.org/ns/0/" version="1">\n';
  xml += `  <title>${escapeXml(playlist.title || "Unknown Playlist")}</title>\n`;
  xml += `  <creator>${escapeXml("Luna Music")}</creator>\n`;
  xml += `  <date>${date}</date>\n`;

  if (skippedLocal > 0) {
    xml += `  <comment>${skippedLocal} local device track(s) omitted from export</comment>\n`;
  }

  xml += "  <trackList>\n";

  streamingTracks.forEach((track) => {
    xml += "    <track>\n";
    xml += `      <title>${escapeXml(track.title || "Unknown Title")}</title>\n`;
    xml += `      <creator>${escapeXml(getTrackArtists(track))}</creator>\n`;
    if (track.album?.title) {
      xml += `      <album>${escapeXml(track.album.title)}</album>\n`;
    }
    if (track.duration) {
      xml += `      <duration>${Math.round(track.duration * 1000)}</duration>\n`;
    }
    xml += "    </track>\n";
  });

  xml += "  </trackList>\n";
  xml += "</playlist>\n";

  return xml;
}

export function generateXML(playlist: Playlist, tracks: Track[]): string {
  const streamingTracks = tracks.filter((t) => !t.localUri);
  const skippedLocal = tracks.length - streamingTracks.length;
  const date = new Date().toISOString();

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += "<playlist>\n";
  xml += `  <name>${escapeXml(playlist.title || "Unknown Playlist")}</name>\n`;
  xml += `  <creator>${escapeXml("Luna Music")}</creator>\n`;
  xml += `  <created>${date}</created>\n`;
  xml += `  <trackCount>${streamingTracks.length}</trackCount>\n`;

  if (skippedLocal > 0) {
    xml += `  <comment>${skippedLocal} local device track(s) omitted from export</comment>\n`;
  }

  xml += "  <tracks>\n";

  streamingTracks.forEach((track, index) => {
    xml += "    <track>\n";
    xml += `      <position>${index + 1}</position>\n`;
    xml += `      <title>${escapeXml(track.title || "")}</title>\n`;
    xml += `      <artist>${escapeXml(getTrackArtists(track) || "")}</artist>\n`;
    xml += `      <album>${escapeXml(track.album?.title || "")}</album>\n`;
    xml += `      <duration>${Math.round(track.duration || 0)}</duration>\n`;
    xml += "    </track>\n";
  });

  xml += "  </tracks>\n";
  xml += "</playlist>\n";

  return xml;
}

// ─── Import Parsers ───────────────────────────────────────────────────────────

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

function parseM3U(content: string): ImportItem[] {
  const lines = content.trim().split(/\r?\n/);
  const items: ImportItem[] = [];
  let currentInfo: { title: string; artist: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#EXTM3U") || trimmed.startsWith("#PLAYLIST:")) {
      continue;
    }

    if (trimmed.startsWith("#EXTINF:")) {
      const match = trimmed.match(/#EXTINF:(-?\d+)?,(.+)/);
      if (match) {
        const displayName = match[2];
        const parts = displayName.split(" - ");
        currentInfo = {
          title: parts.length > 1 ? parts.slice(1).join(" - ") : displayName,
          artist: parts.length > 1 ? parts[0] : "",
        };
      }
    } else if (!trimmed.startsWith("#")) {
      if (currentInfo) {
        items.push({
          type: "track",
          title: currentInfo.title,
          artist: currentInfo.artist,
        });
        currentInfo = null;
      }
    }
  }

  return items;
}

function parseXSPF(content: string): ImportItem[] {
  const items: ImportItem[] = [];

  // Simple regex-based parsing for React Native (no DOMParser)
  const trackRegex = /<track>([\s\S]*?)<\/track>/g;
  let trackMatch;

  while ((trackMatch = trackRegex.exec(content)) !== null) {
    const trackContent = trackMatch[1];
    const titleMatch = trackContent.match(/<title>([\s\S]*?)<\/title>/);
    const creatorMatch = trackContent.match(/<creator>([\s\S]*?)<\/creator>/);
    const albumMatch = trackContent.match(/<album>([\s\S]*?)<\/album>/);

    const title = titleMatch?.[1]?.trim() || "";
    const creator = creatorMatch?.[1]?.trim() || "";
    const album = albumMatch?.[1]?.trim() || "";

    if (title && creator) {
      items.push({
        type: "track",
        title,
        artist: creator,
        album: album || undefined,
      });
    }
  }

  return items;
}

function parseJSPF(content: string): ImportItem[] {
  const items: ImportItem[] = [];

  try {
    const data = JSON.parse(content);
    if (!data.playlist || !Array.isArray(data.playlist.track)) {
      return items;
    }

    for (const jspfTrack of data.playlist.track) {
      const title = jspfTrack.title || "";
      const creator = jspfTrack.creator || "";
      const album = jspfTrack.album || "";

      if (title && creator) {
        items.push({
          type: "track",
          title,
          artist: creator,
          album: album || undefined,
        });
      }
    }
  } catch (e) {
    console.warn("[PlaylistImport] Failed to parse JSPF:", e);
  }

  return items;
}

function parseXML(content: string): ImportItem[] {
  const items: ImportItem[] = [];

  // Try different track element names
  const trackTagNames = ["track", "song", "item"];
  for (const tagName of trackTagNames) {
    const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "g");
    let match;

    while ((match = regex.exec(content)) !== null) {
      const trackContent = match[1];
      const titleMatch = trackContent.match(/<title>([\s\S]*?)<\/title>/)
        || trackContent.match(/<name>([\s\S]*?)<\/name>/);
      const artistMatch = trackContent.match(/<artist>([\s\S]*?)<\/artist>/)
        || trackContent.match(/<creator>([\s\S]*?)<\/creator>/)
        || trackContent.match(/<performer>([\s\S]*?)<\/performer>/);
      const albumMatch = trackContent.match(/<album>([\s\S]*?)<\/album>/);

      const title = titleMatch?.[1]?.trim() || "";
      const artist = artistMatch?.[1]?.trim() || "";
      const album = albumMatch?.[1]?.trim() || "";

      if (title && artist) {
        items.push({
          type: "track",
          title,
          artist,
          album: album || undefined,
        });
      }
    }

    if (items.length > 0) break;
  }

  return items;
}

function detectFormat(content: string, filename?: string): string {
  const ext = filename?.toLowerCase().split(".").pop();

  if (ext === "m3u" || ext === "m3u8") return "m3u";
  if (ext === "xspf") return "xspf";
  if (ext === "jspf") return "jspf";

  const trimmed = content.trim();
  if (trimmed.startsWith("#EXTM3U")) return "m3u";
  if (trimmed.startsWith("<?xml") && trimmed.includes("<playlist")) return "xspf";
  if (trimmed.startsWith("{") && trimmed.includes('"playlist"')) return "jspf";
  if (trimmed.startsWith("<?xml")) return "xml";

  return "csv";
}

// ─── PlaylistImportManager ────────────────────────────────────────────────────

class PlaylistImportManager {
  private queue: {
    playlistId: string;
    items: ImportItem[];
    options: ImportOptions;
    playlist: Playlist & { tracks: Track[] };
  }[] = [];
  private isProcessing = false;
  private cancelled = false;
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

  private buildQueries(item: ImportItem) {
    const title = item.title?.trim() || "";
    const artist = item.artist?.trim() || "";
    const primaryArtist = this.getPrimaryArtist(artist);
    const queries: string[] = [];

    // Match web app: single query strategy — quoted title + artist
    if (title && artist) {
      queries.push(`"${title}" ${artist}`);
      if (primaryArtist && primaryArtist !== artist) {
        queries.push(`"${title}" ${primaryArtist}`);
      }
    }

    return queries.filter(Boolean);
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

  cancelImport() {
    if (!this.isProcessing || this.queue.length === 0) return;
    this.cancelled = true;
    console.log("[PlaylistImport] Import cancellation requested");
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
    // Diagnostic logging
    console.log(`[PlaylistImport] parseCSV: ${items.length} items parsed`);
    if (items.length > 0) {
      const sample = items.slice(0, 3);
      console.log(`[PlaylistImport] Sample items:`, sample.map(i => ({
        title: i.title?.substring(0, 30),
        artist: i.artist?.substring(0, 30),
        album: i.album?.substring(0, 30),
        isrc: i.isrc || 'none'
      })));
      const withIsrc = items.filter(i => i.isrc && i.isrc.trim().length > 0);
      console.log(`[PlaylistImport] Items with ISRC: ${withIsrc.length}/${items.length}`);
    }

    return items;
  }

  parseContent(content: string, filename?: string): ImportItem[] {
    const format = detectFormat(content, filename);
    console.log(`[PlaylistImport] Detected format: ${format}`);

    switch (format) {
      case "m3u":
        return parseM3U(content);
      case "xspf":
        return parseXSPF(content);
      case "jspf":
        return parseJSPF(content);
      case "xml":
        return parseXML(content);
      case "csv":
      default:
        // CSV parsing is async, handled separately
        return [];
    }
  }

  async startImport(
    title: string,
    description: string,
    content: string,
    options: ImportOptions,
    filename?: string
  ) {
    const format = detectFormat(content, filename);
    let items: ImportItem[];

    if (format === "csv") {
      items = await this.parseCSV(content);
    } else {
      items = this.parseContent(content, filename);
    }

    const playlistId = `local:${Date.now()}`;
    console.log("[PlaylistImport] Parsed items:", items.length);

    const newPlaylist: Playlist & { tracks: Track[] } = {
      id: playlistId,
      title,
      description: description || `Imported from ${format.toUpperCase()} - ${items.length} items`,
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

  private async enrichTrackMetadata(track: Track): Promise<Track> {
    // Enrich with album cover if missing
    if (!track.album?.coverUrl && track.album?.id) {
      try {
        const albumData = await musicService.getAlbum(track.album.id);
        if (albumData?.coverUrl) {
          track = {
            ...track,
            album: { ...track.album, coverUrl: albumData.coverUrl },
          };
        }
      } catch {
        // Ignore enrichment errors
      }
    }
    return track;
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const task = this.queue[0];
    const { items, options, playlist } = task;
    let tracksAdded = 0;
    const missingItems: { type: string; title?: string; artist?: string; album?: string }[] = [];

    this.notify({
      playlistId: task.playlistId,
      current: 0,
      total: items.length,
      status: "searching",
    });

    console.log(`[PlaylistImport] Starting processQueue: ${items.length} items to process`);

    for (let i = 0; i < items.length; i++) {
      if (this.cancelled) {
        console.log("[PlaylistImport] Import cancelled by user");
        break;
      }

      const item = items[i];
      let foundTrack: Track | null = null;

      try {
        // Log item being processed
        console.log(`[PlaylistImport] Processing ${i + 1}/${items.length}: "${item.title}" by "${item.artist}" (ISRC: ${item.isrc || 'none'})`);

        if (item.isrc) {
          // Try Qobuz first by ISRC (main provider)
          console.log(`[PlaylistImport] ISRC search: ${item.isrc}`);
          const qobuzRes = await qobuzService.searchByIsrc(item.isrc);
          if (qobuzRes) {
            console.log(`[PlaylistImport] ISRC match found: "${qobuzRes.title}" by "${qobuzRes.artist?.name}"`);
            foundTrack = qobuzRes;
          } else {
            console.log(`[PlaylistImport] ISRC not found on Qobuz`);
          }

          // Fall back to unified search if Qobuz didn't find it
          if (!foundTrack) {
            const res = await musicService.search(`isrc:${item.isrc}`);
            const searchResults = res.tracks || [];
            // Only accept exact ISRC match — never take first result blindly
            const match = searchResults.find((t: any) => t.isrc === item.isrc);
            if (match) {
              console.log(`[PlaylistImport] ISRC match found via unified search: "${match.title}" by "${match.artist?.name}"`);
              foundTrack = match;
            } else {
              console.log(`[PlaylistImport] ISRC not found via unified search (${searchResults.length} results, no exact match)`);
            }
          }
        }

        if (!foundTrack && (item.title || item.artist)) {
          const queries = this.buildQueries(item);
          console.log(`[PlaylistImport] Text search queries: ${queries.join(' | ')}`);

          for (let qi = 0; qi < queries.length; qi++) {
            const query = queries[qi];
            console.log(`[PlaylistImport] Trying query ${qi + 1}/${queries.length}: "${query}"`);

            // Try Qobuz first (main provider)
            const qobuzResults = await qobuzService.search(query);
            const qobuzTracks = qobuzResults.tracks || [];
            console.log(`[PlaylistImport] Qobuz returned ${qobuzTracks.length} tracks`);

            if (qobuzTracks.length > 0) {
              const qobuzMatch = findBestMatch(
                qobuzTracks,
                item.artist || "",
                item.album || "",
                options,
              );
              if (qobuzMatch) {
                console.log(`[PlaylistImport] Qobuz match found: "${qobuzMatch.title}" by "${qobuzMatch.artist?.name}"`);
                foundTrack = qobuzMatch;
                break;
              } else {
                console.log(`[PlaylistImport] Qobuz: ${qobuzTracks.length} tracks found but artist match failed`);
                console.log(`[PlaylistImport] Qobuz artists:`, qobuzTracks.slice(0, 3).map(t => t.artist?.name));
              }
            }

            // Fall back to unified search if Qobuz didn't find it
            if (!foundTrack) {
              const res = await musicService.search(query);
              const searchResults = res.tracks || [];
              console.log(`[PlaylistImport] Unified search returned ${searchResults.length} tracks`);

              if (searchResults.length > 0) {
                const unifiedMatch = findBestMatch(
                  searchResults,
                  item.artist || "",
                  item.album || "",
                  options,
                );
                if (unifiedMatch) {
                  console.log(`[PlaylistImport] Unified match found: "${unifiedMatch.title}" by "${unifiedMatch.artist?.name}"`);
                  foundTrack = unifiedMatch;
                  break;
                } else {
                  console.log(`[PlaylistImport] Unified: ${searchResults.length} tracks found but artist match failed`);
                  console.log(`[PlaylistImport] Unified artists:`, searchResults.slice(0, 3).map(t => t.artist?.name));
                }
              }
            }
          }
        }

        if (foundTrack) {
          const isDuplicate = playlist.tracks.some(
            (t) => t.id === foundTrack!.id,
          );
          if (!isDuplicate) {
            // Enrich track metadata
            foundTrack = await this.enrichTrackMetadata(foundTrack);
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
              `[PlaylistImport] Skipping duplicate:`,
              foundTrack.title,
              "-",
              foundTrack.artist?.name,
            );
          }
        } else {
          missingItems.push({
            type: item.type,
            title: item.title,
            artist: item.artist,
            album: item.album,
          });
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

        this.notify({
            playlistId: task.playlistId,
            current: i + 1,
            total: items.length,
            status: "searching",
            currentItem: item.title,
            missingItems,
        });
      }

      await new Promise(r => setTimeout(r, 200));
    }

    playlist.isImporting = false;
    playlist.importProgress = undefined;
    playlist.trackCount = playlist.tracks.length;

    const saved = await storageService.saveUserPlaylist(playlist);
    if (!saved) {
      console.error("[PlaylistImport] Failed to save playlist to storage:", playlist.id);
      this.notify({
        playlistId: task.playlistId,
        current: items.length,
        total: items.length,
        status: "failed",
        missingItems,
      });
      this.queue.shift();
      this.isProcessing = false;
      this.processQueue();
      return;
    }

    const wasCancelled = this.cancelled;
    this.cancelled = false;

    if (wasCancelled) {
      console.log(
        "[PlaylistImport] Import cancelled:",
        playlist.id,
        playlist.trackCount,
        "tracks saved",
      );
    } else {
      console.log(
        "[PlaylistImport] Completed import:",
        playlist.id,
        playlist.trackCount,
      );
    }

    this.notify({
        playlistId: task.playlistId,
        current: items.length,
        total: items.length,
        status: wasCancelled ? "cancelled" : "completed",
        missingItems,
    });

    this.queue.shift();
    this.isProcessing = false;
    this.processQueue();
  }
}

export const playlistImporter = new PlaylistImportManager();
