import { storageService } from "./storage-service";
import { Track } from "./types";

// Simple MD5 implementation for Last.fm signatures
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

export class LastFmScrobbler {
  private readonly API_KEY = "85214f5abbc730e78770f27784b9bdf7";
  private readonly API_SECRET = "2c2c37fd86739191860db810dd063292";
  private readonly API_URL = "https://ws.audioscrobbler.com/2.0/";

  private sessionKey: string | null = null;
  private currentTrack: Track | null = null;
  private scrobbleTimer: any = null;
  private hasScrobbled = false;

  constructor() {
    this.loadSession();
  }

  private async loadSession() {
    const session = await storageService.getItem("lastfm_session");
    if (session) {
      this.sessionKey = session.key;
    }
  }

  async setSession(key: string, username: string) {
    this.sessionKey = key;
    await storageService.setItem("lastfm_session", { key, username });
  }

  isAuthenticated() {
    return !!this.sessionKey;
  }

  private async generateSignature(params: Record<string, any>) {
    const sortedKeys = Object.keys(params).sort();
    let signatureString = "";
    for (const key of sortedKeys) {
      signatureString += key + params[key];
    }
    signatureString += this.API_SECRET;
    return md5(signatureString);
  }

  private async makeRequest(method: string, params: Record<string, any> = {}, requiresAuth = false) {
    const requestParams: Record<string, any> = {
      method,
      api_key: this.API_KEY,
      ...params,
    };

    if (requiresAuth && this.sessionKey) {
      requestParams.sk = this.sessionKey;
    }

    const signature = await this.generateSignature(requestParams);
    
    const formData = new URLSearchParams();
    for (const key in requestParams) formData.append(key, requestParams[key]);
    formData.append("api_sig", signature);
    formData.append("format", "json");

    try {
      const response = await fetch(this.API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      return await response.json();
    } catch (e) {
      console.error("Last.fm request failed:", e);
      throw e;
    }
  }

  async updateNowPlaying(track: Track) {
    if (!this.isAuthenticated()) return;
    this.currentTrack = track;
    this.hasScrobbled = false;
    this.clearTimer();

    try {
      const artistName = track.artist?.name || "Unknown Artist";
      await this.makeRequest("track.updateNowPlaying", {
        artist: artistName,
        track: track.title,
        album: track.album?.title || "",
        duration: Math.floor(track.duration / 1000),
      }, true);
      
      // Schedule scrobble after 50% or 4 minutes
      const delay = Math.min((track.duration / 2), 240000);
      this.scrobbleTimer = setTimeout(() => this.scrobble(), delay);
    } catch (e) {}
  }

  private async scrobble() {
    if (!this.isAuthenticated() || !this.currentTrack || this.hasScrobbled) return;

    try {
      const artistName = this.currentTrack.artist?.name || "Unknown Artist";
      await this.makeRequest("track.scrobble", {
        artist: artistName,
        track: this.currentTrack.title,
        album: this.currentTrack.album?.title || "",
        timestamp: Math.floor(Date.now() / 1000),
      }, true);
      this.hasScrobbled = true;
      console.log("[Last.fm Scrobbler] Scrobbled:", this.currentTrack.title);
    } catch (e) {}
  }

  clearTimer() {
    if (this.scrobbleTimer) {
      clearTimeout(this.scrobbleTimer);
      this.scrobbleTimer = null;
    }
  }

  onPlaybackStop() {
    this.clearTimer();
  }
}
