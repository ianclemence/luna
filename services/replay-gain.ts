import { settingsManager, ReplayGainMode } from "../lib/settings";

export { ReplayGainMode };

class ReplayGainService {
  async getMode(): Promise<ReplayGainMode> {
    const settings = await settingsManager.getSettings();
    return settings.replayGainMode;
  }

  async setMode(mode: ReplayGainMode) {
    await settingsManager.updateSettings({ replayGainMode: mode });
  }

  async getPreamp(): Promise<number> {
    const settings = await settingsManager.getSettings();
    return settings.replayGainPreamp;
  }

  async setPreamp(db: number) {
    await settingsManager.updateSettings({ replayGainPreamp: db });
  }

  /**
   * Calculate the effective volume multiplier from ReplayGain data.
   *
   * Formula (matches Monochrome exactly):
   *  1. Select track or album gain based on mode
   *  2. Add pre-amp offset (default +3 dB)
   *  3. Convert dB to linear: scale = 10^(dB / 20)
   *  4. Peak protection: if scale * peak > 1.0, clamp to 1.0 / peak
   *  5. Return scale to multiply against the user volume slider
   */
  async calculateGain(
    rg: { trackGain: number; trackPeak: number; albumGain: number; albumPeak: number } | undefined,
    userVolume: number,
  ): Promise<number> {
    const mode = await this.getMode();
    if (mode === "off" || !rg) return userVolume;

    const preamp = await this.getPreamp();
    let gainDb = 0;
    let peak = 1.0;

    if (mode === "album") {
      gainDb = rg.albumGain;
      peak = rg.albumPeak || 1.0;
    } else {
      gainDb = rg.trackGain;
      peak = rg.trackPeak || 1.0;
    }

    gainDb += preamp;

    // dB to linear
    let scale = Math.pow(10, gainDb / 20);

    // Peak protection (prevent clipping)
    if (scale * peak > 1.0) {
      scale = 1.0 / peak;
    }

    return Math.max(0, Math.min(1, userVolume * scale));
  }
}

export const replayGainService = new ReplayGainService();
