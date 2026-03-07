class Helpers {
  static formatTime(seconds) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  static formatTimeShort(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  static generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static extractMetadata(filename) {
    const name = filename.replace(/\.[^/.]+$/, "");
    const parts = name.split(/\s*-\s*/);

    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        name: parts.slice(1).join(" - ").trim(),
      };
    }

    return { artist: "Unknown Artist", name: name.trim() };
  }

  static isAudioFile(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    return ["mp3", "wav", "flac", "m4a", "aac", "ogg", "wma", "opus"].includes(ext);
  }

  static lerp(a, b, t) {
    return a + (b - a) * t;
  }

  static clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  static smoothstep(x) {
    return x * x * (3 - 2 * x);
  }
}
