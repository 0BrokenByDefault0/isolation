import './styles.css';
import { state } from './state.js';
import { loadPersisted } from './state.js';
import { initSky, syncStars } from './sky.js';
import { initUI, updateStats, playAlbum, toast, getSpectrum } from './ui.js';

async function boot() {
  await loadPersisted();

  initUI();
  syncStars(state.albums.length);
  updateStats();

  initSky(document.getElementById('sky'), {
    getPlayingIndex: () => (state.playing ? state.playing.albumIdx : -1),
    isPaused: () => state.paused,
    isVizOn: () => state.settings.viz,
    getSpectrum,
    getStarLabel: (i) => {
      const a = state.albums[i];
      return a ? a.title + ' — ' + a.artist : '';
    },
    onStarClick: (i) => {
      const a = state.albums[i];
      if (!a) return;
      playAlbum(i, 0);
      toast('NOW ORBITING: ' + a.title);
    },
  });
}

boot();
