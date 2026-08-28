/**
 * amazon-crypto.ts
 *
 * CENC-encrypted Amazon Music stream decryption. Ported from Monochrome's
 * sw-decrypter.js Service Worker.
 *
 * How Monochrome actually plays Amazon streams (see platform-detection.ts and
 * api.js getStreamUrl):
 *  - On Chromium it uses native EME/CENC (Shaka) - the browser decrypts.
 *  - On Safari/Firefox the service worker pipes the file through
 *    `Mp4DecryptTransformer`, which KEEPS the fragmented-MP4 container and only:
 *      1. decrypts each mdat audio sample with AES-128-CTR (8-byte CENC IVs
 *         padded to a 16-byte counter block, NIST big-endian increment),
 *      2. rewrites the DRM boxes (`sinf`/`senc`/`sbgp`/`sgpd`/`pssh`) to `free`,
 *      3. fixes the `stsd` sample entry: `enca` -> the real codec
 *         (`fLaC`/`mp4a`/`Opus`) and injects a `dfLa` STREAMINFO for FLAC.
 *  The output is always a container - Monochrome never emits a bare `.flac`.
 *
 * The previous Luna port instead rebuilt a standalone raw `.flac`. That only
 * works for genuine FLAC streams, needed a reconstructed STREAMINFO, and
 * produced garbage for AAC/Opus. This rewrite mirrors the proven behaviour:
 * download the file once, decrypt the samples in place (AES-CTR is
 * length-preserving, so all box offsets stay valid), strip DRM, and write a
 * playable `.m4a`. AES-128-CTR comes from @noble/ciphers (pure JS; WebCrypto's
 * `crypto.subtle` is unavailable on Hermes).
 */

import { File, Paths } from 'expo-file-system';
import { ctr } from '@noble/ciphers/aes.js';

/** Let the JS thread service UI work (renders, taps) between long CPU bursts. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ─── MP4 Box Parser ──────────────────────────────────────────────────────────

// Fragmented MP4 stores per-fragment metadata (senc/trun/tfhd) inside `moof`/`traf`
// containers - without walking these, no IVs or sample sizes are ever found.
const CONTAINER_TYPES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'moof', 'traf']);
const DRM_BOX_TYPES = new Set(['sinf', 'senc', 'sbgp', 'sgpd', 'pssh']);

interface Mp4Box {
  type: string;
  offset: number;
  size: number;
  data: Uint8Array;
  children: Mp4Box[];
}

interface FragmentData {
  /** Absolute byte offset of the first audio sample within the mdat payload. */
  payload: number;
  sampleSizes: number[];
  ivs: Uint8Array[];
}

/** Parse MP4 boxes, recursing into container boxes. Handles 32/64-bit sizes. */
function parseMp4Boxes(buffer: Uint8Array): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = 0;

  while (offset + 8 <= buffer.length) {
    let size = readUint32(buffer, offset);
    const type = readString(buffer, offset + 4, 4);
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > buffer.length) break;
      const high = readUint32(buffer, offset + 8);
      const low = readUint32(buffer, offset + 12);
      size = high * 2 ** 32 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = buffer.length - offset;
    }

    if (size < headerSize || offset + size > buffer.length) break;

    const box: Mp4Box = {
      type,
      offset,
      size,
      data: buffer.slice(offset, offset + size),
      children: [],
    };

    if (CONTAINER_TYPES.has(type)) {
      box.children = parseMp4Boxes(buffer.slice(offset + headerSize, offset + size));
    }

    boxes.push(box);
    offset += size;
  }

  return boxes;
}

function findBox(boxes: Mp4Box[], type: string): Mp4Box | null {
  for (const box of boxes) {
    if (box.type === type) return box;
    if (box.children.length > 0) {
      const found = findBox(box.children, type);
      if (found) return found;
    }
  }
  return null;
}

function readUint32(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset] << 24) |
    (buffer[offset + 1] << 16) |
    (buffer[offset + 2] << 8) |
    buffer[offset + 3]
  );
}

function readUint16(buffer: Uint8Array, offset: number): number {
  return (buffer[offset] << 8) | buffer[offset + 1];
}

function readString(buffer: Uint8Array, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(buffer[offset + i]);
  }
  return s;
}

// ─── Fragment Metadata Parsers (tfhd / trun / senc) ─────────────────────────

function parseTfhd(box: Mp4Box): { defaultSampleSize: number } {
  const d = box.data;
  const flags = readUint32(d, 8) & 0xffffff;
  let offset = 16; // 8-byte box header + 4-byte version/flags + 4-byte track_ID
  if (flags & 0x000001) offset += 8; // base_data_offset
  if (flags & 0x000002) offset += 4; // sample_description_index
  if (flags & 0x000008) offset += 4; // default_sample_duration
  let defaultSampleSize = 0;
  if (flags & 0x000010) {
    defaultSampleSize = readUint32(d, offset);
  }
  return { defaultSampleSize };
}

function parseTrun(box: Mp4Box, defaultSampleSize: number): number[] {
  const d = box.data;
  const flags = readUint32(d, 8) & 0xffffff;
  const sampleCount = readUint32(d, 12);
  let offset = 16; // 8-byte box header + 4-byte version/flags + 4-byte sample_count

  if (flags & 0x000001) offset += 4; // data_offset
  if (flags & 0x000004) offset += 4; // first_sample_flags

  const sizes: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    if (flags & 0x000100) offset += 4; // sample_duration
    if (flags & 0x000200) {
      sizes.push(readUint32(d, offset));
      offset += 4;
    } else {
      sizes.push(defaultSampleSize || 0);
    }
    if (flags & 0x000400) offset += 4; // sample_flags
  }
  return sizes;
}

/**
 * CENC uses 8-byte per-sample IVs, padded into a 16-byte AES-CTR counter block
 * (IV first, zero incrementing counter).
 */
function parseSenc(box: Mp4Box): Uint8Array[] {
  const d = box.data;
  const flags = readUint32(d, 8) & 0xffffff;
  const sampleCount = readUint32(d, 12);
  const ivSize = 8;
  let offset = 16; // 8-byte box header + 4-byte version/flags + 4-byte sample_count

  const ivs: Uint8Array[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const iv = new Uint8Array(16);
    for (let j = 0; j < ivSize; j++) {
      iv[j] = d[offset + j];
    }
    ivs.push(iv);
    offset += ivSize;

    if (flags & 0x000002) {
      // Subsample encryption: skip the (clear, encrypted) byte-run pairs.
      const subsampleCount = readUint16(d, offset);
      offset += 2 + subsampleCount * 6;
    }
  }
  return ivs;
}

function parseMoofFragment(moof: Mp4Box): { sampleSizes: number[]; ivs: Uint8Array[] } {
  const sampleSizes: number[] = [];
  const ivs: Uint8Array[] = [];

  const trafs = moof.children.filter((c) => c.type === 'traf');
  for (const traf of trafs) {
    const tfhd = findBox(traf.children, 'tfhd');
    const defaultSampleSize = tfhd ? parseTfhd(tfhd).defaultSampleSize : 0;
    const trun = findBox(traf.children, 'trun');
    const senc = findBox(traf.children, 'senc');
    if (trun) sampleSizes.push(...parseTrun(trun, defaultSampleSize));
    if (senc) ivs.push(...parseSenc(senc));
  }

  return { sampleSizes, ivs };
}

/**
 * Collect the (payload start, sizes, IVs) triplets across every moof -> mdat
 * fragment pair, then decrypt those samples in place. Mirrors sw-decrypter's
 * streaming behaviour, where the mdat payload holds that fragment's samples in
 * the order described by the preceding `trun`.
 */
function collectFragmentedOps(boxes: Mp4Box[]): FragmentData[] {
  const ops: FragmentData[] = [];
  let pending: { sampleSizes: number[]; ivs: Uint8Array[] } | null = null;

  for (const box of boxes) {
    if (box.type === 'moof') {
      pending = parseMoofFragment(box);
      continue;
    }
    if (box.type === 'mdat') {
      const headerSize = readUint32(box.data, 0) === 1 ? 16 : 8;
      const payload = box.offset + headerSize;
      if (pending && pending.sampleSizes.length > 0) {
        ops.push({ payload, sampleSizes: pending.sampleSizes, ivs: pending.ivs });
      }
      pending = null;
      continue;
    }
  }

  return ops;
}

/** Fallback for the rare non-fragmented layout (stsz + movie-level senc). */
function collectNonFragmentedOps(boxes: Mp4Box[]): FragmentData[] {
  const mdat = findBox(boxes, 'mdat');
  const senc = findBox(boxes, 'senc');
  const stsz = findBox(boxes, 'stsz');
  const ivs = senc ? parseSenc(senc) : [];

  if (!mdat) return [];
  const headerSize = readUint32(mdat.data, 0) === 1 ? 16 : 8;
  const payload = mdat.offset + headerSize;

  let sampleSizes: number[] = [];
  if (stsz) {
    const d = stsz.data;
    const defaultSize = readUint32(d, 12); // default_sample_size
    const sampleCount = readUint32(d, 16); // sample_count
    for (let i = 0; i < sampleCount; i++) {
      sampleSizes.push(defaultSize === 0 ? readUint32(d, 20 + i * 4) : defaultSize);
    }
  }

  return sampleSizes.length > 0 ? [{ payload, sampleSizes, ivs }] : [];
}

// ─── Codec Handling ──────────────────────────────────────────────────────────

/**
 * Map the envelope's resource codec (like Monochrome api.js getStreamUrl) to a
 * service-worker-style target container codec.
 */
function mapTargetCodec(codec: string | null | undefined): 'flac' | 'mp4a' | 'opus' {
  const normalized = String(codec || '').toLowerCase();
  if (normalized === 'opus') return 'opus';
  if (normalized === 'aac' || normalized.startsWith('mp4a')) return 'mp4a';
  return 'flac';
}

/**
 * Detect the codec from the `stsd` sample entry when no codec hint is available
 * (the previous port read the wrong offsets, so every stream logged as mp4a).
 */
function detectCodecFromStsd(boxes: Mp4Box[]): 'flac' | 'mp4a' | 'opus' {
  const stsd = findBox(boxes, 'stsd');
  if (!stsd) return 'flac';

  const d = stsd.data;
  const entryCount = readUint32(d, 12);
  if (entryCount <= 0) return 'flac';

  const entryStart = 16; // 8-byte box header + 4-byte version/flags + 4-byte entry_count
  const entrySize = readUint32(d, entryStart);
  const entryType = readString(d, entryStart + 4, 4);

  if (entryType === 'enca') {
    const original = findFrmaFormat(d, entryStart + 8, entrySize - 8);
    return mapTargetCodec(original || 'flac');
  }
  return mapTargetCodec(entryType || 'flac');
}

function findFrmaFormat(d: Uint8Array, start: number, length: number): string | null {
  const end = start + length;
  for (let i = start; i + 8 <= end; i++) {
    if (d[i] === 0x66 && d[i + 1] === 0x72 && d[i + 2] === 0x6d && d[i + 3] === 0x61) {
      return readString(d, i + 4, 4);
    }
  }
  return null;
}

// ─── Container Surgery (ported from sw-decrypter.js) ────────────────────────

function rewriteTypeFree(copy: Uint8Array, offset: number): void {
  copy[offset + 4] = 0x66; // f
  copy[offset + 5] = 0x72; // r
  copy[offset + 6] = 0x65; // e
  copy[offset + 7] = 0x65; // e
}

function renameNestedBoxToFree(boxData: Uint8Array, start: number, size: number): void {
  if (start < 0 || size < 8 || start + size > boxData.length) return;
  boxData[start + 4] = 0x66;
  boxData[start + 5] = 0x72;
  boxData[start + 6] = 0x65;
  boxData[start + 7] = 0x65;
  boxData.fill(0, start + 8, start + size);
}

function hasBoxType(boxData: Uint8Array, type: string): boolean {
  const a = type.charCodeAt(0);
  const b = type.charCodeAt(1);
  const c = type.charCodeAt(2);
  const d = type.charCodeAt(3);
  for (let i = 4; i < boxData.length - 4; i++) {
    if (boxData[i] === a && boxData[i + 1] === b && boxData[i + 2] === c && boxData[i + 3] === d) {
      const size = readUint32(boxData, i - 4);
      if (size >= 8 && i - 4 + size <= boxData.length) return true;
    }
  }
  return false;
}

/** Synthetic 50-byte dfLa box wrapping a STREAMINFO metadata block. */
function syntheticDfLa(): Uint8Array {
  return new Uint8Array([
    0x00, 0x00, 0x00, 0x32, 0x64, 0x66, 0x4c, 0x61, // size=50, 'dfLa'
    0x00, 0x00, 0x00, 0x00, // version/flags
    0x80, 0x00, 0x00, 0x22, // metadata block header (STREAMINFO, 34 bytes)
    0x10, 0x00, 0x10, 0x00, // min/max block size (4096)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // min/max frame size (0)
    0x0a, 0xc4, 0x42, 0xf0, // 44100 Hz, 2 ch, 16-bit (+ high total samples)
    0x00, 0x00, 0x00, 0x00, // low total samples
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // MD5
  ]);
}

/**
 * Rewrite an `stsd` box so a decrypted stream plays without the encryption
 * sample entry: rename `enca` to the real codec, and for FLAC replace the
 * nested `sinf` with a `dfLa` STREAMINFO box. Port of sw-decrypter modifyBox.
 */
function synthesizeStsd(boxData: Uint8Array, targetCodec: 'flac' | 'mp4a' | 'opus'): void {
  const hasExistingDfLa = hasBoxType(boxData, 'dfLa');
  const isFlac = targetCodec === 'flac';

  for (let i = 8; i < boxData.length - 4; i++) {
    if (
      boxData[i] === 0x65 &&
      boxData[i + 1] === 0x6e &&
      boxData[i + 2] === 0x63 &&
      boxData[i + 3] === 0x61 // 'enca'
    ) {
      if (isFlac) {
        boxData[i] = 0x66;
        boxData[i + 1] = 0x4c;
        boxData[i + 2] = 0x61;
        boxData[i + 3] = 0x43; // 'fLaC'
      } else if (targetCodec === 'mp4a') {
        boxData[i] = 0x6d;
        boxData[i + 1] = 0x70;
        boxData[i + 2] = 0x34;
        boxData[i + 3] = 0x61; // 'mp4a'
      } else {
        boxData[i] = 0x4f;
        boxData[i + 1] = 0x70;
        boxData[i + 2] = 0x75;
        boxData[i + 3] = 0x73; // 'Opus'
      }
    }

    if (
      isFlac &&
      boxData[i] === 0x73 &&
      boxData[i + 1] === 0x69 &&
      boxData[i + 2] === 0x6e &&
      boxData[i + 3] === 0x66 // 'sinf'
    ) {
      const sinfSize = readUint32(boxData, i - 4);
      if (hasExistingDfLa) {
        renameNestedBoxToFree(boxData, i - 4, sinfSize);
        continue;
      }

      if (sinfSize >= 50) {
        boxData.set(syntheticDfLa(), i - 4);

        const remaining = sinfSize - 50;
        if (remaining >= 8) {
          const rem = remaining;
          boxData[i - 4 + 50] = (rem >>> 24) & 0xff;
          boxData[i - 4 + 51] = (rem >>> 16) & 0xff;
          boxData[i - 4 + 52] = (rem >>> 8) & 0xff;
          boxData[i - 4 + 53] = rem & 0xff;
          boxData[i - 4 + 54] = 0x66; // f
          boxData[i - 4 + 55] = 0x72; // r
          boxData[i - 4 + 56] = 0x65; // e
          boxData[i - 4 + 57] = 0x65; // e
          boxData.fill(0, i - 4 + 58, i - 4 + sinfSize);
        }
      }
    }
  }
}

/**
 * Rewrite the DRM boxes to `free` and fix the `stsd` sample entry on a fresh
 * copy of the file. All operations are size-preserving, so box offsets remain
 * valid for the player.
 */
function stripDrm(copy: Uint8Array, boxes: Mp4Box[], targetCodec: 'flac' | 'mp4a' | 'opus'): void {
  for (const box of boxes) {
    if (DRM_BOX_TYPES.has(box.type)) {
      rewriteTypeFree(copy, box.offset);
    } else if (box.type === 'stsd') {
      synthesizeStsd(copy.subarray(box.offset, box.offset + box.size), targetCodec);
    }
    if (box.children.length > 0) {
      stripDrm(copy, box.children, targetCodec);
    }
  }
}

// ─── AES-128-CTR Decryption ──────────────────────────────────────────────────

function aesCtrDecrypt(keyBytes: Uint8Array, counter: Uint8Array, data: Uint8Array): Uint8Array {
  const cipher = ctr(keyBytes, counter);
  return cipher.decrypt(data);
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
}

// ─── Main Decrypt Function ───────────────────────────────────────────────────

/**
 * Download a CENC-encrypted Amazon Music stream and produce a playable MP4 by
 * decrypting the audio samples in place (AES-CTR is length-preserving) and
 * stripping the DRM metadata. Returns the local file URI.
 */
export async function decryptStream(
  encryptedUrl: string,
  decryptionKey: string,
  keyId: string | null,
  codecHint?: string | null,
): Promise<string> {
  console.log(`[AmazonCrypto] Fetching encrypted stream: ${encryptedUrl.substring(0, 80)}...`);

  const fullResponse = await fetch(encryptedUrl);
  if (!fullResponse.ok) {
    throw new Error(`Failed to fetch full stream: ${fullResponse.status}`);
  }

  const fullBuffer = new Uint8Array(await fullResponse.arrayBuffer());
  console.log(`[AmazonCrypto] Fetched full stream: ${fullBuffer.length} bytes`);

  const boxes = parseMp4Boxes(fullBuffer);
  const targetCodec = codecHint ? mapTargetCodec(codecHint) : detectCodecFromStsd(boxes);

  // Locate the encrypted samples (fragmented layout, with non-fragmented fallback).
  let ops = collectFragmentedOps(boxes);
  if (ops.length === 0) {
    ops = collectNonFragmentedOps(boxes);
  }

  const totalSamples = ops.reduce((sum, op) => sum + op.sampleSizes.length, 0);
  console.log(`[AmazonCrypto] Codec: ${targetCodec}, Samples: ${totalSamples}`);

  if (totalSamples === 0) {
    throw new Error('No encrypted samples found (unrecognized MP4 layout)');
  }

  const keyBytes = hexToBytes(decryptionKey);

  // Work on a copy, then patch it: strip DRM, decrypt the mdat samples in place.
  const output = new Uint8Array(fullBuffer);
  stripDrm(output, boxes, targetCodec);

  // Decrypt in bounded chunks and yield between them so the JS thread can keep
  // servicing taps/renders - thousands of AES-CTR blocks can otherwise stall UI.
  const YIELD_EVERY = 128;
  let decrypted = 0;
  for (const op of ops) {
    let offset = op.payload;
    const count = Math.min(op.sampleSizes.length, op.ivs.length);
    for (let i = 0; i < count; i++) {
      const size = op.sampleSizes[i];
      if (size <= 0 || offset + size > output.length) break;
      const ciphertext = output.subarray(offset, offset + size);
      output.set(aesCtrDecrypt(keyBytes, op.ivs[i], ciphertext), offset);
      offset += size;
      decrypted++;
      if (decrypted % YIELD_EVERY === 0) {
        await yieldToEventLoop();
      }
    }
  }

  console.log(`[AmazonCrypto] Decrypting ${decrypted} samples...`);

  // Native Uint8Array write in chunks - no whole-buffer JS base64 encode.
  const file = new File(Paths.cache, `amazon_decrypted_${Date.now()}.m4a`);
  file.create();
  const WRITE_CHUNK = 1024 * 1024;
  for (let i = 0; i < output.length; i += WRITE_CHUNK) {
    file.write(output.subarray(i, i + WRITE_CHUNK), { append: true });
    await yieldToEventLoop();
  }

  console.log(`[AmazonCrypto] Decrypted audio written to: ${file.uri}`);
  return file.uri;
}