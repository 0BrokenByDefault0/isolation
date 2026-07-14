# Contributing

Thanks for your interest in improving ISOLATION.

## Getting started

```sh
git clone https://github.com/0BrokenByDefault0/isolation.git
cd isolation
npm install
npm run dev
```

The app is plain ES modules with no framework and no runtime dependencies.
Vite is used only for the dev server and production build.

## Guidelines

- Keep the module boundaries described in the README's Architecture section.
  Rendering belongs in `src/sky.js`, audio in `src/audio.js`, persistence in
  `src/db.js` and `src/state.js`, and DOM work in `src/ui.js`.
- No runtime dependencies. If a feature seems to need a library, open an
  issue first so the trade-off can be discussed.
- Match the existing code style: two-space indentation, single quotes,
  semicolons, and small focused functions.
- The visual identity (palette, CRT mono type, wireframe rendering) is a
  deliberate design constraint. Changes to it should be discussed in an
  issue before a pull request.
- Test locally with a real music folder before submitting playback or
  import changes. `npm run build && npm run preview` should succeed with
  no console errors.

## Pull requests

- Keep pull requests focused on a single change.
- Describe what changed and why, and include screenshots for visual
  changes.
- Make sure CI passes.

## Reporting bugs

Open an issue with your browser and OS, steps to reproduce, and what you
expected to happen. For import problems, describing the folder layout
(nesting, file formats) helps a lot.
