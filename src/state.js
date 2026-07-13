// Central app state + persistence. Albums and playlists live in IndexedDB;
// lightweight settings (EQ, toggles, volume) live alongside them in a kv store.

import * as db from './db.js';

export const state = {
  albums: [],       // {id, title, artist, year, genre, art, source, tracks:[{id,title,len,handle?}]}
  playlists: [],    // {id, name, trackIds:[albumId:trackIdx]}
  playing: null,    // {albumIdx, trackIdx}
  paused: true,
  pos: 0,
  eq: { gains: new Array(10).fill(0) },
  settings: { hud: true, viz: false, volume: 0.72 },
  // session-only File objects for albums imported via the fallback picker
  // (webkitdirectory files are not persistable across reloads)
  sessionFiles: new Map(), // trackId -> File
};

export function trackId(albumId, trackIdx) {
  return `${albumId}:${trackIdx}`;
}

export function findTrack(tid) {
  const sep = tid.lastIndexOf(':');
  const albumId = tid.slice(0, sep);
  const idx = +tid.slice(sep + 1);
  const album = state.albums.find((a) => a.id === albumId);
  if (!album || !album.tracks[idx]) return null;
  return { album, track: album.tracks[idx], trackIdx: idx };
}

export function currentTrack() {
  if (!state.playing) return null;
  const a = state.albums[state.playing.albumIdx];
  return a ? a.tracks[state.playing.trackIdx] : null;
}

export function currentAlbum() {
  return state.playing ? state.albums[state.playing.albumIdx] : null;
}

/* ---------- persistence ---------- */

function persistableAlbum(a) {
  // File objects can't be stored; directory-picker handles can.
  return {
    ...a,
    tracks: a.tracks.map(({ file, ...t }) => t),
  };
}

export async function saveAlbum(a) {
  try { await db.put('albums', persistableAlbum(a)); } catch { /* private mode etc. */ }
}

export async function savePlaylist(p) {
  try { await db.put('playlists', p); } catch { /* ignore */ }
}

export async function deletePlaylist(id) {
  try { await db.del('playlists', id); } catch { /* ignore */ }
}

export async function saveSettings() {
  try {
    await db.kvSet('settings', state.settings);
    await db.kvSet('eq', state.eq.gains);
  } catch { /* ignore */ }
}

export async function clearLibrary() {
  state.albums = [];
  state.playlists = [];
  state.playing = null;
  state.sessionFiles.clear();
  try {
    await db.clear('albums');
    await db.clear('playlists');
  } catch { /* ignore */ }
}

export async function loadPersisted() {
  try {
    const [albums, playlists, settings, eq] = await Promise.all([
      db.getAll('albums'),
      db.getAll('playlists'),
      db.kvGet('settings'),
      db.kvGet('eq'),
    ]);
    albums.sort((a, b) => a.order - b.order);
    state.albums = albums;
    state.playlists = playlists;
    if (settings) Object.assign(state.settings, settings);
    if (Array.isArray(eq) && eq.length === 10) state.eq.gains = eq;
  } catch { /* start fresh */ }
}

/* ---------- resolving a playable File for a track ---------- */

export async function resolveFile(album, trackIdx) {
  const t = album.tracks[trackIdx];
  if (!t) return null;
  const sessionFile = state.sessionFiles.get(trackId(album.id, trackIdx));
  if (sessionFile) return sessionFile;
  if (t.handle) {
    try {
      if ((await t.handle.queryPermission({ mode: 'read' })) !== 'granted') {
        if ((await t.handle.requestPermission({ mode: 'read' })) !== 'granted') return null;
      }
      return await t.handle.getFile();
    } catch {
      return null;
    }
  }
  return null;
}
