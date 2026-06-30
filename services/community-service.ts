/**
 * community-service.ts
 *
 * SpotiFLAC community server integration for streaming.
 * Decrypts AES-256-GCM encrypted server URLs and API keys,
 * then requests stream downloads from community servers.
 *
 * Ported from: D:\laragon\www\SpotiFLAC\backend\community_endpoints.go
 *              D:\laragon\www\SpotiFLAC\backend\community_apikey.go
 */
import QuickCrypto from 'react-native-quick-crypto';

// ─── AES-256-GCM Decryption ──────────────────────────────────────────────────

function sha256(parts: Uint8Array[]): Uint8Array {
  const hash = QuickCrypto.createHash('sha256');
  for (const part of parts) {
    hash.update(part);
  }
  return new Uint8Array(hash.digest());
}

function aes256GcmDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  // GCM tag is appended to ciphertext for OpenSSL/conventional GCM APIs
  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext, 0);
  sealed.set(tag, ciphertext.length);

  const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  if (aad && aad.length > 0) {
    decipher.setAAD(aad);
  }
  const decrypted = Buffer.concat([decipher.update(sealed), decipher.final()]);
  return new Uint8Array(decrypted);
}

function bytesToString(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

// ─── Community URL Decryption ─────────────────────────────────────────────────

const communityURLSeedParts = [
  new TextEncoder().encode('spotif'),
  new TextEncoder().encode('lac:co'),
  new TextEncoder().encode('mmunity:url:v1'),
];

const communityURLAAD = new TextEncoder().encode('spotiflac|community|url|v1');

// Tidal community URL
const tidalCommunityURLNonce = new Uint8Array([
  0x6a, 0x2a, 0x9e, 0xf3, 0x25, 0x5f, 0x48, 0x3c, 0xc3, 0xdf, 0x1d, 0xa9,
]);
const tidalCommunityURLCiphertext = new Uint8Array([
  0x8f, 0x90, 0xa4, 0x28, 0x24, 0x06, 0x35, 0x13, 0x2d, 0x33, 0x96, 0x9a,
  0xd7, 0x2c, 0x31, 0x42, 0x6a, 0xf3, 0xee, 0x86, 0x34, 0x99, 0x15, 0x1e,
  0xa9, 0x07, 0x06, 0xe6, 0xee, 0x0d, 0x75,
]);
const tidalCommunityURLTag = new Uint8Array([
  0x4d, 0x1c, 0x4e, 0x98, 0x96, 0x07, 0x16, 0xad, 0x6a, 0x7c, 0xa0, 0xdf,
  0xe9, 0xc5, 0xf6, 0x87,
]);

// Qobuz community URL
const qobuzCommunityURLNonce = new Uint8Array([
  0x5f, 0xd8, 0xfd, 0xfd, 0x89, 0x83, 0xe7, 0x6c, 0xde, 0x48, 0x47, 0x8d,
]);
const qobuzCommunityURLCiphertext = new Uint8Array([
  0xfa, 0x35, 0x21, 0xba, 0x02, 0xc6, 0x15, 0x1f, 0x0e, 0xa3, 0xa6, 0x16,
  0x64, 0x2b, 0xd8, 0xfb, 0xf5, 0x35, 0xfe, 0xe9, 0x0e, 0x59, 0xd9, 0x25,
  0x72, 0x57, 0x88, 0x94, 0xa9, 0xb7, 0x70,
]);
const qobuzCommunityURLTag = new Uint8Array([
  0xd7, 0x72, 0xb5, 0x2b, 0x1c, 0xb1, 0xfd, 0xba, 0x22, 0x09, 0x25, 0x41,
  0x87, 0x85, 0x30, 0x1b,
]);

// Amazon community URL
const amazonCommunityURLNonce = new Uint8Array([
  0x55, 0x18, 0x01, 0x42, 0x42, 0x0c, 0xf6, 0x78, 0x8a, 0x73, 0xd7, 0x63,
]);
const amazonCommunityURLCiphertext = new Uint8Array([
  0xd2, 0xf3, 0xdc, 0xe8, 0x62, 0xf0, 0xad, 0xc2, 0x4a, 0x43, 0xb1, 0xa2,
  0x1c, 0x0d, 0x41, 0x3e, 0x2e, 0x30, 0x29, 0x5e, 0x46, 0xe2, 0xc2, 0xd6,
  0xc1, 0xf3, 0xe3, 0x1a, 0x8f, 0x67, 0xfe,
]);
const amazonCommunityURLTag = new Uint8Array([
  0xf9, 0x0a, 0xfd, 0xed, 0x9e, 0xe8, 0xb4, 0xc0, 0x75, 0xf3, 0xd5, 0x74,
  0x3c, 0xb6, 0xa1, 0xb9,
]);

function decryptCommunityURL(
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
): string {
  const key = sha256(communityURLSeedParts);
  const plaintext = aes256GcmDecrypt(key, nonce, ciphertext, tag, communityURLAAD);
  return bytesToString(plaintext);
}

const communityDownloadPath = '/api/dl';

export function getTidalCommunityDownloadURL(): string {
  const base = decryptCommunityURL(
    tidalCommunityURLNonce,
    tidalCommunityURLCiphertext,
    tidalCommunityURLTag,
  );
  return base + communityDownloadPath;
}

export function getQobuzCommunityDownloadURL(): string {
  const base = decryptCommunityURL(
    qobuzCommunityURLNonce,
    qobuzCommunityURLCiphertext,
    qobuzCommunityURLTag,
  );
  return base + communityDownloadPath;
}

export function getAmazonCommunityDownloadURL(): string {
  const base = decryptCommunityURL(
    amazonCommunityURLNonce,
    amazonCommunityURLCiphertext,
    amazonCommunityURLTag,
  );
  return base + communityDownloadPath;
}

// ─── Community API Key Decryption ─────────────────────────────────────────────

const communityAPIKeySeedParts = [
  new TextEncoder().encode('spotif'),
  new TextEncoder().encode('lac:co'),
  new TextEncoder().encode('mmunity:apikey:v1'),
];

const communityAPIKeyAAD = new TextEncoder().encode('spotiflac|community|apikey|v1');

const communityAPIKeyNonce = new Uint8Array([
  0x20, 0x5c, 0x92, 0x4b, 0x61, 0xc2, 0x79, 0xd3, 0xea, 0x5d, 0xdd, 0xd4,
]);

const communityAPIKeyCiphertext = new Uint8Array([
  0x51, 0x0b, 0x26, 0xaf, 0xac, 0x6f, 0xf6, 0x41, 0x79, 0xde, 0x8d, 0x36,
  0x83, 0x46, 0xb5, 0xd5, 0x96, 0xef, 0xad, 0xed, 0xe0, 0xd0, 0xc7, 0xc2,
  0x90, 0x01, 0x50, 0x5f, 0x55, 0x59, 0x9f, 0xac, 0x1f, 0xd0, 0x70, 0x18,
  0x91, 0x4f, 0x7a, 0x32,
]);

const communityAPIKeyTag = new Uint8Array([
  0x56, 0xb0, 0x28, 0x68, 0x9f, 0x39, 0x0d, 0xbc, 0xc0, 0x8e, 0xfb, 0x52,
  0x3a, 0xd6, 0x18, 0xae,
]);

let cachedAPIKey: string | null = null;

export function getCommunityAPIKey(): string {
  if (cachedAPIKey) return cachedAPIKey;
  const key = sha256(communityAPIKeySeedParts);
  const plaintext = aes256GcmDecrypt(
    key,
    communityAPIKeyNonce,
    communityAPIKeyCiphertext,
    communityAPIKeyTag,
    communityAPIKeyAAD,
  );
  cachedAPIKey = bytesToString(plaintext);
  return cachedAPIKey!;
}

// ─── Community Server Client ──────────────────────────────────────────────────

const COMMUNITY_TIMEOUT = 15000;
const MAX_RETRIES = 3;

interface CommunityStreamRequest {
  service: 'tidal' | 'qobuz' | 'amazon';
  trackId: string;
  quality?: string; // "16" for lossless, "24" for hi-res
}

interface CommunityStreamResponse {
  url: string;
  quality?: string;
  service: string;
}

/**
 * Request a stream URL from the community server.
 * The community server handles all auth and returns a direct download URL.
 */
export async function requestCommunityStream(
  request: CommunityStreamRequest,
): Promise<CommunityStreamResponse | null> {
  const { service, trackId, quality } = request;

  const downloadURL =
    service === 'tidal'
      ? getTidalCommunityDownloadURL()
      : service === 'qobuz'
        ? getQobuzCommunityDownloadURL()
        : getAmazonCommunityDownloadURL();

  const apiKey = getCommunityAPIKey();

  // Community servers expect { id: string, quality: string }
  // quality: "16" for lossless, "24" for hi-res
  const body: Record<string, string> = {
    id: trackId,
    quality: quality || '16',
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), COMMUNITY_TIMEOUT);

      const response = await fetch(downloadURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'User-Agent': 'Luna/1.0.0',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        // Rate limited — wait and retry
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000 + 250
          : (attempt + 1) * 5000;
        console.log(`[Community] Rate limited, waiting ${waitMs}ms before retry ${attempt + 1}/${MAX_RETRIES}`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (response.status === 503) {
        // Server on cooldown
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000 + 250
          : 30000;
        console.warn(`[Community] Server on cooldown, waiting ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (!response.ok) {
        console.warn(`[Community] ${service} returned ${response.status}`);
        return null;
      }

      const data = await response.json() as any;

      // Tidal community returns: { quality, url, lyric }
      // Qobuz community returns: { url } or { download_url } or { data: { url } }
      // Amazon community returns similar patterns
      let streamUrl: string | null = null;

      if (data.url) {
        streamUrl = data.url;
      } else if (data.download_url) {
        streamUrl = data.download_url;
      } else if (data.data?.url) {
        streamUrl = data.data.url;
      } else if (data.data?.download_url) {
        streamUrl = data.data.download_url;
      }

      if (streamUrl && typeof streamUrl === 'string' && streamUrl.startsWith('http')) {
        return {
          url: streamUrl,
          quality: data.quality,
          service,
        };
      }

      console.warn(`[Community] No streamable URL in ${service} response:`, Object.keys(data));
      return null;
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.warn(`[Community] ${service} request timed out (attempt ${attempt + 1})`);
      } else {
        console.warn(`[Community] ${service} request failed (attempt ${attempt + 1}):`, e.message);
      }
      if (attempt === MAX_RETRIES) return null;
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 2000));
    }
  }

  return null;
}

/**
 * Get stream URL from community servers for a Tidal track.
 * Tries Tidal first, then Qobuz as fallback.
 *
 * Quality mapping (matching SpotiFLAC):
 *   HI_RES_LOSSLESS, HI_RES → "24"
 *   Everything else → "16"
 */
export async function getCommunityStreamUrl(
  tidalTrackId: string,
  preferredQuality: string = 'HI_RES_LOSSLESS',
): Promise<{ url: string; service: string } | null> {
  const quality = preferredQuality.includes('HI_RES') ? '24' : '16';

  // Try Tidal community server first
  const tidalResult = await requestCommunityStream({
    service: 'tidal',
    trackId: tidalTrackId,
    quality,
  });
  if (tidalResult) {
    console.log(`[Community] Got stream URL from Tidal community server`);
    return { url: tidalResult.url, service: 'community-tidal' };
  }

  // Fallback to Qobuz community server
  const qobuzResult = await requestCommunityStream({
    service: 'qobuz',
    trackId: tidalTrackId,
    quality,
  });
  if (qobuzResult) {
    console.log(`[Community] Got stream URL from Qobuz community server`);
    return { url: qobuzResult.url, service: 'community-qobuz' };
  }

  return null;
}
