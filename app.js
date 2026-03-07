let player, mood, viz, ui;

document.addEventListener("DOMContentLoaded", () => {
  // Init systems
  player = new PlayerEngine();
  mood = new MoodSystem();
  viz = new Visualizer(mood);
  ui = new UIController(player, mood, viz);

  // Wire up player callbacks
  player.onStateChange = () => {
    ui.updatePlayButton();
    if (player.isPlaying) {
      mood.initialize(document.getElementById("audioPlayer"));
      mood.resume();
    }
  };

  player.onTimeUpdate = () => {
    ui.updateProgress();
  };

  player.onSongChange = (song) => {
    ui.updateSongInfo();
    ui._updateInsights();
  };

  // Set initial volume
  player.setVolume(75);

  console.log("🚀 NOVA Music Player v2.0 ready");
});
