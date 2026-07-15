import './styles.css';
import { state } from './state.js';
import { loadPersisted } from './state.js';
import { initSky, syncStars, PITCH_MIN, PITCH_MAX } from './sky.js';
import { initUI, updateStats, playAlbum, toast, getSpectrum } from './ui.js';

const DEG = 180 / Math.PI;

// Two-way binding between the top ROTATE/TILT sliders and the sky camera:
// slider input steers the view; drag/inertia on the canvas flows back into
// the sliders so they always show where you're looking.
function bindViewBar(view) {
  const yawEl = document.getElementById('vYaw');
  const pitchEl = document.getElementById('vPitch');
  const yawVal = document.getElementById('vYawVal');
  const pitchVal = document.getElementById('vPitchVal');
  let held = false;
  for (const el of [yawEl, pitchEl]) {
    el.addEventListener('pointerdown', () => { held = true; });
    el.addEventListener('pointerup', () => { held = false; });
    el.addEventListener('pointercancel', () => { held = false; });
  }
  pitchEl.min = Math.ceil(PITCH_MIN * DEG);
  pitchEl.max = Math.floor(PITCH_MAX * DEG);

  yawEl.addEventListener('input', () => view.setYaw(+yawEl.value / DEG));
  pitchEl.addEventListener('input', () => view.setPitch(+pitchEl.value / DEG));

  (function sync() {
    const { yaw, pitch } = view.view();
    const yawDeg = ((yaw * DEG) % 360 + 360) % 360;
    const pitchDeg = pitch * DEG;
    if (!held) {
      yawEl.value = yawDeg;
      pitchEl.value = pitchDeg;
    }
    yawVal.textContent = Math.round(yawDeg) + '°';
    pitchVal.textContent = Math.round(pitchDeg) + '°';
    requestAnimationFrame(sync);
  })();
}

async function boot() {
  await loadPersisted();

  initUI();
  syncStars(state.albums.length);
  updateStats();

  const view = initSky(document.getElementById('sky'), {
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

  bindViewBar(view);
}

boot();
