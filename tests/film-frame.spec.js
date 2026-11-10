const { readFile } = require('node:fs/promises');
const { test, expect } = require('@playwright/test');

async function openCatalog(page, testInfo) {
  if (testInfo.project.name === 'mobile') {
    await page.locator('.mobile-nav-tab[data-panel="presets"]').click();
  }
  await page.getByRole('button', { name: '胶片边框', exact: true }).click();
}

test('finds film stocks by aliases and format, and restores custom edge text', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles({
    name: 'portrait.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#346"/></svg>'),
  });
  await openCatalog(page, testInfo);
  await page.locator('#film-catalog-format').selectOption('120');
  await page.locator('#film-catalog-type').selectOption('slide');
  await page.locator('#preset-search').fill('富士 velvia 50');
  const stock = page.getByRole('button', { name: /Fujifilm Velvia 50/ });
  await expect(page.locator('.film-stock-card')).toHaveCount(1);
  await stock.click();
  await expect(page.locator('#film-frame-format')).toHaveValue('120');
  await expect(page.getByLabel('齿孔颜色（135）')).toBeHidden();
  await expect(page.getByRole('button', { name: '使用自定义边字' })).toHaveCount(0);
  await expect(page.locator('#output-summary strong')).toHaveText('708 × 828px');
  await page.locator('#film-frame-style').selectOption('light');
  await page.locator('#film-frame-edge-a').fill('VELVIA TEST ▸ {frame}');
  await expect.poll(() => page.evaluate(async () => {
    const { jobs } = await SessionStore.restoreSession();
    return jobs[0]?.borderOverrides?.film?.edgeA;
  })).toBe('VELVIA TEST ▸ {frame}');
  await page.reload();
  await openCatalog(page, testInfo);
  await expect(page.locator('#film-frame-edge-a')).toHaveValue('VELVIA TEST ▸ {frame}');
  await page.getByRole('button', { name: '移除胶片边框' }).click();
  await expect(page.locator('#film-frame-editor')).toBeHidden();
});

async function makeExifPhoto(page) {
  const jpeg = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 901;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2764b0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const tiff = Buffer.alloc(79);
  tiff.write('II');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  function tag(offset, id, type, count, value) {
    tiff.writeUInt16LE(id, offset);
    tiff.writeUInt16LE(type, offset + 2);
    tiff.writeUInt32LE(count, offset + 4);
    tiff.writeUInt32LE(value, offset + 8);
  }
  tiff.writeUInt16LE(3, 8);
  tag(10, 0x010f, 2, 6, 68); // Make
  tag(22, 0x0110, 2, 5, 74); // Model
  tag(34, 0x8769, 4, 1, 50); // ExifIFD pointer
  tiff.writeUInt16LE(1, 50);
  tag(52, 0x8827, 3, 1, 400); // ISO
  tiff.write('Leica\0M4-2\0', 68);
  const app1 = Buffer.from([0xff, 0xe1, 0x00, tiff.length + 8]);
  return Buffer.concat([Buffer.from(jpeg.slice(0, 2)), app1, Buffer.from('Exif\0\0'), tiff, Buffer.from(jpeg.slice(2))]);
}

test('prints EXIF and the selected 135 hole color at native size', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');
  await page.evaluate(() => {
    const draw = CanvasRenderingContext2D.prototype.fillText;
    window.drawnFilmEdges = [];
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      if (value.startsWith('TEST')) window.drawnFilmEdges.push([this.canvas.width, value]);
      return draw.call(this, value, ...args);
    };
  });
  await page.locator('#file-input').setInputFiles({
    name: 'exif.jpg', mimeType: 'image/jpeg', buffer: await makeExifPhoto(page),
  });
  await openCatalog(page, testInfo);
  await page.locator('#preset-search').fill('Portra 400');
  await page.getByRole('button', { name: /Kodak Portra 400/ }).click();
  await page.locator('#film-frame-edge-b').fill('TEST {camera} | {iso} | {stock}');
  const edge = 'TEST Leica M4-2 | ISO 400 | Kodak Portra 400';
  await expect.poll(() => page.evaluate(() => window.drawnFilmEdges.map(entry => entry[1]))).toContain(edge);
  const color = page.getByLabel('齿孔颜色（135）');
  await expect(color).toHaveValue('#ffffff');
  const previewHole = () => page.evaluate(() => {
    const { shorter, bTop } = CanvasRenderer.getLastLayout();
    const ctx = document.getElementById('canvas-preview').getContext('2d');
    return Array.from(ctx.getImageData(Math.round(shorter * .05), Math.round(bTop * .68), 1, 1).data);
  });
  await expect.poll(previewHole).toEqual([255, 255, 255, 255]);
  await color.fill('#62a8de');
  await expect.poll(previewHole).toEqual([98, 168, 222, 255]);
  await page.locator('#film-frame-format').selectOption('120');
  await expect(color).toBeHidden();
  await page.locator('#film-frame-format').selectOption('135');
  await expect(color).toHaveValue('#62a8de');
  await page.locator('.panel-tab[data-tab="output"]').click();
  await page.locator('#output-format').selectOption('png');
  await expect(page.locator('#output-summary strong')).toHaveText('929 × 756px');

  const [download] = await Promise.all([
    page.waitForEvent('download'), page.locator('#btn-export-single').click(),
  ]);
  const data = Array.from(await readFile(await download.path()));
  const actual = await page.evaluate(async bytes => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return {
      size: [image.width, image.height],
      left: Array.from(ctx.getImageData(14, 78, 1, 1).data),
      right: Array.from(ctx.getImageData(914, 677, 1, 1).data),
      hole: Array.from(ctx.getImageData(30, 53, 1, 1).data),
    };
  }, data);
  expect(actual.size).toEqual([929, 756]);
  expect(actual.left).toEqual(actual.right);
  expect(actual.left[2]).toBeGreaterThan(160);
  expect(actual.hole).toEqual([98, 168, 222, 255]);
  expect(await page.evaluate(() => window.drawnFilmEdges)).toContainEqual([929, edge]);
});
