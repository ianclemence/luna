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
 *
 * `decryptStreamProgressive` is the web-parity path used for playback: it
 * streams the response body, decrypts only the first couple of fragments
 * (~4MB, 1-2s of JS work), hands the player a local HLS playlist it can start
 * immediately, and keeps decrypting the remaining fragments in the background
 * while audio plays - see the section comment further down.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { ctr } from '@noble/ciphers/aes.js';

/** Let the JS thread service UI work (renders, taps) between long CPU bursts. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Yield to the JS thread after this many decrypted samples. */
const YIELD_EVERY = 128;

// ─── MP4 Box Parser ──────────────────────────────────────────────────────────

// Fragmented MP4 stores per-fragment metadata (senc/trun/tfhd) inside `moof`/`traf`
// containers - without walking these, no IVs or sample sizes are ever found.
// `saiz`/`saio` carry per-sample auxiliary (encryption) info: ExoPlayer requires a
// TrackEncryptionBox when they're present (FragmentedMp4Extractor.parseTraf does
// checkNotNull(encryptionBox) for saiz) - since we also strip `tenc`/`sinf` from
// stsd, leaving saiz/saio crashes playback with an NPE ("Source error").
const CONTAINER_TYPES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'moof', 'traf']);
const DRM_BOX_TYPES = new Set(['sinf', 'senc', 'sbgp', 'sgpd', 'pssh', 'saiz', 'saio']);

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

/**
 * Parse MP4 boxes, recursing into container boxes. Handles 32/64-bit sizes.
 *
 * `baseOffset` translates child box offsets into ABSOLUTE file offsets: the
 * recursion parses `buffer.slice(...)` views, so without the base every child
 * offset would be relative to its parent slice. Downstream surgery
 * (stripDrm/synthesizeStsd) patches `copy` at `box.offset` — with relative
 * offsets those writes landed at the wrong absolute positions (e.g. a `senc`
 * at depth 3 corrupted the file header instead of itself), producing a file
 * the player rejects with "Source error".
 */
function parseMp4Boxes(buffer: Uint8Array, baseOffset = 0): Mp4Box[] {
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
      offset: baseOffset + offset,
      size,
      data: buffer.slice(offset, offset + size),
      children: [],
    };

    if (CONTAINER_TYPES.has(type)) {
      box.children = parseMp4Boxes(
        buffer.slice(offset + headerSize, offset + size),
        baseOffset + offset + headerSize,
      );
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

function parseTfhd(box: Mp4Box): { defaultSampleSize: number; defaultSampleDuration: number } {
  const d = box.data;
  const flags = readUint32(d, 8) & 0xffffff;
  let offset = 16; // 8-byte box header + 4-byte version/flags + 4-byte track_ID
  if (flags & 0x000001) offset += 8; // base_data_offset
  if (flags & 0x000002) offset += 4; // sample_description_index
  let defaultSampleDuration = 0;
  if (flags & 0x000008) {
    defaultSampleDuration = readUint32(d, offset);
    offset += 4; // default_sample_duration
  }
  let defaultSampleSize = 0;
  if (flags & 0x000010) {
    defaultSampleSize = readUint32(d, offset);
    offset += 4; // default_sample_size
  }
  return { defaultSampleSize, defaultSampleDuration };
}

function parseTrun(
  box: Mp4Box,
  defaultSampleSize: number,
  defaultSampleDuration: number,
): { sizes: number[]; durations: number[] } {
  const d = box.data;
  const flags = readUint32(d, 8) & 0xffffff;
  const sampleCount = readUint32(d, 12);
  let offset = 16; // 8-byte box header + 4-byte version/flags + 4-byte sample_count

  if (flags & 0x000001) offset += 4; // data_offset
  if (flags & 0x000004) offset += 4; // first_sample_flags

  const sizes: number[] = [];
  const durations: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    if (flags & 0x000100) {
      durations.push(readUint32(d, offset));
      offset += 4; // sample_duration
    } else {
      durations.push(defaultSampleDuration);
    }
    if (flags & 0x000200) {
      sizes.push(readUint32(d, offset));
      offset += 4;
    } else {
      sizes.push(defaultSampleSize || 0);
    }
    if (flags & 0x000400) offset += 4; // sample_flags
  }
  return { sizes, durations };
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

function parseMoofFragment(moof: Mp4Box): {
  sampleSizes: number[];
  sampleDurations: number[];
  ivs: Uint8Array[];
} {
  const sampleSizes: number[] = [];
  const sampleDurations: number[] = [];
  const ivs: Uint8Array[] = [];

  const trafs = moof.children.filter((c) => c.type === 'traf');
  for (const traf of trafs) {
    const tfhd = findBox(traf.children, 'tfhd');
    const defaults = tfhd
      ? parseTfhd(tfhd)
      : { defaultSampleSize: 0, defaultSampleDuration: 0 };
    const trun = findBox(traf.children, 'trun');
    const senc = findBox(traf.children, 'senc');
    if (trun) {
      const table = parseTrun(trun, defaults.defaultSampleSize, defaults.defaultSampleDuration);
      sampleSizes.push(...table.sizes);
      sampleDurations.push(...table.durations);
    }
    if (senc) ivs.push(...parseSenc(senc));
  }

  return { sampleSizes, sampleDurations, ivs };
}

/**
 * Collect the (payload start, sizes, IVs) triplets across every moof -> mdat
 * fragment pair, then decrypt those samples in place. Mirrors sw-decrypter's
 * streaming behaviour, where the mdat payload holds that fragment's samples in
 * the order described by the preceding `trun`.
 */
function collectFragmentedOps(boxes: Mp4Box[]): FragmentData[] {
  const ops: FragmentData[] = [];
  let pending: ReturnType<typeof parseMoofFragment> | null = null;

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

/** Decrypt a contiguous range of fragments in place. Yields to keep UI alive. */
async function decryptOpsInPlace(
  output: Uint8Array,
  ops: FragmentData[],
  keyBytes: Uint8Array,
  start: number,
  end: number,
): Promise<number> {
  let decrypted = 0;
  for (let o = start; o < end; o++) {
    const op = ops[o];
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
  return decrypted;
}

/** Write (or overwrite) the whole buffer to disk in chunks. */
async function writeOutputToFile(file: File, output: Uint8Array): Promise<void> {
  const WRITE_CHUNK = 1024 * 1024;
  let first = true;
  for (let i = 0; i < output.length; i += WRITE_CHUNK) {
    // First chunk truncates (overwrites) any prior content; the rest append.
    file.write(output.subarray(i, i + WRITE_CHUNK), { append: !first });
    first = false;
    await yieldToEventLoop();
  }
}

/**
 * Download a CENC-encrypted Amazon Music stream, decrypt EVERY sample, and
 * produce a complete local `.m4a`. Blocks until the whole stream is
 * downloaded and decrypted - playback cannot start before it resolves.
 *
 * This is the fallback/full path (used when response streaming is
 * unavailable). The playback path is `decryptStreamProgressive`, which starts
 * after only the first couple of fragments.
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

  await decryptOpsInPlace(output, ops, keyBytes, 0, ops.length);

  // Native Uint8Array write in chunks - no whole-buffer JS base64 encode.
  const file = new File(Paths.cache, `amazon_decrypted_${Date.now()}.m4a`);
  file.create();
  await writeOutputToFile(file, output);

  console.log(`[AmazonCrypto] Decrypted audio written to: ${file.uri}`);
  return file.uri;
}

// ─── Progressive Decrypt (local HLS pipeline) ────────────────────────────────
//
// Web-app parity for playback: instead of downloading + decrypting the entire
// ~30MB stream before play() can be called, this pipeline:
//
//   1. streams the encrypted response body via expo/fetch,
//   2. writes an init segment (ftyp + moov, DRM stripped) and decrypts only
//      the first HEAD_SEGMENTS moof/mdat fragments (~4MB, 1-2s of JS work),
//   3. resolves with a LOCAL HLS playlist URI that expo-audio starts playing
//      immediately,
//   4. keeps decrypting the remaining fragments in the background, appending
//      each to an `#EXT-X-PLAYLIST-TYPE:EVENT` playlist as it completes.
//
// The EVENT playlist is what makes this safe: when the player catches up with
// the last written segment it re-polls the playlist after targetDuration
// instead of hitting EOF, so playback never ends early (a growing flat .m4a
// would end playback at EOF, and pre-writing an encrypted tail would feed the
// decoder garbage). Once the stream is fully decrypted, `#EXT-X-ENDLIST` is
// appended and the track ends naturally; the finished directory is a complete
// local VOD HLS asset that the decrypted-audio cache can replay instantly.

const PROGRESSIVE_DIR_PREFIX = 'amazon_prog_';
/** Fragments decrypted before playback starts. 1 = start after the first
 * fragment is ready (~10s of audio downloaded + decrypted). */
const HEAD_SEGMENTS = 1;
/** Bytes grabbed from the tail of the stream to locate a moov-at-end init
 * segment early, so head fragments can decrypt while the file still downloads. */
const EARLY_INIT_TAIL = 4 * 1024 * 1024;
/** Directories from crashed/abandoned sessions are swept after this long. */
const STALE_PROGRESSIVE_DIR_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * Finalized VOD assets are owned by the decrypted-audio LRU cache (music-service)
 * and persist across sessions - they are only hard-swept after this long, as a
 * safety net for entries lost from AsyncStorage (which would otherwise leak).
 */
const FINALIZED_CACHE_DIR_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProgressiveDecryptResult {
  /**
   * file:// URI of the (growing) local HLS playlist. Playable immediately once
   * `headReady` has resolved and the underlying ExoPlayer has finished parsing
   * the EVENT playlist.
   */
  playlistUri: string;
  /**
   * Resolves once the stream is finished. `true` when the ENTIRE stream was
   * decrypted (the directory is a complete VOD asset worth caching), `false`
   * when the playlist was finalized early (mid-stream failure after playback
   * already started).
   */
  done: Promise<boolean>;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** mdhd carries the audio timescale (EXTINF seconds); mvhd is the fallback. */
function parseMediaTimescale(boxes: Mp4Box[]): number {
  for (const type of ['mdhd', 'mvhd']) {
    const box = findBox(boxes, type);
    if (!box) continue;
    const version = box.data[8];
    const timescaleOffset = version === 1 ? 28 : 20;
    if (timescaleOffset + 4 <= box.data.length) {
      const timescale = readUint32(box.data, timescaleOffset);
      if (timescale > 0) return timescale;
    }
  }
  return 0;
}

/**
 * Decrypt one fragment (moof + mdat) in place and strip its DRM boxes.
 * Returns the decrypted sample count, the summed sample duration (in timescale
 * units) and the decrypted payload bytes for the playlist's #EXTINF entry and
 * lead-in accounting.
 */
async function decryptFragmentInPlace(
  seg: Uint8Array,
  keyBytes: Uint8Array,
  targetCodec: 'flac' | 'mp4a' | 'opus',
): Promise<{ sampleCount: number; duration: number; bytes: number }> {
  const boxes = parseMp4Boxes(seg);
  const moof = boxes.find((b) => b.type === 'moof');
  const mdat = boxes.find((b) => b.type === 'mdat');
  if (!moof || !mdat) {
    throw new Error('Fragment is missing moof/mdat');
  }

  const { sampleSizes, sampleDurations, ivs } = parseMoofFragment(moof);
  const headerSize = readUint32(seg, mdat.offset) === 1 ? 16 : 8;
  const payload = mdat.offset + headerSize;

  let offset = payload;
  const count = Math.min(sampleSizes.length, ivs.length);
  let decrypted = 0;
  let decryptedBytes = 0;
  for (let i = 0; i < count; i++) {
    const size = sampleSizes[i];
    if (size <= 0 || offset + size > seg.length) break;
    const ciphertext = seg.subarray(offset, offset + size);
    seg.set(aesCtrDecrypt(keyBytes, ivs[i], ciphertext), offset);
    offset += size;
    decrypted++;
    decryptedBytes += size;
    if (decrypted % YIELD_EVERY === 0) {
      await yieldToEventLoop();
    }
  }

  // senc/saiz/saio/sbgp/sgpd live inside moof/traf; stsd only exists in moov.
  stripDrm(seg, boxes, targetCodec);

  let duration = 0;
  for (const d of sampleDurations) duration += d;
  return { sampleCount: decrypted, duration, bytes: decryptedBytes };
}

/**
 * Delete leftover progressive directories: unfinished dirs (crashed sessions)
 * after 24h, finalized VOD cache assets after 7 days.
 */
function sweepStaleProgressiveDirs(root: Directory): void {
  try {
    const staleCutoff = Date.now() - STALE_PROGRESSIVE_DIR_AGE_MS;
    const cacheCutoff = Date.now() - FINALIZED_CACHE_DIR_AGE_MS;
    for (const entry of root.list()) {
      if (!(entry instanceof Directory) || !entry.name.startsWith(PROGRESSIVE_DIR_PREFIX)) {
        continue;
      }
      const stamp = Number(entry.name.slice(PROGRESSIVE_DIR_PREFIX.length).split('_')[0]);
      if (!Number.isFinite(stamp) || stamp <= 0) continue;
      // A finalized playlist (ENDLIST present) is a complete VOD asset managed
      // by the decrypted-audio cache; anything else is session debris.
      let finalized = false;
      try {
        finalized = new File(entry, 'index.m3u8').textSync().includes('#EXT-X-ENDLIST');
      } catch {}
      const cutoff = finalized ? cacheCutoff : staleCutoff;
      if (stamp < cutoff) {
        entry.delete();
      }
    }
  } catch {}
}

export async function decryptStreamProgressive(
  encryptedUrl: string,
  decryptionKey: string,
  keyId: string | null,
  codecHint?: string | null,
  leadInBytes?: number,
): Promise<ProgressiveDecryptResult> {
  console.log(`[AmazonCrypto] Progressive fetch: ${encryptedUrl.substring(0, 80)}...`);

  const keyBytes = hexToBytes(decryptionKey);

  const cacheRoot = new Directory(Paths.cache);
  sweepStaleProgressiveDirs(cacheRoot);

  const dir = new Directory(
    cacheRoot,
    `${PROGRESSIVE_DIR_PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
  );
  dir.create();

  const initFile = new File(dir, 'init.mp4');
  const playlistFile = new File(dir, 'index.m3u8');

  let targetCodec: 'flac' | 'mp4a' | 'opus' | null = codecHint ? mapTargetCodec(codecHint) : null;
  let timescale = 0;
  let ftypWritten = false;

  const initParts: Uint8Array[] = [];
  let initWritten = false;
  // The moof / mdat boxes pair up in order, but with the previous implementation
  // every pair blocked the stream reader while the JS thread decrypted and wrote
  // it. We now tag each pair with its sequence number and let the reader keep
  // pumping data while decryption runs in the background - the HLS playlist
  // only grows in monotonic order so the player never sees an out-of-range
  // MEDIA-SEQUENCE.
  let pendingMoof: { bytes: Uint8Array; seq: number } | null = null;
  let fragmentSeq = 0;
  // Completed (moof+mdat) pairs queued while moov is still in flight, processed
  // in FIFO order once `initWritten` flips to true.
  const queuedFragments: { bytes: Uint8Array; seq: number }[] = [];
  // Results from background decryption, keyed by fragment sequence. Drained in
  // order so the playlist, fast-start file, and `headReady` all see fragments
  // monotonically even though decryption itself is parallel.
  interface FragmentResult {
    sampleCount: number;
    duration: number;
    bytes: number;
  }
  const pendingResults = new Map<number, FragmentResult>();
  let nextSeqToEmit = 0;

  const segmentDurations: number[] = [];
  const segmentLines: string[] = [];
  let segmentIndex = 0;
  let totalDuration = 0;
  let leadInPayloadBytes = 0;

  let settleHead!: (result: ProgressiveDecryptResult) => void;
  let failHead!: (error: unknown) => void;
  let resolveDone!: (complete: boolean) => void;
  let headSettled = false;
  const headPromise = new Promise<ProgressiveDecryptResult>((resolve, reject) => {
    settleHead = resolve;
    failHead = reject;
  });
  // Deferred (not an IIFE) so pipeline closures can reference it safely.
  const done = new Promise<boolean>((resolve) => {
    resolveDone = resolve;
  });

  const writePlaylist = (finished: boolean) => {
    let targetDuration = 1;
    for (const d of segmentDurations) {
      targetDuration = Math.max(targetDuration, Math.ceil(d));
    }
    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:7',
      '#EXT-X-INDEPENDENT-SEGMENTS',
      `#EXT-X-TARGETDURATION:${targetDuration}`,
      '#EXT-X-PLAYLIST-TYPE:EVENT',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-MAP:URI="init.mp4"',
      ...segmentLines,
    ];
    if (finished) lines.push('#EXT-X-ENDLIST');
    playlistFile.write(lines.join('\n') + '\n');
  };

  const emitReadyFragments = async () => {
    while (true) {
      const result = pendingResults.get(nextSeqToEmit);
      if (!result) break;
      const seq = nextSeqToEmit;
      pendingResults.delete(seq);
      nextSeqToEmit++;

      const seg = queuedFragments[seq]?.bytes;
      if (!seg) continue;

      if (result.sampleCount === 0) continue;

      const segFile = new File(dir, `seg_${segmentIndex}.m4s`);
      segFile.create();
      segFile.write(seg);

      const seconds = timescale > 0 && result.duration > 0 ? result.duration / timescale : 4.0;
      segmentDurations.push(seconds);
      totalDuration += seconds;
      leadInPayloadBytes += result.bytes;
      segmentLines.push(`#EXTINF:${seconds.toFixed(5)},`, `seg_${segmentIndex}.m4s`);
      segmentIndex++;
      writePlaylist(false);

      // Playback starts after HEAD_SEGMENTS fragments AND (when a caller asked
      // for one) at least `leadInBytes` of decrypted payload.
      const headReady =
        segmentIndex >= HEAD_SEGMENTS &&
        (leadInBytes == null || leadInPayloadBytes >= leadInBytes);
      if (headReady && !headSettled) {
        console.log(
          `[AmazonCrypto] Head ready: ${segmentIndex} segments, ${totalDuration.toFixed(1)}s of audio in ${Date.now() - startedAt}ms`,
        );
        headSettled = true;
        settleHead({ playlistUri: playlistFile.uri, done });
      }
    }
  };

  /**
   * Fire-and-forget: kicks off decryption in the background and parks the
   * result. The download loop never waits on this - it keeps streaming bytes
   * into the accumulator while the JS thread chews through fragments.
   */
  const scheduleDecrypt = (seg: Uint8Array, seq: number) => {
    void decryptFragmentInPlace(seg, keyBytes, targetCodec!)
      .then((result) => {
        pendingResults.set(seq, result);
        return emitReadyFragments();
      })
      .catch((error) => {
        console.warn(`[AmazonCrypto] Fragment ${seq} decrypt failed:`, error);
        pendingResults.set(seq, { sampleCount: 0, duration: 0, bytes: 0 });
        return emitReadyFragments();
      });
  };

  const handleBox = (type: string, bytes: Uint8Array): void => {
    if (type === 'ftyp') {
      // The early-init probe may have already contributed ftyp; don't duplicate
      // it into initParts (a double ftyp would corrupt init.mp4).
      if (!ftypWritten) {
        initParts.push(bytes);
        ftypWritten = true;
      }
      return;
    }
    if (type === 'moov') {
      // An early-init probe (tail Range request) may have already built
      // init.mp4. moov is position-independent, so the probe's copy is valid;
      // skip re-initialising to avoid a corrupt double-moov init segment.
      if (initWritten) return;
      const moovCopy = new Uint8Array(bytes);
      const boxes = parseMp4Boxes(moovCopy);
      if (!targetCodec) targetCodec = detectCodecFromStsd(boxes);
      stripDrm(moovCopy, boxes, targetCodec);
      timescale = parseMediaTimescale(boxes);

      initParts.push(moovCopy);
      initFile.create();
      initFile.write(concatBytes(initParts));

      initWritten = true;
      playlistFile.create();
      writePlaylist(false);
      console.log(
        `[AmazonCrypto] init.mp4 written (codec=${targetCodec}, timescale=${timescale})`,
      );

      // Drain anything that piled up while moov was still in flight, kicking off
      // decryptions for each (the order is preserved because we tagged every
      // pair with its sequence number).
      for (const frag of queuedFragments) {
        scheduleDecrypt(frag.bytes, frag.seq);
      }
      return;
    }
    if (type === 'moof') {
      pendingMoof = { bytes, seq: fragmentSeq };
      return;
    }
    if (type === 'mdat') {
      if (pendingMoof) {
        const encrypted = concatBytes([pendingMoof.bytes, bytes]);
        const seg = new Uint8Array(encrypted);
        const seq = pendingMoof.seq;
        pendingMoof = null;
        fragmentSeq++;
        queuedFragments.push({ bytes: seg, seq });
        if (initWritten) {
          scheduleDecrypt(seg, seq);
        }
      }
      return;
    }
    // Other top-level boxes (free/skip/sidx/...) are not needed for playback.
  };

  /** Consume every complete top-level box from the front of the accumulator. */
  const extractCompleteBoxes = (
    acc: Uint8Array,
    streamEnded: boolean,
  ): Uint8Array => {
    let offset = 0;
    while (true) {
      if (offset + 8 > acc.length) break;
      let size = readUint32(acc, offset);
      let headerSize = 8;
      if (size === 1) {
        if (offset + 16 > acc.length) break;
        const high = readUint32(acc, offset + 8);
        const low = readUint32(acc, offset + 12);
        size = high * 2 ** 32 + low;
        headerSize = 16;
      } else if (size === 0) {
        // Box extends to end of stream - only completable at stream end.
        if (!streamEnded) return acc.subarray(offset);
        size = acc.length - offset;
      }
      if (size < headerSize) break;
      if (offset + size > acc.length) {
        if (streamEnded) {
          // Truncated final box - nothing usable.
          return new Uint8Array(0);
        }
        break;
      }
      const bytes = acc.slice(offset, offset + size);
      // SYNCHRONOUS box dispatch: never blocks the stream reader on JS work.
      handleBox(readString(acc, offset + 4, 4), bytes);
      offset += size;
    }
    return offset > 0 ? acc.slice(offset) : acc;
  };

  /** Locate the first top-level box of `type` anywhere in `buf`. */
  const findTopLevelBox = (buf: Uint8Array, type: string): Uint8Array | null => {
    let offset = 0;
    while (offset + 8 <= buf.length) {
      let size = readUint32(buf, offset);
      if (size === 1) {
        if (offset + 16 > buf.length) break;
        const high = readUint32(buf, offset + 8);
        const low = readUint32(buf, offset + 12);
        size = high * 2 ** 32 + low;
      }
      if (size < 8 || offset + size > buf.length) break;
      if (readString(buf, offset + 4, 4) === type) {
        return buf.slice(offset, offset + size);
      }
      offset += size;
    }
    return null;
  };

  /**
   * For moov-at-end streams, the init segment isn't available until the whole
   * file downloads - which blocks the first fragment from decrypting. Grab a
   * small head range (for ftyp) and the tail range (for moov) in parallel so
   * init.mp4 is ready early and head fragments decrypt while the main stream is
   * still downloading. Purely additive: any failure silently falls back to the
   * normal serial path (init set when moov arrives in the main stream).
   */
  const tryEarlyInit = async () => {
    try {
      const headResp = await expoFetch(encryptedUrl, {
        headers: { Range: 'bytes=0-65535' },
      });
      if (!headResp.ok) return;
      const headBuf = new Uint8Array(await headResp.arrayBuffer());
      const ftyp = findTopLevelBox(headBuf, 'ftyp');
      if (ftyp && !ftypWritten) {
        initParts.push(ftyp);
        ftypWritten = true;
      }

      // If moov is already in the head (common case), we're done immediately.
      const headMoov = findTopLevelBox(headBuf, 'moov');
      const totalMatch = /bytes\s+\d+-\d+\/(\d+)/.exec(
        headResp.headers?.get?.('Content-Range') ?? '',
      );
      const total = totalMatch ? parseInt(totalMatch[1], 10) : NaN;

      let moovBytes: Uint8Array | null = headMoov;
      if (!moovBytes && Number.isFinite(total) && total > 0) {
        const start = Math.max(0, total - EARLY_INIT_TAIL);
        const tailResp = await expoFetch(encryptedUrl, {
          headers: { Range: `bytes=${start}-` },
        });
        if (!tailResp.ok) return;
        const tailBuf = new Uint8Array(await tailResp.arrayBuffer());
        moovBytes = findTopLevelBox(tailBuf, 'moov');
      }
      if (!moovBytes || initWritten) return;

      const moovCopy = new Uint8Array(moovBytes);
      const boxes = parseMp4Boxes(moovCopy);
      if (!targetCodec) targetCodec = detectCodecFromStsd(boxes);
      stripDrm(moovCopy, boxes, targetCodec);
      timescale = parseMediaTimescale(boxes);
      initParts.push(moovCopy);
      initFile.create();
      initFile.write(concatBytes(initParts));
      initWritten = true;
      playlistFile.create();
      writePlaylist(false);
      console.log(
        `[AmazonCrypto] Early init from probe (codec=${targetCodec}, timescale=${timescale})`,
      );
      for (const frag of queuedFragments) scheduleDecrypt(frag.bytes, frag.seq);
    } catch (e) {
      console.warn('[AmazonCrypto] early-init probe failed, using serial path:', e);
    }
  };

  // Fire-and-forget: the download/decrypt pipeline runs in the background;
  // progress is reported through `headPromise` and `done`.
  const startedAt = Date.now();
  void (async () => {
    // Fire the early-init probe in the background so it doesn't block the main
    // stream fetch (which is the critical path for head-ready).
    void tryEarlyInit();
    try {
      const response = await expoFetch(encryptedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch stream: ${response.status}`);
      }

      const reader = response.body?.getReader() ?? null;
      if (!reader) {
        // No streaming body available (unsupported runtime): buffer the whole
        // response, then run the same box pipeline over it. Degrades to the
        // download-then-play behaviour but keeps the output format identical.
        const full = new Uint8Array(await response.arrayBuffer());
        extractCompleteBoxes(full, true);
      } else {
        let acc: Uint8Array = new Uint8Array(0);
        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (value && value.length > 0) {
            acc = concatBytes([acc, value]);
          }
          acc = extractCompleteBoxes(acc, streamDone === true);
          if (streamDone) break;
        }
      }

      // Wait for any in-flight decryptions so `done` reflects the whole stream.
      while (nextSeqToEmit < fragmentSeq || pendingResults.size > 0) {
        await yieldToEventLoop();
      }

      if (initWritten) {
        writePlaylist(true);
        console.log(
          `[AmazonCrypto] Progressive decrypt finished: ${segmentIndex} segments, ${totalDuration.toFixed(1)}s`,
        );
      }
      if (!headSettled) {
        if (initWritten && segmentIndex > 0) {
          headSettled = true;
          settleHead({ playlistUri: playlistFile.uri, done });
          resolveDone(true);
        } else {
          try {
            dir.delete();
          } catch {}
          failHead(new Error('No playable fragments in stream'));
          resolveDone(false);
        }
      } else {
        // Entire stream decrypted: the directory is now a complete VOD asset.
        resolveDone(true);
      }
    } catch (error) {
      if (!headSettled) {
        try {
          dir.delete();
        } catch {}
        failHead(error);
        resolveDone(false);
        return;
      }
      // Mid-stream failure after playback started: finalize what we have so
      // the track ends gracefully instead of buffering forever. Resolves
      // `false` so callers do NOT cache the partial asset as complete.
      console.warn('[AmazonCrypto] Progressive decrypt failed after head:', error);
      try {
        if (initWritten) writePlaylist(true);
      } catch {}
      resolveDone(false);
    }
  })();

  return headPromise;
}