/**
 * eq-presets.ts
 *
 * 10-band graphic EQ presets interpolated from Monochrome's 16-band presets.
 *
 * Reference: D:\laragon\www\monochrome\js\audio-context.js (EQ_PRESETS_16)
 *            D:\laragon\www\monochrome\js\equalizer.js (EQ_PRESETS_16BAND)
 *
 * Frequency bands: 31, 62, 125, 250, 500, 1K, 2K, 4K, 8K, 16K Hz
 * Gain range: -12 dB to +12 dB
 */

export const EQ_BAND_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_BAND_LABELS = ['31', '62', '125', '250', '500', '1K', '2K', '4K', '8K', '16K'];

export const EQ_GAIN_MIN = -12;
export const EQ_GAIN_MAX = 12;
export const EQ_DEFAULT_GAIN = 0;

export interface EqPreset {
  name: string;
  gains: number[]; // 10 values, one per band
}

// 16-band presets from Monochrome (interpolated to 10 bands below)
const PRESETS_16: Record<string, number[]> = {
  flat:            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass_boost:      [6, 5, 4.5, 4, 3, 2, 1, 0.5, 0, 0, 0, 0, 0, 0, 0, 0],
  bass_reducer:    [-6, -5, -4, -3, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  treble_boost:    [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 5.5, 6],
  treble_reducer:  [0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -2, -3, -4, -5, -5.5, -6],
  vocal_boost:     [-2, -1, 0, 0, 1, 2, 3, 4, 4, 3, 2, 1, 0, 0, -1, -2],
  loudness:        [5, 4, 3, 1, 0, -1, -1, 0, 0, 1, 2, 3, 4, 4.5, 4, 3],
  rock:            [4, 3.5, 3, 2, -1, -2, -1, 1, 2, 3, 3.5, 4, 4, 3, 2, 1],
  pop:             [-1, 0, 1, 2, 3, 3, 2, 1, 0, 1, 2, 2, 2, 2, 1, 0],
  classical:       [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 2],
  jazz:            [3, 2, 1, 1, -1, -1, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2],
  electronic:      [4, 3.5, 3, 1, 0, -1, 0, 1, 2, 3, 3, 2, 2, 3, 4, 3.5],
  hip_hop:         [5, 4.5, 4, 3, 1, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2],
  r_and_b:         [3, 5, 4, 2, 1, 0, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1],
  acoustic:        [3, 2, 1, 1, 2, 2, 1, 0, 0, 1, 1, 2, 3, 3, 2, 1],
  podcast:         [-3, -2, -1, 0, 1, 2, 3, 4, 4, 3, 2, 1, 0, -1, -2, -3],
};

function interpolate16to10(preset16: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < 10; i++) {
    const sourceIndex = (i / 9) * 15; // Map 0..9 → 0..15
    const indexLow = Math.floor(sourceIndex);
    const indexHigh = Math.min(Math.ceil(sourceIndex), 15);
    const fraction = sourceIndex - indexLow;
    const low = preset16[indexLow] || 0;
    const high = preset16[indexHigh] || 0;
    result.push(Math.round((low + (high - low) * fraction) * 10) / 10);
  }
  return result;
}

function buildPreset(name: string, gains16: number[]): EqPreset {
  return { name, gains: interpolate16to10(gains16) };
}

export const EQ_PRESETS: Record<string, EqPreset> = {
  flat:           buildPreset('Flat', PRESETS_16.flat),
  bass_boost:     buildPreset('Bass Boost', PRESETS_16.bass_boost),
  bass_reducer:   buildPreset('Bass Reducer', PRESETS_16.bass_reducer),
  treble_boost:   buildPreset('Treble Boost', PRESETS_16.treble_boost),
  treble_reducer: buildPreset('Treble Reducer', PRESETS_16.treble_reducer),
  vocal_boost:    buildPreset('Vocal Boost', PRESETS_16.vocal_boost),
  loudness:       buildPreset('Loudness', PRESETS_16.loudness),
  rock:           buildPreset('Rock', PRESETS_16.rock),
  pop:            buildPreset('Pop', PRESETS_16.pop),
  classical:      buildPreset('Classical', PRESETS_16.classical),
  jazz:           buildPreset('Jazz', PRESETS_16.jazz),
  electronic:     buildPreset('Electronic', PRESETS_16.electronic),
  hip_hop:        buildPreset('Hip-Hop', PRESETS_16.hip_hop),
  r_and_b:        buildPreset('R&B', PRESETS_16.r_and_b),
  acoustic:       buildPreset('Acoustic', PRESETS_16.acoustic),
  podcast:        buildPreset('Podcast / Speech', PRESETS_16.podcast),
};

export const EQ_PRESET_KEYS = Object.keys(EQ_PRESETS);
