class MoodSystem {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.currentMood = "calm";
    this.moodSmoothed = 0; // smoothed energy
    this.beatThreshold = 0;
    this.beatCooldown = 0;
    this.onBeat = null;
    this.onMoodChange = null;

    this.moods = {
      energetic: {
        emoji: "⚡",
        label: "Energetic",
        color: "#fb923c",
        bg: "rgba(251,146,60,0.15)",
      },
      happy: {
        emoji: "😊",
        label: "Happy",
        color: "#fbbf24",
        bg: "rgba(251,191,36,0.15)",
      },
      focus: {
        emoji: "🎯",
        label: "Focus",
        color: "#34d399",
        bg: "rgba(52,211,153,0.15)",
      },
      calm: {
        emoji: "🌊",
        label: "Calm",
        color: "#60a5fa",
        bg: "rgba(96,165,250,0.15)",
      },
      romantic: {
        emoji: "💕",
        label: "Romantic",
        color: "#f472b6",
        bg: "rgba(244,114,182,0.15)",
      },
      melancholic: {
        emoji: "🌙",
        label: "Melancholic",
        color: "#a78bfa",
        bg: "rgba(167,139,250,0.15)",
      },
    };

    // Song mood assignments (set by user or auto-detected)
    this.songMoods = {}; // songId -> moodKey
    this.moodHistory = []; // session mood log
  }

  initialize(audioElement) {
    if (this.audioContext) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.8;

      this.source =
        this.audioContext.createMediaElementAudioSource(audioElement);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    } catch (e) {
      console.warn("Web Audio API unavailable:", e);
    }
  }

  resume() {
    if (this.audioContext?.state === "suspended") {
      this.audioContext.resume();
    }
  }

  getFrequencyData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  getTimeDomainData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  /** Returns { bass, mid, treble, energy, rms } all 0-1 */
  analyzeSpectrum() {
    const data = this.getFrequencyData();
    if (!data) return { bass: 0, mid: 0, treble: 0, energy: 0, rms: 0 };

    const binCount = data.length;
    const bassEnd = Math.floor(binCount * 0.05); // ~0-250Hz
    const midEnd = Math.floor(binCount * 0.3); // ~250-2.5kHz
    // rest = treble

    let bass = 0,
      mid = 0,
      treble = 0;
    for (let i = 0; i < bassEnd; i++) bass += data[i];
    for (let i = bassEnd; i < midEnd; i++) mid += data[i];
    for (let i = midEnd; i < binCount; i++) treble += data[i];

    bass /= bassEnd * 255;
    mid /= (midEnd - bassEnd) * 255;
    treble /= (binCount - midEnd) * 255;

    const energy = data.reduce((a, b) => a + b, 0) / (binCount * 255);

    // RMS from time domain
    const td = this.getTimeDomainData();
    let rms = 0;
    if (td) {
      for (let i = 0; i < td.length; i++) {
        const v = (td[i] - 128) / 128;
        rms += v * v;
      }
      rms = Math.sqrt(rms / td.length);
    }

    return { bass, mid, treble, energy, rms };
  }

  detectBeat(spec) {
    const now = performance.now();
    if (now < this.beatCooldown) return false;

    const energy = spec.bass * 0.6 + spec.energy * 0.4;
    this.moodSmoothed = Helpers.lerp(this.moodSmoothed, energy, 0.1);
    this.beatThreshold = Helpers.lerp(
      this.beatThreshold,
      this.moodSmoothed,
      0.02,
    );

    if (energy > this.beatThreshold * 1.4 && energy > 0.04) {
      this.beatCooldown = now + 200; // min 200ms between beats
      if (this.onBeat) this.onBeat(energy);
      return true;
    }
    return false;
  }

  detectMood(spec) {
    // If user has manually pinned a mood for current song, honour it
    if (this._pinnedMood) return this._pinnedMood;

    let newMood;
    const e = spec.energy;
    const b = spec.bass;
    const t = spec.treble;

    // Lowered thresholds — typical compressed music energy sits 0.03-0.15
    if (e > 0.12 && b > 0.1) newMood = "energetic";
    else if (e > 0.09 && t > 0.07) newMood = "happy";
    else if (e > 0.06 && t > 0.05) newMood = "focus";
    else if (e > 0.04 && b > 0.03) newMood = "romantic";
    else if (e > 0.02) newMood = "calm";
    else newMood = "melancholic";

    if (newMood !== this.currentMood) {
      this.currentMood = newMood;
      if (this.onMoodChange) this.onMoodChange(newMood);
    }
    return newMood;
  }

  /** Pin a mood for the current song so auto-detection won't override it */
  pinMood(moodKey) {
    this._pinnedMood = moodKey || null;
    if (moodKey) {
      this.currentMood = moodKey;
      if (this.onMoodChange) this.onMoodChange(moodKey);
    }
  }

  getMoodInfo(moodKey) {
    return this.moods[moodKey || this.currentMood];
  }

  assignSongMood(songId, moodKey) {
    this.songMoods[songId] = moodKey;
  }

  getSongMood(songId) {
    return this.songMoods[songId] || null;
  }

  getSongsByMood(songs, moodKey) {
    return songs.filter((s) => this.songMoods[s.id] === moodKey);
  }

  /** Called at end of each song to log mood */
  logMoodSession() {
    this.moodHistory.unshift({ mood: this.currentMood, time: Date.now() });
    if (this.moodHistory.length > 10) this.moodHistory.pop();
  }

  getMoodCounts(songs) {
    const counts = {};
    Object.keys(this.moods).forEach((m) => (counts[m] = 0));
    songs.forEach((s) => {
      const m = this.songMoods[s.id];
      if (m && counts[m] !== undefined) counts[m]++;
    });
    return counts;
  }
}
