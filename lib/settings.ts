import AsyncStorage from "@react-native-async-storage/async-storage";

export type AudioQuality = "HI_RES_LOSSLESS" | "LOSSLESS" | "HIGH" | "LOW";

export interface UserSettings {
  streamingQuality: AudioQuality;
  downloadQuality: AudioQuality;
  cellularQuality: AudioQuality;
  autoDownloadFavorites: boolean;
  romajiEnabled: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  streamingQuality: "HI_RES_LOSSLESS",
  downloadQuality: "HI_RES_LOSSLESS",
  cellularQuality: "HIGH",
  autoDownloadFavorites: false,
  romajiEnabled: true,
};

const SETTINGS_KEY = "user_settings";

class SettingsManager {
  private settings: UserSettings = { ...DEFAULT_SETTINGS };
  private initialized = false;

  async getSettings(): Promise<UserSettings> {
    if (!this.initialized) {
      await this.init();
    }
    return this.settings;
  }

  async init() {
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      if (data) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
      this.initialized = true;
    } catch (e) {
      console.warn("Failed to load settings:", e);
    }
  }

  async updateSettings(updates: Partial<UserSettings>) {
    this.settings = { ...this.settings, ...updates };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
  }
}

export const settingsManager = new SettingsManager();
