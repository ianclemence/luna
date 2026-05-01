import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TidalTrack {
  id: number;
  title: string;
  duration: number;
  audioQuality: string;
  artist: { id: number; name: string };
  artists: Array<{ id: number; name: string }>;
  album: { id: number; title: string; cover: string };
  explicit: boolean;
  trackNumber: number;
  volumeNumber: number;
}

export interface PlaybackInfo {
  trackId: number;
  assetPresentation: string;
  audioMode: string;
  audioQuality: string;
  manifestMimeType: string;
  manifest: string;
  albumReplayGain: number;
  trackReplayGain: number;
}

const BROWSER_CLIENT_ID = 'txNoH4kkV41MfH25';
const BROWSER_CLIENT_SECRET = 'dQjy0MinCEvxi1O4UmxvxWnDjt4cgHBPw8ll6nYBk98=';

class HiFiClient {
  private static instance: HiFiClient | null = null;
  private token: string | null = null;
  private tokenExpiry = 0;
  private refreshToken: string | null = null;

  private constructor() {}

  static getInstance(): HiFiClient {
    if (!HiFiClient.instance) {
      HiFiClient.instance = new HiFiClient();
    }
    return HiFiClient.instance;
  }

  async initialize() {
    try {
      const storedToken = await AsyncStorage.getItem('hifi_token');
      const storedExpiry = await AsyncStorage.getItem('hifi_token_expiry');
      const storedRefresh = await AsyncStorage.getItem('hifi_refresh_token');

      if (storedToken) this.token = storedToken;
      if (storedExpiry) this.tokenExpiry = parseInt(storedExpiry, 10);
      if (storedRefresh) this.refreshToken = storedRefresh;
    } catch (e) {
      console.warn('[HiFiClient] Failed to load stored tokens', e);
    }
  }

  private async fetchAppToken(force = false): Promise<string | null> {
    if (!force && this.token && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    try {
      const params = new URLSearchParams({
        client_id: BROWSER_CLIENT_ID,
        client_secret: BROWSER_CLIENT_SECRET,
      });

      if (this.refreshToken) {
        params.set('refresh_token', this.refreshToken);
        params.set('grant_type', 'refresh_token');
      } else {
        params.set('grant_type', 'client_credentials');
      }

      const response = await fetch('https://auth.tidal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error(`Auth failed: ${response.status}`);
      }

      const json = await response.json();
      this.token = json.access_token;
      this.tokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
      if (json.refresh_token) this.refreshToken = json.refresh_token;

      await AsyncStorage.setItem('hifi_token', this.token!);
      await AsyncStorage.setItem('hifi_token_expiry', this.tokenExpiry.toString());
      if (this.refreshToken) {
        await AsyncStorage.setItem('hifi_refresh_token', this.refreshToken);
      }

      return this.token;
    } catch (error) {
      console.error('[HiFiClient] Token fetch error:', error);
      return null;
    }
  }

  async query(relativePath: string, params: Record<string, string | number> = {}): Promise<any> {
    const token = await this.fetchAppToken();
    if (!token) throw new Error('No Tidal token available');

    const url = new URL(`https://api.tidal.com/v1${relativePath.startsWith('/') ? '' : '/'}${relativePath}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    
    // Default country code if not provided
    if (!url.searchParams.has('countryCode')) {
      url.searchParams.set('countryCode', 'US');
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (response.status === 401) {
      // Retry once with fresh token
      const freshToken = await this.fetchAppToken(true);
      if (!freshToken) throw new Error('Auth failed on retry');
      
      const retryResponse = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${freshToken}`,
          'Accept': 'application/json',
        },
      });
      if (!retryResponse.ok) throw new Error(`Query failed: ${retryResponse.status}`);
      return retryResponse.json();
    }

    if (!response.ok) {
      throw new Error(`Query failed: ${response.status}`);
    }

    return response.json();
  }

  async getTrackInfo(id: string | number): Promise<TidalTrack> {
    return this.query(`/tracks/${id}`);
  }

  async getPlaybackInfo(id: string | number, quality = 'LOSSLESS'): Promise<PlaybackInfo> {
    return this.query(`/tracks/${id}/playbackinfo`, {
      audioquality: quality,
      playbackmode: 'STREAM',
      assetpresentation: 'FULL',
    });
  }
}

export const hifiClient = HiFiClient.getInstance();
