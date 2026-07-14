// The galactic landscape: a 3D celestial sphere. Every album is a star; each
// complete group of 20 clusters around its own bearing and wires into a
// constellation; every 100 albums spawns a planet with its own palette, body
// type, tilt, and moons. Drag rotates the view through full 360° yaw and
// near-vertical pitch; wheel or pinch zooms smoothly.

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

// Constellation bearings spiral around the whole sphere — above and below the
// horizon — so groups never share a region.
function clusterCenter(g) {
  const y = -0.3 + 1.0 * (((g * 0.61803) + 0.13) % 1);
  const r = Math.sqrt(Math.max(0.01, 1 - y * y));
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
    r: 0.65 + srnd() * 0.85,
    tw: srnd() * Math.PI * 2,
    sp: 0.5 + srnd() * 1.5,
    pink: srnd() < 0.12,
    born: performance.now(),
  });
}

// Planet palettes: 'r,g,b' strings usable in rgba().
const PLANET_COLS = ['61,255,110', '255,79,195', '90,220,255', '255,190,90', '255,95,80', '185,130,255'];

function makePlanet(p) {
  let s = p * 7919 + 31;
  const pr = () => ((s = (48271 * s) % 2147483647) / 2147483647);
  const y = -0.2 + pr() * 0.8;
  const r = Math.sqrt(Math.max(0.01, 1 - y * y));
  const th = p * 2.1 + 1.3 + pr() * 0.8;
  const type = p % 3; // 0 wire globe, 1 banded giant + ring, 2 rocky + craters
  const moons = [];
  const nMoons = type === 2 ? 1 + Math.floor(pr() * 2) : pr() < 0.4 ? 1 : 0;
  for (let m = 0; m < nMoons; m++) {
    moons.push({ dist: 1.6 + pr() * 0.9, speed: 0.0004 + pr() * 0.0005, phase: pr() * Math.PI * 2, size: 0.08 + pr() * 0.08 });
  }
  const craters = [];
  if (type === 2) {
    for (let c = 0; c < 4 + Math.floor(pr() * 3); c++) {
      craters.push({ a: pr() * Math.PI * 2, d: 0.15 + pr() * 0.7, r: 0.08 + pr() * 0.14 });
    }
  }
  return {
    dir: { x: r * Math.cos(th), y, z: r * Math.sin(th) },
    size: 0.04 + pr() * 0.028,
    rot: pr() * Math.PI,
    tilt: (pr() - 0.5) * 0.9,
    col: PLANET_COLS[p % PLANET_COLS.length],
    type,
    bands: 4 + Math.floor(pr() * 3),
    ring: type === 1 || pr() < 0.25,
    moons,
    craters,
    name: 'PLNT-' + String(p + 1).padStart(2, '0'),
  };
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
  for (let p = 0; p < Math.floor(n / 100); p++) sky.planets.push(makePlanet(p));
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

  // camera — open aimed at the first constellation so the sky never boots
  // onto an empty patch
  let yaw = 0.55, pitch = 0.3;
  if (sky.stars.length) {
    const c = sky.clusters.length ? sky.clusters[0].center : sky.stars[0].dir;
    yaw = Math.atan2(c.x, c.z);
    pitch = Math.atan2(c.y, Math.hypot(c.x, c.z));
  }
  let vyaw = 0, vpitch = 0;
  let zoom = 1, zoomTarget = 1;
  const PITCH_MIN = -1.45, PITCH_MAX = 1.45;
  const ZOOM_MIN = 0.65, ZOOM_MAX = 3.2;

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

  const focal = () => Math.min(W, H) * 0.95 * zoom;
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

  /* ---- pointers: drag to look, pinch to zoom, tap to play ---- */
  const pointers = new Map();
  let moved = 0;
  let pinchBase = 0, pinchZoom = 1;
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

  const pinchDist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) moved = 0;
    if (pointers.size === 2) { pinchBase = pinchDist(); pinchZoom = zoomTarget; }
    vyaw = vpitch = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (prev) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);
      if (pointers.size === 2 && pinchBase > 0) {
        zoomTarget = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (pinchZoom * pinchDist()) / pinchBase));
      } else if (pointers.size === 1) {
        const k = 0.0032 / zoom;
        yaw -= dx * k;
        pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + dy * k));
        vyaw = -dx * k;
        vpitch = dy * k;
      }
      hoverStar = -1;
    } else {
      hoverStar = nearestStar(e.clientX, e.clientY);
      canvas.style.cursor = hoverStar >= 0 ? 'pointer' : 'grab';
    }
  });
  const release = (e) => {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchBase = 0;
    if (wasSingle && e.type === 'pointerup' && moved < 7) {
      const i = nearestStar(e.clientX, e.clientY);
      if (i >= 0) hooks.onStarClick(i);
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomTarget = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomTarget * Math.exp(-e.deltaY * 0.0012)));
  }, { passive: false });

  /* ---- scene pieces ---- */

  function drawContours(t) {
    ctx.save();
    ctx.globalAlpha = 0.045;
    ctx.strokeStyle = '#3DFF6E';
    ctx.lineWidth = 1;
    const base = H * 0.1 + (0.3 - pitch) * H * 0.25;
    for (let c = 0; c < 4; c++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 18) {
        const y = base + c * 30 + Math.sin(x * 0.008 + c * 1.7 + yaw * 1.5) * 18 + Math.sin(x * 0.021 + c * 0.6 + t * 0.00008) * 9;
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
    ctx.globalAlpha = Math.min(0.22, 0.09 * (1 + bass * 1.8));

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

    for (let k = -7; k <= 7; k++) {
      for (const sgn of [1, -1]) {
        const pts = [];
        for (let j = 0; j <= 18; j++) pts.push({ x: k * 0.4, y: gy, z: (0.12 + j * 0.34) * sgn });
        polyline(pts);
      }
    }
    for (let j = 1; j <= 9; j++) {
      const z = 0.14 * Math.pow(1.5, j);
      for (const sgn of [1, -1]) {
        const pts = [];
        for (let k = -20; k <= 20; k++) pts.push({ x: k * 0.17, y: gy, z: z * sgn });
        polyline(pts);
      }
    }

    // horizon line
    const hy = horizonY();
    if (hy > -20 && hy < H + 20) {
      ctx.globalAlpha = Math.min(0.8, 0.3 + bass * 0.5);
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
      ctx.fillStyle = `rgba(${col},.5)`;
      ctx.shadowColor = `rgba(${col},.7)`;
      ctx.shadowBlur = 6;
      ctx.fillRect(i * bw + 1, hy - h, bw - 2, h);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(i * bw + 1, hy, bw - 2, h * 0.35);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawPlanet(pl, t) {
    const p = project(pl.dir);
    if (!p) return;
    const R = Math.min(130, (pl.size * focal()) / p.z);
    if (R < 3) return;
    const col = pl.col;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(pl.tilt);

    // body outline
    ctx.strokeStyle = `rgba(${col},.85)`;
    ctx.lineWidth = 1;
    ctx.shadowColor = `rgba(${col},.7)`;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${col},.38)`;

    const rot = t * 0.00012 + pl.rot;
    if (pl.type === 0) {
      // wireframe globe: meridians + latitudes
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
    } else if (pl.type === 1) {
      // banded gas giant: latitude bands only, drifting with rotation
      for (let k = 0; k < pl.bands; k++) {
        const f = (k + 0.5) / pl.bands;
        const yy = R * (f * 2 - 1) * 0.85;
        const w = Math.sqrt(Math.max(0, R * R - yy * yy));
        const wob = Math.sin(rot * 3 + k * 1.7) * R * 0.03;
        ctx.beginPath();
        ctx.ellipse(0, yy + wob, w, Math.max(1.5, w * 0.13), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      // rocky world: craters + polar cap
      for (const c of pl.craters) {
        const cxr = Math.cos(c.a + rot) * c.d;
        if (Math.abs(cxr) > 0.92) continue; // rotated past the limb
        const cyr = Math.sin(c.a) * c.d * 0.8;
        const squash = Math.sqrt(Math.max(0.05, 1 - cxr * cxr));
        ctx.beginPath();
        ctx.ellipse(cxr * R, cyr * R, c.r * R * squash, c.r * R, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, -R * 0.78, R * 0.45, R * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (pl.ring) {
      ctx.strokeStyle = `rgba(${col},.55)`;
      for (const rr of [1.55, 1.75]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, R * rr, R * rr * 0.26, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // moons orbit in the planet's tilted plane
    for (const m of pl.moons) {
      const a = t * m.speed + m.phase;
      const mx = Math.cos(a) * R * m.dist;
      const my = Math.sin(a) * R * m.dist * 0.3;
      ctx.fillStyle = `rgba(${col},.8)`;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(1.2, R * m.size * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.rotate(-pl.tilt);
    ctx.fillStyle = `rgba(${col},.75)`;
    ctx.font = '9px "Courier New",monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⟨' + pl.name + '⟩', 0, R * 1.8 + 12);
    ctx.restore();
  }

  // dev hook: open with #debug to drive the camera from the console/tests
  if (location.hash === '#debug') {
    window.__sky = {
      planets: sky.planets,
      aim(dir, z = 1) {
        yaw = Math.atan2(dir.x, dir.z);
        pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
        zoom = zoomTarget = z;
      },
    };
  }

  function frame(t) {
    // inertia + eased zoom
    if (!pointers.size) {
      yaw += vyaw;
      pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch + vpitch));
      vyaw *= 0.94;
      vpitch *= 0.94;
    }
    zoom += (zoomTarget - zoom) * 0.12;

    const viz = hooks.isVizOn() ? hooks.getSpectrum(t) : null;
    const bass = viz ? (viz[0] + viz[1] + viz[2] + viz[3]) / 4 : 0;

    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, W, H);
    const g1 = ctx.createRadialGradient(W * 0.75, H * 0.75, 0, W * 0.75, H * 0.75, W * 0.6);
    g1.addColorStop(0, 'rgba(20,60,120,.08)');
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
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
      ctx.strokeStyle = i % 2 ? 'rgba(255,79,195,.2)' : 'rgba(61,255,110,.2)';
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
        ctx.fillStyle = i % 2 ? 'rgba(255,79,195,.45)' : 'rgba(61,255,110,.45)';
        ctx.font = '9px "Courier New",monospace';
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
      const persp = Math.min(1.4, (0.75 + 0.35 / p.z) * Math.sqrt(zoom));
      let r = s.r * (0.6 + 0.8 * age) * persp;
      const glow = isPlay ? 20 + 6 * Math.sin(t * 0.006) + bass * 26 : 4 * tw * (1 + bass * 1.5);
      ctx.save();
      ctx.shadowColor = `rgba(${col},.95)`;
      ctx.shadowBlur = glow;
      ctx.fillStyle = `rgba(${col},${isPlay ? 1 : 0.45 + 0.5 * tw})`;
      if (isPlay) r = s.r * 1.9 * persp;
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.rotate(-Math.PI / 4);
      ctx.fillRect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
      if (isPlay) {
        ctx.strokeStyle = `rgba(${col},.55)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 12 + 5 * Math.sin(t * 0.004), 0, Math.PI * 2);
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
