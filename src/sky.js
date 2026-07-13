// The galactic landscape, now a 3D celestial sphere. Every album is a star on
// the sphere; each complete group of 20 clusters around its own bearing and
// wires into a constellation; every 100 albums spawns a wireframe planet.
// Drag (touch or mouse) rotates the view with inertia. When the visualizer is
// on, the sky reacts to the audio spectrum.

const VIZ_N = 48;
export { VIZ_N };

const sky = { stars: [], clusters: [], planets: [] };

let seed = 9001;
const srnd = () => ((seed = (48271 * seed) % 2147483647) / 2147483647);

const GOLDEN_ANGLE = 2.39996323;

function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

// Constellation bearings spiral around the upper sky so groups never share a
// region; each gets its own patch of the sphere.
function clusterCenter(g) {
  const y = 0.18 + 0.62 * (((g * 0.61803) + 0.13) % 1);
  const r = Math.sqrt(1 - y * y);
  const th = g * GOLDEN_ANGLE + 0.7;
  return { x: r * Math.cos(th), y, z: r * Math.sin(th) };
}

function tangentBasis(c) {
  const up = Math.abs(c.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const t1 = norm(cross(c, up));
  const t2 = cross(c, t1);
  return [t1, t2];
}

function addStar(i) {
  const c = clusterCenter(Math.floor(i / 20));
  const [t1, t2] = tangentBasis(c);
  const a = srnd() * Math.PI * 2;
  const amp = 0.05 + srnd() * 0.2;
  const u = Math.cos(a) * amp, w = Math.sin(a) * amp * 0.8;
  sky.stars.push({
    dir: norm({ x: c.x + t1.x * u + t2.x * w, y: c.y + t1.y * u + t2.y * w, z: c.z + t1.z * u + t2.z * w }),
    off: { u, w },
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
    idx.sort((a, b) => {
      const A = sky.stars[a].off, B = sky.stars[b].off;
      return Math.atan2(A.w, A.u) - Math.atan2(B.w, B.u);
    });
    sky.clusters.push({ idx, name: 'CST-' + String(g + 1).padStart(2, '0'), center: clusterCenter(g) });
  }
  sky.planets = [];
  for (let p = 0; p < Math.floor(n / 100); p++) {
    const y = 0.1 + ((p * 0.37 + 0.5) % 1) * 0.5;
    const r = Math.sqrt(1 - y * y);
    const th = p * 2.1 + 1.3 + GOLDEN_ANGLE * 2;
    sky.planets.push({
      dir: { x: r * Math.cos(th), y, z: r * Math.sin(th) },
      size: 0.045 + ((p * 13) % 22) * 0.0012,
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
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  let hoverStar = -1;

  // camera
  let yaw = 0.55, pitch = 0.3;
  let vyaw = 0, vpitch = 0;
  const PITCH_MIN = -0.35, PITCH_MAX = 1.25;

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

  const focal = () => Math.min(W, H) * 0.95;
  const cx = () => W / 2;
  const cyS = () => H * 0.42;
  const NEAR = 0.18;

  // Works for unit directions and world positions alike (camera at origin).
  function project(d) {
    const cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const x1 = cyw * d.x - syw * d.z;
    const z1 = syw * d.x + cyw * d.z;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const y2 = d.y * cp - z1 * sp;
    const z2 = d.y * sp + z1 * cp;
    if (z2 < NEAR) return null;
    const f = focal();
    return { x: cx() + (x1 / z2) * f, y: cyS() - (y2 / z2) * f, z: z2 };
  }

  function horizonY() {
    return Math.max(-40, Math.min(H + 40, cyS() + focal() * Math.tan(pitch)));
  }

  /* ---- pointer: drag to look, tap to play ---- */
  let dragging = false, moved = 0, lastX = 0, lastY = 0;
  const projStars = []; // screen positions from the last frame, for hit tests

  function nearestStar(mx, my) {
    let best = -1, bd = 16;
    for (let i = 0; i < projStars.length; i++) {
      const p = projStars[i];
      if (!p) continue;
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    vyaw = vpitch = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      const k = 0.0032;
      yaw -= dx * k;
      pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + dy * k));
      vyaw = -dx * k;
      vpitch = dy * k;
      lastX = e.clientX;
      lastY = e.clientY;
      hoverStar = -1;
    } else {
      hoverStar = nearestStar(e.clientX, e.clientY);
      canvas.style.cursor = hoverStar >= 0 ? 'pointer' : 'grab';
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    if (moved < 7) {
      const i = nearestStar(e.clientX, e.clientY);
      if (i >= 0) hooks.onStarClick(i);
    }
  });
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  /* ---- scene pieces ---- */

  function drawContours(t) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#3DFF6E';
    ctx.lineWidth = 1;
    const base = H * 0.1 + (0.3 - pitch) * H * 0.25;
    for (let c = 0; c < 6; c++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const y = base + c * 26 + Math.sin(x * 0.008 + c * 1.7 + yaw * 1.5) * 18 + Math.sin(x * 0.021 + c * 0.6 + t * 0.00008) * 9;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // A world-fixed grid on the ground plane; it swings around as the view yaws.
  function drawFloor(bass) {
    const gy = -0.3;
    ctx.save();
    ctx.strokeStyle = 'rgba(61,255,110,.9)';
    ctx.lineWidth = 1;
    ctx.globalAlpha = Math.min(0.35, 0.16 * (1 + bass * 1.8));

    const polyline = (pts) => {
      let started = false;
      ctx.beginPath();
      for (const wp of pts) {
        const p = project(wp);
        if (!p) { started = false; continue; }
        started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        started = true;
      }
      ctx.stroke();
    };

    for (let k = -9; k <= 9; k++) {
      const pts = [];
      for (let j = 0; j <= 22; j++) {
        const z = 0.12 + j * 0.28;
        pts.push({ x: k * 0.34, y: gy, z });
        pts.push({ x: k * 0.34, y: gy, z: -z });
      }
      // draw the two half-lines separately so they don't join through the camera
      polyline(pts.filter((_, i) => i % 2 === 0));
      polyline(pts.filter((_, i) => i % 2 === 1));
    }
    for (let j = 1; j <= 12; j++) {
      const z = 0.12 * Math.pow(1.42, j);
      for (const sgn of [1, -1]) {
        const pts = [];
        for (let k = -24; k <= 24; k++) pts.push({ x: k * 0.14, y: gy, z: z * sgn });
        polyline(pts);
      }
    }

    // horizon line
    const hy = horizonY();
    if (hy > -20 && hy < H + 20) {
      ctx.globalAlpha = Math.min(1, 0.4 + bass * 0.5);
      ctx.strokeStyle = 'rgba(61,255,110,.5)';
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(W, hy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawViz(v) {
    const hy = horizonY();
    if (hy < -20 || hy > H + 20) return;
    const bw = W / VIZ_N;
    ctx.save();
    for (let i = 0; i < VIZ_N; i++) {
      const h = v[i] * (H * 0.2);
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

  function drawPlanet(pl, t) {
    const p = project(pl.dir);
    if (!p) return;
    const R = Math.min(90, (pl.size * focal()) / p.z);
    if (R < 3) return;
    const col = pl.pink ? '255,79,195' : '61,255,110';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = `rgba(${col},.9)`;
    ctx.lineWidth = 1;
    ctx.shadowColor = `rgba(${col},.8)`;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${col},.45)`;
    const rot = t * 0.00012 + pl.rot;
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
    // inertia
    if (!dragging) {
      yaw += vyaw;
      pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + vpitch));
      vyaw *= 0.94;
      vpitch *= 0.94;
    }

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
    drawFloor(bass);
    if (viz) drawViz(viz);
    sky.planets.forEach((p) => drawPlanet(p, t));

    // project stars once per frame (also feeds hit testing)
    projStars.length = sky.stars.length;
    for (let i = 0; i < sky.stars.length; i++) projStars[i] = project(sky.stars[i].dir);

    // constellation lines
    ctx.save();
    sky.clusters.forEach((cl, i) => {
      ctx.strokeStyle = i % 2 ? 'rgba(255,79,195,.35)' : 'rgba(61,255,110,.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = viz ? -(t * 0.03) : 0;
      ctx.beginPath();
      for (let k = 0; k < cl.idx.length; k++) {
        const a = projStars[cl.idx[k]];
        const b = projStars[cl.idx[(k + 1) % cl.idx.length]];
        if (!a || !b) continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const c = project(cl.center);
      if (c) {
        ctx.fillStyle = i % 2 ? 'rgba(255,79,195,.8)' : 'rgba(61,255,110,.8)';
        ctx.font = '10px "Courier New",monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⟨' + cl.name + '⟩', c.x, c.y);
      }
    });
    ctx.restore();

    // stars
    const playIdx = hooks.getPlayingIndex();
    for (let i = 0; i < sky.stars.length; i++) {
      const p = projStars[i];
      if (!p) continue;
      const s = sky.stars[i];
      const isPlay = i === playIdx && !hooks.isPaused();
      const tw = 0.55 + 0.45 * Math.sin(t * 0.002 * s.sp + s.tw);
      const age = Math.min(1, (t - s.born) / 900);
      const col = s.pink || i === playIdx ? '255,79,195' : '61,255,110';
      const persp = Math.min(1.8, 0.75 + 0.35 / p.z);
      let r = s.r * (0.6 + 0.8 * age) * persp;
      const glow = isPlay ? 26 + 8 * Math.sin(t * 0.006) + bass * 30 : 6 * tw * (1 + bass * 1.5);
      ctx.save();
      ctx.shadowColor = `rgba(${col},.95)`;
      ctx.shadowBlur = glow;
      ctx.fillStyle = `rgba(${col},${isPlay ? 1 : 0.5 + 0.5 * tw})`;
      if (isPlay) r = s.r * 2.2 * persp;
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
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
