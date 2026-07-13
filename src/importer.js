// Folder import. The rule: one folder = one album — unless the folder contains
// subfolders, in which case each first-level subfolder becomes its own album
// (deeper nesting, e.g. disc folders, collapses into its parent album).
// Loose files sitting next to subfolders form an album named after the root.

import { state, trackId, saveAlbum } from './state.js';
import { readTags } from './tags.js';
import { pixelate, makeMockArt } from './pixel.js';

const AUDIO_RE = /\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|webm)$/i;
const IMG_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;

export const supportsFSAccess = 'showDirectoryPicker' in window;

function newGroup(name) {
  return { name, tracks: [], images: [] };
}

// Walk a FileSystemDirectoryHandle into album groups per the folder rule.
async function walkDirectory(dir) {
  const groups = new Map();
  const root = newGroup(dir.name);

  async function collect(handle, group) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        if (AUDIO_RE.test(entry.name)) group.tracks.push({ name: entry.name, handle: entry });
        else if (IMG_RE.test(entry.name)) group.images.push({ name: entry.name, handle: entry });
      } else {
        await collect(entry, group); // deeper nesting collapses into the album
      }
    }
  }

  for await (const entry of dir.values()) {
    if (entry.kind === 'file') {
      if (AUDIO_RE.test(entry.name)) root.tracks.push({ name: entry.name, handle: entry });
      else if (IMG_RE.test(entry.name)) root.images.push({ name: entry.name, handle: entry });
    } else {
      const g = newGroup(entry.name);
      await collect(entry, g);
      if (g.tracks.length) groups.set(entry.name, g);
    }
  }
  if (root.tracks.length) groups.set('.', root);
  return groups;
}

// Group a flat FileList (webkitdirectory fallback) the same way.
function groupFileList(files) {
  const groups = new Map();
  for (const f of files) {
    const parts = (f.webkitRelativePath || f.name).split('/');
    const key = parts.length >= 3 ? parts[1] : '.';
    const name = parts.length >= 3 ? parts[1] : parts[0];
    if (!groups.has(key)) groups.set(key, newGroup(name));
    const g = groups.get(key);
    if (AUDIO_RE.test(f.name)) g.tracks.push({ name: f.name, file: f });
    else if (IMG_RE.test(f.name)) g.images.push({ name: f.name, file: f });
  }
  for (const [k, g] of groups) if (!g.tracks.length) groups.delete(k);
  return groups;
}

function pickCoverImage(images) {
  return images.find((i) => /cover|folder|front|album/i.test(i.name)) || images[0] || null;
}

async function toFile(entry) {
  if (entry.file) return entry.file;
  try { return await entry.handle.getFile(); } catch { return null; }
}

function majority(values) {
  const counts = new Map();
  let best = null, n = 0;
  for (const v of values) {
    if (!v) continue;
    const c = (counts.get(v) || 0) + 1;
    counts.set(v, c);
    if (c > n) { n = c; best = v; }
  }
  return best;
}

async function buildAlbum(group, onProgress) {
  group.tracks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const tags = [];
  let picture = null;
  for (const [i, entry] of group.tracks.entries()) {
    const f = await toFile(entry);
    const t = f ? await readTags(f) : {};
    tags.push(t);
    if (!picture && t.picture) picture = t.picture;
    onProgress?.(i + 1, group.tracks.length, group.name);
  }
  if (!picture) {
    const cover = pickCoverImage(group.images);
    if (cover) picture = await toFile(cover);
  }

  const album = {
    id,
    order: Date.now(),
    title: (majority(tags.map((t) => t.album)) || group.name).toUpperCase(),
    artist: (majority(tags.map((t) => t.artist)) || 'UNKNOWN ARTIST').toUpperCase(),
    year: majority(tags.map((t) => t.year)) || new Date().getFullYear(),
    genre: (majority(tags.map((t) => t.genre)) || 'LOCAL').toUpperCase(),
    art: (await pixelate(picture)) || makeMockArt(id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)),
    source: 'local',
    tracks: group.tracks.map((entry, k) => ({
      id: trackId(id, k),
      title: (tags[k].title || entry.name.replace(/\.[^.]+$/, '')).toUpperCase(),
      len: 0,
      handle: entry.handle || null,
    })),
  };

  // Fallback-imported files only live for this session.
  group.tracks.forEach((entry, k) => {
    if (entry.file) state.sessionFiles.set(trackId(id, k), entry.file);
  });

  return album;
}

async function ingestGroups(groups, onProgress) {
  let added = 0;
  for (const g of groups.values()) {
    const album = await buildAlbum(g, onProgress);
    state.albums.push(album);
    await saveAlbum(album);
    added++;
  }
  return added;
}

export async function importViaPicker(onProgress) {
  const dir = await window.showDirectoryPicker({ mode: 'read' });
  const groups = await walkDirectory(dir);
  return ingestGroups(groups, onProgress);
}

export function importViaInput(onProgress) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.setAttribute('webkitdirectory', '');
    inp.onchange = async () => {
      const groups = groupFileList([...inp.files]);
      resolve(await ingestGroups(groups, onProgress));
    };
    inp.click();
  });
}

/* ---------- mock albums (demo sky without local files) ---------- */

let mockSeed = 1337;
const mrnd = () => ((mockSeed = (48271 * mockSeed) % 2147483647) / 2147483647);
const ADJ = ['HOPELESS', 'NEON', 'TERMINAL', 'WIRED', 'SILENT', 'ORBITAL', 'BROKEN', 'ACID', 'VOID', 'FERAL', 'STATIC', 'LUCID', 'GRID', 'HOLLOW', 'MAGNETIC', 'PALE', 'RADIO', 'GHOST', 'SODIUM', 'ASH'];
const NOUN = ['WORLD', 'TUNNEL', 'GARDEN', 'SIGNAL', 'HARVEST', 'MACHINE', 'WEATHER', 'CHAPEL', 'MIRROR', 'HIGHWAY', 'FREQUENCY', 'BODIES', 'PARADISE', 'ANTENNA', 'WINTER', 'THEATRE', 'CIRCUIT', 'LAGOON', 'SERMON', 'ARCADE'];
const ARTISTS = ['WAYV COLLECTIVE', 'KIDMOGRAPH', 'MOSTLY HARMLESS', 'DEVOTED FOLLOWERS', 'EARTH TERMINAL', 'THE RESTRICTED', 'GRID RUNNERS', 'SODIUM CHOIR', 'PALE ANTENNA', 'DESTRUCTION UNIT 99'];
const GENRES = ['SYNTHWAVE', 'DARKWAVE', 'POST-PUNK', 'IDM', 'SHOEGAZE', 'INDUSTRIAL', 'DREAM POP', 'EBM'];

export async function addMockAlbums(count) {
  let added = 0;
  for (let j = 0; j < count; j++) {
    const n = state.albums.length + 1;
    const id = 'm' + Date.now().toString(36) + n + Math.random().toString(36).slice(2, 5);
    const nTracks = 6 + Math.floor(mrnd() * 5);
    const album = {
      id,
      order: Date.now() + j,
      title: ADJ[Math.floor(mrnd() * ADJ.length)] + ' ' + NOUN[Math.floor(mrnd() * NOUN.length)],
      artist: ARTISTS[Math.floor(mrnd() * ARTISTS.length)],
      year: 1994 + Math.floor(mrnd() * 32),
      genre: GENRES[Math.floor(mrnd() * GENRES.length)],
      art: makeMockArt(n * 31 + j),
      source: 'mock',
      tracks: Array.from({ length: nTracks }, (_, t) => ({
        id: trackId(id, t),
        title: NOUN[Math.floor(mrnd() * NOUN.length)] + ' ' + String(t + 1).padStart(2, '0'),
        len: 150 + Math.floor(mrnd() * 150),
        handle: null,
      })),
    };
    state.albums.push(album);
    await saveAlbum(album);
    added++;
  }
  return added;
}
