// DOM layer: transport hub, slide-up panels, toasts, HUD toggle.

import {
  state, currentTrack, currentAlbum, findTrack, trackId,
  saveAlbum, savePlaylist, deletePlaylist, saveSettings, clearLibrary, resolveFile,
} from './state.js';
import { engine, EQ_LABELS } from './audio.js';
import { importViaPicker, importViaInput, addMockAlbums, supportsFSAccess } from './importer.js';
import { syncStars, constellations, VIZ_N } from './sky.js';

const $ = (id) => document.getElementById(id);

const EQ_PRESETS = {
  'FLAT': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'BASS RITUAL': [8, 7, 5, 2, 0, -1, 0, 1, 2, 3],
  'VOCAL CULT': [-2, -1, 0, 2, 4, 5, 4, 2, 0, -1],
  'AIRWAVE': [0, 0, 0, 0, 0, 1, 2, 4, 6, 7],
  'TUNNEL': [6, 4, 0, -3, -5, -5, -3, 0, 4, 6],
};

let activeTab = null;
let tagAlbumIdx = 0;

export function fmt(s) {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/* ---------- toast ---------- */
let toastTimer;
export function toast(msg) {
  const el = $('toast');
  el.textContent = '⟨' + msg + '⟩';
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.opacity = '0'), 2600);
}

/* ---------- stats HUD ---------- */
export function updateStats() {
  const n = state.albums.length;
  $('stStars').textContent = n + ' STARS⟩';
  $('stConst').textContent = Math.floor(n / 20) + ' FORMED⟩';
  $('stPlan').textContent = Math.floor(n / 100) + ' SPAWNED⟩';
  $('stBar').style.width = ((n % 20) / 20) * 100 + '%';
  $('stNext').textContent = 'NEXT CONSTELLATION: ' + (n % 20) + '/20 · NEXT PLANET: ' + (n % 100) + '/100';
}

function applyHud() {
  $('statbox').classList.toggle('off', !state.settings.hud);
  $('hudChip').classList.toggle('on', !state.settings.hud);
}

/* ---------- playback ---------- */
async function startTrack() {
  const album = currentAlbum();
  if (!album) return;
  const idx = state.playing.trackIdx;
  const file = await resolveFile(album, idx);
  if (file) {
    try {
      await engine.playFile(file, state.eq.gains);
    } catch {
      toast('PLAYBACK BLOCKED — TAP PLAY');
      state.paused = true;
    }
  } else {
    engine.stop();
    if (album.source === 'local') {
      toast('FILE UNREACHABLE — RE-GRANT FOLDER ACCESS OR RE-IMPORT');
      state.paused = true;
    }
    // mock albums tick on a simulated clock
  }
  renderNP();
}

export function playAlbum(albumIdx, trackIdx) {
  state.playing = { albumIdx, trackIdx };
  state.paused = false;
  state.pos = 0;
  startTrack();
  refreshPanel();
}

export function nextTrack(d = 1) {
  if (!state.playing) return;
  const album = currentAlbum();
  let ti = state.playing.trackIdx + d;
  if (ti < 0) ti = album.tracks.length - 1;
  if (ti >= album.tracks.length) ti = 0;
  state.playing.trackIdx = ti;
  state.pos = 0;
  startTrack();
  refreshPanel();
}

function isRealTrack() {
  const album = currentAlbum();
  if (!album) return false;
  const t = currentTrack();
  return !!(t && (t.handle || state.sessionFiles.has(t.id)));
}

export function renderNP() {
  const tr = currentTrack();
  const artEl = $('npArt');
  if (!tr) {
    $('npTitle').textContent = 'NOTHING PLAYING';
    $('npSub').textContent = '— PICK A STAR —';
    artEl.style.display = 'none';
  } else {
    const a = currentAlbum();
    $('npTitle').textContent = tr.title;
    $('npSub').textContent = a.artist + ' · ' + a.title;
    $('tEnd').textContent = fmt(tr.len);
    if (a.art) { artEl.src = a.art; artEl.style.display = 'block'; }
    else artEl.style.display = 'none';
  }
  $('btPlay').textContent = state.paused ? '►' : '▮▮';
}

function tick() {
  const tr = currentTrack();
  if (!tr || state.paused) return;
  if (isRealTrack()) {
    state.pos = engine.position();
    const d = engine.duration();
    if (d && Math.abs(d - tr.len) > 0.5) {
      tr.len = d;
      const album = currentAlbum();
      if (album.source === 'local') saveAlbum(album);
    }
  } else {
    state.pos += 0.25;
    if (state.pos >= tr.len) { nextTrack(); return; }
  }
  $('tCur').textContent = fmt(state.pos);
  $('tEnd').textContent = fmt(tr.len);
  $('seekFill').style.width = (tr.len ? (state.pos / tr.len) * 100 : 0) + '%';
}

/* ---------- panels ---------- */
function closePanel() {
  $('panel').classList.remove('open');
  activeTab = null;
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('on'));
}

function openTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
  $('panel').classList.add('open');
  refreshPanel();
}

export function refreshPanel() {
  renderNP();
  if (!activeTab || !$('panel').classList.contains('open')) return;
  ({ library: renderLibrary, playlists: renderPlaylists, tags: renderTags, eq: renderEQ, sky: renderSkyLog })[activeTab]();
}

/* ---------- library ---------- */
function renderLibrary() {
  const pbody = $('pbody');
  $('ptitle').textContent = 'LIBRARY // EVERY ALBUM = ONE STAR';
  const n = state.albums.length;
  pbody.innerHTML = `
    <div class="lib-tools">
      <button class="btn pink" id="importDir">IMPORT FOLDER ⟨LOCAL FILES⟩</button>
      <button class="btn ghost" id="addMock">+ MOCK ALBUM</button>
      <button class="btn ghost" id="addTwenty">+20 ⟨CONSTELLATION⟩</button>
      <button class="btn ghost" id="addHundred">FILL TO ${Math.ceil((n + 1) / 100) * 100} ⟨PLANET⟩</button>
      <button class="btn ghost" id="clearLib">CLEAR SKY</button>
      <span class="note">// one folder = one album · subfolders inside = separate albums</span>
    </div>
    <div class="albums" id="albGrid"></div>
    ${n === 0 ? '<div class="empty">THE SKY IS BARE. IMPORT A FOLDER TO SPAWN YOUR FIRST STAR.</div>' : ''}`;
  const grid = pbody.querySelector('#albGrid');
  state.albums.forEach((a, i) => {
    const d = document.createElement('div');
    d.className = 'alb' + (state.playing && state.playing.albumIdx === i ? ' playing' : '');
    d.innerHTML =
      (a.art ? `<img class="art" src="${a.art}" alt="">` : '<div class="star-ico"></div>') +
      `<div class="meta">
        <div class="t"></div><div class="a"></div>
        <div class="y">${a.year} · ${esc(a.genre)} · ${a.tracks.length} TRK${a.source === 'mock' ? ' · MOCK' : ''}</div>
      </div>`;
    d.querySelector('.t').textContent = a.title;
    d.querySelector('.a').textContent = a.artist;
    d.onclick = () => { playAlbum(i, 0); toast('NOW ORBITING: ' + a.title); };
    grid.appendChild(d);
  });

  pbody.querySelector('#importDir').onclick = async () => {
    try {
      const progress = (done, total, name) => { $('ptitle').textContent = `IMPORTING ${esc(name)} — ${done}/${total}`; };
      const before = state.albums.length;
      const added = supportsFSAccess ? await importViaPicker(progress) : await importViaInput(progress);
      afterAdd(before, added, true);
    } catch (e) {
      if (e && e.name !== 'AbortError') toast('IMPORT FAILED');
      refreshPanel();
    }
  };
  pbody.querySelector('#addMock').onclick = async () => afterAdd(state.albums.length, await addMockAlbums(1));
  pbody.querySelector('#addTwenty').onclick = async () => afterAdd(state.albums.length, await addMockAlbums(20));
  pbody.querySelector('#addHundred').onclick = async () => {
    const target = Math.ceil((state.albums.length + 1) / 100) * 100;
    afterAdd(state.albums.length, await addMockAlbums(target - state.albums.length));
  };
  pbody.querySelector('#clearLib').onclick = async () => {
    engine.stop();
    state.paused = true;
    await clearLibrary();
    syncStars(0);
    updateStats();
    refreshPanel();
    toast('SKY CLEARED');
  };
}

function afterAdd(before, added, imported = false) {
  const n = state.albums.length;
  syncStars(n);
  updateStats();
  refreshPanel();
  if (Math.floor(n / 100) > Math.floor(before / 100)) toast('PLANET SPAWNED. CONSIDER YOU GOD?');
  else if (Math.floor(n / 20) > Math.floor(before / 20)) toast('CONSTELLATION FORMED: CST-' + String(Math.floor(n / 20)).padStart(2, '0'));
  else if (imported) toast(added + (added === 1 ? ' ALBUM' : ' ALBUMS') + ' IMPORTED · ' + added + (added === 1 ? ' STAR' : ' STARS') + ' SPAWNED');
  else toast('STAR SPAWNED');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- playlists ---------- */
function renderPlaylists() {
  const pbody = $('pbody');
  $('ptitle').textContent = 'PLAYLISTS // DEVOTED SEQUENCES';
  let html = `
    <div class="lib-tools">
      <input id="plName" class="txt-in" placeholder="NEW PLAYLIST NAME" aria-label="New playlist name">
      <button class="btn" id="plCreate">CREATE</button>
    </div>`;
  if (!state.playlists.length) html += '<div class="empty">NO PLAYLISTS YET.</div>';
  state.playlists.forEach((pl, pi) => {
    html += `<h3 class="sec">⟨${esc(pl.name)}⟩ · ${pl.trackIds.length} TRACKS
      <button class="mini red" data-delpl="${pi}">DELETE</button></h3><div class="rows">`;
    if (!pl.trackIds.length) html += '<div class="empty">EMPTY. ADD TRACKS BELOW ↓</div>';
    pl.trackIds.forEach((tid, k) => {
      const f = findTrack(tid);
      if (!f) return;
      html += `<div class="row-item"><span class="num">${String(k + 1).padStart(2, '0')}</span>
        <span class="grow">${esc(f.track.title)} <span class="dim">// ${esc(f.album.title)}</span></span>
        <span class="dim">${f.track.len ? fmt(f.track.len) : '—'}</span>
        <button class="mini" data-play="${tid}">PLAY</button>
        <button class="mini red" data-rm="${pi}:${k}">✕</button></div>`;
    });
    html += '</div>';
  });
  if (state.albums.length) {
    html += `<h3 class="sec">ADD TRACK TO PLAYLIST</h3>
      <div class="lib-tools">
        <select id="plPick" class="sel-in" aria-label="Playlist">
          ${state.playlists.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}
        </select>
        <select id="trPick" class="sel-in wide" aria-label="Track">
          ${state.albums.map((a) => a.tracks.map((t) => `<option value="${t.id}">${esc(a.title)} — ${esc(t.title)}</option>`).join('')).join('')}
        </select>
        <button class="btn pink" id="plAdd">+ ADD</button>
      </div>`;
  }
  pbody.innerHTML = html;

  pbody.querySelector('#plCreate').onclick = async () => {
    const v = pbody.querySelector('#plName').value.trim().toUpperCase();
    if (!v) { toast('NAME REQUIRED'); return; }
    const pl = { id: 'p' + Date.now().toString(36), name: v, trackIds: [] };
    state.playlists.push(pl);
    await savePlaylist(pl);
    renderPlaylists();
    toast('PLAYLIST CREATED: ' + v);
  };
  const addBtn = pbody.querySelector('#plAdd');
  if (addBtn) addBtn.onclick = async () => {
    if (!state.playlists.length) { toast('CREATE A PLAYLIST FIRST'); return; }
    const pl = state.playlists[+pbody.querySelector('#plPick').value];
    pl.trackIds.push(pbody.querySelector('#trPick').value);
    await savePlaylist(pl);
    renderPlaylists();
    toast('TRACK ADDED');
  };
  pbody.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => {
    const [pi, k] = b.dataset.rm.split(':').map(Number);
    state.playlists[pi].trackIds.splice(k, 1);
    await savePlaylist(state.playlists[pi]);
    renderPlaylists();
  }));
  pbody.querySelectorAll('[data-delpl]').forEach((b) => (b.onclick = async () => {
    const [pl] = state.playlists.splice(+b.dataset.delpl, 1);
    await deletePlaylist(pl.id);
    renderPlaylists();
    toast('PLAYLIST DELETED');
  }));
  pbody.querySelectorAll('[data-play]').forEach((b) => (b.onclick = () => {
    const f = findTrack(b.dataset.play);
    if (!f) return;
    playAlbum(state.albums.indexOf(f.album), f.trackIdx);
  }));
}

/* ---------- tag editor ---------- */
function renderTags() {
  const pbody = $('pbody');
  $('ptitle').textContent = 'TAG EDITOR // REWRITE THE RECORD';
  if (!state.albums.length) {
    pbody.innerHTML = '<div class="empty">NOTHING TO EDIT — IMPORT A FOLDER FIRST.</div>';
    return;
  }
  if (tagAlbumIdx >= state.albums.length) tagAlbumIdx = 0;
  const a = state.albums[tagAlbumIdx];
  pbody.innerHTML = `
    <div class="lib-tools">
      <select id="tagPick" class="sel-in wide" aria-label="Album to edit">
        ${state.albums.map((x, i) => `<option value="${i}" ${i === tagAlbumIdx ? 'selected' : ''}>${esc(x.title)} — ${esc(x.artist)}</option>`).join('')}
      </select>
    </div>
    <div class="form-grid">
      <div class="field"><label>Album Title</label><input id="fTitle"></div>
      <div class="field"><label>Artist</label><input id="fArtist"></div>
      <div class="field"><label>Year</label><input id="fYear" inputmode="numeric"></div>
      <div class="field"><label>Genre</label><input id="fGenre"></div>
    </div>
    <div class="lib-tools"><button class="btn" id="tagSave">SAVE TAGS ⟨WRITE⟩</button>
      <span class="note">// saved to the library database — source files are never modified</span></div>
    <h3 class="sec">TRACKLIST — CLICK A TITLE TO RENAME</h3>
    <div class="rows" id="tagTracks"></div>`;
  pbody.querySelector('#fTitle').value = a.title;
  pbody.querySelector('#fArtist').value = a.artist;
  pbody.querySelector('#fYear').value = a.year;
  pbody.querySelector('#fGenre').value = a.genre;

  pbody.querySelector('#tagPick').onchange = (e) => { tagAlbumIdx = +e.target.value; renderTags(); };
  pbody.querySelector('#tagSave').onclick = async () => {
    a.title = pbody.querySelector('#fTitle').value.trim().toUpperCase() || a.title;
    a.artist = pbody.querySelector('#fArtist').value.trim().toUpperCase() || a.artist;
    a.year = parseInt(pbody.querySelector('#fYear').value, 10) || a.year;
    a.genre = pbody.querySelector('#fGenre').value.trim().toUpperCase() || a.genre;
    await saveAlbum(a);
    renderNP();
    renderTags();
    toast('TAGS WRITTEN: ' + a.title);
  };
  const rows = pbody.querySelector('#tagTracks');
  a.tracks.forEach((t, k) => {
    const d = document.createElement('div');
    d.className = 'row-item';
    d.innerHTML = `<span class="num">${String(k + 1).padStart(2, '0')}</span>
      <input class="inline-in" aria-label="Track title">
      <span class="dim">${t.len ? fmt(t.len) : '—'}</span>`;
    const inp = d.querySelector('input');
    inp.value = t.title;
    inp.onblur = async () => {
      const v = inp.value.trim().toUpperCase();
      if (v && v !== t.title) {
        t.title = v;
        inp.value = v;
        await saveAlbum(a);
        renderNP();
      }
    };
    rows.appendChild(d);
  });
}

/* ---------- EQ ---------- */
function renderEQ() {
  const pbody = $('pbody');
  $('ptitle').textContent = 'EQUALIZER // 10-BAND SIGNAL SHAPING';
  pbody.innerHTML = `
    <div class="eq-wrap">
      <div class="eq-presets"><span class="lbl">PRESET:</span>
        ${Object.keys(EQ_PRESETS).map((k) => `<button class="btn ghost" data-preset="${k}">${k}</button>`).join('')}
      </div>
      <div class="eq" id="eqBands"></div>
      <span class="note">// ±12 dB · live BiquadFilterNode chain on local files</span>
    </div>`;
  const wrap = pbody.querySelector('#eqBands');
  EQ_LABELS.forEach((f, i) => {
    const b = document.createElement('div');
    b.className = 'band';
    b.innerHTML = `<span class="val">${gainLabel(state.eq.gains[i])}</span>
      <input type="range" class="v" min="-12" max="12" step="1" value="${state.eq.gains[i]}" aria-label="${f} Hz gain">
      <span class="hz">${f}</span>`;
    const r = b.querySelector('input');
    r.oninput = () => {
      state.eq.gains[i] = +r.value;
      engine.setEqGain(i, +r.value);
      b.querySelector('.val').textContent = gainLabel(+r.value);
      saveSettings();
    };
    wrap.appendChild(b);
  });
  pbody.querySelectorAll('[data-preset]').forEach((btn) => (btn.onclick = () => {
    state.eq.gains = [...EQ_PRESETS[btn.dataset.preset]];
    engine.applyEq(state.eq.gains);
    saveSettings();
    renderEQ();
    toast('EQ PRESET: ' + btn.dataset.preset);
  }));
}

function gainLabel(v) {
  return (v > 0 ? '+' : '') + v + 'dB';
}

/* ---------- sky log ---------- */
function renderSkyLog() {
  const pbody = $('pbody');
  $('ptitle').textContent = 'SKY LOG // EARTH: MOSTLY HARMLESS';
  const n = state.albums.length;
  const nc = Math.floor(n / 20);
  let html = `<h3 class="sec">CELESTIAL CENSUS</h3><div class="rows">
    <div class="row-item"><span class="grow">STARS (ALBUMS)</span><span class="acid">${n}</span></div>
    <div class="row-item"><span class="grow">CONSTELLATIONS (PER 20)</span><span class="pinkv">${nc}</span></div>
    <div class="row-item"><span class="grow">PLANETS (PER 100)</span><span class="acid">${Math.floor(n / 100)}</span></div>
    <div class="row-item"><span class="grow">STARS UNTIL NEXT CONSTELLATION</span><span class="dim">${20 - (n % 20)}</span></div>
    <div class="row-item"><span class="grow">STARS UNTIL NEXT PLANET</span><span class="dim">${100 - (n % 100)}</span></div>
  </div><h3 class="sec">FORMED CONSTELLATIONS</h3><div class="rows">`;
  if (!nc) html += '<div class="empty">NONE YET — REACH 20 ALBUMS</div>';
  constellations().forEach((c, i) => {
    html += `<div class="row-item"><span class="num">${String(i + 1).padStart(2, '0')}</span>
      <span class="grow">⟨${c.name}⟩ <span class="dim">// albums ${i * 20 + 1}–${i * 20 + 20}</span></span></div>`;
  });
  html += '</div>';
  pbody.innerHTML = html;
}

/* ---------- boot ---------- */
export function initUI() {
  // transport
  $('btPlay').onclick = async () => {
    if (!state.playing) {
      if (state.albums.length) playAlbum(0, 0);
      else toast('THE SKY IS BARE — IMPORT A FOLDER');
      return;
    }
    state.paused = !state.paused;
    if (isRealTrack()) {
      if (state.paused) engine.pause();
      else engine.resume().catch(() => {});
    }
    renderNP();
  };
  $('btNext').onclick = () => nextTrack(1);
  $('btPrev').onclick = () => nextTrack(-1);
  $('seekTrack').onclick = (e) => {
    const tr = currentTrack();
    if (!tr || !tr.len) return;
    const r = e.currentTarget.getBoundingClientRect();
    state.pos = tr.len * ((e.clientX - r.left) / r.width);
    if (isRealTrack()) engine.seek(state.pos);
    $('seekFill').style.width = (state.pos / tr.len) * 100 + '%';
    $('tCur').textContent = fmt(state.pos);
  };

  // volume
  const vol = $('vol');
  vol.value = Math.round(state.settings.volume * 100);
  engine.setVolume(state.settings.volume);
  vol.oninput = () => {
    state.settings.volume = vol.value / 100;
    engine.setVolume(state.settings.volume);
    saveSettings();
  };

  // visualizer toggle
  $('btViz').classList.toggle('on', state.settings.viz);
  $('btViz').onclick = () => {
    state.settings.viz = !state.settings.viz;
    $('btViz').classList.toggle('on', state.settings.viz);
    saveSettings();
    toast(state.settings.viz ? 'VISUALIZER ON — THE SKY LISTENS' : 'VISUALIZER OFF');
  };

  // HUD toggle
  applyHud();
  $('hudOff').onclick = () => { state.settings.hud = false; applyHud(); saveSettings(); };
  $('hudChip').onclick = () => { state.settings.hud = true; applyHud(); saveSettings(); };

  // tabs
  document.querySelectorAll('.tab').forEach((b) => {
    b.onclick = () => {
      if (activeTab === b.dataset.tab && $('panel').classList.contains('open')) closePanel();
      else openTab(b.dataset.tab);
    };
  });
  $('pclose').onclick = closePanel;

  engine.onEnded(() => nextTrack(1));
  setInterval(tick, 250);
  setTimeout(() => { $('hint').style.opacity = '0'; }, 9000);

  updateStats();
  renderNP();
}

// Simulated spectrum for mock albums; real FFT for local files.
export function getSpectrum(t) {
  const tr = currentTrack();
  if (!tr || state.paused) return new Array(VIZ_N).fill(0);
  if (engine.hasAnalyser() && isRealTrack()) return engine.spectrum(VIZ_N);
  const out = new Array(VIZ_N);
  for (let i = 0; i < VIZ_N; i++) {
    out[i] = Math.max(0, Math.sin(t * 0.004 + i * 0.55) * Math.sin(t * 0.0013 + i * 0.21)) * (1 - (i / VIZ_N) * 0.6) * 0.8;
  }
  return out;
}
