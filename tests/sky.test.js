import assert from 'node:assert/strict';
import test from 'node:test';
import { initSky, syncStars } from '../src/sky.js';

// Exercise the actual renderer and hit-test projection without a browser or
// dependency. Canvas drawing calls are recorded so hidden labels cannot leak
// through a separate planet/constellation/hover path.
function scene(count, width = 393, height = 852) {
  const text = [], fills = [], events = new Map();
  let nextFrame;
  let labels = true;
  const context = new Proxy({}, {
    get(target, key) {
      if (key === 'fillText') return (value) => text.push(value);
      if (key === 'fillRect') return () => fills.push({ color: target.fillStyle, glow: target.shadowBlur });
      if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return target[key] ?? (() => {});
    },
  });
  Object.assign(globalThis, {
    innerWidth: width, innerHeight: height, devicePixelRatio: 1,
    location: { hash: '#debug' }, window: {},
    matchMedia: () => ({ matches: true }),
    addEventListener: (event, callback) => events.set(event, callback),
    requestAnimationFrame: (callback) => { nextFrame = callback; },
  });
  const canvas = { style: {}, getContext: () => context, addEventListener: (event, cb) => events.set(event, cb) };
  const viewport = { left: 16, right: width - 16, top: width <= 640 ? 270 : 180, bottom: height - 112 };
  syncStars(count);
  let clicked = -1;
  const view = initSky(canvas, {
    getViewport: () => viewport, areLabelsOn: () => labels,
    getPlayingIndex: () => -1, isPaused: () => true, isVizOn: () => false,
    getStarLabel: (i) => `ALBUM ${i}`, onStarClick: (i) => { clicked = i; },
  });
  return {
    view, camera: window.__sky, viewport, text, fills, events,
    labels: (value) => { labels = value; },
    clicked: () => clicked,
    frame: () => { text.length = 0; fills.length = 0; nextFrame(performance.now() + 10000); },
  };
}

function assertFits(s, count) {
  const { viewport, camera } = s;
  assert.equal(camera.stars.length, count);
  for (const object of [...camera.stars, ...camera.planets]) {
    const p = camera.project(object.dir);
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), `${count}: object behind camera`);
    const radius = object.size ? Math.max(2.5, Math.min(150, object.size * Math.min(innerWidth, innerHeight) * 0.95 / p.z)) : 4;
    const extent = object.size ? radius * Math.max(2.1, ...object.moons.map((m) => m.dist + m.size)) : radius;
    assert.ok(p.x - extent >= viewport.left && p.x + extent <= viewport.right, `${count}: clipped horizontally`);
    assert.ok(p.y - extent >= viewport.top && p.y + extent <= viewport.bottom, `${count}: clipped vertically`);
  }
}

test('collection overview fits all objects, including the back of a full belt', () => {
  for (const [width, height] of [[320, 568], [393, 852], [430, 932], [844, 390], [1440, 900]]) {
    for (const count of [0, 1, 19, 20, 21, 99, 100, 180, 300, 720, 1000]) {
      const s = scene(count, width, height);
      assertFits(s, count);
      const initial = s.camera.view();
      s.frame();
      assert.deepEqual(s.camera.view(), initial, 'opening view must not drift into a cinematic intro');
    }
  }
});

test('all sky text hides when zoomed out or toggled off, while stars remain lit', () => {
  const s = scene(100);
  s.camera.aim(s.camera.planets[0].dir, 1);
  s.frame();
  const star = s.camera.stars.find((value) => s.camera.project(value.dir));
  const p = s.camera.project(star.dir);
  s.events.get('pointermove')({ pointerId: 1, clientX: p.x, clientY: p.y });
  s.frame();
  assert.ok(s.text.some((value) => value.includes('PLNT-')));
  assert.ok(s.text.some((value) => value.includes('CST-')));
  assert.ok(s.text.some((value) => value.includes('ALBUM')));
  s.labels(false);
  s.frame();
  assert.equal(s.text.length, 0);
  assert.ok(s.fills.some(({ color, glow }) => /^rgba\((61,255,110|255,79,195),0\.9/.test(color) && glow >= 7));
  s.labels(true);
  s.events.get('wheel')({ deltaY: 10000, preventDefault() {} });
  s.frame();
  assert.equal(s.text.length, 0, 'far overview must contain no celestial labels');
  assert.ok(s.camera.view().zoom < 0.45);
  s.events.get('wheel')({ deltaY: -10000, preventDefault() {} });
  s.frame();
  assert.ok(s.text.length > 0, 'labels return on zooming in');
});

test('fit follows library growth until exploration; fit button restores the overview', () => {
  const s = scene(0);
  syncStars(300);
  s.frame();
  assertFits(s, 300);
  s.view.setYaw(1);
  s.frame();
  const explored = s.camera.view();
  syncStars(720);
  s.frame();
  assert.deepEqual(s.camera.view(), explored, 'import should not reset a manually explored view');
  s.view.fitCollection();
  assertFits(s, 720);
  syncStars(0);
  s.frame();
  assert.equal(s.camera.view().overview, true);
});

test('a visible album star still responds to a tap in the fitted view', () => {
  const s = scene(1);
  s.frame();
  const p = s.camera.project(s.camera.stars[0].dir);
  const event = { pointerId: 1, clientX: p.x, clientY: p.y, type: 'pointerup' };
  s.events.get('pointerdown')(event);
  s.events.get('pointerup')(event);
  assert.equal(s.clicked(), 0);
});
