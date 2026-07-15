// The galactic landscape: a 3D celestial sphere. Every album is a star; each
// complete group of 20 forms a constellation with its own organic spine-and-
// branch shape; every 100 albums spawns a planet. Constellations sit in tidy
// rings around the viewer (a "galactic belt"), so panning the view sweeps
// through them one by one instead of hunting across an empty sphere.
//
// Navigation is target-based: the top ROTATE/TILT sliders (or dragging the
// canvas) set a target the camera eases toward — snappy in normal use, slow
// and cinematic during the load-in overview.

const VIZ_N = 48;
export { VIZ_N };

const sky = { stars: [], clusters: [], planets: [], dust: [] };

const GOLDEN_ANGLE = 2.39996323;
const TAU = Math.PI * 2;

function rng(seed) {
  let s = (seed % 2147483647) || 1;
  return () => ((s = (48271 * s) % 2147483647) / 2147483647);
}

function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function dirFrom(azimuth, elevation) {
  const ce = Math.cos(elevation);
  return { x: ce * Math.sin(azimuth), y: Math.sin(elevation), z: ce * Math.cos(azimuth) };
}

/* ---------- layout: the galactic belt ---------- */

// Constellations fill rings around the viewer: 9 evenly spaced bearings per
// ring, each ring at its own comfortable elevation, phase-shifted so rings
// never stack vertically. Everything lands where the TILT slider can reach.
const RING_SLOTS = 9;
const RING_ELEV = [0.32, 0.68, 0.06, 0.98];

function clusterCenter(g) {
  const ring = Math.floor(g / RING_SLOTS) % RING_ELEV.length;
  const lap = Math.floor(g / (RING_SLOTS * RING_ELEV.length));
  const jitter = rng(g * 7127 + 41);
  const az = (g % RING_SLOTS) * (TAU / RING_SLOTS) + ring * 0.38 + lap * 0.19 + (jitter() - 0.5) * 0.1;
  const el = RING_ELEV[ring] + (jitter() - 0.5) * 0.08;
  return dirFrom(az, el);
}

function tangentBasis(c) {
  const up = Math.abs(c.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const t1 = norm(cross(c, up));
  const t2 = cross(c, t1);
  return [t1, t2];
}

// Each constellation is a spine of 8 bright stars (a momentum random walk)
// with 12 dimmer companions branching off it — reads like a real asterism
// instead of a scatter blob. Deterministic per group index.
const patternCache = new Map();
function makePattern(g) {
  if (patternCache.has(g)) return patternCache.get(g);
  const pr = rng(g * 2654435761 + 97);
  const pts = [];
  const edges = [];
  let u = 0, w = 0, ang = pr() * TAU;
  for (let k = 0; k < 8; k++) {
    pts.push({ u, w, major: true });
    if (k > 0) edges.push([k - 1, k]);
    ang += (pr() - 0.5) * 1.3;
    const step = 0.3 + pr() * 0.4;
    u += Math.cos(ang) * step;
    w += Math.sin(ang) * step * 0.7;
  }
  for (let k = 8; k < 20; k++) {
    const parent = Math.floor(pr() * pts.length);
    const a = pr() * TAU;
    const d = 0.18 + pr() * 0.4;
    pts.push({ u: pts[parent].u + Math.cos(a) * d, w: pts[parent].w + Math.sin(a) * d * 0.8, major: false });
    edges.push([parent, k]);
  }
  // center and scale to an angular radius that reads well from the origin
  let cu = 0, cw = 0;
  for (const p of pts) { cu += p.u; cw += p.w; }
  cu /= pts.length; cw /= pts.length;
  let maxR = 0.001;
  for (const p of pts) { p.u -= cu; p.w -= cw; maxR = Math.max(maxR, Math.hypot(p.u, p.w)); }
  const R = 0.12 + pr() * 0.04;
  for (const p of pts) { p.u = (p.u / maxR) * R; p.w = (p.w / maxR) * R; }
  const pattern = { pts, edges };
  patternCache.set(g, pattern);
  return pattern;
}

function addStar(i) {
  const g = Math.floor(i / 20);
  const c = clusterCenter(g);
  const [t1, t2] = tangentBasis(c);
  const p = makePattern(g).pts[i % 20];
  const sr = rng(i * 3571 + 13);
  sky.stars.push({
    dir: norm({
      x: c.x + t1.x * p.u + t2.x * p.w,
      y: c.y + t1.y * p.u + t2.y * p.w,
      z: c.z + t1.z * p.u + t2.z * p.w,
    }),
    r: p.major ? 1.1 + sr() * 0.7 : 0.55 + sr() * 0.55,
    tw: sr() * TAU,
    sp: 0.5 + sr() * 1.5,
    pink: sr() < 0.12,
    born: performance.now(),
  });
}

/* ---------- planets ---------- */

// Planet palettes: 'r,g,b' strings usable in rgba().
const PLANET_COLS = ['61,255,110', '255,79,195', '90,220,255', '255,190,90', '255,95,80', '185,130,255'];
const PLANET_ELEV = [0.52, 0.2, 0.84];

function makePlanet(p) {
  const pr = rng(p * 7919 + 31);
  // offset half a slot from the constellation bearings so planets sit in the
  // gaps between asterisms, not on top of them
  const az = p * (TAU / 7) + TAU / (RING_SLOTS * 2) + pr() * 0.3;
  const el = PLANET_ELEV[p % PLANET_ELEV.length] + (pr() - 0.5) * 0.1;
  const type = p % 3; // 0 wire globe, 1 banded giant + ring, 2 rocky + craters
  const moons = [];
  const nMoons = type === 2 ? 1 + Math.floor(pr() * 2) : pr() < 0.4 ? 1 : 0;
  for (let m = 0; m < nMoons; m++) {
    moons.push({ dist: 1.6 + pr() * 0.9, speed: 0.0004 + pr() * 0.0005, phase: pr() * TAU, size: 0.08 + pr() * 0.08 });
  }
  const craters = [];
  if (type === 2) {
    for (let c = 0; c < 4 + Math.floor(pr() * 3); c++) {
      craters.push({ a: pr() * TAU, d: 0.15 + pr() * 0.7, r: 0.08 + pr() * 0.14 });
    }
  }
  return {
    dir: dirFrom(az, el),
    size: 0.055 + pr() * 0.03,
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

/* ---------- background dust ---------- */

function makeDust() {
  const pr = rng(424243);
  sky.dust = [];
  for (let i = 0; i < 420; i++) {
    const y = pr() * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * GOLDEN_ANGLE;
    sky.dust.push({
      dir: { x: r * Math.cos(th), y, z: r * Math.sin(th) },
      a: 0.05 + pr() * 0.22,
      r: 0.3 + pr() * 0.6,
      tw: pr() * TAU,
    });
  }
}
makeDust();

function rebuildClusters() {
  sky.clusters = [];
  const n = sky.stars.length;
  for (let g = 0; g < Math.floor(n / 20); g++) {
    sky.clusters.push({
      idx: Array.from({ length: 20 }, (_, k) => g * 20 + k),
      edges: makePattern(g).edges,
      name: 'CST-' + String(g + 1).padStart(2, '0'),
      center: clusterCenter(g),
    });
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

export const PITCH_MIN = -0.22, PITCH_MAX = 1.12;

export function initSky(canvas, hooks) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  let hoverStar = -1;

  /* ---- camera: everything eases toward a target ---- */

  // Boot aims at the heart of the belt so the first frame is a postcard of
  // the whole universe, then glides in from a pulled-back, offset vantage.
  function overviewTarget() {
    const c = sky.clusters.length ? sky.clusters[0].center
      : sky.stars.length ? sky.stars[0].dir : dirFrom(0.9, 0.34);
    // nudge half a slot so neighbouring constellations share the frame
    return {
      yaw: Math.atan2(c.x, c.z) + TAU / (RING_SLOTS * 2),
      pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.atan2(c.y, Math.hypot(c.x, c.z)) + 0.06)),
    };
  }

  const home = overviewTarget();
  let yawT = home.yaw, pitchT = home.pitch;
  let yaw = yawT - 1.15, pitch = Math.min(PITCH_MAX, pitchT + 0.45);
  let zoom = 0.6, zoomTarget = 0.92;
  const ZOOM_MIN = 0.55, ZOOM_MAX = 3.2;
  const INTRO_MS = 3200;
  const bootAt = performance.now();

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

  const clampPitch = (v) => Math.max(PITCH_MIN, Math.min(PITCH_MAX, v));

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) moved = 0;
    if (pointers.size === 2) { pinchBase = pinchDist(); pinchZoom = zoomTarget; }
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
        pitch = clampPitch(pitch + dy * k);
        yawT = yaw;
        pitchT = pitch;
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

  function drawDust(t) {
    ctx.save();
    for (const d of sky.dust) {
      const p = project(d.dir);
      if (!p) continue;
      const tw = 0.7 + 0.3 * Math.sin(t * 0.0011 + d.tw);
      ctx.globalAlpha = d.a * tw;
      ctx.fillStyle = '#9fd8b4';
      ctx.fillRect(p.x, p.y, d.r, d.r);
    }
    ctx.restore();
  }

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

  // Soft colored haze behind each formed constellation — depth without noise.
  function drawNebulae() {
    for (let i = 0; i < sky.clusters.length; i++) {
      const c = project(sky.clusters[i].center);
      if (!c) continue;
      const R = (0.22 * focal()) / c.z;
      const col = i % 2 ? '255,79,195' : '61,255,110';
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
      g.addColorStop(0, `rgba(${col},.06)`);
      g.addColorStop(0.6, `rgba(${col},.025)`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(c.x - R, c.y - R, R * 2, R * 2);
    }
  }

  function drawPlanet(pl, t) {
    const p = project(pl.dir);
    if (!p) return;
    const R = Math.min(150, (pl.size * focal()) / p.z);
    if (R < 3) return;
    const col = pl.col;
    ctx.save();
    ctx.translate(p.x, p.y);

    // atmosphere halo
    const halo = ctx.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 2.1);
    halo.addColorStop(0, `rgba(${col},.14)`);
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.fillRect(-R * 2.1, -R * 2.1, R * 4.2, R * 4.2);

    ctx.rotate(pl.tilt);

    // solid body so the planet occludes the dust field behind it
    const body = ctx.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
    body.addColorStop(0, 'rgba(14,22,18,.96)');
    body.addColorStop(1, 'rgba(4,6,7,.96)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();

    // body outline
    ctx.strokeStyle = `rgba(${col},.85)`;
    ctx.lineWidth = 1;
    ctx.shadowColor = `rgba(${col},.7)`;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
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
        ctx.ellipse(0, 0, w, R, 0, 0, TAU);
        ctx.stroke();
      }
      for (let k = 1; k < 4; k++) {
        const yy = R * ((k / 4) * 2 - 1) * 0.75;
        const w = Math.sqrt(Math.max(0, R * R - yy * yy));
        ctx.beginPath();
        ctx.ellipse(0, yy, w, w * 0.22, 0, 0, TAU);
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
        ctx.ellipse(0, yy + wob, w, Math.max(1.5, w * 0.13), 0, 0, TAU);
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
        ctx.ellipse(cxr * R, cyr * R, c.r * R * squash, c.r * R, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, -R * 0.78, R * 0.45, R * 0.16, 0, 0, TAU);
      ctx.stroke();
    }

    // terminator: night side creeping over one limb
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R - 0.5, 0, TAU);
    ctx.clip();
    const shade = ctx.createLinearGradient(-R, 0, R, 0);
    shade.addColorStop(0, 'transparent');
    shade.addColorStop(0.62, 'transparent');
    shade.addColorStop(1, 'rgba(2,3,4,.72)');
    ctx.fillStyle = shade;
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.restore();

    if (pl.ring) {
      ctx.strokeStyle = `rgba(${col},.55)`;
      for (const rr of [1.55, 1.75]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, R * rr, R * rr * 0.26, 0, 0, TAU);
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
      ctx.arc(mx, my, Math.max(1.2, R * m.size * 0.4), 0, TAU);
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
        yaw = yawT = Math.atan2(dir.x, dir.z);
        pitch = pitchT = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
        zoom = zoomTarget = z;
      },
    };
  }

  function frame(t) {
    // ease toward targets — cinematic during the intro, snappy afterwards
    const intro = t - bootAt < INTRO_MS;
    const k = intro ? 0.028 : 0.2;
    yaw += (yawT - yaw) * k;
    pitch += (pitchT - pitch) * k;
    pitch = clampPitch(pitch);
    zoom += (zoomTarget - zoom) * (intro ? 0.028 : 0.12);

    const viz = hooks.isVizOn() ? hooks.getSpectrum(t) : null;
    const bass = viz ? (viz[0] + viz[1] + viz[2] + viz[3]) / 4 : 0;

    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, W, H);
    const g1 = ctx.createRadialGradient(W * 0.75, H * 0.75, 0, W * 0.75, H * 0.75, W * 0.6);
    g1.addColorStop(0, 'rgba(20,60,120,.08)');
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    drawDust(t);
    drawContours(t);
    drawFloor(bass);
    if (viz) drawViz(viz);
    drawNebulae();
    sky.planets.forEach((p) => drawPlanet(p, t));

    // project stars once per frame (also feeds hit testing)
    projStars.length = sky.stars.length;
    for (let i = 0; i < sky.stars.length; i++) projStars[i] = project(sky.stars[i].dir);

    // constellation lines follow each asterism's spine-and-branch pattern
    ctx.save();
    sky.clusters.forEach((cl, i) => {
      ctx.strokeStyle = i % 2 ? 'rgba(255,79,195,.28)' : 'rgba(61,255,110,.28)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = viz ? -(t * 0.03) : 0;
      ctx.beginPath();
      for (const [ea, eb] of cl.edges) {
        const a = projStars[cl.idx[ea]];
        const b = projStars[cl.idx[eb]];
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
        ctx.fillText('⟨' + cl.name + '⟩', c.x, c.y + (0.16 * focal()) / c.z);
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
        ctx.arc(0, 0, 12 + 5 * Math.sin(t * 0.004), 0, TAU);
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

  /* ---- view API: the top ROTATE/TILT sliders drive these ---- */
  return {
    // absolute yaw in radians; camera takes the shortest way around
    setYaw(rad) {
      let d = (rad - yaw) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      yawT = yaw + d;
    },
    setPitch(rad) {
      pitchT = clampPitch(rad);
    },
    view: () => ({ yaw, pitch }),
    isDragging: () => pointers.size > 0,
  };
}
