// Capture PhotoFrame's real UI with generated, non-personal demonstration images.
const { createServer } = require('node:http');
const { readFile, writeFile, mkdir, stat } = require('node:fs/promises');
const { resolve, join, extname, sep } = require('node:path');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const root = process.env.PHOTOFRAME_SCREENSHOT_ROOT || resolve(__dirname, '..');
const output = resolve(process.env.PHOTOFRAME_SCREENSHOT_DIR || join(root, 'docs/screenshots'));
const { chromium, expect } = createRequire(join(root, 'package.json'))('@playwright/test');

function demoArtwork(index) {
  const dimensions = [
    [2400, 1600],
    [1600, 2400],
    [2000, 2000],
    [3200, 1200],
  ];
  const [width, height] = dimensions[index];
  const schemes = [
    ['#d8e9df', '#7da9a0', '#406b64', '#213e3b', '#eadbad'],
    ['#e9cbae', '#b58370', '#6f6960', '#384b4d', '#fae5bc'],
    ['#e8daca', '#bd9472', '#756b65', '#3c4c4a', '#f5dfb2'],
    ['#ead6b5', '#c49c70', '#a67555', '#624d40', '#f9e5b8'],
  ];
  const [sky, far, middle, near, sun] = schemes[index];
  const trees = Array.from({ length: 11 }, (_, i) => {
    const x = 120 + i * 210,
      y = 1070 + (i % 3) * 45,
      h = 130 + (i % 4) * 25;
    return `<path d="M${x} ${y - h}l-24 ${h}h48Z" fill="${near}" opacity=".72"/><path d="M${x} ${y}v42" stroke="${near}" stroke-width="5"/>`;
  }).join('');
  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 2400 1600" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="${far}"/></linearGradient><linearGradient id="water" x2="0" y2="1"><stop stop-color="${far}"/><stop offset="1" stop-color="${sky}"/></linearGradient><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".12"/></feComponentTransfer></filter></defs><path fill="url(#sky)" d="M0 0h2400v1600H0z"/><circle cx="${1750 - index * 190}" cy="${400 + index * 80}" r="${120 + index * 12}" fill="${sun}" opacity=".9"/><path d="M0 880L260 570 550 860 930 330 1270 760 1620 520 1910 740 2210 420 2400 660V1600H0Z" fill="${far}"/><path d="M0 1080L220 790 570 1010 940 690 1170 1000 1430 790 1780 1050 2090 700 2400 990V1600H0Z" fill="${middle}"/><path d="M0 1130Q600 1240 1100 1050T2400 1170V1600H0Z" fill="url(#water)"/><path d="M0 1230Q450 1070 850 1190L1120 1600H0Z" fill="${near}"/><path d="M2400 1180Q1950 1130 1640 1390L1580 1600H2400Z" fill="${middle}"/>${trees}<g stroke="${sky}" opacity=".5" stroke-width="5"><path d="M1190 1230h430M1270 1290h230M1130 1390h410M1270 1490h180"/></g><g fill="none" stroke="${near}" stroke-width="7" opacity=".6"><path d="M510 350q30-28 60 0q30-28 60 0M650 300q20-18 40 0q20-18 40 0"/></g><path fill="#715c3d" d="M1360 1320h180l-35 20h-100Z"/><path stroke="#715c3d" stroke-width="5" d="M1450 1280v45"/><path fill="${near}" d="M1440 1283q10-25 20 0v40h-20Z"/><path fill="#fff" filter="url(#grain)" opacity=".22" d="M0 0h2400v1600H0z"/><text x="95" y="1525" fill="${sun}" opacity=".72" font-size="21" font-family="sans-serif" letter-spacing="5">PHOTOFRAME / SYNTHETIC STUDY ${index + 1}</text></svg>`,
  };
}
async function rasterize(page, svg, type = 'image/png', quality = 0.95) {
  return Buffer.from(
    await page.evaluate(
      async ({ source, type, quality }) => {
        const image = new Image();
        image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(source)));
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d').drawImage(image, 0, 0);
        return canvas.toDataURL(type, quality).split(',')[1];
      },
      { source: svg, type, quality },
    ),
    'base64',
  );
}
async function webp(page, bytes) {
  return Buffer.from(
    await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + base64;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', 0.9).split(',')[1];
    }, bytes.toString('base64')),
    'base64',
  );
}
async function main() {
  await mkdir(output, { recursive: true });
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
  };
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + sep) || pathname.split('/').some((p) => p.startsWith('.'))) {
        res.writeHead(403);
        res.end();
        return;
      }
      const bytes = await readFile(file);
      res.writeHead(200, {
        'Content-Type': mime[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  const errors = [],
    shots = [];
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PHOTOFRAME_SCREENSHOT_BROWSER
        ? { executablePath: process.env.PHOTOFRAME_SCREENSHOT_BROWSER }
        : { channel: 'chrome' }),
    });
    const context = await browser.newContext({
      viewport: { width: 1560, height: 1000 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin);
    await expect(page.locator('.preset-card').first()).toBeVisible();
    const inventory = await page.evaluate(() => ({
      presets: window.PRESETS.length,
      collageLayouts: window.COLLAGE_LAYOUTS.length,
      stickers: window.StickerLibrary.builtIns.length,
      categories: window.StickerLibrary.categories?.length,
    }));
    const names = [
      '01-riverside-demo.png',
      '02-dawn-demo.png',
      '03-mountain-demo.png',
      '04-panorama-demo.png',
    ];
    const files = await Promise.all(
      names.map(async (name, i) => ({
        name,
        mimeType: 'image/png',
        buffer: await rasterize(page, demoArtwork(i).svg),
      })),
    );
    await writeFile(
      join(output, 'demo-photo.jpg'),
      await rasterize(page, demoArtwork(0).svg, 'image/jpeg', 0.92),
    );
    await page.locator('#file-input').setInputFiles(files);
    await expect(page.locator('#btn-export-single')).toBeEnabled();
    const settle = async (p = page) => {
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(500);
      await expect(p.locator('#render-indicator')).toBeHidden();
    };
    const tab = async (name, p = page) =>
      p.locator(`.panel-tab[data-tab="${name}"]`).evaluate((el) => el.click());
    const preset = async (id) => {
      await tab('presets');
      await page.locator(`.preset-card[data-id="${id}"]`).click();
      await settle();
    };
    const locations = ['江南 · 水岸', '晨光 · 山居', '远山 · 秋色', '旷野 · 黄昏'];
    for (let i = 0; i < 4; i++) {
      await page.locator('.strip-item').nth(i).click();
      await preset(['135-h', '135-v', '66', 'xpan-h'][i]);
      await tab('info');
      for (const [id, value] of Object.entries({
        'input-location': locations[i],
        'input-camera': i === 2 ? 'Hasselblad 500C/M' : 'Nikon FM2',
        'input-film': i === 3 ? 'Kodak Gold 200' : 'Kodak Portra 400',
        'input-date': '2026.10.18',
      }))
        await page.locator('#' + id).fill(value);
    }
    await page.locator('.strip-item').first().click();
    await tab('presets');
    await settle();
    async function capture(name, p = page) {
      await settle(p);
      await expect(p.locator('#toast')).not.toHaveClass(/show/);
      await p.mouse.move(1, 1);
      await p.waitForTimeout(180);
      await p.evaluate(async () => {
        await Promise.all(
          [...document.images]
            .filter((i) => {
              const r = i.getBoundingClientRect();
              return r.width && r.height && r.top < innerHeight && r.bottom > 0;
            })
            .map((i) => i.decode().catch(() => {})),
        );
      });
      const dimensions = p.viewportSize();
      const bytes = await webp(p, await p.screenshot({ type: 'png' }));
      await writeFile(join(output, name + '.webp'), bytes);
      shots.push({ name, ...dimensions, bytes: bytes.length });
      console.log('Captured', name, bytes.length);
    }
    await capture('workspace');
    await page.locator('#preset-search').fill('Portra 400');
    await page.locator('[data-stock="kodak-portra-400"]').click();
    await page.locator('#film-frame-edge-b').fill('{format}   {camera}   {date}');
    await capture('film-frame');
    await page.locator('#film-frame-remove').click();
    await page.locator('#preset-search').clear();

    await tab('stickers');
    await page.getByRole('button', { name: '地图叠层', exact: true }).click();
    await page.getByRole('button', { name: '试用 Val di Funes' }).click();
    await expect(page.locator('#terrain-map-label')).toHaveValue('Val di Funes');
    await capture('terrain-map');

    await page.getByLabel('地图样式').selectOption('city');
    await page.getByRole('button', { name: '试用圣彼得堡' }).click();
    await expect(page.locator('#terrain-map-label')).toHaveValue('圣彼得堡 · Saint Petersburg');
    await page.getByLabel('地图背景').selectOption('solid');
    await page.getByLabel('底色', { exact: true }).fill('#243848');
    await page.getByLabel('底色不透明度').fill('1');
    await page.locator('#sticker-scale').fill('0.24');
    await settle();
    const previewBox = await page.locator('#canvas-preview').boundingBox();
    const mapBox = await page.locator('#sticker-transform-handle').boundingBox();
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(previewBox.x + previewBox.width * .18, previewBox.y + previewBox.height * .90, { steps: 8 });
    await page.mouse.up();
    await capture('city-map');
    await page.locator('#btn-sticker-delete').click();

    await tab('output');
    await page.locator('#output-format').selectOption('jpeg');
    await expect(page.locator('#output-resolution')).toHaveValue('0');
    await capture('export');
    await page.locator('#output-resolution').selectOption('2400');
    await settle();
    const downloading = page.waitForEvent('download');
    await page.locator('#btn-export-single').click();
    const download = await downloading;
    const result = await readFile(await download.path());
    assert.ok(result[0] === 0xff && result[1] === 0xd8, 'Expected a real JPEG export');
    await writeFile(join(output, 'result.jpg'), result);
    const exportInfo = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = 'data:image/jpeg;base64,' + base64;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, result.toString('base64'));
    await writeFile(join(output, 'result.webp'), await webp(page, result));
    await page.locator('#theme-select').selectOption('warm');
    await tab('border');
    await page.locator('#background-mode').selectOption('paper');
    await page.locator('#border-color').evaluate((el) => {
      el.value = '#f7f0e3';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#btn-border-resize').click();
    await capture('border-editor');
    await page.locator('#btn-border-resize').click();
    await page.locator('#theme-select').selectOption('darkroom');
    await tab('stickers');
    await page.getByRole('button', { name: /135 矢量/ }).click();
    await page.locator('.sticker-card[data-sticker-id="camera-nikon-f"]').click();
    await page.locator('#sticker-scale').fill('0.18');
    const handle = await page.locator('#sticker-transform-handle').boundingBox(),
      canvas = await page.locator('#canvas-preview').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width * 0.83, canvas.y + canvas.height * 0.87, {
      steps: 10,
    });
    await page.mouse.up();
    await page.locator('#sticker-rotation').fill('-8');
    await capture('sticker-library');
    await page.locator('#btn-sync-edits').click();
    await expect(page.locator('#sync-edits-overlay')).toBeVisible();
    await capture('batch-sync');
    await page.locator('#btn-sync-cancel').click();
    await page.locator('#theme-select').selectOption('studio');
    await preset('xpan-h');
    await page.locator('#btn-adjust-crop').click();
    await expect(page.locator('#crop-overlay')).toBeVisible();
    await capture('crop-editor');
    await page.locator('#btn-crop-cancel').click();
    await page.getByRole('button', { name: '拼图', exact: true }).click();
    await page.locator('.preset-card[data-id="cl-4grid"]').click();
    await expect(page.locator('#collage-overlay')).toBeVisible();
    await page.locator('#collage-title-input').fill('秋日光影 / FIELD NOTES');
    await page.locator('#collage-subtitle-input').fill('FOUR FRAMES · A SYNTHETIC PHOTO STUDY');
    await page.locator('#collage-gap').fill('0.018');
    await page.locator('#collage-radius').fill('0.012');
    await page.locator('#collage-margin').fill('0.04');
    await page.locator('#collage-background-mode').selectOption('paper');
    await capture('collage');
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobile.newPage();
    mobilePage.on('pageerror', (e) => errors.push(e.message));
    await mobilePage.goto(origin);
    await mobilePage.locator('#file-input').setInputFiles(files.slice(0, 3));
    await expect(mobilePage.locator('#btn-export-single')).toBeEnabled();
    await mobilePage.locator('.mobile-nav-tab[data-panel="info"]').click();
    await mobilePage.locator('#input-location').tap();
    await expect(mobilePage.locator('#input-location')).toBeFocused();
    await mobilePage.locator('#input-location').fill('江南 · 水岸');
    await mobilePage.locator('#input-camera').fill('Nikon FM2');
    await mobilePage.locator('#input-film').fill('Kodak Portra 400');
    await mobilePage.locator('#mobile-panel-backdrop').click({ position: { x: 10, y: 10 } });
    await capture('mobile-editor', mobilePage);
    await mobilePage.locator('.mobile-nav-tab[data-panel="border"]').click();
    await capture('mobile-tools', mobilePage);
    assert.deepEqual(errors, [], 'Uncaught renderer errors');
    await writeFile(
      join(output, 'capture-report.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          version: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version,
          synthetic: true,
          inventory,
          shots,
          export: { file: 'result.jpg', bytes: result.length, ...exportInfo },
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      'Finished:',
      shots.length,
      'UI screenshots and one real JPEG export',
      inventory,
      exportInfo,
    );
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
