
// Mock React Native dependencies
// Create a minimal environment for testing without React Native
// We'll reimplement the core logic of the importer directly in this file
// to avoid importing files that depend on React Native

import fs from "fs";

const mockAsyncStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
  clear: async () => {},
  getAllKeys: async () => [],
  multiGet: async () => [],
  multiSet: async () => {},
  multiRemove: async () => {},
};

// Mock expo-file-system
const mockFileSystem = {
  documentDirectory: "file:///data/user/0/host.exp.exponent/files/",
  cacheDirectory: "file:///data/user/0/host.exp.exponent/cache/",
  writeAsStringAsync: async () => {},
  readAsStringAsync: async () => "",
  getInfoAsync: async () => ({ exists: false, isDirectory: false }),
  deleteAsync: async () => {},
  makeDirectoryAsync: async () => {},
  createDownloadResumable: () => ({
    downloadAsync: async () => ({ uri: "file:///test.mp3" }),
  }),
};

// Mock other expo modules
const mockExpoModules = {
  getInstallationIdAsync: async () => "test-id",
  // Add other mocks as needed
};

// ------------------------------------------------------------------
// Minimal API Service Implementation (copied logic from music-service.ts)
// ------------------------------------------------------------------

const DEFAULT_TIDAL_INSTANCES = {
  api: [
    { url: 'https://eu-central.monochrome.tf', version: '2.4' },
    { url: 'https://us-west.monochrome.tf', version: '2.4' },
    { url: 'https://arran.monochrome.tf', version: '2.4' },
    { url: 'https://triton.squid.wtf', version: '2.4' },
    { url: 'https://api.monochrome.tf/', version: '2.3' },
    { url: 'https://monochrome-api.samidy.com', version: '2.3' },
    { url: 'https://wolf.qqdl.site', version: '2.2' },
    { url: 'https://maus.qqdl.site', version: '2.2' },
    { url: 'https://vogel.qqdl.site', version: '2.2' },
    { url: 'https://hund.qqdl.site', version: '2.2' },
    { url: 'https://tidal.kinoplus.online', version: '2.2' }
  ],
  streaming: []
};

async function fetchWithRetry(relativePath, options = {}) {
  const instances = DEFAULT_TIDAL_INSTANCES.api;
  const maxAttempts = instances.length;
  let lastError = null;
  let instanceIndex = Math.floor(Math.random() * instances.length);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const instance = instances[instanceIndex % instances.length];
    const baseUrl = instance.url.endsWith("/") ? instance.url : `${instance.url}/`;
    const url = `${baseUrl}${relativePath.startsWith("/") ? relativePath.substring(1) : relativePath}`;

    try {
      // console.log(`Fetching: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data?.success === false) {
        throw new Error("API returned success: false");
      }
      return data;
    } catch (error) {
      // console.warn(`Failed fetch from ${baseUrl}: ${error.message}`);
      lastError = error;
      instanceIndex++;
    }
  }
  throw lastError || new Error(`All instances failed for: ${relativePath}`);
}

// ------------------------------------------------------------------
// Search Logic (The part we want to test)
// ------------------------------------------------------------------

// Helper to find key recursively - REPLICATING WEB APP LOGIC EXACTLY
const findSearchSection = (source, key, visited = new Set()) => {
    if (!source || typeof source !== 'object') return;

    if (Array.isArray(source)) {
        for (const e of source) {
            const f = findSearchSection(e, key, visited);
            if (f) return f;
        }
        return;
    }

    if (visited.has(source)) return;
    visited.add(source);

    if ('items' in source && Array.isArray(source.items)) return source;

    if (key in source) {
        const f = findSearchSection(source[key], key, visited);
        if (f) return f;
    }

    for (const v of Object.values(source)) {
        const f = findSearchSection(v, key, visited);
        if (f) return f;
    }
};

async function searchTracks(query) {
    console.log(`Searching for: ${query}`);
    try {
        const data = await fetchWithRetry(`search/?s=${encodeURIComponent(query)}`);
        // console.log("Raw API Response keys:", Object.keys(data));
        
        const section = findSearchSection(data, "tracks");
         if (section) {
             console.log(`  Found 'tracks' section. Items: ${section.items?.length || 0}`);
             if (section.items?.length > 0) {
                  console.log(`  First item: ${section.items[0].title} by ${section.items[0].artist?.name}`);
             }
         } else {
             console.log("  Did NOT find 'tracks' section");
             // Log the structure to see what we ARE getting
             const keys = Object.keys(data);
             console.log("  Root keys:", keys);
             if (data.data) {
                console.log("  data keys:", Object.keys(data.data));
                if (data.data.items && data.data.items.length > 0) {
                     console.log("  First item in data.items:", JSON.stringify(data.data.items[0]).substring(0, 100));
                }
             }
             if (data.items) console.log("  root has items array len:", data.items.length);
             // console.log("  Data dump:", JSON.stringify(data).substring(0, 200));
         }

        return {
            items: (section?.items || []).map(t => transformTidalTrack(t))
        };
    } catch (e) {
        console.error(`  API Error: ${e.message}`);
        return { items: [] };
    }
}

function transformTidalTrack(track) {
    const mainArtist = track.artist || (Array.isArray(track.artists) && track.artists.length > 0 ? track.artists[0] : null) || { id: "0", name: "Unknown" };
    return {
        id: `t:${track.id}`,
        title: track.title,
        artist: { id: `t:${mainArtist.id}`, name: mainArtist.name }
    };
}

// ------------------------------------------------------------------
// CSV Parsing Logic (from playlist-importer.ts)
// ------------------------------------------------------------------

const HEADER_MAPPINGS = {
  track: ["track name", "title", "song", "name", "track", "track title"],
  artist: ["artist name(s)", "artist name", "artist", "artists", "creator", "artist names"],
  album: ["album", "album name"],
  type: ["type", "category", "kind"],
  isrc: ["isrc", "isrc code"],
  spotifyId: ["spotify - id", "spotify id", "spotify_id", "spotifyid"],
  playlistName: ["playlist name", "playlist", "playlist title"],
  duration: ["duration", "length", "time"],
};

function normalizeHeader(header) {
  return header.replace(/\uFEFF/g, "").toLowerCase().trim().replace(/[_\s]+/g, " ");
}

function mapHeaders(rawHeaders) {
  const mapped = {};
  rawHeaders.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    for (const [key, aliases] of Object.entries(HEADER_MAPPINGS)) {
      if (aliases.includes(normalized)) {
        mapped[key] = index;
        break;
      }
    }
  });
  return mapped;
}

function parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const parseLine = (text) => {
      const values = [];
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
      return values.map((v) => v.trim().replace(/^"|"$/g, "").trim());
    };

    const rawHeaders = parseLine(lines[0]);
    const mappedHeaders = mapHeaders(rawHeaders);
    const rows = lines.slice(1);
    const items = [];

    for (const row of rows) {
      if (!row.trim()) continue;
      const values = parseLine(row);

      const trackName = mappedHeaders.track !== undefined ? values[mappedHeaders.track] : undefined;
      const artistName = mappedHeaders.artist !== undefined ? values[mappedHeaders.artist] : undefined;
      const albumName = mappedHeaders.album !== undefined ? values[mappedHeaders.album] : undefined;

      if (trackName || artistName) {
        items.push({
          type: "track",
          title: trackName,
          artist: artistName,
          album: albumName,
        });
      }
    }
    return items;
}

// ------------------------------------------------------------------
// Test Execution
// ------------------------------------------------------------------

async function runTest() {
    console.log("Starting Standalone Test...");
    
    const csvPath = "d:\\laragon\\www\\luna\\docs\\drizzy_🦉.csv";
    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const items = parseCSV(csvContent);
    
    console.log(`Parsed ${items.length} items.`);
    
    let matches = 0;
    let fails = 0;

    for (const item of items) {
        const query = `"${item.title}" ${item.artist}`;
        // console.log(`Searching: ${query}`);
        
        try {
            const result = await searchTracks(query);
            if (result.items && result.items.length > 0) {
                console.log(`[MATCH] ${item.title} -> ${result.items[0].title} (${result.items[0].artist.name})`);
                matches++;
            } else {
                // Try fallback query without quotes
                const fallbackQuery = `${item.title} ${item.artist}`;
                const fallbackResult = await searchTracks(fallbackQuery);
                 if (fallbackResult.items && fallbackResult.items.length > 0) {
                    console.log(`[MATCH-FB] ${item.title} -> ${fallbackResult.items[0].title}`);
                    matches++;
                 } else {
                    console.log(`[FAIL] ${item.title} - ${item.artist}`);
                    fails++;
                 }
            }
        } catch (e) {
            console.error(`Error searching ${item.title}:`, e.message);
            fails++;
        }
        
        await new Promise(r => setTimeout(r, 0));
    }
    
    console.log("---------------------------------------------------");
    console.log(`Test Complete. Matches: ${matches}, Fails: ${fails}`);
}

runTest();
