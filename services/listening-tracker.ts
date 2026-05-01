import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'luna-listening-data-v1';
const MAX_TRACKS = 2000;
const MAX_ARTISTS = 500;
const SKIP_THRESHOLD_S = 5;
const COMPLETION_RATIO_THRESHOLD = 0.3;

export interface TrackListeningData {
  playCount: number;
  skipCount: number;
  totalPlayTime: number;
  completionCount: number;
  lastPlayed: number;
  avgCompletionRatio: number;
}

export interface ArtistListeningData {
  name: string;
  affinity: number;
  playCount: number;
  skipCount: number;
  totalPlayTime: number;
}

interface ListeningData {
  tracks: Record<string, TrackListeningData>;
  artists: Record<string, ArtistListeningData>;
  version: number;
}

class ListeningTracker {
  private data: ListeningData | null = null;
  private currentTrackId: string | null = null;
  private playStartTime: number | null = null;
  private lastTimeUpdate = 0;
  private accumulatedPlayTime = 0;
  private trackDuration = 0;
  private flushTimer: any = null;

  constructor() {}

  private async load(): Promise<ListeningData> {
    if (this.data) return this.data;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      this.data = raw ? JSON.parse(raw) : this.empty();
    } catch {
      this.data = this.empty();
    }
    return this.data!;
  }

  private empty(): ListeningData {
    return { tracks: {}, artists: {}, version: 1 };
  }

  private async save() {
    try {
      const d = this.data || (await this.load());
      
      // Prune tracks
      const trackEntries = Object.entries(d.tracks);
      if (trackEntries.length > MAX_TRACKS) {
        trackEntries.sort((a, b) => (b[1].lastPlayed || 0) - (a[1].lastPlayed || 0));
        d.tracks = Object.fromEntries(trackEntries.slice(0, MAX_TRACKS));
      }

      // Prune artists
      const artistEntries = Object.entries(d.artists);
      if (artistEntries.length > MAX_ARTISTS) {
        artistEntries.sort((a, b) => (b[1].affinity || 0) - (a[1].affinity || 0));
        d.artists = Object.fromEntries(artistEntries.slice(0, MAX_ARTISTS));
      }

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    } catch (e) {
      console.warn('[ListeningTracker] Save failed', e);
    }
  }

  private flush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.save();
      this.flushTimer = null;
    }, 5000);
  }

  onTrackStart(track: any) {
    if (!track || !track.id) return;
    this.finalizeCurrent();
    this.currentTrackId = track.id;
    this.playStartTime = Date.now();
    this.lastTimeUpdate = 0;
    this.accumulatedPlayTime = 0;
    this.trackDuration = (track.duration || 0) / 1000;
  }

  onTimeUpdate(currentTime: number, duration?: number) {
    if (!this.currentTrackId || this.playStartTime === null) return;
    if (duration && duration > 0) this.trackDuration = duration;
    
    if (this.lastTimeUpdate > 0 && currentTime > this.lastTimeUpdate) {
      const delta = currentTime - this.lastTimeUpdate;
      if (delta < 5) {
        this.accumulatedPlayTime += delta;
      }
    }
    this.lastTimeUpdate = currentTime;
  }

  onTrackEnd() {
    this.finalizeCurrent();
  }

  onSkip() {
    if (!this.currentTrackId || this.playStartTime === null) return;
    const elapsed = this.accumulatedPlayTime;
    this.recordTrackSignal(this.currentTrackId, elapsed, this.trackDuration, true);
    this.currentTrackId = null;
    this.playStartTime = null;
    this.flush();
  }

  private async finalizeCurrent() {
    if (!this.currentTrackId || this.playStartTime === null) return;
    const elapsed = this.accumulatedPlayTime;
    await this.recordTrackSignal(this.currentTrackId, elapsed, this.trackDuration, false);
    this.currentTrackId = null;
    this.playStartTime = null;
    this.flush();
  }

  private async recordTrackSignal(trackId: string, playTimeS: number, durationS: number, wasSkipped: boolean) {
    const d = await this.load();
    if (!d.tracks[trackId]) {
      d.tracks[trackId] = {
        playCount: 0,
        skipCount: 0,
        totalPlayTime: 0,
        completionCount: 0,
        lastPlayed: 0,
        avgCompletionRatio: 0,
      };
    }
    const t = d.tracks[trackId];
    t.playCount++;
    t.totalPlayTime += playTimeS;
    t.lastPlayed = Date.now();

    const completionRatio = durationS > 0 ? Math.min(playTimeS / durationS, 1) : 0;
    t.avgCompletionRatio =
      t.avgCompletionRatio === 0 ? completionRatio : t.avgCompletionRatio * 0.8 + completionRatio * 0.2;

    if (wasSkipped || playTimeS < SKIP_THRESHOLD_S) {
      t.skipCount++;
    } else if (playTimeS >= durationS * 0.9 || completionRatio >= 0.9) {
      t.completionCount++;
    }
  }

  async getTopArtists(limit = 20) {
    const d = await this.load();
    return Object.entries(d.artists)
      .filter(([, v]) => v.playCount >= 2)
      .sort((a, b) => b[1].affinity - a[1].affinity)
      .slice(0, limit)
      .map(([id, v]) => ({ id, ...v }));
  }

  async getTrackScore(trackId: string) {
    const d = await this.load();
    const signal = d.tracks[trackId];
    if (!signal) return 0;
    
    const skipRate = signal.playCount > 0 ? signal.skipCount / signal.playCount : 0;
    const completionRate = signal.playCount > 0 ? signal.completionCount / signal.playCount : 0;
    
    return (
      signal.avgCompletionRatio * 2 + 
      completionRate * 3 - 
      skipRate * 4 + 
      Math.log2(signal.playCount + 1) * 0.5
    );
  }
}

export const listeningTracker = new ListeningTracker();
