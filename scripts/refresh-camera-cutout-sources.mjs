import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadataPath = path.join(root, 'assets/cameras/ATTRIBUTION.json');
const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
const qualityReportPath = path.join(root, 'assets/camera-cutouts/QUALITY_REPORT.json');
let previousAssets = [];
try { previousAssets = JSON.parse(await fs.readFile(qualityReportPath, 'utf8')).assets || []; } catch {}
const cutoutFiles = (await fs.readdir(path.join(root, 'assets/camera-cutouts')))
  .filter(name => name.endsWith('.svg'))
  .map(name => name.replace(/\.svg$/, ''));
previousAssets = previousAssets.filter(item => cutoutFiles.includes(item.id));
const currentPreviousById = new Map(previousAssets.map(item => [item.id, item]));
const selected = cutoutFiles.map(id => [id, metadata[id]])
  .filter(([id, item]) => item?.title && currentPreviousById.get(id)?.status !== 'updated');

if (!selected.length) {
  console.log(JSON.stringify({ requested: 0, updated: previousAssets.length, failed: [] }, null, 2));
  process.exit(0);
}

const params = new URLSearchParams({
  action: 'query',
  titles: selected.map(([, item]) => `File:${item.title}`).join('|'),
  prop: 'imageinfo',
  iiprop: 'url|mime|size',
  iiurlwidth: '1400',
  format: 'json',
  origin: '*',
});
const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
  headers: { 'User-Agent': 'PhotoFrameCameraLibrary/1.1 (local quality refresh)' },
});
if (!response.ok) throw new Error(`Wikimedia API ${response.status}`);
const json = await response.json();
const pages = new Map(Object.values(json.query?.pages || {}).map(page => [page.title.replace(/^File:/, ''), page]));
const report = previousAssets.filter(item => item.status === 'updated');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

for (const [id, item] of selected) {
  const info = pages.get(item.title)?.imageinfo?.[0];
  const url = info?.thumburl || info?.url;
  if (!url) { report.push({ id, status: 'missing' }); continue; }
  const target = path.join(root, item.src);
  let download;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    download = await fetch(url, { headers: { 'User-Agent': 'PhotoFrameCameraLibrary/1.1' } });
    if (download.status !== 429) break;
    await pause(1200 * (attempt + 1));
  }
  if (!download.ok) { report.push({ id, status: `http-${download.status}` }); continue; }
  await fs.writeFile(target, Buffer.from(await download.arrayBuffer()));
  report.push({
    id,
    status: 'updated',
    sourceWidth: info.width,
    sourceHeight: info.height,
    downloadedWidth: info.thumbwidth || info.width,
    downloadedHeight: info.thumbheight || info.height,
  });
  await pause(250);
}

await fs.writeFile(
  qualityReportPath,
  `${JSON.stringify({ refreshedAt: new Date().toISOString(), assets: report }, null, 2)}\n`,
);
console.log(JSON.stringify({ requested: selected.length, updated: report.filter(item => item.status === 'updated').length, failed: report.filter(item => item.status !== 'updated') }, null, 2));
