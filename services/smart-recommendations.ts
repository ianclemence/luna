import { listeningTracker } from "./listening-tracker";
import { storageService } from "./storage-service";
import { Track, Album, Artist } from "./types";

class SmartRecommendations {
  async getSmartSeeds(count = 50): Promise<any[]> {
    const [history, favorites, playlists] = await Promise.all([
      storageService.getHistory(),
      storageService.getFavorites("track"),
      storageService.getUserPlaylists(),
    ]);

    const playlistTracks = playlists.flatMap((p) => p.tracks || []);
    const scoredTracks = new Map<string, { score: number; track: any }>();

    const addWithScore = (tracks: any[], baseWeight: number) => {
      for (const t of tracks) {
        if (!t || !t.id) continue;
        const signalScore = listeningTracker.getTrackScore(t.id);
        const completionBonus = this._getCompletionBonus(t.id);
        const score = baseWeight + signalScore + completionBonus;

        const existing = scoredTracks.get(t.id);
        if (existing) {
          existing.score += score;
          existing.track = t;
        } else {
          scoredTracks.set(t.id, { score, track: t });
        }
      }
    };

    addWithScore(favorites, 3);
    addWithScore(playlistTracks, 2);
    addWithScore(history, 1);

    const sorted = [...scoredTracks.values()].sort((a, b) => b.score - a.score);
    const dislikedArtistIds = new Set(listeningTracker.getDislikedArtistIds());

    const filteredSeeds = sorted
      .filter((s) => {
        const t = s.track;
        if (this._isTrackByDislikedArtist(t, dislikedArtistIds)) return false;
        const signal = listeningTracker.getTrackSignal(t.id);
        if (signal && signal.playCount >= 3 && signal.avgCompletionRatio < 0.2)
          return false;
        return true;
      })
      .slice(0, count)
      .map((s) => s.track);

    return this.shuffle(filteredSeeds);
  }

  private _getCompletionBonus(trackId: string): number {
    const signal = listeningTracker.getTrackSignal(trackId);
    if (!signal) return 0;
    if (signal.avgCompletionRatio > 0.8) return 2;
    if (signal.avgCompletionRatio > 0.5) return 1;
    if (signal.avgCompletionRatio < 0.2 && signal.playCount >= 2) return -3;
    return 0;
  }

  private _isTrackByDislikedArtist(track: any, dislikedArtistIds: Set<string>): boolean {
    if (!track || dislikedArtistIds.size === 0) return false;
    const mainArtistId = track.artist?.id?.replace("t:", "") || track.artistId;
    if (mainArtistId && dislikedArtistIds.has(String(mainArtistId))) return true;
    
    if (track.artists) {
        return track.artists.some((a: any) => {
            const id = a.id?.replace("t:", "");
            return id && dislikedArtistIds.has(String(id));
        });
    }
    return false;
  }

  filterRecommendations<T extends { id: string }>(items: T[]): T[] {
    const dislikedArtistIds = new Set(listeningTracker.getDislikedArtistIds());
    const frequentlySkippedIds = new Set(listeningTracker.getFrequentlySkippedTrackIds(100));
    const shortPlayIds = new Set(listeningTracker.getShortPlayTrackIds(100));

    return items.filter((t: any) => {
      if (!t || !t.id) return false;
      if (frequentlySkippedIds.has(t.id)) return false;
      if (shortPlayIds.has(t.id)) return false;
      if (this._isTrackByDislikedArtist(t, dislikedArtistIds)) return false;
      return true;
    });
  }

  scoreRecommendation(track: any): number {
    if (!track) return 0;
    let score = 0;
    const dislikedArtistIds = new Set(listeningTracker.getDislikedArtistIds());
    const topArtists = listeningTracker.getTopArtists(30);
    const topArtistIds = new Set(topArtists.map((a) => a.id));

    const mainArtistId = track.artist?.id?.replace("t:", "") || track.artistId;
    if (mainArtistId && topArtistIds.has(String(mainArtistId))) {
      const artist = topArtists.find((a) => a.id === String(mainArtistId));
      score += artist ? Math.min(artist.affinity * 2, 5) : 1;
    }

    if (this._isTrackByDislikedArtist(track, dislikedArtistIds)) {
      score -= 5;
    }
    
    const skipIds = new Set(listeningTracker.getFrequentlySkippedTrackIds(50));
    if (skipIds.has(track.id)) score -= 3;

    return score;
  }

  rankRecommendations<T extends { id: string }>(items: T[]): T[] {
    return items
      .map((t) => ({ item: t, score: this.scoreRecommendation(t) }))
      .sort((a, b) => b.score - a.score)
      .map((t) => t.item);
  }

  private shuffle<T>(arr: T[]): T[] {
    return [...arr].sort(() => Math.random() - 0.5);
  }
}

export const smartRecommendations = new SmartRecommendations();
