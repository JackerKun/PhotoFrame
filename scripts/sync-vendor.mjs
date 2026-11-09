import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const files = [
  ['node_modules/exifr/dist/lite.umd.js', 'vendor/exifr-lite.umd.js'],
  ['node_modules/jszip/dist/jszip.min.js', 'vendor/jszip.min.js'],
  ['node_modules/file-saver/dist/FileSaver.min.js', 'vendor/FileSaver.min.js'],
  ['node_modules/heic2any/dist/heic2any.min.js', 'vendor/heic2any.min.js'],
  ['node_modules/utif/UTIF.js', 'vendor/UTIF.js'],
];

for (const [from, to] of files) {
  const source = resolve(from);
  const target = resolve(to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  console.log(`${from} -> ${to}`);
}

// Keep the city map decoder browser-native so the editor needs no build step.
const modules = [
  ['@mapbox/vector-tile', 'LICENSE.txt', 'vector-tile.mjs'],
  ['@mapbox/point-geometry', 'LICENSE', 'point-geometry.mjs'],
  ['pbf', 'LICENSE', 'pbf.mjs'],
];
const licenses = [];
for (const [name, license, file] of modules) {
  const root = resolve('node_modules', name);
  const source = await readFile(resolve(root, 'index.js'), 'utf8');
  await writeFile(resolve('vendor', file), source.replace("from '@mapbox/point-geometry'", "from './point-geometry.mjs'"));
  licenses.push(name + '\n' + (await readFile(resolve(root, license), 'utf8')).trim());
}
await writeFile(resolve('vendor', 'vector-tiles.LICENSE.txt'), licenses.join('\n\n') + '\n');
