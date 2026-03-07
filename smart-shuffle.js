/**
 * SmartShuffle — guarantees every song plays before repeating,
 * weights unplayed / less-played songs, and never picks the same
 * track twice in a row.
 */
class SmartShuffle {
  constructor() {
    this.history = []; // indices of played songs (global order)
    this.unplayed = []; // indices not yet played in current cycle
    this.weights = {}; // songId -> { plays, lastPlayedAt, loved }
  }

  /** Call when a new playlist is loaded */
  reset(songs) {
    this.unplayed = songs.map((_, i) => i);
    this.history = [];
    // Preserve existing weight data for known songs
    const newWeights = {};
    songs.forEach(s => {
      newWeights[s.id] = this.weights[s.id] || { plays: 0, lastPlayedAt: 0, loved: false };
    });
    this.weights = newWeights;
    this._shuffle(this.unplayed);
  }

  /** Fisher-Yates shuffle, weighted by rarity */
  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  /** Sort unplayed by weight (least played first, with randomness) */
  _sortByWeight(songs) {
    return this.unplayed.sort((a, b) => {
      const wa = this.weights[songs[a].id]?.plays ?? 0;
      const wb = this.weights[songs[b].id]?.plays ?? 0;
      // Add small random factor to avoid rigid ordering
      const noise = (Math.random() - 0.5) * 0.5;
      return (wa - wb) + noise;
    });
  }

  /**
   * Get the next song index.
   * @param {Array} songs - full playlist array
   * @param {number} currentIndex - current song index
   * @returns {number} next song index
   */
  next(songs, currentIndex) {
    if (!songs.length) return 0;

    // If unplayed cycle is empty, start new cycle (but don't repeat last song)
    if (this.unplayed.length === 0) {
      this.unplayed = songs.map((_, i) => i);
      // Remove current song from unplayed start to avoid back-to-back repeat
      const pos = this.unplayed.indexOf(currentIndex);
      if (pos !== -1) this.unplayed.splice(pos, 1);
    }

    // Weight & pick next (remove current from candidates)
    const candidates = this.unplayed.filter(i => i !== currentIndex);
    if (candidates.length === 0) {
      // Edge case: only 1 song
      return currentIndex;
    }

    // Sort by least played, grab from front
    this._sortByWeight(songs);
    const candidates2 = this.unplayed.filter(i => i !== currentIndex);
    const nextIdx = candidates2[0];

    // Remove from unplayed
    const pos = this.unplayed.indexOf(nextIdx);
    if (pos !== -1) this.unplayed.splice(pos, 1);

    this.history.push(nextIdx);
    return nextIdx;
  }

  /** Can we go back? */
  canGoBack() {
    return this.history.length > 1;
  }

  /** Go to previous song in history */
  previous() {
    if (this.history.length > 1) {
      // Put current back in unplayed
      const current = this.history.pop();
      this.unplayed.unshift(current);
      return this.history[this.history.length - 1];
    }
    return this.history[0] ?? 0;
  }

  /** Record that a song was played */
  recordPlay(songId) {
    if (!this.weights[songId]) this.weights[songId] = { plays: 0, lastPlayedAt: 0, loved: false };
    this.weights[songId].plays++;
    this.weights[songId].lastPlayedAt = Date.now();
  }

  /** Toggle loved state */
  toggleLoved(songId) {
    if (!this.weights[songId]) this.weights[songId] = { plays: 0, lastPlayedAt: 0, loved: false };
    this.weights[songId].loved = !this.weights[songId].loved;
    return this.weights[songId].loved;
  }

  isLoved(songId) {
    return this.weights[songId]?.loved ?? false;
  }

  getPlays(songId) {
    return this.weights[songId]?.plays ?? 0;
  }

  /** Return sorted stats for insights */
  getStats(songs) {
    const stats = songs.map(s => ({
      ...s,
      plays: this.getPlays(s.id),
      loved: this.isLoved(s.id),
      lastPlayed: this.weights[s.id]?.lastPlayedAt ?? 0,
    }));
    return {
      topPlayed: [...stats].sort((a, b) => b.plays - a.plays).slice(0, 5),
      rarePlayed: [...stats].sort((a, b) => a.plays - b.plays).slice(0, 5),
      mostLoved: stats.filter(s => s.loved),
      totalPlays: stats.reduce((sum, s) => sum + s.plays, 0),
    };
  }
}
