/**
 * amazon-service.ts
 *
 * Amazon Music streaming integration ported from Monochrome (js/api.js).
 * Uses the amz.geeked.wtf API proxy to fetch encrypted FLAC streams
 * from Amazon Music's catalog.
 *
 * Ported from: D:\laragon\www\monochrome\js\api.js (getAmazonMusicStreamUrl)
 *
 * NOTE: Amazon Music streams are CENC-encrypted FLAC in MP4 containers.
 * In the web app, decryption happens via a Service Worker (sw-decrypter.js).
 * In React Native, we use expo-crypto for AES-CTR decryption.
 */

import { amazonCrypto } from './amazon-crypto';

const AMAZON_API_BASE = 'https://amz.geeked.wtf';
const AMAZON_TIMEOUT = 20000;

// ─── Quality Mapping ─────────────────────────────────────────────────────────

export function getAmazonQuality(quality: string): string {
  if (quality.includes('HI_RES_LOSSLESS') || quality.includes('HI_RES')) return 'UHD';
  if (quality.includes('LOSSLESS')) return 'HD';
  if (quality === 'HIGH') return 'SD_HIGH';
  if (quality === 'LOW') return 'SD_LOW';
  return 'SD_MEDIUM';
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AmazonStreamResult {
  url: string;
  decryptionKey: string | null;
  keyId: string | null;
  quality: string;
  asin: string | null;
  replayGain: {
    programLoudness: number;
    peakAmplitude: number;
  } | null;
}

// ─── Track Lookup ────────────────────────────────────────────────────────────

interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
}

/**
 * Look up a track on Amazon Music via the community API proxy.
 * Returns stream URL + decryption key for CENC-encrypted FLAC.
 */
export async function getAmazonStream(
  track: TrackMetadata,
  quality: string = 'HI_RES_LOSSLESS',
): Promise<AmazonStreamResult | null> {
  const amazonQuality = getAmazonQuality(quality);

  const params = new URLSearchParams({
    track: track.title,
    duration: String(Math.round(track.duration / 1000)),
    album: track.album,
    artist: track.artist,
    quality: amazonQuality,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AMAZON_TIMEOUT);

    const response = await fetch(
      `${AMAZON_API_BASE}/api/track/?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 428) {
      console.warn(`[Amazon] Auth required (${response.status}), track may need Turnstile`);
      return null;
    }

    if (!response.ok) {
      console.warn(`[Amazon] API returned ${response.status}`);
      return null;
    }

    const data = await response.json() as any;

    if (!data.stream_url) {
      console.warn(`[Amazon] No stream_url in response:`, Object.keys(data));
      return null;
    }

    return {
      url: data.stream_url,
      decryptionKey: data.decryption_key || null,
      keyId: data.key_id || null,
      quality: data.quality_selected || amazonQuality,
      asin: data.asin || null,
      replayGain: data.replay_gain
        ? {
            programLoudness: data.replay_gain.program_loudness_lufs ?? -14,
            peakAmplitude: data.replay_gain.peak_amplitude_db ?? 0,
          }
        : null,
    };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.warn(`[Amazon] Request timed out`);
    } else {
      console.warn(`[Amazon] Request failed:`, e.message);
    }
    return null;
  }
}

/**
 * Try to get an Amazon Music stream using Tidal track metadata.
 * Fetches track info from Tidal to get title/artist/album/duration,
 * then looks up the same track on Amazon Music.
 */
export async function getAmazonStreamFromTidal(
  tidalTrackId: string,
  tidalTrackInfo: {
    title: string;
    artist: string;
    album: string;
    duration: number;
  },
  quality: string = 'HI_RES_LOSSLESS',
): Promise<AmazonStreamResult | null> {
  return getAmazonStream(tidalTrackInfo, quality);
}

/**
 * Attempt to decrypt a CENC-encrypted Amazon Music FLAC stream.
 * Returns a local file URI pointing to the decrypted audio.
 */
export async function decryptAmazonStream(
  encryptedUrl: string,
  decryptionKey: string,
  keyId: string | null,
): Promise<string | null> {
  try {
    return await amazonCrypto.decryptStream(encryptedUrl, decryptionKey, keyId);
  } catch (e: any) {
    console.warn(`[Amazon] Decryption failed:`, e.message);
    return null;
  }
}
