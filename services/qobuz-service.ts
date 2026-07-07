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
  private readonly APP_ID = "798273057";
  private readonly APP_SECRET = "abb21364945c0583309667d13ca3d93a";
  private readonly TOKEN = "jM-6F2QcDpfG7fj1RRPq7bAa7tBVCykt__5HD1K25v2yFq0c9_-SmXEhG-74moNpN5YQTmFFyyMq2F70h1G17A";
  private readonly API_BASE = "https://www.qobuz.com/api.json/0.2/";

  private getHeaders(): Record<string, string> {
    return {
      "X-App-Id": this.APP_ID,
      "X-User-Auth-Token": this.TOKEN,
      "Accept": "application/json",
      "Content-Type": "application/json"
    };
  }

  async search(query: string, limit = 25): Promise<{
    tracks: Track[];
    albums: Album[];
    artists: Artist[];
    playlists: Playlist[];
  }> {
    try {
      const url = `${this.API_BASE}catalog/search?query=${encodeURIComponent(query)}&limit=${limit}`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders()
      });

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

  async getTrack(trackId: string): Promise<any> {
    const cleanId = trackId.replace(/^[tq]:/, "");
    const url = `${this.API_BASE}track/get?track_id=${cleanId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders()
    });
    if (!response.ok) throw new Error(`Qobuz track/get failed: ${response.status}`);
    return await response.json();
  }

  async getAlbum(albumId: string): Promise<Album> {
    const cleanId = albumId.replace(/^[tq]:/, "");
    const url = `${this.API_BASE}album/get?album_id=${cleanId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders()
    });
    if (!response.ok) throw new Error(`Qobuz album/get failed: ${response.status}`);
    const data = await response.json();
    return this.transformAlbum(data);
  }

  async getAlbumTracks(albumId: string): Promise<Track[]> {
    const cleanId = albumId.replace(/^[tq]:/, "");
    const url = `${this.API_BASE}album/get?album_id=${cleanId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders()
    });
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
    // Use artist/page to get sorted discography and top tracks
    const url = `${this.API_BASE}artist/page?artist_id=${cleanId}&limit=100&offset=0&sort=release_date`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders()
    });
    if (!response.ok) throw new Error(`Qobuz artist/page failed: ${response.status}`);
    const data = await response.json();
    
    // Map releases to albums
    const albums = (data.releases?.items || []).map((a: any) => this.transformAlbum(a));
    // Map top_tracks to tracks
    const tracks = (data.top_tracks?.items || []).map((t: any) => this.transformTrack(t));
    
    return {
      artist: this.transformArtist(data),
      albums,
      tracks,
      biography: data.biography?.content || data.biography?.summary || undefined
    };
  }

  async getStreamUrl(trackId: string, preferredQuality = "HI_RES_LOSSLESS"): Promise<string | null> {
    try {
      const cleanId = trackId.replace(/^[tq]:/, "");
      // 1. Fetch track details to know maximum supported sample rate / bit depth
      const trackInfo = await this.getTrack(cleanId);
      
      // 2. Select matching format ID
      const formatId = this.selectFormatId(trackInfo, preferredQuality);

      // 3. Generate signed signature for track/getFileUrl
      const ts = Math.floor(Date.now() / 1000);
      const sigString = `trackgetFileUrlformat_id${formatId}intentstreamtrack_id${cleanId}${ts}${this.APP_SECRET}`;
      const sig = md5(sigString);

      const url = `${this.API_BASE}track/getFileUrl?track_id=${cleanId}&format_id=${formatId}&intent=stream&request_ts=${ts}&request_sig=${sig}`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders()
      });

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

  private transformTrack(t: any): Track {
    const mainArtist = t.performer || { id: "0", name: "Unknown Artist" };
    const albumId = t.album?.id || "0";
    const albumTitle = t.album?.title || "Unknown Album";
    const coverUrl = t.album?.image?.large || t.album?.image?.small || undefined;

    return {
      id: `q:${t.id}`,
      title: t.title,
      artist: { id: `q:${mainArtist.id}`, name: mainArtist.name },
      artists: [{ id: `q:${mainArtist.id}`, name: mainArtist.name }],
      album: {
        id: `q:${albumId}`,
        title: albumTitle,
        coverUrl
      },
      duration: (t.duration || 0) * 1000,
      provider: "qobuz",
      quality: t.hires ? "Hi-Res" : "CD",
      explicit: !!t.parental_warning,
      trackNumber: t.track_number,
      releaseDate: t.release_date_stream || t.release_date_original,
      isrc: t.isrc,
      _raw: t
    } as any;
  }

  private transformAlbum(a: any): Album {
    const artistId = a.artist?.id || (a.artists && a.artists[0]?.id) || "0";
    const rawArtistName = a.artist?.name || (a.artists && a.artists[0]?.name) || "Unknown Artist";
    const artistName = typeof rawArtistName === "object" ? rawArtistName.display : rawArtistName;

    const coverUrl = a.image?.large || a.image?.small || undefined;
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
    const name = typeof a.name === "object" ? a.name.display : a.name || "Unknown Artist";
    const imageUrl = a.image?.large || a.image?.medium || a.images?.portrait || undefined;

    return {
      id: `q:${a.id}`,
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
