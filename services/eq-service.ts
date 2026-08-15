/**
 * eq-service.ts
 *
 * 10-band graphic equalizer service. Stores user EQ preferences
 * (enabled state, preset, per-band gains) in AsyncStorage.
 *
 * The actual audio processing requires a native EQ module (e.g. Android
 * Equalizer / iOS AVAudioUnitEQ). This service manages the configuration
 * layer and exposes a clean API for the audio player to consume.
 *
 * Reference: D:\laragon\www\monochrome\js\storage.js (equalizerSettings)
 *            D:\laragon\www\monochrome\js\equalizer.js
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { EQ_PRESETS, EQ_PRESET_KEYS, EQ_BAND_FREQUENCIES, EQ_GAIN_MIN, EQ_GAIN_MAX, EqPreset } from '../constants/eq-presets';

const ENABLED_KEY = 'eq-enabled';
const PRESET_KEY = 'eq-preset';
const GAINS_KEY = 'eq-gains';

export interface EqState {
  enabled: boolean;
  presetKey: string;
  gains: number[];
}

const DEFAULT_STATE: EqState = {
  enabled: false,
  presetKey: 'flat',
  gains: EQ_BAND_FREQUENCIES.map(() => 0),
};

class EqService {
  private state: EqState = { ...DEFAULT_STATE };
  private listeners: ((state: EqState) => void)[] = [];

  async init(): Promise<void> {
    try {
      const enabled = await AsyncStorage.getItem(ENABLED_KEY);
      const preset = await AsyncStorage.getItem(PRESET_KEY);
      const gainsJson = await AsyncStorage.getItem(GAINS_KEY);

      if (enabled === 'true') this.state.enabled = true;
      if (preset && EQ_PRESETS[preset]) this.state.presetKey = preset;
      if (gainsJson) {
        try {
          const parsed = JSON.parse(gainsJson);
          if (Array.isArray(parsed) && parsed.length === EQ_BAND_FREQUENCIES.length) {
            this.state.gains = parsed.map((g: number) =>
              Math.max(EQ_GAIN_MIN, Math.min(EQ_GAIN_MAX, Number(g) || 0))
            );
          }
        } catch {}
      }
    } catch {}
  }

  getState(): EqState {
    return { ...this.state, gains: [...this.state.gains] };
  }

  subscribe(callback: (state: EqState) => void): () => void {
    this.listeners.push(callback);
    callback(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notify(): void {
    const snapshot = this.getState();
    this.listeners.forEach((l) => l(snapshot));
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.state.enabled = enabled;
    try { await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false'); } catch {}
    this.notify();
  }

  async setPreset(presetKey: string): Promise<void> {
    const preset = EQ_PRESETS[presetKey];
    if (!preset) return;
    this.state.presetKey = presetKey;
    this.state.gains = [...preset.gains];
    try { await AsyncStorage.setItem(PRESET_KEY, presetKey); } catch {}
    try { await AsyncStorage.setItem(GAINS_KEY, JSON.stringify(this.state.gains)); } catch {}
    this.notify();
  }

  async setGain(bandIndex: number, gain: number): Promise<void> {
    if (bandIndex < 0 || bandIndex >= EQ_BAND_FREQUENCIES.length) return;
    const clamped = Math.max(EQ_GAIN_MIN, Math.min(EQ_GAIN_MAX, Math.round(gain * 10) / 10));
    this.state.gains[bandIndex] = clamped;
    // Switch to custom preset when user manually adjusts bands
    this.state.presetKey = 'custom';
    try { await AsyncStorage.setItem(GAINS_KEY, JSON.stringify(this.state.gains)); } catch {}
    this.notify();
  }

  async reset(): Promise<void> {
    this.state = { ...DEFAULT_STATE };
    try { await AsyncStorage.setItem(ENABLED_KEY, 'false'); } catch {}
    try { await AsyncStorage.setItem(PRESET_KEY, 'flat'); } catch {}
    try { await AsyncStorage.setItem(GAINS_KEY, JSON.stringify(DEFAULT_STATE.gains)); } catch {}
    this.notify();
  }

  /**
   * Get the effective gain array for all 10 bands.
   * Returns null if EQ is disabled.
   */
  getActiveGains(): number[] | null {
    if (!this.state.enabled) return null;
    return [...this.state.gains];
  }

  /**
   * Get the gain for a specific frequency band.
   * Returns 0 if EQ is disabled.
   */
  getGainForFrequency(frequencyHz: number): number {
    if (!this.state.enabled) return 0;
    // Find closest band
    let closestIndex = 0;
    let closestDiff = Infinity;
    for (let i = 0; i < EQ_BAND_FREQUENCIES.length; i++) {
      const diff = Math.abs(EQ_BAND_FREQUENCIES[i] - frequencyHz);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }
    return this.state.gains[closestIndex];
  }
}

export const eqService = new EqService();
