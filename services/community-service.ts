/**
 * community-service.ts
 *
 * SpotiFLAC community server integration for streaming.
 * Uses pre-decrypted server URLs and API keys (derived from
 * AES-256-GCM encrypted constants in the Go/Python SpotiFLAC projects).
 *
 * Ported from: D:\laragon\www\SpotiFLAC\backend\community_endpoints.go
 *              D:\laragon\www\SpotiFLAC\backend\community_apikey.go
 *
 * NOTE: The community URLs are deterministic — same seed parts always
 * produce the same AES key and plaintext. If the SpotiFLAC project
 * rotates keys, update the values below from the Go/Python source.
 */

// Pre-decrypted community server base URLs (from AES-256-GCM decryption of SpotiFLAC constants)
// Seed: "spotiflac:community:url:v1" → SHA-256 → AES-256-GCM key
// These values match the Go backend's decrypted endpoints.
const TIDAL_COMMUNITY_BASE = 'tdl-foss.spotbye.qzz.io';
const QOBUZ_COMMUNITY_BASE = 'qbz-foss.spotbye.qzz.io';
const AMAZON_COMMUNITY_BASE = 'amz-foss.spotbye.qzz.io';

// Pre-decrypted API key
// Seed: "spotiflac:community:apikey:v1" → SHA-256 → AES-256-GCM key
const COMMUNITY_API_KEY = 'explore-obscure-chivalry-travesty-blinks';

const communityDownloadPath = '/api/dl';

export function getTidalCommunityDownloadURL(): string {
  return `https://${TIDAL_COMMUNITY_BASE}${communityDownloadPath}`;
}

export function getQobuzCommunityDownloadURL(): string {
  return `https://${QOBUZ_COMMUNITY_BASE}${communityDownloadPath}`;
}

export function getAmazonCommunityDownloadURL(): string {
  return `https://${AMAZON_COMMUNITY_BASE}${communityDownloadPath}`;
}

export function getCommunityAPIKey(): string {
  return COMMUNITY_API_KEY;
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
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000 + 250
          : (attempt + 1) * 5000;
        console.log(`[Community] Rate limited, waiting ${waitMs}ms before retry ${attempt + 1}/${MAX_RETRIES}`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (response.status === 503) {
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
 */
export async function getCommunityStreamUrl(
  tidalTrackId: string,
  preferredQuality: string = 'HI_RES_LOSSLESS',
): Promise<{ url: string; service: string } | null> {
  const quality = preferredQuality.includes('HI_RES') ? '24' : '16';

  const tidalResult = await requestCommunityStream({
    service: 'tidal',
    trackId: tidalTrackId,
    quality,
  });
  if (tidalResult) {
    console.log(`[Community] Got stream URL from Tidal community server`);
    return { url: tidalResult.url, service: 'community-tidal' };
  }

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
