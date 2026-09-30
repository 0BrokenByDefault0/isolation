(async () => {
  const report = (data) => window.webkit.messageHandlers.smoke.postMessage(data);
  const deadline = Date.now() + 25000;
  const wait = async (predicate) => {
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('Web app did not become ready within 25 seconds');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  try {
    await wait(() => window.__sky && document.getElementById('vLabels'));
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('isolation', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    const seeded = await new Promise((resolve, reject) => {
      const r = db.transaction('kv').objectStore('kv').get('native-smoke-seeded'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    if (!seeded) {
      // Feed a real WAV through the app's picker result/import path. The
      // document-picker UI itself still needs physical-device review.
      const bytes = new Uint8Array(16044);
      const header = new DataView(bytes.buffer);
      const word = (offset, text) => [...text].forEach((c, i) => { bytes[offset + i] = c.charCodeAt(0); });
      word(0, 'RIFF'); header.setUint32(4, 16036, true); word(8, 'WAVE'); word(12, 'fmt ');
      header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true);
      header.setUint32(24, 8000, true); header.setUint32(28, 16000, true);
      header.setUint16(32, 2, true); header.setUint16(34, 16, true); word(36, 'data'); header.setUint32(40, 16000, true);
      const file = new File([bytes], 'check.wav', { type: 'audio/wav' });
      Object.defineProperty(file, 'webkitRelativePath', { value: 'Smoke Album/check.wav' });
      document.querySelector('[data-tab="library"]').click();
      const originalClick = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function () {
        if (this.type !== 'file') return originalClick.call(this);
        const transfer = new DataTransfer(); transfer.items.add(file); this.files = transfer.files;
        this.dispatchEvent(new Event('change'));
      };
      try { document.getElementById('importDir').click(); } finally { HTMLInputElement.prototype.click = originalClick; }
      await wait(() => window.__sky.stars.length === 1);
      await new Promise((resolve, reject) => {
        const t = db.transaction(['albums', 'kv'], 'readwrite');
        for (let i = 0; i < 299; i++) t.objectStore('albums').put({
          id: 'native-smoke-' + i, order: i, title: 'ALBUM ' + i, artist: 'ARTIST', source: 'mock',
          tracks: [{ id: 'native-smoke-' + i + ':0', title: 'TRACK', len: 180 }],
        });
        t.objectStore('kv').put({ skyLabels: false, hud: true, viz: false, volume: 0.72 }, 'settings');
        t.objectStore('kv').put(true, 'native-smoke-seeded');
        t.oncomplete = resolve; t.onerror = () => reject(t.error);
      });
      db.close(); location.reload(); return;
    }
    await wait(() => window.__sky.stars.length === 300);
    const s = window.__sky;
    if (s.planets.length !== 3) throw new Error('Expected three planets');
    if (document.getElementById('vLabels').getAttribute('aria-pressed') !== 'false') throw new Error('Labels setting did not persist');
    const albums = await new Promise((resolve, reject) => {
      const r = db.transaction('albums').objectStore('albums').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    const audio = albums.find((album) => album.source === 'local')?.tracks[0].file;
    if (!audio || audio.size !== 16044 || await audio.slice(0, 4).text() !== 'RIFF') throw new Error('Imported audio did not survive reload');
    document.getElementById('vFit').click();
    const viewport = s.view().viewport;
    for (const object of [...s.stars, ...s.planets]) {
      const p = s.project(object.dir);
      if (!p || p.x < viewport.left || p.x > viewport.right || p.y < viewport.top || p.y > viewport.bottom) throw new Error('Collection not framed');
    }
    report({ status: 'passed', albums: 300, planets: 3, labelsPersisted: true, audioBlobPersisted: true,
      canvasWidth: document.getElementById('sky').getBoundingClientRect().width, viewportWidth: innerWidth });
    db.close();
  } catch (error) { report({ status: 'failed', error: String(error) }); }
})();
