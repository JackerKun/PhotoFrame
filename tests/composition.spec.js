const { readFile } = require('node:fs/promises');
const { test, expect } = require('@playwright/test');

test('finds Fuji film by name from the main preset search', async ({ page }, testInfo) => {
  await page.goto('/');
  if (testInfo.project.name === 'mobile') {
    await page.locator('.mobile-nav-tab[data-panel="presets"]').click();
  }
  const search = page.locator('#preset-search');
  await search.fill('Ｆｕｊｉ provia');
  await expect(page.locator('.cat-btn[data-cat="all"]')).toHaveClass(/active/);
  await expect(page.locator('.film-stock-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Fujifilm Provia 100F/ })).toBeVisible();
  await search.fill('富士 120 velvia 50');
  await expect(page.locator('.film-stock-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Fujifilm Velvia 50/ })).toBeVisible();
  await search.clear();
  await expect(page.locator('#film-frame-panel')).toBeHidden();
  await expect(page.locator('.preset-card').first()).toBeVisible();
});

const colors = [
  [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0],
];
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2400"><path fill="red" d="M0 0h1800v1200H0z"/><path fill="lime" d="M1800 0h1800v1200H1800z"/><path fill="blue" d="M0 1200h1800v1200H0z"/><path fill="yellow" d="M1800 1200h1800v1200H1800z"/></svg>');

test('rotates and flips composition, supports cancellation and undo, and exports in the same direction', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles({
    name: 'quadrants.svg', mimeType: 'image/svg+xml', buffer: svg,
  });

  const preview = () => page.evaluate(() => {
    const layout = CanvasRenderer.getLastLayout();
    if (!layout) return null;
    const ctx = document.getElementById('canvas-preview').getContext('2d');
    const { bLeft, bTop, photoW, photoH } = layout;
    return [.25, .75].flatMap(y => [.25, .75].map(x =>
      Array.from(ctx.getImageData(bLeft + x * photoW, bTop + y * photoH, 1, 1).data).slice(0, 3)
    ));
  });

  await expect.poll(preview).toEqual(colors);
  await page.locator('#btn-adjust-crop').click();
  await page.getByRole('button', { name: '右转 90°' }).click();
  await page.getByRole('button', { name: '水平翻转' }).click();
  await page.getByRole('button', { name: '垂直翻转' }).click();
  await page.getByRole('button', { name: '完成构图' }).click();
  const transformed = [colors[1], colors[3], colors[0], colors[2]];
  await expect.poll(preview).toEqual(transformed);
  await expect(page.locator('#output-summary strong')).toHaveText('2640 × 4248px');

  await page.locator('#btn-adjust-crop').click();
  await page.getByRole('button', { name: '左转 90°' }).click();
  await page.locator('#btn-crop-cancel').click();
  await expect.poll(preview).toEqual(transformed);

  await page.keyboard.press('Control+z');
  await expect.poll(preview).toEqual(colors);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(preview).toEqual(transformed);

  if (testInfo.project.name === 'mobile') return;
  await page.locator('.panel-tab[data-tab="output"]').click();
  await page.locator('#output-format').selectOption('png');
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.locator('#btn-export-single').click(),
  ]);
  const bytes = Array.from(await readFile(await download.path()));
  const exported = await page.evaluate(async bytes => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return {
      size: [image.width, image.height],
      pixels: [1020, 2820].flatMap(y => [720, 1920].map(x =>
        Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3)
      )),
    };
  }, bytes);
  expect(exported).toEqual({ size: [2640, 4248], pixels: transformed });
});

test('keeps an off-center crop on the same subject when rotated and mirrored', async ({ page }) => {
  await page.goto('/');
  const crops = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const preview = document.createElement('canvas');
    preview.width = 90;
    preview.height = 60;
    const editor = new CropEditor(canvas, preview, 2, 1, { width: 900, height: 600 });
    editor.setFromCropRect({ sx: 105, sy: 60, sw: 500, sh: 250 });
    const original = editor.getCropData();
    editor.transform('right');
    const rotated = editor.getCropData();
    editor.transform('horizontal');
    const mirrored = editor.getCropData();
    editor.destroy();
    return { original, rotated, mirrored };
  });
  expect(crops).toEqual({
    original: { sx: 105, sy: 60, sw: 500, sh: 250 },
    rotated: { sx: 290, sy: 105, sw: 250, sh: 500 },
    mirrored: { sx: 60, sy: 105, sw: 250, sh: 500 },
  });
});
