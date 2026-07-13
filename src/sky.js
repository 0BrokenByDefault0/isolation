// The galactic landscape. Every album is a star; each complete group of 20
// stars wires into a constellation; every 100 albums spawns a wireframe
// planet. When the visualizer is on, the sky reacts to the audio spectrum.

const VIZ_N = 48;
export { VIZ_N };

const sky = { stars: [], clusters: [], planets: [] };

let seed = 9001;
const srnd = () => ((seed = (48271 * seed) % 2147483647) / 2147483647);

function clusterCenter(g) {
  const gx = (g * 0.618033988) % 1;
  return { x: 0.12 + 0.76 * ((gx * 7) % 1), y: 0.12 + 0.5 * ((g * 0.414 + 0.23) % 1) };
}

function addStar(i) {
  const c = clusterCenter(Math.floor(i / 20));
  const ang = srnd() * Math.PI * 2;
  const rad = 0.03 + srnd() * 0.11;
  sky.stars.push({
    x: c.x + Math.cos(ang) * rad,
    y: c.y + Math.sin(ang) * rad * 0.8,
    r: 1.1 + srnd() * 1.6,
    tw: srnd() * Math.PI * 2,
    sp: 0.5 + srnd() * 1.5,
    pink: srnd() < 0.12,
    born: performance.now(),
  });
}

function rebuildClusters() {
  sky.clusters = [];
  const n = sky.stars.length;
  for (let g = 0; g < Math.floor(n / 20); g++) {
    const idx = Array.from({ length: 20 }, (_, k) => g * 20 + k);
    const c = clusterCenter(g);
    idx.sort((a, b) => {
      const A = sky.stars[a], B = sky.stars[b];
      return Math.atan2(A.y - c.y, A.x - c.x) - Math.atan2(B.y - c.y, B.x - c.x);
    });
    sky.clusters.push({ idx, name: 'CST-' + String(g + 1).padStart(2, '0') });
  }
  sky.planets = [];
  for (let p = 0; p < Math.floor(n / 100); p++) {
    sky.planets.push({
      x: 0.15 + ((p * 0.37 + 0.5) % 1) * 0.7,
      y: 0.14 + ((p * 0.61 + 0.2) % 1) * 0.35,
      r: 34 + ((p * 13) % 22),
      rot: p * 0.7,
      pink: p % 2 === 1,
    });
  }
}

export function syncStars(count) {
  while (sky.stars.length < count) addStar(sky.stars.length);
  if (sky.stars.length > count) sky.stars.length = count;
  rebuildClusters();
}

export function constellations() {
  return sky.clusters;
}

/* ---------- renderer ---------- */

export function initSky(canvas, hooks) {
  // hooks: getPlayingIndex(), isPaused(), isVizOn(), getSpectrum(t),
  //        getStarLabel(i), onStarClick(i), reducedMotion
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  let hoverStar = -1;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  const horizonY = () => H - 108 - H * 0.16;
  const starPos = (s) => ({ x: s.x * W, y: s.y * (H - 180) + 20 });

  function hitStar(mx, my) {
    for (let i = sky.stars.length - 1; i >= 0; i--) {
      const p = starPos(sky.stars[i]);
      if (Math.hypot(p.x - mx, p.y - my) < 12) return i;
    }
    return -1;
  }

  canvas.addEventListener('mousemove', (e) => {
    hoverStar = hitStar(e.clientX, e.clientY);
    canvas.style.cursor = hoverStar >= 0 ? 'pointer' : 'crosshair';
  });
  canvas.addEventListener('click', (e) => {
    const i = hitStar(e.clientX, e.clientY);
    if (i >= 0) hooks.onStarClick(i);
  });

  function drawContours(t) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#3DFF6E';
    ctx.lineWidth = 1;
    for (let c = 0; c < 7; c++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 14) {
        const y = H * 0.12 + c * 26 + Math.sin(x * 0.008 + c * 1.7) * 18 + Math.sin(x * 0.021 + c * 0.6 + t * 0.00008) * 9;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFloor(t, bass) {
    const hy = horizonY();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, hy, W, H - hy);
    ctx.clip();
    ctx.strokeStyle = 'rgba(61,255,110,.22)';
    ctx.lineWidth = 1;
    const vx = W / 2;
    for (let i = -14; i <= 14; i++) {
      ctx.beginPath();
      ctx.moveTo(vx, hy);
      ctx.lineTo(vx + i * W * 0.13, H);
      ctx.stroke();
    }
    const scroll = (t * 0.00006) % 1;
    for (let j = 0; j < 14; j++) {
      const f = (j + scroll) / 14;
      const y = hy + (H - hy) * f * f;
      ctx.globalAlpha = Math.min(1, (0.05 + f * 0.3) * (1 + bass * 1.5));
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.globalAlpha = Math.min(1, 0.5 + bass * 0.5);
    ctx.strokeStyle = 'rgba(61,255,110,.5)';
    ctx.beginPath();
    ctx.moveTo(0, hy);
    ctx.lineTo(W, hy);
    ctx.stroke();
    ctx.restore();
  }

  function drawViz(v) {
    const hy = horizonY();
    const bw = W / VIZ_N;
    ctx.save();
    for (let i = 0; i < VIZ_N; i++) {
      const h = v[i] * (H * 0.22);
      if (h < 1) continue;
      const col = i % 7 === 3 ? '255,79,195' : '61,255,110';
      ctx.fillStyle = `rgba(${col},.55)`;
      ctx.shadowColor = `rgba(${col},.8)`;
      ctx.shadowBlur = 8;
      ctx.fillRect(i * bw + 1, hy - h, bw - 2, h);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(i * bw + 1, hy, bw - 2, h * 0.35);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawPlanet(p, t) {
    const x = p.x * W, y = p.y * (H - 160), R = p.r;
    const col = p.pink ? '255,79,195' : '61,255,110';
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = `rgba(${col},.9)`;
    ctx.lineWidth = 1;
    ctx.shadowColor = `rgba(${col},.8)`;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${col},.45)`;
    const rot = t * 0.00012 + p.rot;
    for (let k = 0; k < 5; k++) {
      const w = Math.abs(Math.cos(rot + (k * Math.PI) / 5)) * R;
      if (w < 2) continue;
      ctx.beginPath();
      ctx.ellipse(0, 0, w, R, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let k = 1; k < 4; k++) {
      const yy = R * ((k / 4) * 2 - 1) * 0.75;
      const w = Math.sqrt(Math.max(0, R * R - yy * yy));
      ctx.beginPath();
      ctx.ellipse(0, yy, w, w * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(${col},.9)`;
    ctx.font = '9px "Courier New",monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⟨PLANET⟩', 0, R + 16);
    ctx.restore();
  }

  function frame(t) {
    const viz = hooks.isVizOn() ? hooks.getSpectrum(t) : null;
    const bass = viz ? (viz[0] + viz[1] + viz[2] + viz[3]) / 4 : 0;

    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, W, H);
    const g1 = ctx.createRadialGradient(W * 0.75, H * 0.75, 0, W * 0.75, H * 0.75, W * 0.6);
    g1.addColorStop(0, 'rgba(20,60,120,.10)');
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(W * 0.2, H * 0.5, 0, W * 0.2, H * 0.5, W * 0.5);
    g2.addColorStop(0, 'rgba(61,255,110,.05)');
    g2.addColorStop(1, 'transparent');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);

    drawContours(t);
    drawFloor(t, bass);
    if (viz) drawViz(viz);
    sky.planets.forEach((p) => drawPlanet(p, t));

    // constellation lines
    ctx.save();
    sky.clusters.forEach((cl, i) => {
      ctx.strokeStyle = i % 2 ? 'rgba(255,79,195,.35)' : 'rgba(61,255,110,.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = viz ? -(t * 0.03) : 0;
      ctx.beginPath();
      cl.idx.forEach((si, k) => {
        const p = starPos(sky.stars[si]);
        k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      const c = clusterCenter(i);
      ctx.fillStyle = i % 2 ? 'rgba(255,79,195,.8)' : 'rgba(61,255,110,.8)';
      ctx.font = '10px "Courier New",monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⟨' + cl.name + '⟩', c.x * W, c.y * (H - 180) + 20);
    });
    ctx.restore();

    // stars
    const playIdx = hooks.getPlayingIndex();
    sky.stars.forEach((s, i) => {
      const p = starPos(s);
      const isPlay = i === playIdx && !hooks.isPaused();
      const tw = 0.55 + 0.45 * Math.sin(t * 0.002 * s.sp + s.tw);
      const age = Math.min(1, (t - s.born) / 900);
      const col = s.pink || i === playIdx ? '255,79,195' : '61,255,110';
      let r = s.r * (0.6 + 0.8 * age);
      const glow = isPlay ? 26 + 8 * Math.sin(t * 0.006) + bass * 30 : 6 * tw * (1 + bass * 1.5);
      ctx.save();
      ctx.shadowColor = `rgba(${col},.95)`;
      ctx.shadowBlur = glow;
      ctx.fillStyle = `rgba(${col},${isPlay ? 1 : 0.5 + 0.5 * tw})`;
      if (isPlay) r = s.r * 2.2;
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.rotate(-Math.PI / 4);
      ctx.fillRect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
      if (isPlay) {
        ctx.strokeStyle = `rgba(${col},.6)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 14 + 6 * Math.sin(t * 0.004), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      if (i === hoverStar) {
        ctx.fillStyle = 'rgba(217,245,226,.95)';
        ctx.font = '10px "Courier New",monospace';
        ctx.textAlign = 'left';
        ctx.fillText('⟨' + hooks.getStarLabel(i) + '⟩', p.x + 10, p.y - 8);
      }
    });

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
