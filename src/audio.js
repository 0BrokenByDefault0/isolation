// Playback engine: <audio> element routed through a 10-band biquad EQ chain,
// a master gain, and an analyser that feeds the sky visualizer.

export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_LABELS = ['31', '62', '125', '250', '500', '1K', '2K', '4K', '8K', '16K'];

const audioEl = new Audio();
audioEl.preload = 'metadata';

let ctx = null;
let eqNodes = [];
let gainNode = null;
let analyser = null;
let curURL = null;

function ensure(gains) {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  let node = ctx.createMediaElementSource(audioEl);
  eqNodes = EQ_FREQS.map((f, i) => {
    const q = ctx.createBiquadFilter();
    q.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
    q.frequency.value = f;
    q.Q.value = 1.1;
    q.gain.value = gains[i] || 0;
    node.connect(q);
    node = q;
    return q;
  });
  gainNode = ctx.createGain();
  gainNode.gain.value = audioEl.volume;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  node.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(ctx.destination);
}

export const engine = {
  async playFile(file, gains) {
    ensure(gains);
    await ctx.resume();
    if (curURL) URL.revokeObjectURL(curURL);
    curURL = URL.createObjectURL(file);
    audioEl.src = curURL;
    return audioEl.play();
  },
  pause() { audioEl.pause(); },
  async resume() { if (ctx) await ctx.resume(); return audioEl.play(); },
  stop() {
    audioEl.pause();
    audioEl.removeAttribute('src');
    if (curURL) { URL.revokeObjectURL(curURL); curURL = null; }
  },
  seek(sec) { if (isFinite(audioEl.duration)) audioEl.currentTime = sec; },
  position() { return audioEl.currentTime || 0; },
  duration() { return isFinite(audioEl.duration) ? audioEl.duration : 0; },
  setVolume(v) {
    audioEl.volume = v;
    if (gainNode) gainNode.gain.value = v;
  },
  setEqGain(i, db) { if (eqNodes[i]) eqNodes[i].gain.value = db; },
  applyEq(gains) { eqNodes.forEach((n, i) => { n.gain.value = gains[i] || 0; }); },
  onEnded(cb) { audioEl.addEventListener('ended', cb); },
  hasAnalyser() { return !!analyser; },
  // Normalized frequency bins for the visualizer, resampled to n bars.
  spectrum(n) {
    const out = new Array(n).fill(0);
    if (!analyser) return out;
    const d = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(d);
    for (let i = 0; i < n; i++) out[i] = d[Math.floor((i * d.length) / n)] / 255;
    return out;
  },
};
