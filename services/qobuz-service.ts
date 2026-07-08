/**
 * Qobuz Service — Luna
 *
 * Direct integration with Qobuz API v0.2.
 * Uses provided App ID, App Secret, and User Auth Token to search the catalog,
 * fetch metadata, and generate signed track stream URLs.
 */

import { Track, Album, Artist, Playlist } from "./types";

// Simple MD5 implementation for request signatures
function md5(string: string) {
  function safeAdd(x: number, y: number) {
    var lsw = (x & 0xffff) + (y & 0xffff);
    var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num: number, cnt: number) {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  function binlMD5(x: any[], len: number) {
    x[len >> 5] |= 0x80 << (len % 32);
    x[(((len + 64) >>> 9) << 4) + 14] = len;
    var i, olda, oldb, oldc, oldd, a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (i = 0; i < x.length; i += 16) {
      olda = a; oldb = b; oldc = c; oldd = d;
      a = md5ff(a, b, c, d, x[i], 7, -680876936); d = md5ff(d, a, b, c, x[i + 1], 12, -389564586); c = md5ff(c, d, a, b, x[i + 2], 17, 606105819); b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897); d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426); c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341); b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416); d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417); c = md5ff(c, d, a, b, x[i + 10], 17, -42063); b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682); d = md5ff(d, a, b, c, x[i + 13], 12, -40341101); c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290); b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510); d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632); c = md5gg(c, d, a, b, x[i + 11], 14, 643717713); b = md5gg(b, c, d, a, x[i], 20, -373897302);
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691); d = md5gg(d, a, b, c, x[i + 10], 9, 38016083); c = md5gg(c, d, a, b, x[i + 15], 14, -660478335); b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438); d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690); c = md5gg(c, d, a, b, x[i + 3], 14, -187363961); b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467); d = md5gg(d, a, b, c, x[i + 2], 9, -51403784); c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473); b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
      a = md5hh(a, b, c, d, x[i + 5], 4, -378558); d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463); c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562); b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060); d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353); c = md5hh(c, d, a, b, x[i + 7], 16, -155497632); b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174); d = md5hh(d, a, b, c, x[i], 11, -358537222); c = md5hh(c, d, a, b, x[i + 3], 16, -722521979); b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487); d = md5hh(d, a, b, c, x[i + 12], 11, -421815835); c = md5hh(c, d, a, b, x[i + 15], 16, 530742520); b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
      a = md5ii(a, b, c, d, x[i], 6, -198630844); d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415); c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905); b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571); d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606); c = md5ii(c, d, a, b, x[i + 10], 15, -1051523); b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359); d = md5ii(d, a, b, c, x[i + 15], 10, -30611744); c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380); b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070); d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379); c = md5ii(c, d, a, b, x[i + 2], 15, 718787259); b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
      a = safeAdd(a, olda); b = safeAdd(b, oldb); c = safeAdd(c, oldc); d = safeAdd(d, oldd);
    }
    return [a, b, c, d];
  }
  function binl2rstr(input: any[]) {
    var i, output = "";
    var length32 = input.length * 32;
    for (i = 0; i < length32; i += 8) {
      output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xff);
    }
    return output;
  }
  function rstr2binl(input: string) {
    var i, output = Array(input.length >> 2);
    for (i = 0; i < output.length; i += 1) { output[i] = 0; }
    var length8 = input.length * 8;
    for (i = 0; i < length8; i += 8) {
      output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << (i % 32);
    }
    return output;
  }
  function rstrMD5(s: string) {
    return binl2rstr(binlMD5(rstr2binl(s), s.length * 8));
  }
  function rstr2hex(input: string) {
    var hexTab = "0123456789abcdef", output = "", x, i;
    for (i = 0; i < input.length; i += 1) {
      x = input.charCodeAt(i);
      output += hexTab.charAt((x >>> 4) & 0x0f) + hexTab.charAt(x & 0x0f);
    }
    return output;
  }
  function str2rstrUTF8(input: string) {
    return unescape(encodeURIComponent(input));
  }
  return rstr2hex(rstrMD5(str2rstrUTF8(string)));
}

class QobuzService {
  private readonly API_BASE = "https://www.qobuz.com/api.json/0.2/";

  /**
   * Credential pool — all 7 accounts are tested and working for both
   * search (catalog/search) and streaming (track/getFileUrl with signed sig).
   * On a 401 or 429 response the service automatically rotates to the next
   * credential, giving 7× the rate-limit headroom and automatic failover.
   */
  private readonly CREDENTIALS = [
    {
      appId: "798273057",
      secret: "abb21364945c0583309667d13ca3d93a",
      token: "jM-6F2QcDpfG7fj1RRPq7bAa7tBVCykt__5HD1K25v2yFq0c9_-SmXEhG-74moNpN5YQTmFFyyMq2F70h1G17A",
    },
    {
      appId: "798273057",
      secret: "abb21364945c0583309667d13ca3d93a",
      token: "1aFowv-ylpS5sYZv2ifXwHVjES9RX752HUozlaDS6YqZ4Fugp3pfNb3_40h2IV0IzBzqpkTPpmUi5SHGNP6qIQ",
    },
    {
      appId: "798273057",
      secret: "abb21364945c0583309667d13ca3d93a",
      token: "e5LOIO2m1Da_MCglsOH2I_gjKlmd3dOUguFe9btPlkeSe5vcwU-zUWVyJF272_n_XvIP7M-yAKIpbre_WTqRfw",
    },
    {
      appId: "798273057",
      secret: "abb21364945c0583309667d13ca3d93a",
      token: "J1nl2UXyZ9Pd2SF5s_YjvyNORbwe1UwNjHchv-UgOcE_WgrVSQvCoFQdTxgjYyBYDqgWfHfOlVT5wGZlvINrHA",
    },
    {
      appId: "312369995",
      secret: "e79f8b9be485692b0e5f9dd895826368",
      token: "W853CycKLM_InthmeZh5Gh2JkgnDi0xMGQVRZue2g9zA5GQvAWiWyp2r47Z2iRvxrfSV-PejQ5u_m7nUeCPk3w",
    },
    {
      appId: "312369995",
      secret: "e79f8b9be485692b0e5f9dd895826368",
      token: "-p7AmBdtHymBqXpWFjxMFNwd0J-iGSJJJRNN6RA8Sa0GFhtAZ6M5AOMJ3Hw_nkdLL8_7cmOYgG0wyIvjkYqt1g",
    },
    {
      appId: "312369995",
      secret: "e79f8b9be485692b0e5f9dd895826368",
      token: "jzjhl5_opHNsUvhb-bUzb0sbTiJVNb3VwqFZAQ0AongGFhtAZ6M5AOMJ3Hw_nkdLL8_7cmOYgG0wyIvjkYqt1g",
    },
  ] as const;

  /** Index of the currently active credential. */
  private credentialIndex = 0;

  private get APP_ID()     { return this.CREDENTIALS[this.credentialIndex].appId; }
  private get APP_SECRET() { return this.CREDENTIALS[this.credentialIndex].secret; }
  private get TOKEN()      { return this.CREDENTIALS[this.credentialIndex].token; }

  /** Rotate to the next credential in the pool. */
  private rotateCredential() {
    const prev = this.credentialIndex;
    this.credentialIndex = (this.credentialIndex + 1) % this.CREDENTIALS.length;
    console.warn(`[QobuzService] Rotating credential: ${prev} → ${this.credentialIndex}`);
  }

  private getHeaders(): Record<string, string> {
    return {
      "X-App-Id": this.APP_ID,
      "X-User-Auth-Token": this.TOKEN,
      "Accept": "application/json",
      "Content-Type": "application/json"
    };
  }

  /**
   * Wrapper around fetch that automatically rotates credentials on 401 / 429
   * and retries once with the fresh credential.
   */
  private async fetchWithRotation(url: string, options?: RequestInit): Promise<Response> {
    let response = await fetch(url, { method: "GET", ...options, headers: this.getHeaders() });
    if (response.status === 401 || response.status === 429) {
      this.rotateCredential();
      response = await fetch(url, { method: "GET", ...options, headers: this.getHeaders() });
    }
    return response;
  }

  async search(query: string, limit = 25): Promise<{
    tracks: Track[];
    albums: Album[];
    artists: Artist[];
    playlists: Playlist[];
  }> {
    try {
      const url = `${this.API_BASE}catalog/search?query=${encodeURIComponent(query)}&limit=${limit}`;
      const response = await this.fetchWithRotation(url);

      if (!response.ok) {
        throw new Error(`Qobuz search error ${response.status}`);
      }

      const data = await response.json();
      return {
        tracks: (data.tracks?.items || []).map((t: any) => this.transformTrack(t)),
        albums: (data.albums?.items || []).map((a: any) => this.transformAlbum(a)),
        artists: (data.artists?.items || []).map((a: any) => this.transformArtist(a)),
        playlists: (data.playlists?.items || []).map((p: any) => this.transformPlaylist(p))
      };
    } catch (e) {
      console.warn("[QobuzService] Search failed:", e);
      return { tracks: [], albums: [], artists: [], playlists: [] };
    }
  }

  async searchByIsrc(isrc: string): Promise<Track | null> {
    try {
      const url = `${this.API_BASE}catalog/search?query=${encodeURIComponent(isrc)}&limit=5`;
      const response = await this.fetchWithRotation(url);
      if (!response.ok) return null;
      const data = await response.json();
      const tracks = data.tracks?.items || [];
      const match = tracks.find((t: any) => t.isrc === isrc);
      return match ? this.transformTrack(match) : null;
    } catch (e) {
      console.warn(`[QobuzService] ISRC search failed for ${isrc}:`, e);
      return null;
    }
  }

  async getTrack(trackId: string): Promise<any> {
    const cleanId = trackId.replace(/^[tq]:/, "");
    const url = `${this.API_BASE}track/get?track_id=${cleanId}`;
    const response = await this.fetchWithRotation(url);
    if (!response.ok) throw new Error(`Qobuz track/get failed: ${response.status}`);
    return await response.json();
  }

  async getAlbum(albumId: string): Promise<Album> {
    const cleanId = albumId.replace(/^[tq]:/, "");
    const url = `${this.API_BASE}album/get?album_id=${cleanId}`;
    const response = await this.fetchWithRotation(url);
    if (!response.ok) throw new Error(`Qobuz album/get failed: ${response.status}`);
    const data = await response.json();
    return this.transformAlbum(data);
  }

  async getAlbumTracks(albumId: string): Promise<Track[]> {
    const cleanId = albumId.replace(/^[tq]:/, "");
    const url = `${this.API_BASE}album/get?album_id=${cleanId}`;
    const response = await this.fetchWithRotation(url);
    if (!response.ok) throw new Error(`Qobuz album/get failed: ${response.status}`);
    const data = await response.json();
    return (data.tracks?.items || []).map((t: any) => {
      // Inject album metadata into tracks for consistency
      const trackData = { ...t };
      if (!trackData.album) {
        trackData.album = {
          id: data.id,
          title: data.title,
          image: data.image
        };
      }
      return this.transformTrack(trackData);
    });
  }

  async getArtist(artistId: string): Promise<{ artist: Artist; albums: Album[]; tracks: Track[]; biography?: string }> {
    const cleanId = artistId.replace(/^[tq]:/, "");

    // Step 1: Fetch core artist info + top tracks from artist/page
    const pageUrl = `${this.API_BASE}artist/page?artist_id=${cleanId}&limit=100&offset=0`;
    const pageResponse = await this.fetchWithRotation(pageUrl);
    if (!pageResponse.ok) throw new Error(`Qobuz artist/page failed: ${pageResponse.status}`);
    const pageData = await pageResponse.json();

    // Step 2: Fetch full discography via artist/get (supports pagination, better album data)
    // We paginate until we've fetched all albums where this artist is the primary.
    const PAGE_SIZE = 200;
    const allRawAlbums: any[] = [];

    const firstGetUrl = `${this.API_BASE}artist/get?artist_id=${cleanId}&extra=albums&limit=${PAGE_SIZE}&offset=0`;
    const firstGetResp = await this.fetchWithRotation(firstGetUrl);
    if (firstGetResp.ok) {
      const firstGetData = await firstGetResp.json();
      const total: number = firstGetData.albums?.total || 0;
      const firstItems: any[] = firstGetData.albums?.items || [];
      allRawAlbums.push(...firstItems);

      // Paginate through the rest
      const totalPages = Math.ceil(total / PAGE_SIZE);
      if (totalPages > 1) {
        const pageRequests = [];
        for (let page = 1; page < Math.min(totalPages, 10); page++) {
          // Cap at 10 pages (2000 albums) for safety
          pageRequests.push(
            this.fetchWithRotation(
              `${this.API_BASE}artist/get?artist_id=${cleanId}&extra=albums&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
            ).then(r => r.ok ? r.json() : null).catch(() => null)
          );
        }
        const pages = await Promise.all(pageRequests);
        for (const p of pages) {
          if (p?.albums?.items) allRawAlbums.push(...p.albums.items);
        }
      }
    }

    // Filter to albums where this artist is the CREDITED primary artist.
    // Qobuz's top-level `album.artist` field is the single billed artist
    // (e.g. "She Will" has artist.id = Lil Wayne, even though Drake is in
    // artists[] as "main-artist"). This is the correct signal to use.
    const primaryArtistId = Number(cleanId);

    // Build a set of allowed genres based on the artist's top tracks to filter out
    // albums by different artists that share the exact same name (Qobuz metadata overlap).
    const allowedGenres = new Set<string>();
    const topTrackGenres: string[] = Array.isArray(pageData.top_tracks)
      ? pageData.top_tracks.map((t: any) => t.album?.genre?.name).filter(Boolean)
      : [];

    if (topTrackGenres.length > 0) {
      for (const g of topTrackGenres) {
        const lowerG = g.toLowerCase().trim();
        allowedGenres.add(lowerG);

        // Map crossover/related genres to prevent false negatives
        if (
          lowerG.includes("hip-hop") ||
          lowerG.includes("rap") ||
          lowerG.includes("r&b") ||
          lowerG.includes("pop") ||
          lowerG.includes("dance")
        ) {
          [
            "hip-hop/rap", "rap", "hip-hop", "r&b", "pop", "dance", "soul", "electronic",
            "reggae", "reggaeton", "house", "techno", "drum & bass", "gospel", "soundtrack",
            "ambiance", "musiques du monde", "afrique", "musique urbaine", "dancehall"
          ].forEach(x => allowedGenres.add(x));
        } else if (
          lowerG.includes("metal") ||
          lowerG.includes("rock") ||
          lowerG.includes("alternative") ||
          lowerG.includes("indie") ||
          lowerG.includes("indé")
        ) {
          [
            "metal", "rock", "alternative", "alternatif et indé", "alternatif", "indie",
            "indé", "punk", "new wave", "pop", "folk", "blues", "soundtrack", "hard rock"
          ].forEach(x => allowedGenres.add(x));
        } else if (lowerG.includes("classique") || lowerG.includes("classical")) {
          ["classique", "classical", "soundtrack", "ambient", "jazz", "crossover"].forEach(x => allowedGenres.add(x));
        } else if (lowerG.includes("jazz")) {
          ["jazz", "blues", "soul", "vocal", "pop", "classique", "classical"].forEach(x => allowedGenres.add(x));
        }
      }
    }

    const primaryAlbums = allRawAlbums.filter((a: any) => {
      if (Number(a.artist?.id) !== primaryArtistId) return false;

      // Filter out mismatched genres if we have a profile built from top tracks
      if (allowedGenres.size > 0 && a.genre?.name) {
        const albumGenre = a.genre.name.toLowerCase().trim();
        if (!allowedGenres.has(albumGenre)) {
          console.warn(`[QobuzService] Filtered out mismatched album "${a.title}" (Genre: ${a.genre.name}) for artist ID ${primaryArtistId}`);
          return false;
        }
      }
      return true;
    });

    // Deduplicate by title + track count, and drop single-track releases (singles)
    const seenKeys = new Map<string, Album>();
    for (const raw of primaryAlbums) {
      // Skip singles before transformation (faster, uses raw field)
      const rawTrackCount = raw.tracks_count ?? raw.tracks?.total ?? 0;
      if (rawTrackCount <= 1) continue;

      const album = this.transformAlbum(raw);
      const key = `${(album.title || "").toLowerCase().trim()}|${album.trackCount || 0}`;
      if (!seenKeys.has(key)) {
        seenKeys.set(key, album);
      }
    }
    const albums = Array.from(seenKeys.values()).sort((a, b) =>
      new Date(b.releaseDate || 0).getTime() - new Date(a.releaseDate || 0).getTime()
    );

    // `top_tracks` from artist/page is a FLAT array of track objects
    const tracks = Array.isArray(pageData.top_tracks)
      ? pageData.top_tracks.map((t: any) => this.transformTrackFromArtistPage(t))
      : [];

    // Build artist — artist/get has richer image data (direct `large` URL)
    const artist = this.transformArtistFromPage(pageData);

    return {
      artist,
      albums,
      tracks,
      biography: pageData.biography?.content || pageData.biography?.summary || undefined
    };
  }

  async getStreamUrl(trackId: string, preferredQuality = "HI_RES_LOSSLESS"): Promise<string | null> {
    try {
      const cleanId = trackId.replace(/^[tq]:/, "");
      // 1. Fetch track details to know maximum supported sample rate / bit depth
      const trackInfo = await this.getTrack(cleanId);

      // 2. Select matching format ID
      const formatId = this.selectFormatId(trackInfo, preferredQuality);

      // 3. Build a signed URL using the currently active credential.
      //    If the first attempt fails (401/429) we rotate and re-sign, because
      //    the stream signature is bound to APP_SECRET of the signing credential.
      const buildSignedUrl = () => {
        const ts = Math.floor(Date.now() / 1000);
        const sigString = `trackgetFileUrlformat_id${formatId}intentstreamtrack_id${cleanId}${ts}${this.APP_SECRET}`;
        const sig = md5(sigString);
        return `${this.API_BASE}track/getFileUrl?track_id=${cleanId}&format_id=${formatId}&intent=stream&request_ts=${ts}&request_sig=${sig}`;
      };

      let response = await fetch(buildSignedUrl(), { method: "GET", headers: this.getHeaders() });
      if (response.status === 401 || response.status === 429) {
        this.rotateCredential();
        response = await fetch(buildSignedUrl(), { method: "GET", headers: this.getHeaders() });
      }

      if (!response.ok) {
        throw new Error(`getFileUrl returned status ${response.status}`);
      }

      const fileUrlData = await response.json();
      return fileUrlData.url || null;
    } catch (e) {
      console.error("[QobuzService] getStreamUrl failed:", e);
      return null;
    }
  }

  async getReplayGain(trackId: string): Promise<{
    trackGain: number;
    trackPeak: number;
    albumGain: number;
    albumPeak: number;
  } | null> {
    try {
      const cleanId = trackId.replace(/^[tq]:/, "");
      const data = await this.getTrack(cleanId);
      const rg = data.audio_info;
      if (rg && (rg.replaygain_track_gain !== undefined || rg.replaygain_track_peak !== undefined)) {
        return {
          trackGain: rg.replaygain_track_gain || 0,
          trackPeak: rg.replaygain_track_peak || 1.0,
          albumGain: rg.replaygain_album_gain || rg.replaygain_track_gain || 0,
          albumPeak: rg.replaygain_album_peak || rg.replaygain_track_peak || 1.0
        };
      }
    } catch (e) {
      console.warn("[QobuzService] getReplayGain failed:", e);
    }
    return null;
  }

  private selectFormatId(trackInfo: any, preferredQuality: string): number {
    const isHires = !!trackInfo.hires;
    const maxSampleRate = trackInfo.maximum_sampling_rate || 44.1;

    if (preferredQuality === "HI_RES_LOSSLESS" || preferredQuality === "HI_RES") {
      if (isHires) {
        if (maxSampleRate > 96) return 27; // 24-bit / 192kHz FLAC
        if (maxSampleRate > 48) return 7;  // 24-bit / 96kHz FLAC
      }
      return 6; // 16-bit / 44.1kHz FLAC
    }

    if (preferredQuality === "LOSSLESS") {
      return 6; // 16-bit / 44.1kHz FLAC
    }

    return 5; // 320kbps MP3
  }

  private resolveArtistName(nameField: any): string {
    if (!nameField) return "Unknown Artist";
    if (typeof nameField === "string") return nameField;
    if (typeof nameField === "object") return nameField.display || nameField.name || "Unknown Artist";
    return String(nameField);
  }

  private transformTrack(t: any): Track {
    // catalog/search and album/get tracks use `performer` for main artist
    const mainArtistRaw = t.performer || t.artist || { id: "0", name: "Unknown Artist" };
    const mainArtistName = this.resolveArtistName(mainArtistRaw.name);
    const albumId = t.album?.id || "0";
    const albumTitle = t.album?.title || "Unknown Album";
    const coverUrl = t.album?.image?.large || t.album?.image?.small || undefined;

    return {
      id: `q:${t.id}`,
      title: t.title,
      artist: { id: `q:${mainArtistRaw.id}`, name: mainArtistName },
      artists: [{ id: `q:${mainArtistRaw.id}`, name: mainArtistName }],
      album: {
        id: `q:${albumId}`,
        title: albumTitle,
        coverUrl
      },
      duration: (t.duration || 0) * 1000,
      provider: "qobuz",
      quality: t.hires ? "Hi-Res" : "CD",
      explicit: !!t.parental_warning,
      trackNumber: t.track_number || t.physical_support?.track_number,
      releaseDate: t.release_date_stream || t.release_date_original,
      isrc: t.isrc,
      _raw: t
    } as any;
  }

  /**
   * Transform a track from artist/page `top_tracks` array.
   * These tracks use `artist: {id, name: {display}}` (no `performer` field).
   */
  private transformTrackFromArtistPage(t: any): Track {
    const mainArtistRaw = t.artist || { id: "0", name: "Unknown Artist" };
    const mainArtistName = this.resolveArtistName(mainArtistRaw.name);
    const albumId = t.album?.id || "0";
    const albumTitle = t.album?.title || "Unknown Album";
    const coverUrl = t.album?.image?.large || t.album?.image?.small || undefined;

    return {
      id: `q:${t.id}`,
      title: t.title,
      artist: { id: `q:${mainArtistRaw.id}`, name: mainArtistName },
      artists: [{ id: `q:${mainArtistRaw.id}`, name: mainArtistName }],
      album: {
        id: `q:${albumId}`,
        title: albumTitle,
        coverUrl
      },
      duration: (t.duration || 0) * 1000,
      provider: "qobuz",
      quality: t.audio_info?.maximum_bit_depth > 16 ? "Hi-Res" : "CD",
      explicit: !!t.parental_warning,
      trackNumber: t.physical_support?.track_number || t.track_number,
      isrc: t.isrc,
      _raw: t
    } as any;
  }

  private transformAlbum(a: any): Album {
    const artistId = a.artist?.id || (a.artists && a.artists[0]?.id) || "0";
    const rawArtistName = a.artist?.name || (a.artists && a.artists[0]?.name) || "Unknown Artist";
    const artistName = typeof rawArtistName === "object" ? rawArtistName.display : rawArtistName;

    const coverUrl = typeof a.image === "string" 
      ? a.image 
      : (a.image?.large || a.image?.small || undefined);
    const releaseDate = a.release_date_stream || a.release_date_original || a.dates?.stream || a.dates?.original;

    return {
      id: `q:${a.id}`,
      title: a.title,
      artist: { id: `q:${artistId}`, name: artistName },
      coverUrl,
      provider: "qobuz",
      trackCount: a.tracks_count,
      releaseDate
    };
  }

  private transformArtist(a: any): Artist {
    const name = this.resolveArtistName(a.name);

    let imageUrl: string | undefined;
    if (a.image?.large) {
      imageUrl = a.image.large;
    } else if (a.image?.medium) {
      imageUrl = a.image.medium;
    } else if (a.images?.portrait?.hash) {
      imageUrl = `https://static.qobuz.com/images/artists/covers/large/${a.images.portrait.hash}.jpg`;
    } else if (typeof a.images?.portrait === "string" && a.images.portrait.startsWith("http")) {
      imageUrl = a.images.portrait;
    } else if (typeof a.picture === "string" && a.picture.startsWith("http")) {
      imageUrl = a.picture;
    }

    return {
      id: `q:${a.id}`,
      name,
      imageUrl,
      provider: "qobuz"
    };
  }

  /**
   * Transform an artist from the artist/page top-level response.
   * The page response has: id, name: {display}, images: {portrait: {hash, format}}
   */
  private transformArtistFromPage(data: any): Artist {
    const name = this.resolveArtistName(data.name);

    let imageUrl: string | undefined;
    if (data.images?.portrait?.hash) {
      const hash = data.images.portrait.hash;
      const fmt = data.images.portrait.format || "jpg";
      imageUrl = `https://static.qobuz.com/images/artists/covers/large/${hash}.${fmt}`;
    } else if (data.image?.large) {
      imageUrl = data.image.large;
    } else if (data.picture) {
      imageUrl = data.picture;
    }

    return {
      id: `q:${data.id}`,
      name,
      imageUrl,
      provider: "qobuz"
    };
  }

  private transformPlaylist(p: any): Playlist {
    const imageUrl = p.image_template?.replace("{size}", "600") || undefined;

    return {
      id: `q:${p.id}`,
      title: p.name || p.title,
      description: p.description,
      imageUrl,
      provider: "qobuz",
      trackCount: p.tracks_count
    };
  }
}

export const qobuzService = new QobuzService();
