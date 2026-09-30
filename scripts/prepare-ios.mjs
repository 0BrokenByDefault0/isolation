import { cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';

await rm('ios/Web', { recursive: true, force: true });
await cp('dist', 'ios/Web', { recursive: true });
const scripts = (await readdir('ios/Web/assets')).filter((name) => name.endsWith('.js'));
if (scripts.length !== 1) throw new Error('The offline iOS shell requires one standalone JS bundle.');
const js = await readFile(`ios/Web/assets/${scripts[0]}`, 'utf8');
if (/\bimport\s*(?:\(|\.|\{)|\bexport\s*\{/.test(js)) throw new Error('iOS bundle contains module imports; review offline packaging.');
// The build is already a self-contained bundle. A deferred classic script
// works from a bundled file URL without weakening WebKit's file-origin policy.
const html = (await readFile('ios/Web/index.html', 'utf8'))
  .replace('type="module" crossorigin', 'defer').replaceAll(' crossorigin', '');
await writeFile('ios/Web/index.html', html);
console.log('Prepared offline iOS web assets.');
