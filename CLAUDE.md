# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ISOLATION is a local music player where the library renders as a 3D night sky: each album is a star, every 20 albums form a constellation, every 100 albums spawn a planet. Entirely client-side — no server, no accounts, no telemetry. Files never leave the browser.

## Commands

```sh
npm install        # one-time setup
npm run dev        # Vite dev server with hot reload
npm run build      # production build to dist/
npm run preview    # serve the production build
```

There is no test suite or linter. CI (`.github/workflows/ci.yml`) runs `npm ci && npm run build` on Node 22; `deploy.yml` publishes `dist/` to GitHub Pages on pushes to main. The bar before submitting changes is: `npm run build && npm run preview` succeeds with no console errors (see CONTRIBUTING.md).

To exercise the sky without local music files, use the mock album buttons in the Library panel (`addMockAlbums` in `src/importer.js`). Opening the app with `#debug` in the URL exposes `window.__sky` with a camera `aim(dir, zoom)` helper (`src/sky.js`).

## Hard constraints

- **No runtime dependencies.** Vite is the only dev dependency, used solely for dev server and build. If a feature seems to need a library, open an issue first — do not add packages.
- **No framework.** Plain ES modules (`"type": "module"`), direct DOM manipulation, a single 2D canvas for rendering.
- **Keep module boundaries.** Rendering belongs in `src/sky.js`, audio in `src/audio.js`, persistence in `src/db.js` and `src/state.js`, DOM work in `src/ui.js`.
- **Visual identity is a deliberate design constraint** (acid-print palette: void black, wireframe green `#3DFF6E`, mesh pink, glitch red; CRT mono type; wireframe rendering; ALL-CAPS text). Changes to it need an issue discussion first.
- **Source files are never modified.** Tag edits are stored in the library database only.
- Code style: two-space indentation, single quotes, semicolons, small focused functions.
- License is AGPL-3.0-only.

## Architecture

Boot flow: `index.html` is the static shell (transport hub, panels, HUD markup); `src/main.js` loads persisted state, initializes the UI, then initializes the sky with callbacks that bridge the two (playing index, pause state, spectrum data, star click → play album).

```
src/state.js     central mutable `state` object + persistence + resolving playable Files
src/db.js        IndexedDB wrapper: 'albums' and 'playlists' stores + a 'kv' store (settings, EQ)
src/importer.js  folder walking, album grouping rule, mock albums
src/tags.js      binary metadata parser: ID3v2.2/2.3/2.4, FLAC Vorbis+PICTURE, MP4/M4A ilst
src/pixel.js     artwork → 24x24 pixelated mosaic data URL; generated sprite fallback
src/audio.js     <audio> element → 10x BiquadFilter EQ chain → gain → analyser (FFT for viz)
src/sky.js       celestial-sphere renderer, camera, planets, visualizer drawing
src/ui.js        transport, slide-up panels, playlists, tag editor, EQ, toasts
```

Cross-module data flow worth knowing:

- **State and persistence.** `src/state.js` owns the singleton `state`. Albums/playlists persist to IndexedDB; File System Access API directory handles are structured-cloneable in Chromium, so the library survives reloads there (permission is re-requested on playback via `resolveFile`). The fallback import path (`webkitdirectory` input, used by Firefox/Safari) yields plain `File` objects that cannot persist — they live in `state.sessionFiles` for the session only. `persistableAlbum` strips `file` fields before writing to the DB.
- **Track identity.** Tracks are addressed as `albumId:trackIdx` strings (`trackId`/`findTrack` in state.js). Playlists store these IDs, so reordering tracks within an album would break playlist references.
- **The album grouping rule** (`src/importer.js`): one imported folder = one album, unless it contains subfolders — then each first-level subfolder is its own album and deeper nesting (disc folders) collapses into its parent. Loose files next to subfolders become an album named after the root. Both import paths (directory picker and flat FileList) must implement the same rule. Album metadata is the majority vote across per-track tags, uppercased.
- **The renderer** (`src/sky.js`) is a single 2D canvas doing its own perspective projection — no WebGL. Stars are unit vectors on a sphere around the camera; constellation bearings follow a golden-angle spiral so groups never overlap; the ground grid is world-fixed so it swings as the view yaws. Star/planet layout is generated from seeded PRNGs (`srnd`), so it is deterministic per album count. The sky only knows album *indices*; it gets labels and playback state through the callbacks wired in `main.js`.
- **Audio graph** (`src/audio.js`) is built lazily on first play: MediaElementSource → lowshelf + 8 peaking + highshelf biquads (31 Hz–16 kHz) → gain → analyser → destination. `engine.spectrum(n)` resamples FFT bins for the visualizer, consumed by sky.js via ui.js's `getSpectrum`.

## Browser support nuance

Chromium gets full persistence via `showDirectoryPicker` (`supportsFSAccess` in importer.js gates this). Firefox/Safari fall back to the `webkitdirectory` input: metadata persists, but files must be re-imported each session. Any import or playback change needs to work on both paths.
