import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const source = await fs.readFile(path.join(root, 'js/sticker-library.js'), 'utf8');
const cameraBlock = source.slice(source.indexOf('const cameras = ['), source.indexOf('].map(camera)', source.indexOf('const cameras = [')));
const cameras = [...cameraBlock.matchAll(/'([^'\n]+\|[^'\n]+)'/g)].map(match => {
  const [id, name] = match[1].split('|');
  return { id, name };
});

const aliases = {
  'widleux': 'Widelux F7',
  'olympus-mju': 'Olympus mju camera',
  'disposable': 'disposable 35mm camera',
  'polaroid-sx70': 'Polaroid SX-70',
  'instax-wide': 'Fujifilm Instax Wide camera',
};
const normalize = value => value.normalize('NFKD').toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9]+/g, ' ').trim();
const stripHtml = value => String(value || '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
const allowedLicense = value => /^(cc\s|cc0|public domain|pd)/i.test(value || '');
const rejectedTitle = value => /\b(film backs?|lens(?:es)? only|manual|advertisement|brochure)\b/i.test(value || '');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function scoreCandidate(camera, title, description = '') {
  const query = normalize(aliases[camera.id] || camera.name);
  const normalizedTitle = normalize(title.replace(/^File:/i, ''));
  const haystack = normalize(`${title} ${description}`);
  const tokens = query.split(' ').filter(token => token.length > 1 || /^\d+$/.test(token));
  const titleMatched = tokens.filter(token => normalizedTitle.includes(token));
  const titleCoverage = titleMatched.length / Math.max(1, tokens.length);
  // Descriptions and category text often mention a model that is not actually
  // pictured. A usable result must identify both the maker and model in the
  // filename itself; description text only supplies a small tie-breaker.
  const makerMatches = normalizedTitle.includes(tokens[0]);
  const modelMatches = tokens.length === 1 || tokens.slice(1).some(token => normalizedTitle.includes(token));
  if (!makerMatches || !modelMatches || titleCoverage < .55) return -100;
  let score = titleCoverage * 100;
  if (normalizedTitle.includes(query)) score += 40;
  if (tokens.every(token => haystack.includes(token))) score += 5;
  if (/\bcamera\b/.test(haystack)) score += 5;
  if (/\b(collection|lot|group|museum display)\b/.test(haystack)) score -= 15;
  return score;
}

async function search(camera) {
  const query = aliases[camera.id] || camera.name;
  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: `filetype:bitmap ${query} camera`,
    gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|mime|extmetadata',
    iiurlwidth: '640', format: 'json', origin: '*',
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': 'PhotoFrameCameraLibrary/1.0 (local development asset audit)' },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const json = await response.json();
  return Object.values(json.query?.pages || {}).map(page => {
    const info = page.imageinfo?.[0] || {};
    const meta = info.extmetadata || {};
    const license = stripHtml(meta.LicenseShortName?.value || meta.UsageTerms?.value);
    const description = stripHtml(meta.ImageDescription?.value);
    return {
      title: page.title, page: info.descriptionurl, url: info.thumburl, width: info.thumbwidth,
      height: info.thumbheight, mime: info.mime, license, licenseUrl: meta.LicenseUrl?.value || '',
      author: stripHtml(meta.Artist?.value), description,
      score: scoreCandidate(camera, page.title, description),
    };
  }).filter(item => item.url && !rejectedTitle(item.title) && /^image\/(jpeg|png|webp)$/.test(item.mime || '') && allowedLicense(item.license))
    .sort((a, b) => b.score - a.score);
}

async function withRetries(operation) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      if (!/^429\b/.test(error.message) || attempt === 4) throw error;
      await pause(750 * (attempt + 1));
    }
  }
}

const outputDir = path.join(root, 'assets/cameras');
await fs.mkdir(outputDir, { recursive: true });
const manifest = {};
const unresolved = [];

for (const camera of cameras) {
  try {
      const candidates = await withRetries(() => search(camera));
      const best = candidates[0];
      if (!best || best.score < 60) {
        unresolved.push({ ...camera, candidates: candidates.slice(0, 3) });
        await pause(80);
        continue;
      }
      const extension = best.mime === 'image/png' ? 'png' : best.mime === 'image/webp' ? 'webp' : 'jpg';
      const filename = `${camera.id}.${extension}`;
      const target = path.join(outputDir, filename);
      try { await fs.access(target); }
      catch {
        const response = await withRetries(() => fetch(best.url, { headers: { 'User-Agent': 'PhotoFrameCameraLibrary/1.0' } }).then(result => {
          if (!result.ok) throw new Error(`download ${result.status}`);
          return result;
        }));
        await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
      }
      manifest[camera.id] = {
        src: `assets/cameras/${filename}`, ratio: best.width / best.height,
        title: best.title.replace(/^File:/, ''), author: best.author, license: best.license,
        licenseUrl: best.licenseUrl, source: best.page, score: Math.round(best.score),
      };
  } catch (error) {
    unresolved.push({ ...camera, error: error.message });
  }
  await pause(80);
}

const ordered = Object.fromEntries(cameras.filter(camera => manifest[camera.id]).map(camera => [camera.id, manifest[camera.id]]));
await fs.writeFile(path.join(root, 'js/camera-photo-library.js'), `/** Generated from freely licensed Wikimedia Commons files. */\nwindow.CameraPhotoLibrary = ${JSON.stringify(ordered, null, 2)};\n`);
await fs.writeFile(path.join(outputDir, 'ATTRIBUTION.json'), `${JSON.stringify(ordered, null, 2)}\n`);
await fs.writeFile(path.join(outputDir, 'UNRESOLVED.json'), `${JSON.stringify(unresolved, null, 2)}\n`);
console.log(JSON.stringify({ requested: cameras.length, resolved: Object.keys(ordered).length, unresolved: unresolved.length }, null, 2));
