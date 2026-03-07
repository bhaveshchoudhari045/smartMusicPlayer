class UIController {
  constructor(player, moodSystem, visualizer) {
    this.player = player;
    this.mood = moodSystem;
    this.viz = visualizer;

    this.playlists = {}; // id -> { name, emoji, songIds }
    this.pendingAddSongId = null;
    this.selectedPlaylistEmoji = "🎵";
    this.activeSort = "default";
    this.searchQuery = "";
    this.currentView = "player";

    this._loadFromStorage();
    this._restoreFolder();
    this._bindEvents();
    this._setupMoodCallbacks();
    this._updateInsights();
  }

  // ===== STORAGE =====
  _loadFromStorage() {
    try {
      const data = JSON.parse(localStorage.getItem("nova_data") || "{}");

      this.playlists = data.playlists || {};

      if (data.shuffleWeights) {
        this.player.shuffle.weights = data.shuffleWeights;
      }

      if (data.songMoods) {
        this.mood.songMoods = data.songMoods;
      }

      this.savedPlayerState = data.playerState || null;
    } catch (e) {}
  }
  async _restoreFolder() {
    try {
      const handle = await FolderDB.getHandle();

      if (!handle) return;

      const permission = await handle.queryPermission({ mode: "read" });

      if (permission === "granted") {
        await this._loadFolder(handle);
        this._toast("📁 Restored your music folder!");
      }
    } catch (err) {
      console.warn("Folder restore failed:", err);
    }
  }
  _saveToStorage() {
    try {
      localStorage.setItem(
        "nova_data",
        JSON.stringify({
          playlists: this.playlists,
          shuffleWeights: this.player.shuffle.weights,
          songMoods: this.mood.songMoods,
        }),
      );
    } catch (e) {}
  }

  // ===== BIND ALL EVENTS =====
  _bindEvents() {
    // Nav
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        this._switchView(view);
        document
          .querySelectorAll(".nav-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    // Play / Pause
    document.getElementById("playBtn").addEventListener("click", () => {
      if (!this.player.queue.length) {
        this._toast("📁 Load a music folder first!");
        return;
      }
      this.player.togglePlay();
    });

    // Prev / Next
    document
      .getElementById("prevBtn")
      .addEventListener("click", () => this.player.previous());
    document
      .getElementById("nextBtn")
      .addEventListener("click", () => this.player.next());

    // Shuffle
    document.getElementById("shuffleBtn").addEventListener("click", () => {
      const on = this.player.toggleShuffle();
      document.getElementById("shuffleBtn").classList.toggle("active", on);
      this._toast(
        on
          ? "🔀 Smart Shuffle ON — every song gets a turn!"
          : "➡️ Sequential mode",
      );
    });

    // Repeat
    document.getElementById("repeatBtn").addEventListener("click", () => {
      const mode = this.player.toggleRepeat();
      const btn = document.getElementById("repeatBtn");
      const labels = ["🔁 Repeat", "🔁 Repeat All", "🔂 Repeat One"];
      btn.classList.toggle("active", mode > 0);
      btn.querySelector("span").textContent = ["Repeat", "All", "One"][mode];
      this._toast(labels[mode]);
    });

    // Heart / Favorite
    document.getElementById("heartBtn").addEventListener("click", () => {
      const song = this.player.getCurrentSong();
      if (!song) return;
      const loved = this.player.shuffle.toggleLoved(song.id);
      document.getElementById("heartBtn").classList.toggle("heart-on", loved);
      this._toast(
        loved ? "❤️ Added to favorites!" : "🤍 Removed from favorites",
      );
      this._saveToStorage();
      this._updateLibraryDisplay();
      this._updateInsights();
    });

    // Add to Playlist
    document
      .getElementById("addToPlaylistBtn")
      .addEventListener("click", () => {
        const song = this.player.getCurrentSong();
        if (!song) return;
        this._openAddToPlaylist(song.id);
      });

    // Volume
    const volSlider = document.getElementById("volumeSlider");
    const volFill = document.getElementById("volFill");
    const volValue = document.getElementById("volValue");
    volSlider.addEventListener("input", (e) => {
      const v = e.target.value;
      this.player.setVolume(v);
      volFill.style.width = v + "%";
      volValue.textContent = v;
    });

    // Waveform seek
    document.getElementById("progressWrap").addEventListener("click", (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      this.player.seek(pct);
    });

    // Select Folder
    document
      .getElementById("selectFolderBtn")
      .addEventListener("click", async () => {
        try {
          const handle = await window.showDirectoryPicker({ mode: "read" });
          await FolderDB.saveHandle(handle);
          await this._loadFolder(handle);
        } catch (e) {
          if (e.name !== "AbortError") console.warn(e);
        }
      });

    // Search
    document.getElementById("searchInput").addEventListener("input", (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this._updateLibraryDisplay();
    });

    // Sort buttons
    document.querySelectorAll(".sort-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeSort = btn.dataset.sort;
        document
          .querySelectorAll(".sort-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this._updateLibraryDisplay();
      });
    });

    // Queue toggle
    document.getElementById("queueToggle").addEventListener("click", () => {
      document.getElementById("queueSidebar").classList.toggle("open");
    });
    document.getElementById("queueClose").addEventListener("click", () => {
      document.getElementById("queueSidebar").classList.remove("open");
    });

    // New Playlist modal
    document.getElementById("newPlaylistBtn").addEventListener("click", () => {
      this._openModal("playlistModal");
    });
    document
      .getElementById("cancelPlaylistBtn")
      .addEventListener("click", () => this._closeModal());
    document
      .getElementById("createPlaylistBtn")
      .addEventListener("click", () => {
        const name = document.getElementById("playlistNameInput").value.trim();
        if (!name) return;
        this._createPlaylist(name, this.selectedPlaylistEmoji);
        document.getElementById("playlistNameInput").value = "";
        this._closeModal();
      });

    // Emoji picker
    const emojiPickerEl = document.getElementById("emojiPicker");
    if (emojiPickerEl) {
      const emojis = emojiPickerEl.textContent.trim().split(/\s+/);
      emojiPickerEl.innerHTML = emojis
        .map((e) => `<span>${e}</span>`)
        .join(" ");
      emojiPickerEl.querySelectorAll("span").forEach((s) => {
        s.addEventListener("click", () => {
          emojiPickerEl
            .querySelectorAll("span")
            .forEach((x) => x.classList.remove("selected"));
          s.classList.add("selected");
          this.selectedPlaylistEmoji = s.textContent;
        });
      });
      emojiPickerEl.querySelector("span")?.classList.add("selected");
    }

    // Add to playlist modal cancel
    document
      .getElementById("cancelAddBtn")
      .addEventListener("click", () => this._closeModal());

    // Mood cards
    document.querySelectorAll(".mood-card").forEach((card) => {
      card.addEventListener("click", () => {
        const moodKey = card.dataset.mood;
        this._filterByMood(moodKey);
        document
          .querySelectorAll(".mood-card")
          .forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
      });
    });

    // Play mood list
    document.getElementById("playMoodBtn")?.addEventListener("click", () => {
      const moodSongs = this._activeMoodSongs;
      if (!moodSongs?.length) return;
      this.player.setPlaylist(moodSongs);
      this.player.play(0);
      this._switchView("player");
      document.querySelector('[data-view="player"]').click();
    });

    // Overlay click to close
    document.getElementById("modalOverlay").addEventListener("click", (e) => {
      if (e.target === document.getElementById("modalOverlay"))
        this._closeModal();
    });

    // Save player state while playing
    this.player.audio.addEventListener("timeupdate", () => {
      this._saveToStorage();
    });
  }

  _setupMoodCallbacks() {
    this.mood.onBeat = (energy) => {
      // Pulse play button
      const btn = document.getElementById("playBtn");
      btn.style.boxShadow = `0 0 ${30 + energy * 60}px rgba(167,139,250,0.8)`;
      setTimeout(() => {
        btn.style.boxShadow = "";
      }, 200);
    };

    this.mood.onMoodChange = (newMood) => {
      const info = this.mood.getMoodInfo(newMood);
      document.getElementById("moodEmoji").textContent = info.emoji;
      document.getElementById("moodLabel").textContent = info.label;
      const badge = document.getElementById("moodBadge");
      badge.style.borderColor = info.color;
      badge.style.color = info.color;
      badge.style.background = info.bg;

      // Assign mood to current song
      const song = this.player.getCurrentSong();
      if (song) {
        this.mood.assignSongMood(song.id, newMood);
        this._updateMoodCounts();
        this._saveToStorage();
      }
    };
  }

  // ===== VIEW SWITCHING =====
  _switchView(view) {
    this.currentView = view;
    document
      .querySelectorAll(".view")
      .forEach((v) => v.classList.remove("active"));
    document.getElementById(`view-${view}`)?.classList.add("active");

    if (view === "insights") this._updateInsights();
    if (view === "mood") this._updateMoodCounts();
    if (view === "playlists") this._renderPlaylists();
    if (view === "library") this._updateLibraryDisplay();
  }

  // ===== FOLDER LOADING =====
  async _loadFolder(handle) {
    const songs = [];
    this._toast("🔍 Scanning folder...");

    const traverse = async (folder, depth = 0) => {
      if (depth > 5) return;
      for await (const entry of folder.values()) {
        if (entry.kind === "file" && Helpers.isAudioFile(entry.name)) {
          try {
            const file = await entry.getFile();
            const meta = Helpers.extractMetadata(entry.name);
            songs.push({
              id: entry.name + "_" + file.size,
              name: meta.name,
              artist: meta.artist,
              path: URL.createObjectURL(file),
              filename: entry.name,
              size: file.size,
            });
          } catch (e) {}
        } else if (entry.kind === "directory") {
          try {
            await traverse(entry, depth + 1);
          } catch (e) {}
        }
      }
    };

    await traverse(handle);

    if (!songs.length) {
      this._toast("❌ No audio files found in folder");
      return;
    }

    this.player.setPlaylist(songs);

    if (this.savedPlayerState?.currentSongId) {
      const index = songs.findIndex(
        (s) => s.id === this.savedPlayerState.currentSongId,
      );

      if (index !== -1) {
        this.player.currentIndex = index;

        this.player.audio.onloadedmetadata = () => {
          const duration = this.player.audio.duration || 0;
          const savedTime = this.savedPlayerState.currentTime || 0;

          if (duration > 0 && savedTime > 0) {
            this.player.seek(savedTime / duration);
          }
        };
      }
    }
    this._saveToStorage();
    this._updateLibraryDisplay();
    this._updateQueueDisplay();
    this._updateMoodCounts();
    this._toast(`✅ Loaded ${songs.length} songs!`);
  }

  // ===== UI UPDATES =====
  updatePlayButton() {
    const btn = document.getElementById("playBtn");
    const iconPlay = btn.querySelector(".icon-play");
    const iconPause = btn.querySelector(".icon-pause");
    const playing = this.player.isPlaying;

    iconPlay.style.display = playing ? "none" : "block";
    iconPause.style.display = playing ? "block" : "none";
    btn.classList.toggle("playing", playing);

    if (playing) this.viz.start();
    else this.viz.stop();
  }

  updateSongInfo() {
    const song = this.player.getCurrentSong();
    if (!song) return;

    document.getElementById("songTitle").textContent = song.name;
    document.getElementById("songArtist").textContent = song.artist;

    // Update heart button
    const loved = this.player.shuffle.isLoved(song.id);
    document.getElementById("heartBtn").classList.toggle("heart-on", loved);

    // Highlight in library
    this._updateLibraryHighlight();
    this._updateQueueDisplay();
  }

  updateProgress() {
    const t = Helpers.formatTime(this.player.currentTime);
    const d = Helpers.formatTime(this.player.duration);
    document.getElementById("currentTime").textContent = t;
    document.getElementById("totalTime").textContent = d;
    this.viz.drawWaveform(this.player.progress);
  }

  _updateLibraryDisplay() {
    const list = document.getElementById("songList");
    let songs = [...this.player.playlist];

    // Search filter
    if (this.searchQuery) {
      songs = songs.filter(
        (s) =>
          s.name.toLowerCase().includes(this.searchQuery) ||
          s.artist.toLowerCase().includes(this.searchQuery),
      );
    }

    // Sort
    switch (this.activeSort) {
      case "title":
        songs.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "artist":
        songs.sort((a, b) => a.artist.localeCompare(b.artist));
        break;
      case "plays":
        songs.sort(
          (a, b) =>
            this.player.shuffle.getPlays(b.id) -
            this.player.shuffle.getPlays(a.id),
        );
        break;
      case "loved":
        songs = songs.filter((s) => this.player.shuffle.isLoved(s.id));
        break;
    }

    if (!songs.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🎵</div><p>${this.player.playlist.length ? "No matches found" : "Load a music folder to begin!"}</p></div>`;
      return;
    }

    list.innerHTML = songs
      .map((song, i) => {
        const plays = this.player.shuffle.getPlays(song.id);
        const loved = this.player.shuffle.isLoved(song.id);
        const current = this.player.getCurrentSong()?.id === song.id;
        const queueIdx = this.player.queue.findIndex((s) => s.id === song.id);
        return `
        <div class="song-item ${current ? "playing" : ""}" data-song-id="${song.id}" data-queue-idx="${queueIdx}">
          <div class="song-num">
            <span class="song-num-text">${i + 1}</span>
            <div class="play-indicator">
              <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
            </div>
          </div>
          <div class="song-thumb">${this._getMoodEmoji(song.id)}</div>
          <div class="song-details">
            <div class="song-name">${song.name}</div>
            <div class="song-artist-small">${song.artist}</div>
          </div>
          <div class="song-meta">
            <span class="song-plays">${plays > 0 ? `▶ ${plays}` : ""}</span>
            <button class="song-heart ${loved ? "active" : ""}" data-song-id="${song.id}" title="Favorite">♥</button>
          </div>
        </div>
      `;
      })
      .join("");

    // Song item click -> play
    list.querySelectorAll(".song-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("song-heart")) return;
        const qIdx = parseInt(item.dataset.queueIdx);
        if (qIdx >= 0) this.player.playAt(qIdx);
      });
    });

    // Heart buttons in library
    list.querySelectorAll(".song-heart").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.songId;
        const loved = this.player.shuffle.toggleLoved(id);
        btn.classList.toggle("active", loved);
        this._saveToStorage();
        if (this.player.getCurrentSong()?.id === id) {
          document
            .getElementById("heartBtn")
            .classList.toggle("heart-on", loved);
        }
        this._updateInsights();
      });
    });
  }

  _getMoodEmoji(songId) {
    const m = this.mood.getSongMood(songId);
    return m ? this.mood.getMoodInfo(m).emoji : "🎵";
  }

  _updateLibraryHighlight() {
    const current = this.player.getCurrentSong();
    document.querySelectorAll(".song-item").forEach((item) => {
      item.classList.toggle("playing", item.dataset.songId === current?.id);
    });
  }

  _updateQueueDisplay() {
    const list = document.getElementById("queueList");
    const q = this.player.queue;
    if (!q.length) {
      list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">Queue is empty</div>`;
      return;
    }
    list.innerHTML = q
      .map(
        (song, i) => `
      <div class="queue-item ${i === this.player.currentIndex ? "playing" : ""}" data-idx="${i}">
        <span class="queue-item-num">${i + 1}</span>
        <div class="queue-item-info">
          <div class="queue-item-name">${song.name}</div>
          <div class="queue-item-artist">${song.artist}</div>
        </div>
      </div>
    `,
      )
      .join("");

    list.querySelectorAll(".queue-item").forEach((item) => {
      item.addEventListener("click", () => {
        this.player.playAt(parseInt(item.dataset.idx));
      });
    });
  }

  _updateInsights() {
    const songs = this.player.playlist;
    if (!songs.length) return;

    const stats = this.player.shuffle.getStats(songs);

    // Total time estimate (avg 3.5 min)
    const totalMs = stats.totalPlays * 3.5 * 60 * 1000;

    document.getElementById("insightFavorite").textContent =
      stats.topPlayed[0]?.name || "—";
    document.getElementById("insightFavoritePlays").textContent =
      `${stats.topPlayed[0]?.plays || 0} plays`;
    document.getElementById("insightTotal").textContent = songs.length;
    document.getElementById("insightTime").textContent =
      Helpers.formatTimeShort(totalMs);
    document.getElementById("insightStreak").textContent =
      stats.topPlayed[0]?.name || "—";

    const renderList = (elId, items, statKey, unit = "plays") => {
      const el = document.getElementById(elId);
      if (!el) return;
      if (!items.length) {
        el.innerHTML = `<div style="color:var(--text3);font-size:11px;padding:8px;">Nothing yet</div>`;
        return;
      }
      el.innerHTML = items
        .map(
          (s, i) => `
        <div class="insight-item">
          <span class="insight-rank">#${i + 1}</span>
          <span class="insight-name">${s.name}</span>
          <span class="insight-stat">${s[statKey]} ${unit}</span>
        </div>
      `,
        )
        .join("");
    };

    renderList("topPlayedList", stats.topPlayed, "plays");
    renderList(
      "rarePlayedList",
      stats.rarePlayed.filter((s) => s.plays === 0 || s.plays < 2),
      "plays",
    );
    renderList("lovedList", stats.mostLoved, "plays");

    // Mood history
    const mhEl = document.getElementById("moodHistory");
    if (mhEl && this.mood.moodHistory.length) {
      mhEl.innerHTML = this.mood.moodHistory
        .map((entry) => {
          const info = this.mood.getMoodInfo(entry.mood);
          return `<span class="mood-history-item" style="border-color:${info.color};color:${info.color};background:${info.bg}">${info.emoji} ${info.label}</span>`;
        })
        .join("");
    }
  }

  _updateMoodCounts() {
    const counts = this.mood.getMoodCounts(this.player.playlist);
    Object.entries(counts).forEach(([mood, count]) => {
      const el = document.getElementById(`mood-count-${mood}`);
      if (el) el.textContent = `${count} song${count !== 1 ? "s" : ""}`;
    });
  }

  _filterByMood(moodKey) {
    const songs = this.mood.getSongsByMood(this.player.playlist, moodKey);
    this._activeMoodSongs = songs;
    const info = this.mood.getMoodInfo(moodKey);
    const container = document.getElementById("moodSongList");
    const listEl = document.getElementById("moodFilteredSongs");
    const labelEl = document.getElementById("activeMoodLabel");

    labelEl.textContent = `${info.emoji} ${info.label} — ${songs.length} songs`;
    container.style.display = "block";

    if (!songs.length) {
      listEl.innerHTML = `<div class="empty-state" style="padding:30px"><div class="empty-icon">${info.emoji}</div><p>No songs detected in this mood yet. Play more music!</p></div>`;
      return;
    }

    listEl.innerHTML = songs
      .map((song, i) => {
        const plays = this.player.shuffle.getPlays(song.id);
        return `
        <div class="song-item" data-song-id="${song.id}">
          <div class="song-num"><span>${i + 1}</span></div>
          <div class="song-thumb">${info.emoji}</div>
          <div class="song-details">
            <div class="song-name">${song.name}</div>
            <div class="song-artist-small">${song.artist}</div>
          </div>
          <div class="song-meta"><span class="song-plays">${plays > 0 ? `▶ ${plays}` : ""}</span></div>
        </div>
      `;
      })
      .join("");

    listEl.querySelectorAll(".song-item").forEach((item) => {
      item.addEventListener("click", () => {
        const song = songs.find((s) => s.id === item.dataset.songId);
        if (!song) return;
        const idx = this.player.queue.findIndex((s) => s.id === song.id);
        if (idx >= 0) this.player.playAt(idx);
        this._switchView("player");
        document.querySelector('[data-view="player"]').click();
      });
    });
  }

  // ===== PLAYLISTS =====
  _createPlaylist(name, emoji) {
    const id = Helpers.generateId();
    this.playlists[id] = { name, emoji, songIds: [] };
    this._saveToStorage();
    this._renderPlaylists();
    this._toast(`${emoji} "${name}" playlist created!`);
  }

  _renderPlaylists() {
    const grid = document.getElementById("playlistGrid");
    const pls = Object.entries(this.playlists);

    if (!pls.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🎼</div><p>No playlists yet. Create one!</p></div>`;
      return;
    }

    grid.innerHTML = pls
      .map(
        ([id, pl]) => `
      <div class="playlist-card" data-playlist-id="${id}">
        <button class="playlist-delete" data-playlist-id="${id}" title="Delete">✕</button>
        <div class="playlist-emoji">${pl.emoji}</div>
        <div class="playlist-name">${pl.name}</div>
        <div class="playlist-count">${pl.songIds.length} songs</div>
      </div>
    `,
      )
      .join("");

    grid.querySelectorAll(".playlist-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.classList.contains("playlist-delete")) return;
        this._openPlaylist(card.dataset.playlistId);
      });
    });

    grid.querySelectorAll(".playlist-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.playlistId;
        delete this.playlists[id];
        this._saveToStorage();
        this._renderPlaylists();
        this._toast("🗑️ Playlist deleted");
      });
    });
  }

  _openPlaylist(id) {
    const pl = this.playlists[id];
    if (!pl) return;
    const songs = this.player.playlist.filter((s) => pl.songIds.includes(s.id));
    if (!songs.length) {
      this._toast("This playlist is empty");
      return;
    }
    this.player.setPlaylist(songs);
    this.player.play(0);
    this._switchView("player");
    document.querySelector('[data-view="player"]').click();
    this._toast(`${pl.emoji} Playing "${pl.name}"`);
  }

  _openAddToPlaylist(songId) {
    this.pendingAddSongId = songId;
    const pls = Object.entries(this.playlists);
    const listEl = document.getElementById("playlistSelectList");

    if (!pls.length) {
      this._toast("Create a playlist first!");
      return;
    }

    listEl.innerHTML = pls
      .map(
        ([id, pl]) => `
      <div class="playlist-select-item" data-playlist-id="${id}">
        <span>${pl.emoji}</span>
        <span>${pl.name}</span>
        <span style="color:var(--text3);font-size:11px;margin-left:auto">${pl.songIds.length} songs</span>
      </div>
    `,
      )
      .join("");

    listEl.querySelectorAll(".playlist-select-item").forEach((item) => {
      item.addEventListener("click", () => {
        const pid = item.dataset.playlistId;
        if (!this.playlists[pid].songIds.includes(this.pendingAddSongId)) {
          this.playlists[pid].songIds.push(this.pendingAddSongId);
          this._saveToStorage();
          this._renderPlaylists();
          this._toast(`✅ Added to "${this.playlists[pid].name}"!`);
        } else {
          this._toast("Song already in playlist");
        }
        this._closeModal();
      });
    });

    // Hide first modal, show second
    document.getElementById("playlistModal").style.display = "none";
    document.getElementById("addToPlaylistModal").style.display = "block";
    this._openModal("addToPlaylistModal");
  }

  // ===== MODALS =====
  _openModal(id) {
    const overlay = document.getElementById("modalOverlay");
    overlay.classList.add("active");
    // Show correct modal
    document
      .querySelectorAll(".modal")
      .forEach((m) => (m.style.display = "none"));
    document.getElementById(id).style.display = "block";
  }

  _closeModal() {
    document.getElementById("modalOverlay").classList.remove("active");
    // Reset to default
    document.getElementById("playlistModal").style.display = "block";
    document.getElementById("addToPlaylistModal").style.display = "none";
  }

  // ===== TOAST =====
  _toast(msg, duration = 2500) {
    const container = document.getElementById("toastContainer");
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
}
