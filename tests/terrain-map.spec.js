const { readFile } = require('node:fs/promises');
const { expect, test } = require('@playwright/test');

const photo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><rect width="1800" height="1200" fill="#294b6e"/></svg>');

async function openEditor(page, project) {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles({ name: 'mountains.svg', mimeType: 'image/svg+xml', buffer: photo });
  if (project === 'mobile') await page.locator('.mobile-nav-tab[data-panel="stickers"]').tap();
  else await page.locator('.panel-tab[data-tab="stickers"]').click();
  await page.getByRole('button', { name: '地图叠层', exact: true }).click();
}

test('adds the offline sample, moves the red pin and renders it at original resolution', async ({ page }, testInfo) => {
  await page.route('https://elevation-tiles-prod.s3.amazonaws.com/**', route => route.abort());
  await page.route('https://photon.komoot.io/**', route => route.abort());
  await openEditor(page, testInfo.project.name);
  await page.getByRole('button', { name: '试用 Val di Funes' }).click();
  const pin = page.locator('#terrain-map-pin');
  await expect(pin).toContainText('46.6440° N');
  expect(await page.locator('#tab-stickers').evaluate(tab => tab.scrollWidth - tab.clientWidth)).toBeLessThanOrEqual(1);
  const map = page.locator('#terrain-map-preview');
  const box = await map.boundingBox();
  await map.click({ position: { x: box.width * .65, y: box.height * .56 } });
  await expect(pin).not.toContainText('46.6440° N');
  await page.locator('#terrain-map-label').fill('Dolomites · Field notes');
  await page.locator('#terrain-map-label').press('Tab');
  await page.locator('[data-map-field="showElevation"]').uncheck();

  if (testInfo.project.name === 'desktop') {
    const handle = page.locator('#sticker-transform-handle');
    await expect(handle).toBeVisible();
    const original = await handle.boundingBox();
    const x = original.x + original.width * .45;
    const y = original.y + original.height * .45;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 32, y + 18, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await handle.boundingBox()).x).toBeGreaterThan(original.x + 25);
  }

  const loadSaved = () => page.evaluate(async () => (await SessionStore.restoreSession()).jobs[0]?.stickers?.find(s => s.terrain));
  await expect.poll(async () => (await loadSaved())?.terrain?.label).toBe('Dolomites · Field notes');
  if (testInfo.project.name === 'desktop') {
    await expect.poll(async () => (await loadSaved())?.x ?? 0).toBeGreaterThan(.52);
  }
  const sticker = await loadSaved();
  expect(sticker.terrain.pin.x).toBeCloseTo(.65, 1);
  expect(sticker.terrain.showElevation).toBe(false);

  if (testInfo.project.name === 'desktop') {
    await page.locator('.panel-tab[data-tab="output"]').click();
    await page.locator('#output-format').selectOption('png');
    await expect(page.locator('#output-summary strong')).toHaveText('1920 × 1524px');
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.locator('#btn-export-single').click(),
    ]);
    const bytes = Array.from(await readFile(await download.path()));
    const pixel = await page.evaluate(async ({ bytes, x, y, scale, pin }) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const w = 1524 * scale;
      const atX = 1920 * x + w * (pin.x - .5);
      const atY = 1524 * y + w / 1.5 * (pin.y - .5);
      return [image.width, image.height, ...ctx.getImageData(atX, atY, 1, 1).data];
    }, { bytes, x: sticker.x, y: sticker.y, scale: sticker.scale, pin: sticker.terrain.pin });
    expect(pixel).toEqual([1920, 1524, 227, 70, 54, 255]);
  }

  await page.reload();
  if (testInfo.project.name === 'mobile') await page.locator('.mobile-nav-tab[data-panel="stickers"]').tap();
  else await page.locator('.panel-tab[data-tab="stickers"]').click();
  await page.getByRole('button', { name: '地图叠层', exact: true }).click();
  await expect(page.locator('#terrain-map-label')).toHaveValue('Dolomites · Field notes');
});

test('searches and builds terrain from Terrarium tiles', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await openEditor(page, testInfo.project.name);
  const tile = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    for (let x = 0; x < 256; x++) {
      const elevation = 32768 + 1000 + 4 * x;
      ctx.fillStyle = `rgb(${elevation >> 8}, ${elevation & 255}, 0)`;
      ctx.fillRect(x, 0, 1, 256);
    }
    return canvas.toDataURL().split(',')[1];
  });
  let tiles = 0;
  await page.route('https://elevation-tiles-prod.s3.amazonaws.com/**', async route => {
    tiles++;
    await route.fulfill({ contentType: 'image/png', body: Buffer.from(tile, 'base64') });
  });
  await page.route('https://photon.komoot.io/**', async route => {
    expect(new URL(route.request().url()).searchParams.get('q')).toBe('Seceda');
    await route.fulfill({ json: { features: [
      { geometry: { coordinates: [11.725, 46.60] }, properties: { name: 'Seceda', country: 'Italy' } },
    ] } });
  });
  await page.getByRole('searchbox', { name: '搜索地图地点' }).fill('Seceda');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.getByRole('button', { name: 'Seceda · Italy' }).click();
  await expect(page.locator('#terrain-map-label')).toHaveValue('Seceda');
  await expect(page.locator('#terrain-map-pin')).toContainText('46.6000° N');
  expect(tiles).toBeGreaterThan(0);
  await page.locator('#terrain-map-center').fill('0, 0');
  await page.getByRole('button', { name: '生成地图' }).click();
  await expect(page.locator('#terrain-map-pin')).toContainText('0.0000° N');
});

test('applies a city map with its own background and exports the selected color', async ({ page }, testInfo) => {
  await page.route('https://tiles.openfreemap.org/**', route => route.abort());
  await openEditor(page, testInfo.project.name);
  await page.getByLabel('地图样式').selectOption('city');
  await page.getByRole('button', { name: '试用圣彼得堡' }).click();
  await expect(page.locator('#terrain-map-label')).toHaveValue('圣彼得堡 · Saint Petersburg');
  await expect(page.locator('#terrain-map-pin')).toContainText('59.9410° N');
  await expect(page.getByLabel('海拔')).toBeHidden();
  await page.getByLabel('地图背景').selectOption('solid');
  await page.getByLabel('底色', { exact: true }).fill('#296249');
  await page.getByLabel('底色不透明度').fill('1');
  await page.getByLabel('地图线色').selectOption('dark');
  await expect(page.locator('#terrain-map-preview')).toHaveAttribute('data-ink', 'dark');
  await page.getByLabel('地图线色').selectOption('auto');
  await expect(page.locator('#terrain-map-preview')).toHaveAttribute('data-ink', 'light');

  const loadSaved = () => page.evaluate(async () => (await SessionStore.restoreSession()).jobs[0]?.stickers?.[0]);
  await expect.poll(async () => (await loadSaved())?.terrain?.backgroundColor).toBe('#296249');
  const sticker = await loadSaved();
  expect(sticker.name).toBe('城市地图');
  expect(sticker.terrain.mode).toBe('city');
  expect(sticker.terrain.city.tiles.some(tile => tile.water.length && tile.major.length)).toBe(true);
  expect(sticker.terrain.backgroundOpacity).toBe(1);

  if (testInfo.project.name === 'desktop') {
    await page.locator('.panel-tab[data-tab="output"]').click();
    await page.locator('#output-format').selectOption('png');
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.locator('#btn-export-single').click(),
    ]);
    const bytes = Array.from(await readFile(await download.path()));
    const colored = await page.evaluate(async ({ bytes, sticker }) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const width = Math.min(canvas.width, canvas.height) * sticker.scale;
      const left = canvas.width * sticker.x - width / 2;
      const top = canvas.height * sticker.y - width / 3;
      const { data } = ctx.getImageData(left + width * .2, top + width * .25, width * .2, width * .15);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 41 && data[i + 1] === 98 && data[i + 2] === 73) count++;
      }
      const outside = Array.from(ctx.getImageData(0, 0, 1, 1).data);
      return { count, outside, size: [image.width, image.height] };
    }, { bytes, sticker });
    expect(colored.count).toBeGreaterThan(1000);
    expect(colored.outside).toEqual([255, 255, 255, 255]);
    expect(colored.size).toEqual([1920, 1524]);
  }

  await page.reload();
  if (testInfo.project.name === 'mobile') await page.locator('.mobile-nav-tab[data-panel="stickers"]').tap();
  else await page.locator('.panel-tab[data-tab="stickers"]').click();
  await page.getByRole('button', { name: '地图叠层', exact: true }).click();
  await expect(page.getByLabel('地图样式')).toHaveValue('city');
  await expect(page.getByLabel('底色', { exact: true })).toHaveValue('#296249');
});
