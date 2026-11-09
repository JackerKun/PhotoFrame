const { readFile } = require('node:fs/promises');
const { test, expect } = require('@playwright/test');

function photo(name, width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#174c79"/>
  </svg>`;
  return { name: `${name}.svg`, mimeType: 'image/svg+xml', buffer: Buffer.from(svg) };
}

test('matches each imported photo and navigates the bottom filmstrip', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles([
    photo('landscape', 900, 600), photo('portrait', 600, 800), photo('square', 700, 700),
  ]);
  const selected = page.locator('.preset-card.active');
  await expect(page.locator('.preview-area #filmstrip .strip-item img')).toHaveCount(3);
  await expect(selected).toHaveAttribute('data-id', '135-h');

  await page.getByRole('button', { name: '下一张照片' }).click();
  await expect(selected).toHaveAttribute('data-id', '645-v');
  await page.locator('.strip-item.active').press('ArrowRight');
  await expect(selected).toHaveAttribute('data-id', '66');
  await expect(page.getByRole('button', { name: '下一张照片' })).toBeDisabled();
  await page.getByRole('button', { name: '上一张照片' }).click();
  await expect(page.locator('.strip-item.active')).toHaveAttribute('aria-label', 'portrait.svg');
});

test('caps combined imports at 72 and scrolls the selected thumbnail into view', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('#file-input');
  const photos = Array.from({ length: 74 }, (_, index) => photo(`photo-${index + 1}`, 24, 16));
  await input.setInputFiles(photos.slice(0, 3));
  await expect(page.locator('.strip-item')).toHaveCount(3);
  await input.setInputFiles(photos.slice(3));
  await expect(page.locator('.strip-item img')).toHaveCount(72);
  await expect(page.locator('#toast')).toContainText('最多支持 72 张');
  await input.setInputFiles(photo('extra', 24, 16));
  await expect(page.locator('.strip-item')).toHaveCount(72);
  await page.locator('.strip-item').nth(70).click();
  await page.getByRole('button', { name: '下一张照片' }).click();
  const active = page.locator('.strip-item.active');
  await expect(active).toHaveAttribute('aria-label', 'photo-72.svg');
  await expect(active).toBeInViewport();
});

test('exports original pixels in both a single file and a ZIP', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');
  const original = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4501;
    canvas.height = 3000;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#123456';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(canvas.width - 1, 0, 1, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('#file-input').setInputFiles([
    { name: 'original.png', mimeType: 'image/png', buffer: Buffer.from(original) },
    photo('square', 100, 100),
  ]);
  await page.locator('.panel-tab[data-tab="output"]').click();
  await expect(page.locator('#output-resolution')).toHaveValue('0');
  await page.locator('#output-format').selectOption('png');
  await expect(page.locator('#output-summary strong')).toHaveText('4801 × 3810px');

  const [single] = await Promise.all([
    page.waitForEvent('download'), page.locator('#btn-export-single').click(),
  ]);
  const [batch] = await Promise.all([
    page.waitForEvent('download'), page.locator('#btn-export-batch').click(),
  ]);
  const [singleBytes, zipBytes] = await Promise.all([single, batch].map(async download =>
    Array.from(await readFile(await download.path()))
  ));
  const result = await page.evaluate(async ({ singleBytes, zipBytes }) => {
    async function inspect(bytes) {
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 4649, 150, 2, 1, 0, 0, 2, 1);
      const result = [bitmap.width, bitmap.height, ...ctx.getImageData(0, 0, 2, 1).data];
      bitmap.close();
      return result;
    }
    const zip = await JSZip.loadAsync(new Uint8Array(zipBytes));
    const original = await zip.file('PhotoFrame导出/original_frame_01.png').async('uint8array');
    const square = await zip.file('PhotoFrame导出/square_frame_02.png').async('uint8array');
    const squareBitmap = await createImageBitmap(new Blob([square], { type: 'image/png' }));
    return {
      single: await inspect(new Uint8Array(singleBytes)),
      batch: await inspect(original),
      square: [squareBitmap.width, squareBitmap.height],
    };
  }, { singleBytes, zipBytes });
  expect(result.single).toEqual([4801, 3810, 18, 52, 86, 255, 255, 0, 0, 255]);
  expect(result.batch).toEqual(result.single);
  expect(result.square).toEqual([114, 131]);
});
