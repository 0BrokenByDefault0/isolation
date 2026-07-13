// Compact metadata reader for the three formats that cover nearly all local
// libraries: ID3v2 (mp3), FLAC (vorbis comment + picture block), and MP4/M4A
// (ilst). Returns { title, artist, album, year, genre, picture } where picture
// is a Blob of the embedded artwork, if any.

const td = (label) => new TextDecoder(label);

function syncsafe(b0, b1, b2, b3) {
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function decodeText(bytes, enc) {
  // ID3v2 encodings: 0 latin1, 1 utf-16 w/ BOM, 2 utf-16be, 3 utf-8
  const label = enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'latin1';
  let s;
  try { s = td(label).decode(bytes); } catch { s = td('latin1').decode(bytes); }
  return s.split('\0')[0].trim();
}

function parseId3(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return null; // "ID3"
  const ver = u8[3];
  const size = syncsafe(u8[6], u8[7], u8[8], u8[9]);
  const end = Math.min(10 + size, u8.length);
  const out = {};
  let p = 10;
  const idLen = ver === 2 ? 3 : 4;
  const hdrLen = ver === 2 ? 6 : 10;
  while (p + hdrLen <= end) {
    const id = td('latin1').decode(u8.subarray(p, p + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break;
    let fsize;
    if (ver === 2) fsize = (u8[p + 3] << 16) | (u8[p + 4] << 8) | u8[p + 5];
    else if (ver === 4) fsize = syncsafe(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
    else fsize = (u8[p + 4] << 24) | (u8[p + 5] << 16) | (u8[p + 6] << 8) | u8[p + 7];
    const body = u8.subarray(p + hdrLen, p + hdrLen + fsize);
    p += hdrLen + fsize;
    if (fsize <= 0 || body.length === 0) continue;

    const textOf = () => decodeText(body.subarray(1), body[0]);
    switch (id) {
      case 'TIT2': case 'TT2': out.title = textOf(); break;
      case 'TPE1': case 'TP1': out.artist = textOf(); break;
      case 'TALB': case 'TAL': out.album = textOf(); break;
      case 'TYER': case 'TDRC': case 'TYE': {
        const y = parseInt(textOf(), 10);
        if (y) out.year = y;
        break;
      }
      case 'TCON': case 'TCO': {
        const g = textOf().replace(/^\(\d+\)/, '').trim();
        if (g) out.genre = g;
        break;
      }
      case 'APIC': case 'PIC': {
        if (out.picture) break;
        const enc = body[0];
        let q = 1, mime;
        if (id === 'PIC') { // v2.2: 3-char image format
          mime = 'image/' + td('latin1').decode(body.subarray(1, 4)).toLowerCase();
          q = 4;
        } else {
          const z = body.indexOf(0, 1);
          if (z < 0) break;
          mime = td('latin1').decode(body.subarray(1, z));
          q = z + 1;
        }
        q += 1; // picture type
        // description, terminated per encoding
        if (enc === 1 || enc === 2) {
          while (q + 1 < body.length && !(body[q] === 0 && body[q + 1] === 0)) q += 2;
          q += 2;
        } else {
          while (q < body.length && body[q] !== 0) q++;
          q += 1;
        }
        if (q < body.length) out.picture = new Blob([body.slice(q)], { type: mime || 'image/jpeg' });
        break;
      }
    }
  }
  return out;
}

function parseFlac(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (td('latin1').decode(u8.subarray(0, 4)) !== 'fLaC') return null;
  const out = {};
  let p = 4;
  while (p + 4 <= u8.length) {
    const head = u8[p];
    const last = head & 0x80;
    const type = head & 0x7f;
    const len = (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3];
    const start = p + 4;
    if (start + len > u8.length) break;
    if (type === 4) { // VORBIS_COMMENT (little-endian lengths)
      let q = start;
      const vlen = dv.getUint32(q, true); q += 4 + vlen;
      const n = dv.getUint32(q, true); q += 4;
      for (let i = 0; i < n && q + 4 <= start + len; i++) {
        const clen = dv.getUint32(q, true); q += 4;
        const c = td('utf-8').decode(u8.subarray(q, q + clen)); q += clen;
        const eq = c.indexOf('=');
        if (eq < 0) continue;
        const key = c.slice(0, eq).toUpperCase();
        const val = c.slice(eq + 1).trim();
        if (key === 'TITLE') out.title = val;
        else if (key === 'ARTIST' && !out.artist) out.artist = val;
        else if (key === 'ALBUM') out.album = val;
        else if (key === 'GENRE' && !out.genre) out.genre = val;
        else if (key === 'DATE' || key === 'YEAR') { const y = parseInt(val, 10); if (y) out.year = y; }
      }
    } else if (type === 6 && !out.picture) { // PICTURE (big-endian)
      let q = start + 4; // skip picture type
      const mlen = dv.getUint32(q); q += 4;
      const mime = td('latin1').decode(u8.subarray(q, q + mlen)); q += mlen;
      const dlen = dv.getUint32(q); q += 4 + dlen; // description
      q += 16; // width, height, depth, colors
      const plen = dv.getUint32(q); q += 4;
      if (q + plen <= start + len) out.picture = new Blob([u8.slice(q, q + plen)], { type: mime });
    }
    p = start + len;
    if (last) break;
  }
  return out;
}

function findAtom(dv, u8, start, end, name) {
  let p = start;
  while (p + 8 <= end) {
    const size = dv.getUint32(p);
    const type = td('latin1').decode(u8.subarray(p + 4, p + 8));
    if (size < 8) break;
    if (type === name) return { start: p + 8, end: Math.min(p + size, end) };
    p += size;
  }
  return null;
}

function parseMp4(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (td('latin1').decode(u8.subarray(4, 8)) !== 'ftyp') return null;
  const moov = findAtom(dv, u8, 0, u8.length, 'moov');
  if (!moov) return null;
  const udta = findAtom(dv, u8, moov.start, moov.end, 'udta');
  if (!udta) return null;
  const meta = findAtom(dv, u8, udta.start, udta.end, 'meta');
  if (!meta) return null;
  const ilst = findAtom(dv, u8, meta.start + 4, meta.end, 'ilst'); // +4: version/flags
  if (!ilst) return null;

  const out = {};
  let p = ilst.start;
  while (p + 8 <= ilst.end) {
    const size = dv.getUint32(p);
    if (size < 8) break;
    const type = td('latin1').decode(u8.subarray(p + 4, p + 8));
    const data = findAtom(dv, u8, p + 8, p + size, 'data');
    if (data) {
      const payload = u8.subarray(data.start + 8, data.end); // skip type+locale
      const text = () => td('utf-8').decode(payload).trim();
      switch (type) {
        case '©nam': out.title = text(); break;
        case '©ART': out.artist = text(); break;
        case '©alb': out.album = text(); break;
        case '©gen': out.genre = text(); break;
        case '©day': { const y = parseInt(text(), 10); if (y) out.year = y; break; }
        case 'covr': {
          const kind = dv.getUint32(data.start) === 14 ? 'image/png' : 'image/jpeg';
          out.picture = new Blob([u8.slice(data.start + 8, data.end)], { type: kind });
          break;
        }
      }
    }
    p += size;
  }
  return out;
}

// Reads enough of the file to cover the tag region without pulling a whole
// FLAC into memory. ID3 declares its own size; FLAC/MP4 metadata live up front.
export async function readTags(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    let span = 4 * 1024 * 1024;
    if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      span = 10 + syncsafe(head[6], head[7], head[8], head[9]) + 4096;
    }
    const buf = await file.slice(0, Math.min(file.size, span)).arrayBuffer();
    return parseId3(buf) || parseFlac(buf) || parseMp4(buf) || {};
  } catch {
    return {};
  }
}
