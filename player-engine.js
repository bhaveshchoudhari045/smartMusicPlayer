class PlayerEngine {
  constructor() {
    this.audio = document.getElementById("audioPlayer");
    this.playlist = []; // full library
    this.queue = []; // current playback order
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isShuffle = false;
    this.repeatMode = 0; // 0=off, 1=all, 2=one

    this.shuffle = new SmartShuffle();

    // Callbacks
    this.onStateChange = null;
    this.onTimeUpdate = null;
    this.onSongChange = null;
    this.onEnded = null;

    this._setupListeners();
  }

  _setupListeners() {
    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
      this.onStateChange?.();
    });
    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
      this.onStateChange?.();
    });
    this.audio.addEventListener("timeupdate", () => this.onTimeUpdate?.());
    this.audio.addEventListener("ended", () => this._handleEnded());
    this.audio.addEventListener("error", (e) => console.warn("Audio error", e));
  }

  _handleEnded() {
    this.shuffle.logMoodSession?.();
    if (this.repeatMode === 2) {
      // Repeat one
      this.audio.currentTime = 0;
      this.audio.play();
      return;
    }
    this.onEnded?.();
    this.next();
  }

  setPlaylist(songs) {
    this.playlist = songs;
    this.queue = [...songs];
    this.shuffle.reset(songs);
    this.currentIndex = 0;
  }

  getCurrentSong() {
    return this.queue[this.currentIndex] || null;
  }

  async play(index) {
    if (index !== undefined) this.currentIndex = index;
    const song = this.getCurrentSong();
    if (!song) return false;

    try {
      this.audio.src = song.path;
      await this.audio.play();
      this.shuffle.recordPlay(song.id);
      this.onSongChange?.(song);
      return true;
    } catch (e) {
      console.warn("Playback failed:", e);
      return false;
    }
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  next() {
    if (!this.queue.length) return;
    if (this.isShuffle) {
      this.currentIndex = this.shuffle.next(this.queue, this.currentIndex);
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.queue.length;
    }
    this.play();
  }

  previous() {
    if (!this.queue.length) return;

    // If more than 3s in, restart current song
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    if (this.isShuffle && this.shuffle.canGoBack()) {
      this.currentIndex = this.shuffle.previous();
    } else {
      this.currentIndex =
        this.currentIndex === 0 ? this.queue.length - 1 : this.currentIndex - 1;
    }
    this.play();
  }

  playAt(index) {
    this.play(index);
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    if (this.isShuffle) {
      this.shuffle.reset(this.queue);
    }
    return this.isShuffle;
  }

  toggleRepeat() {
    this.repeatMode = (this.repeatMode + 1) % 3;
    return this.repeatMode;
  }

  setVolume(val) {
    this.audio.volume = Helpers.clamp(val / 100, 0, 1);
  }

  seek(percent) {
    if (this.audio.duration) {
      this.audio.currentTime = percent * this.audio.duration;
    }
  }

  get progress() {
    return this.audio.duration
      ? this.audio.currentTime / this.audio.duration
      : 0;
  }

  get currentTime() {
    return this.audio.currentTime;
  }
  get duration() {
    return this.audio.duration || 0;
  }
}
