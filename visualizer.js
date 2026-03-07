class Visualizer {
  constructor(moodSystem) {
    this.mood = moodSystem;
    this.canvas = document.getElementById("visualizer");
    this.ctx = this.canvas.getContext("2d");
    this.wCanvas = document.getElementById("waveformCanvas");
    this.wCtx = this.wCanvas.getContext("2d");
    this.bgCanvas = document.getElementById("bgCanvas");
    this.bgCtx = this.bgCanvas.getContext("2d");

    this.raf = null;
    this.isActive = false;
    this.beatScale = 1;
    this.particles = [];
    this.stars = [];
    this.waveHistory = []; // for waveform playback line

    this._initStars();
    this._resizeAll();
    window.addEventListener("resize", () => this._resizeAll());

    // Beat rings
    this.rings = [
      document.querySelector(".r1"),
      document.querySelector(".r2"),
      document.querySelector(".r3"),
    ];
  }

  _resizeAll() {
    [this.canvas, this.wCanvas, this.bgCanvas].forEach((c) => {
      if (!c) return;
      c.width = c.offsetWidth * devicePixelRatio;
      c.height = c.offsetHeight * devicePixelRatio;
    });
    if (this.bgCanvas) {
      this.bgCanvas.width = window.innerWidth * devicePixelRatio;
      this.bgCanvas.height = window.innerHeight * devicePixelRatio;
    }
    this._initStars();
  }

  _initStars() {
    if (!this.bgCanvas) return;
    this.stars = Array.from({ length: 60 }, () => ({
      x: Math.random() * this.bgCanvas.width,
      y: Math.random() * this.bgCanvas.height,
      r: Math.random() * 1.5 + 0.3,
      speed: Math.random() * 0.3 + 0.05,
      alpha: Math.random(),
      alphaDir: Math.random() > 0.5 ? 1 : -1,
    }));
  }

  start() {
    this.isActive = true;
    this._loop();
  }

  stop() {
    this.isActive = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  _loop() {
    if (!this.isActive) return;
    this.raf = requestAnimationFrame(() => this._loop());

    const spec = this.mood.analyzeSpectrum();
    const isBeat = this.mood.detectBeat(spec);
    this.mood.detectMood(spec);

    if (isBeat) this._spawnParticles(spec);

    this._drawBg(spec);
    this._drawBars(spec);
    this._drawBeatRings(spec, isBeat);
    this._updateParticles(spec);
    this._updateVinyl(spec);
  }

  _drawBg(spec) {
    const c = this.bgCtx;
    const W = this.bgCanvas.width;
    const H = this.bgCanvas.height;
    const dpr = devicePixelRatio;
    c.clearRect(0, 0, W, H);

    // Animated stars
    this.stars.forEach((s) => {
      s.alpha += s.alphaDir * 0.005;
      if (s.alpha >= 1 || s.alpha <= 0) s.alphaDir *= -1;
      s.alpha = Helpers.clamp(s.alpha, 0, 1);
      s.y -= s.speed * (1 + spec.energy * 2);
      if (s.y < 0) {
        s.y = H;
        s.x = Math.random() * W;
      }
      c.beginPath();
      c.arc(s.x, s.y, s.r * dpr, 0, Math.PI * 2);
      c.fillStyle = `rgba(167,139,250,${s.alpha * 0.6})`;
      c.fill();
    });
  }

  _drawBars(spec) {
    const data = this.mood.getFrequencyData();
    if (!data) return;

    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const dpr = devicePixelRatio;

    c.clearRect(0, 0, W, H);

    const moodInfo = this.mood.getMoodInfo();
    const color1 = moodInfo?.color || "#a78bfa";
    const color2 = "#f472b6";

    const barCount = 64;
    const barW = W / barCount - 1;
    const step = Math.floor(data.length / barCount);

    for (let i = 0; i < barCount; i++) {
      const val = data[i * step] / 255;
      const barH = val * H * 0.85;

      const x = i * (barW + 1);
      const y = H - barH;

      // Gradient per bar
      const grad = c.createLinearGradient(x, y, x, H);
      grad.addColorStop(0, color1 + "dd");
      grad.addColorStop(0.5, color2 + "88");
      grad.addColorStop(1, color2 + "22");

      c.fillStyle = grad;
      const r = Math.min(barW / 2, 3);
      c.beginPath();
      c.roundRect
        ? c.roundRect(x, y, barW, barH, [r, r, 0, 0])
        : c.rect(x, y, barW, barH);
      c.fill();

      // Glow cap
      if (val > 0.5) {
        c.fillStyle = color1;
        c.fillRect(x, y - 2, barW, 2);
      }
    }

    // Mirror (bottom half, faded)
    c.save();
    c.globalAlpha = 0.2;
    c.translate(0, H);
    c.scale(1, -1);
    for (let i = 0; i < barCount; i++) {
      const val = data[i * step] / 255;
      const barH = val * H * 0.3;
      const x = i * (barW + 1);
      c.fillStyle = moodInfo?.color || "#a78bfa";
      c.fillRect(x, 0, barW, barH);
    }
    c.restore();
  }

  _drawBeatRings(spec, isBeat) {
    const size = 110 + spec.energy * 60;
    if (isBeat) {
      this.rings.forEach((r, i) => {
        if (!r) return;
        const s = size + i * 20;
        r.style.width = s + "px";
        r.style.height = s + "px";
        r.style.opacity = "0.8";
        r.style.transition = "none";
        setTimeout(
          () => {
            r.style.transition = "all 0.8s ease-out";
            r.style.width = s + 80 + "px";
            r.style.height = s + 80 + "px";
            r.style.opacity = "0";
          },
          10 + i * 50,
        );
      });
    }

    // Continuous pulse on vinyl
    const vinyl = document.querySelector(".vinyl");
    if (vinyl) {
      const scale = 1 + spec.bass * 0.08;
      vinyl.style.transform = `scale(${scale})`;
    }
  }

  _spawnParticles(spec) {
    const center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    const count = Math.floor(spec.energy * 8) + 2;
    const moodColor = this.mood.getMoodInfo()?.color || "#a78bfa";

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 3 + 1) * (spec.energy * 4 + 1);
      this.particles.push({
        x: center.x,
        y: center.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: Math.random() * 3 + 1,
        life: 1,
        decay: Math.random() * 0.03 + 0.01,
        color: moodColor,
      });
    }

    // Trim
    if (this.particles.length > 200) this.particles.splice(0, 50);
  }

  _updateParticles(spec) {
    const c = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.life -= p.decay;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fillStyle =
        p.color +
        Math.floor(p.life * 255)
          .toString(16)
          .padStart(2, "0");
      c.fill();
    }
  }

  _updateVinyl(spec) {
    const vinyl = document.querySelector(".vinyl");
    if (!vinyl) return;
    // spinning handled by CSS; just ensure class
    const playing = document.querySelector(".ctrl-btn-play.playing");
    vinyl.classList.toggle("spinning", !!playing);
  }

  /** Draw the waveform progress bar */
  drawWaveform(progress, data) {
    if (!this.wCanvas) return;
    const c = this.wCtx;
    const W = this.wCanvas.width;
    const H = this.wCanvas.height;
    const dpr = devicePixelRatio;

    c.clearRect(0, 0, W, H);

    const bars = 80;
    const bw = W / bars - 1;
    const playedX = progress * W;

    // Generate pseudo-waveform if no real data
    if (!this.waveCache || this.waveCache.length !== bars) {
      this.waveCache = Array.from(
        { length: bars },
        (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(i * 0.4) * Math.cos(i * 0.15)),
      );
    }

    for (let i = 0; i < bars; i++) {
      const x = i * (bw + 1);
      const h = this.waveCache[i] * H * 0.75;
      const y = (H - h) / 2;
      const played = x + bw < playedX;
      const current = x <= playedX && playedX < x + bw;

      if (played) {
        c.fillStyle = "#a78bfa";
      } else if (current) {
        c.fillStyle = "#f472b6";
      } else {
        c.fillStyle = "rgba(255,255,255,0.12)";
      }

      c.beginPath();
      c.roundRect ? c.roundRect(x, y, bw, h, 2) : c.rect(x, y, bw, h);
      c.fill();
    }

    // Playhead
    c.fillStyle = "#fff";
    c.fillRect(playedX - 1, 0, 2, H);
  }
}
