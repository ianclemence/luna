/**
 * external-streams.ts
 *
 * External streaming endpoints ported from SpotiFLAC Python module.
 * Provides Tidal, Qobuz, and Deezer stream resolution via multiple APIs.
 *
 * Endpoints:
 *   - api.zarz.moe POST endpoints (Tidal, Qobuz, Deezer)
 *   - flacdownloader.com (Qobuz 2-step flow)
 *   - open.qobuz.com credential scraping
 */

const ZARZ_BASE = "https://api.zarz.moe/v1/dl";
const ZARZ_UA = "SpotiFLAC-Mobile/4.5.0";

const FLACDOWNLOADER_BASE = "https://flacdownloader.com";
const FLACDOWNLOADER_COOKIE = "csrftoken=laFTROF6th29hXV3Q5KtVw1oelBIGBXS";
const FLACDOWNLOADER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

const QOBUZ_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

const EXTERNAL_TIMEOUT = 15000;

// ─── Quality Mapping ─────────────────────────────────────────────────────────

function mapQualityForZarz(quality: string): string {
  if (quality.includes("HI_RES_LOSSLESS") || quality === "27") return "HI_RES_LOSSLESS";
  if (quality.includes("HI_RES") || quality === "7") return "HI_RES";
  if (quality.includes("LOSSLESS") || quality === "6") return "LOSSLESS";
  if (quality === "5" || quality === "HIGH") return "HIGH";
  return "LOSSLESS";
}

function mapQualityForQobuzZarz(quality: string): string {
  if (quality.includes("HI_RES_LOSSLESS") || quality === "27") return "hi-res-max";
  if (quality.includes("HI_RES") || quality === "7") return "hi-res";
  return "cd";
}

function mapQualityForFlacDownloader(quality: string): number {
  if (quality.includes("HI_RES_LOSSLESS") || quality === "27") return 27;
  if (quality.includes("HI_RES") || quality === "7") return 7;
  if (quality.includes("LOSSLESS") || quality === "6") return 6;
  return 6;
}

// ─── Zarz POST Endpoints ─────────────────────────────────────────────────────

async function zarzPost(
  endpoint: string,
  body: Record<string, any>,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "User-Agent": ZARZ_UA,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[ExternalStreams] Zarz ${endpoint} returned ${response.status}`);
      return null;
    }

    const data = await response.json() as any;

    // Check for error
    if (data.success === false || data.error || data.detail) {
      console.warn(`[ExternalStreams] Zarz error:`, data.message || data.error || data.detail);
      return null;
    }

    // Extract stream URL from various response formats
    return extractStreamUrl(data);
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.warn(`[ExternalStreams] Zarz ${endpoint} timed out`);
    } else {
      console.warn(`[ExternalStreams] Zarz ${endpoint} failed:`, e.message);
    }
    return null;
  }
}

function extractStreamUrl(data: any): string | null {
  // Direct URL fields
  const urlKeys = ["download_url", "url", "link", "u", "direct_download_url"];
  for (const key of urlKeys) {
    const val = data[key];
    if (typeof val === "string" && val.startsWith("http")) return val;
  }

  // Nested in data object
  if (data.data) {
    for (const key of urlKeys) {
      const val = data.data[key];
      if (typeof val === "string" && val.startsWith("http")) return val;
    }

    // Manifest (base64-encoded)
    if (data.data.manifest) {
      const presentation = data.data.assetPresentation;
      if (presentation && presentation !== "FULL") {
        console.warn(`[ExternalStreams] Skipping non-FULL presentation: ${presentation}`);
        return null;
      }
      return `manifest:${data.data.manifest}`;
    }
  }

  // Item array (Tidal response format)
  if (Array.isArray(data) && data.length > 0) {
    const item = data[0];
    if (item.OriginalTrackUrl) return item.OriginalTrackUrl;
    for (const key of urlKeys) {
      if (typeof item[key] === "string" && item[key].startsWith("http")) return item[key];
    }
  }

  return null;
}

// ─── Tidal via Zarz ──────────────────────────────────────────────────────────

export async function getTidalStreamViaZarz(
  trackId: string,
  quality: string = "HI_RES_LOSSLESS",
): Promise<string | null> {
  const cleanId = trackId.replace(/^[tq]:/, "");
  const mappedQuality = mapQualityForZarz(quality);

  console.log(`[ExternalStreams] Trying Tidal via Zarz: ${cleanId} (${mappedQuality})`);
  return zarzPost(`${ZARZ_BASE}/tid2`, {
    id: cleanId,
    quality: mappedQuality,
  });
}

// ─── Qobuz via Zarz ──────────────────────────────────────────────────────────

export async function getQobuzStreamViaZarz(
  trackId: string,
  quality: string = "HI_RES_LOSSLESS",
): Promise<string | null> {
  const cleanId = trackId.replace(/^[tq]:/, "");
  const mappedQuality = mapQualityForQobuzZarz(quality);

  console.log(`[ExternalStreams] Trying Qobuz via Zarz: ${cleanId} (${mappedQuality})`);
  return zarzPost(`${ZARZ_BASE}/qbz`, {
    quality: mappedQuality,
    upload_to_r2: false,
    url: `https://open.qobuz.com/track/${cleanId}`,
  });
}

// ─── Deezer via Zarz ─────────────────────────────────────────────────────────

export async function getDeezerStreamViaZarz(
  trackId: string,
): Promise<string | null> {
  const cleanId = trackId.replace(/^deezer:/, "");

  console.log(`[ExternalStreams] Trying Deezer via Zarz: ${cleanId}`);
  return zarzPost(`${ZARZ_BASE}/dzr`, {
    platform: "deezer",
    url: `https://www.deezer.com/track/${cleanId}`,
  });
}

// ─── FlacDownloader (Qobuz 2-step) ──────────────────────────────────────────

let flacDownloaderToken: string | null = null;
let flacDownloaderTokenExpiry = 0;

async function getFlacDownloaderToken(): Promise<string | null> {
  if (flacDownloaderToken && Date.now() < flacDownloaderTokenExpiry) {
    return flacDownloaderToken;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT);

    const response = await fetch(`${FLACDOWNLOADER_BASE}/prepare`, {
      method: "GET",
      headers: {
        "User-Agent": FLACDOWNLOADER_UA,
        Accept: "application/json, text/plain, */*",
        Referer: `${FLACDOWNLOADER_BASE}/download`,
        Cookie: FLACDOWNLOADER_COOKIE,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[ExternalStreams] FlacDownloader /prepare returned ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    if (data.t) {
      flacDownloaderToken = data.t;
      flacDownloaderTokenExpiry = Date.now() + 55000; // Cache for 55s
      return flacDownloaderToken;
    }

    console.warn(`[ExternalStreams] FlacDownloader /prepare no token:`, Object.keys(data));
    return null;
  } catch (e: any) {
    console.warn(`[ExternalStreams] FlacDownloader /prepare failed:`, e.message);
    return null;
  }
}

export async function getQobuzStreamViaFlacDownloader(
  trackId: string,
  quality: string = "HI_RES_LOSSLESS",
): Promise<string | null> {
  const cleanId = trackId.replace(/^[tq]:/, "");
  const formatId = mapQualityForFlacDownloader(quality);

  const token = await getFlacDownloaderToken();
  if (!token) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT);

    const url = `${FLACDOWNLOADER_BASE}/qobuz-asset?url=https://open.qobuz.com/track/${cleanId}&formatId=${formatId}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": FLACDOWNLOADER_UA,
        Accept: "application/json",
        Referer: `${FLACDOWNLOADER_BASE}/download`,
        "X-Dl-Token": token,
        Cookie: FLACDOWNLOADER_COOKIE,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[ExternalStreams] FlacDownloader /qobuz-asset returned ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    if (data.u && typeof data.u === "string" && data.u.startsWith("http")) {
      console.log(`[ExternalStreams] Got Qobuz stream via FlacDownloader`);
      return data.u;
    }

    console.warn(`[ExternalStreams] FlacDownloader no URL:`, Object.keys(data));
    return null;
  } catch (e: any) {
    console.warn(`[ExternalStreams] FlacDownloader failed:`, e.message);
    return null;
  }
}

// ─── Qobuz Credential Scraping ───────────────────────────────────────────────

interface QobuzCredentials {
  appId: string;
  appSecret: string;
  source: string;
}

let cachedQobuzCreds: QobuzCredentials | null = null;
let qobuzCredsExpiry = 0;

const QOBUZ_DEFAULT_APP_ID = "798273057";
const QOBUZ_DEFAULT_APP_SECRET = "589be88e4538daea11f509d29e4a23b1";

export async function scrapeQobuzCredentials(): Promise<QobuzCredentials> {
  if (cachedQobuzCreds && Date.now() < qobuzCredsExpiry) {
    return cachedQobuzCreds;
  }

  try {
    // Step 1: Fetch track page to find JS bundle URL
    const pageResp = await fetch("https://open.qobuz.com/track/1", {
      headers: { "User-Agent": QOBUZ_UA },
    });

    if (!pageResp.ok) throw new Error(`Page fetch failed: ${pageResp.status}`);

    const html = await pageResp.text();

    // Find main.js bundle URL
    const bundleMatch = html.match(
      /<script[^>]+src="([^"]+\/js\/main\.js|\/resources\/[^"]+\/js\/main\.js)"/,
    );

    if (!bundleMatch) throw new Error("Bundle URL not found in HTML");

    let bundleUrl = bundleMatch[1];
    if (bundleUrl.startsWith("/")) {
      bundleUrl = "https://open.qobuz.com" + bundleUrl;
    }

    // Step 2: Fetch JS bundle and extract credentials
    const bundleResp = await fetch(bundleUrl, {
      headers: { "User-Agent": QOBUZ_UA },
    });

    if (!bundleResp.ok) throw new Error(`Bundle fetch failed: ${bundleResp.status}`);

    const jsText = await bundleResp.text();
    const credMatch = jsText.match(
      /app_id:"(?<app_id>\d{9})",app_secret:"(?<app_secret>[a-f0-9]{32})"/,
    );

    if (!credMatch?.groups) throw new Error("Credentials not found in bundle");

    const creds: QobuzCredentials = {
      appId: credMatch.groups.app_id,
      appSecret: credMatch.groups.app_secret,
      source: bundleUrl,
    };

    cachedQobuzCreds = creds;
    qobuzCredsExpiry = Date.now() + 24 * 3600 * 1000; // 24h cache

    console.log(`[ExternalStreams] Scraped Qobuz credentials: app_id=${creds.appId}`);
    return creds;
  } catch (e: any) {
    console.warn(`[ExternalStreams] Qobuz credential scraping failed:`, e.message);

    // Return defaults
    return {
      appId: QOBUZ_DEFAULT_APP_ID,
      appSecret: QOBUZ_DEFAULT_APP_SECRET,
      source: "default",
    };
  }
}

// ─── Qobuz Signed API Request ────────────────────────────────────────────────

function computeQobuzSignature(
  path: string,
  params: Record<string, any>,
  timestamp: string,
  secret: string,
): string {
  const normalized = path.replace(/\//g, "");
  const excluded = new Set(["app_id", "request_ts", "request_sig"]);
  let payload = normalized;

  const sortedKeys = Object.keys(params)
    .filter((k) => !excluded.has(k))
    .sort();

  for (const key of sortedKeys) {
    const val = params[key];
    if (Array.isArray(val)) {
      for (const v of val) {
        payload += key + String(v);
      }
    } else {
      payload += key + String(val);
    }
  }

  payload += timestamp + secret;

  // MD5 hash
  let hash = 0;
  let result = "";
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Use a simple string-based MD5 approximation via expo-crypto or manual
  // Actually we need real MD5. Use a simple implementation:
  return md5(payload);
}

// Simple MD5 implementation for Qobuz signatures
function md5(string: string): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];

    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }

  function cmn(q: number, a: number, b: number, x: number[], s: number, t: number) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function add32(a: number, b: number) {
    return (a + b) & 0xffffffff;
  }

  function md51(s: string) {
    const n = s.length;
    let state = [1732584193, -271733879, -1732584194, 271733878];
    let i;
    for (i = 64; i <= n; i += 64) {
      md5cycle(state, md5blk(s.substring(i - 64, i)));
    }
    s = s.substring(i - 64);
    const tail = new Array(16).fill(0);
    for (i = 0; i < s.length; i++) {
      tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    }
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) {
      md5cycle(state, tail);
      for (i = 0; i < 16; i++) tail[i] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }

  function md5blk(s: string) {
    const md5blks = [];
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] =
        s.charCodeAt(i) +
        (s.charCodeAt(i + 1) << 8) +
        (s.charCodeAt(i + 2) << 16) +
        (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }

  const hex_chr = "0123456789abcdef".split("");

  function rhex(n: number) {
    let s = "";
    for (let j = 0; j < 4; j++) {
      s += hex_chr[(n >> (j * 8 + 4)) & 0x0f] + hex_chr[(n >> (j * 8)) & 0x0f];
    }
    return s;
  }

  function hex(x: number[]) {
    return x.map(rhex).join("");
  }

  return hex(md51(string));
}

// ─── Qobuz Signed Stream Request ─────────────────────────────────────────────

export async function getQobuzStreamViaSignedApi(
  trackId: string,
  quality: string = "HI_RES_LOSSLESS",
): Promise<string | null> {
  const cleanId = trackId.replace(/^[tq]:/, "");
  const creds = await scrapeQobuzCredentials();

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params: Record<string, any> = {
    app_id: creds.appId,
    request_ts: timestamp,
  };

  const sig = computeQobuzSignature(
    `track/${cleanId}`,
    params,
    timestamp,
    creds.appSecret,
  );

  const url = `https://www.qobuz.com/api.json/0.2/track/${cleanId}?app_id=${creds.appId}&request_ts=${timestamp}&request_sig=${sig}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT);

    const response = await fetch(url, {
      headers: {
        "User-Agent": QOBUZ_UA,
        "X-App-Id": creds.appId,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[ExternalStreams] Qobuz signed API returned ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    // Qobuz track info has stream URLs embedded
    if (data.streams) {
      const stream = data.streams[0];
      if (stream?.url) return stream.url;
    }
    if (data.download_url) return data.download_url;

    console.warn(`[ExternalStreams] Qobuz signed API no stream:`, Object.keys(data));
    return null;
  } catch (e: any) {
    console.warn(`[ExternalStreams] Qobuz signed API failed:`, e.message);
    return null;
  }
}

// ─── Unified External Stream Resolver ────────────────────────────────────────

export interface ExternalStreamResult {
  url: string;
  source: string;
}

/**
 * Try all external streaming endpoints for a Tidal track ID.
 * Returns the first working stream URL.
 */
export async function getExternalStreamUrl(
  trackId: string,
  quality: string = "HI_RES_LOSSLESS",
): Promise<ExternalStreamResult | null> {
  const cleanId = trackId.replace(/^[tq]:/, "");

  // Try all endpoints in parallel, return first success
  const attempts: Array<Promise<ExternalStreamResult | null>> = [
    // Tidal via Zarz
    (async () => {
      const url = await getTidalStreamViaZarz(cleanId, quality);
      return url ? { url, source: "zarz-tidal" } : null;
    })(),

    // Qobuz via Zarz
    (async () => {
      const url = await getQobuzStreamViaZarz(cleanId, quality);
      return url ? { url, source: "zarz-qobuz" } : null;
    })(),

    // Qobuz via FlacDownloader
    (async () => {
      const url = await getQobuzStreamViaFlacDownloader(cleanId, quality);
      return url ? { url, source: "flacdownloader-qobuz" } : null;
    })(),

    // Qobuz via Signed API (credential scraping)
    (async () => {
      const url = await getQobuzStreamViaSignedApi(cleanId, quality);
      return url ? { url, source: "qobuz-signed" } : null;
    })(),
  ];

  // Race all attempts, return first success
  const results = await Promise.allSettled(attempts);

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      console.log(`[ExternalStreams] Got stream from ${result.value.source}`);
      return result.value;
    }
  }

  console.warn(`[ExternalStreams] All external endpoints failed for ${cleanId}`);
  return null;
}
