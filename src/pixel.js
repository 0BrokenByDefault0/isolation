// Album artwork becomes a 24x24 in-color mosaic; the UI scales it up with
// image-rendering: pixelated so real covers read as chunky sprites.

export async function pixelate(blob) {
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    c.getContext('2d').drawImage(img, 0, 0, 24, 24);
    return c.toDataURL();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Seeded, mirrored pixel sprite for albums with no artwork.
export function makeMockArt(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const x = c.getContext('2d');
  let s = ((seed * 104729 + 7919) % 2147483647) + 13;
  const r = () => ((s = (48271 * s) % 2147483647) / 2147483647);
  const h0 = r() * 360;
  x.fillStyle = `hsl(${h0},55%,9%)`;
  x.fillRect(0, 0, 12, 12);
  for (let py = 0; py < 12; py++) {
    for (let px = 0; px < 6; px++) {
      if (r() < 0.42) {
        x.fillStyle = `hsl(${(h0 + r() * 150) % 360},${55 + r() * 45}%,${32 + r() * 38}%)`;
        x.fillRect(px, py, 1, 1);
        x.fillRect(11 - px, py, 1, 1);
      }
    }
  }
  return c.toDataURL();
}
