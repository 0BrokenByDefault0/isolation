# ISOLATION?

A local music player where your library becomes a night sky.

Every album you add spawns a **star** — it glows brighter while you're
listening to it. Every 20 albums wire together into a **constellation**.
Every 100 albums spawns a wireframe **planet** in your sky.

The aesthetic is acid-print poster: grainy void black, wireframe green,
mesh pink, glitch red, CRT mono type, perspective grid horizon.

## Running

```sh
npm install
npm run dev        # dev server
npm run build      # production build → dist/
npm run preview    # serve the production build
```

Local files never leave the browser — there is no server component.
Use Chrome/Edge (or any Chromium browser) for the full experience; the
File System Access API is what lets the library persist across reloads.

## Features

- **Folder import** — one folder = one album. If the folder contains
  subfolders, each first-level subfolder becomes its own album (deeper
  nesting, e.g. disc folders, collapses into its parent). Chromium uses
  the directory picker and persists file handles in IndexedDB so your
  library survives reloads; other browsers fall back to a directory
  input (library metadata persists, files re-import per session).
- **Metadata extraction** — tags and embedded artwork are read directly
  from the audio files: ID3v2.2/2.3/2.4 (mp3), FLAC (Vorbis comments +
  PICTURE block), and MP4/M4A (ilst). Falls back to cover/folder images
  in the folder, then to generated pixel sprites.
- **Pixelated artwork** — covers are downsampled to a 24×24 in-color
  mosaic and rendered with hard pixels.
- **Real 10-band EQ** — 31 Hz–16 kHz biquad chain (±12 dB) through
  Web Audio, with presets. Audible on any imported file; settings persist.
- **Playlists** — create, delete, add/remove tracks, play from anywhere.
- **Tag editor** — edit album title/artist/year/genre and rename tracks
  inline. Edits are saved to the library database; source files are
  never modified.
- **Sky visualizer (toggleable)** — `VIZ` in the transport. Spectrum
  bars rise off the grid horizon with reflections, star glow breathes
  with the bass, constellation lines march. Real FFT for local files.
- **HUD toggle** — the sky census box can be hidden to a small chip.
- **Mock albums** — seed the sky without files to demo the
  star/constellation/planet progression, and clear it again.

## Architecture

```
index.html          static shell (hub, panels, HUD)
src/main.js         boot: load persisted state → init UI → init sky
src/state.js        app state + IndexedDB persistence + file resolution
src/db.js           IndexedDB wrapper (albums, playlists, kv)
src/importer.js     folder walking, album grouping rule, mock albums
src/tags.js         ID3v2 / FLAC / MP4 tag + artwork parser
src/pixel.js        artwork pixelation + generated sprites
src/audio.js        <audio> → 10× BiquadFilter → gain → analyser
src/sky.js          canvas renderer: stars, constellations, planets, viz
src/ui.js           transport, panels, playlists, tag editor, EQ, toasts
src/styles.css      the poster look
```

No runtime dependencies; Vite only for dev/build.
