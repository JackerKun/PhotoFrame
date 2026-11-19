const { readFile } = require('node:fs/promises');
const { test, expect } = require('@playwright/test');

const sample = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="180" height="120" fill="#ad7656"/></svg>');
async function upload(page, names = ['one.svg', 'two.svg']) {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles(names.map(name => ({ name, mimeType: 'image/svg+xml', buffer: sample })));
  await expect.poll(() => page.locator('#canvas-preview').evaluate(canvas => canvas.width)).toBeGreaterThan(1);
}
async function openPanel(page, name, testInfo) {
  await page.locator(testInfo.project.name === 'mobile' ? `.mobile-nav-tab[data-panel="${name}"]` : `.panel-tab[data-tab="${name}"]`).click();
}

test('shares grouped system fonts across titles and extra lines, and remembers folds', async ({ page }, testInfo) => {
  await upload(page);
  await openPanel(page, 'border', testInfo);
  await expect(page.locator('#tab-border > details')).toHaveCount(7);
  await expect(page.locator('#font-title option')).toHaveCount(49);
  await page.locator('#font-title').selectOption('Microsoft YaHei');
  await page.locator('#font-subtitle').selectOption('Consolas');
  await page.locator('#group-extra > summary').click();
  await page.locator('#btn-add-extra-line').click();
  const extra = page.getByRole('combobox', { name: '额外文字行 1 字体' });
  await expect(extra.locator('option')).toHaveCount(50);
  await extra.selectOption('Kaiti SC');
  await page.locator('#btn-collapse-groups').click();
  await expect(page.locator('#tab-border > details[open]')).toHaveCount(0);
  await page.locator('#group-typography > summary').click();
  await expect(page.locator('#font-title')).toHaveValue('Microsoft YaHei');
  await expect(page.locator('#font-subtitle')).toHaveValue('Consolas');
  await page.reload();
  await openPanel(page, 'border', testInfo);
  await expect(page.locator('#tab-border > details[open]')).toHaveCount(1);
  await expect(page.locator('#group-typography')).toHaveAttribute('open', '');
  await page.locator('#btn-expand-groups').click();
  await expect(page.locator('#tab-border > details[open]')).toHaveCount(7);
  await page.screenshot({ path: `/tmp/photoframe-groups-${testInfo.project.name}.png`, fullPage: true });
});

test('mouse wheel moves sticker categories and tags without capturing vertical panel scrolling at the edge', async ({ page }, testInfo) => {
  await page.goto('/');
  await openPanel(page, 'stickers', testInfo);
  const categories = page.locator('#sticker-categories');
  await categories.hover();
  await page.mouse.wheel(0, 160);
  await expect.poll(() => categories.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await categories.hover();
  await page.mouse.wheel(0, -160);
  await expect.poll(() => categories.evaluate(el => el.scrollLeft)).toBe(0);
  const events = await categories.evaluate(el => {
    const dispatch = (deltaY, extra = {}) => {
      const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...extra });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    };
    return { edge: dispatch(-100), zoom: dispatch(100, { ctrlKey: true }), horizontal: dispatch(0, { deltaX: 100 }) };
  });
  expect(events).toEqual({ edge: false, zoom: false, horizontal: false });
  await page.getByRole('button', { name: /135 胶片/ }).click();
  const tags = page.locator('#sticker-tags');
  const overflows = await tags.evaluate(el => el.scrollWidth > el.clientWidth);
  await tags.hover();
  await page.mouse.wheel(0, 100);
  if (overflows) await expect.poll(() => tags.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  else await expect.poll(() => tags.evaluate(el => el.scrollLeft)).toBe(0);
});

test('batch dialog shows the current photo, waiting queue and ZIP packing until download', async ({ page }, testInfo) => {
  await upload(page);
  await page.evaluate(() => {
    const render = CanvasRenderer.render;
    CanvasRenderer.render = async (...args) => {
      await new Promise(resolve => { window.resumeExport = resolve; });
      return render(...args);
    };
    const generate = JSZip.prototype.generateAsync;
    JSZip.prototype.generateAsync = async function (...args) {
      await new Promise(resolve => { window.resumePacking = resolve; });
      return generate.apply(this, args);
    };
  });
  await page.locator('#btn-export-batch').click();
  const dialog = page.getByRole('dialog', { name: '正在批量导出' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#batch-export-filename')).toHaveText('one.svg');
  await expect(page.locator('#batch-export-preview')).toBeVisible();
  await expect(page.locator('#batch-export-queue li').nth(1)).toContainText('等待中');
  await expect(page.locator('#btn-batch-export-close')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof window.resumeExport)).toBe('function');
  await page.evaluate(() => { window.resumeExport(); window.resumeExport = null; });
  await expect(page.locator('#batch-export-filename')).toHaveText('two.svg');
  await expect(page.locator('#batch-export-count')).toHaveText('1 / 2');
  await expect(page.locator('#batch-export-queue li').first()).toContainText('已完成');
  await page.screenshot({ path: `/tmp/photoframe-batch-${testInfo.project.name}.png`, fullPage: true });
  await expect.poll(() => page.evaluate(() => typeof window.resumeExport)).toBe('function');
  await page.evaluate(() => window.resumeExport());
  await expect(page.locator('#batch-export-status')).toContainText('正在打包 ZIP');
  const downloadPromise = page.waitForEvent('download');
  await expect.poll(() => page.evaluate(() => typeof window.resumePacking)).toBe('function');
  await page.evaluate(() => window.resumePacking());
  const download = await downloadPromise;
  await expect(page.locator('#batch-export-title')).toHaveText('批量导出完成');
  await expect(page.locator('#batch-export-progress')).toHaveJSProperty('value', 100);
  const bytes = Array.from(await readFile(await download.path()));
  const files = await page.evaluate(async data => Object.keys((await JSZip.loadAsync(new Uint8Array(data))).files), bytes);
  expect(files).toContain('PhotoFrame导出/one_frame_01.jpg');
  expect(files).toContain('PhotoFrame导出/two_frame_02.jpg');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('#batch-export-dialog')).not.toBeVisible();
  await expect(page.locator('#btn-export-batch')).toBeEnabled();
});

test('batch errors recover controls and partial failures stay visible in the queue', async ({ page }) => {
  await upload(page);
  await page.evaluate(() => {
    const render = CanvasRenderer.render;
    CanvasRenderer.render = (file, ...args) => {
      if (file.name === 'two.svg') throw new Error('模拟照片损坏');
      return render(file, ...args);
    };
  });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-export-batch').click();
  await downloadPromise;
  await expect(page.locator('#batch-export-status')).toContainText('已导出 1 张，失败 1 张');
  await expect(page.locator('#batch-export-queue li').nth(1)).toHaveAttribute('data-status', 'failed');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.evaluate(() => { window.JSZip = undefined; });
  await page.locator('#btn-export-batch').click();
  await expect(page.locator('#batch-export-title')).toHaveText('批量导出失败');
  await expect(page.locator('#batch-export-status')).toContainText('JSZip 未加载');
  await expect(page.getByRole('button', { name: '完成', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('#btn-export-batch')).toBeEnabled();
});

test('font availability, previews and recent choices survive reload without losing portable fonts', async ({ page }, testInfo) => {
  await upload(page);
  await openPanel(page, 'border', testInfo);
  const title = page.locator('#font-title');
  await expect(title.locator('optgroup[label="本机可用 · 系统通用"]')).toHaveCount(1);
  expect(await page.evaluate(() => FontLibrary.isAvailable('PhotoFrame Missing Font 987654321'))).toBe(false);
  await title.selectOption('KaiTi');
  await expect(title.locator('optgroup[label="最近使用"] option')).toHaveAttribute('value', 'KaiTi');
  await expect(page.locator('#font-title + .font-preview')).toContainText('摄影时光 Film');
  await expect(page.locator('#font-title + .font-preview')).toHaveCSS('font-family', /KaiTi/);
  await expect(page.locator('#group-typography > summary small')).toContainText('楷体');
  await page.locator('#group-extra > summary').click();
  await page.locator('#btn-add-extra-line').click();
  await expect(page.locator('#group-extra > summary small')).toHaveText('1 行额外文字');
  await expect(page.locator('.extra-line-item .font-preview')).toBeVisible();
  await page.reload();
  await openPanel(page, 'border', testInfo);
  await expect(page.locator('#font-title optgroup[label="最近使用"] option')).toHaveAttribute('value', 'KaiTi');
  await expect(page.locator('#font-title option')).toHaveCount(49);
});

test('batch cancellation finishes the current photo without downloading and allows another export', async ({ page }) => {
  await upload(page);
  await page.evaluate(() => {
    window.exportRenders = [];
    const render = CanvasRenderer.render;
    CanvasRenderer.render = async (...args) => {
      window.exportRenders.push(args[0].name);
      await new Promise(resolve => { window.resumeExport = resolve; });
      return render(...args);
    };
  });
  const downloads = [];
  page.on('download', download => downloads.push(download));
  await page.locator('#btn-export-batch').click();
  await expect.poll(() => page.evaluate(() => typeof window.resumeExport)).toBe('function');
  await page.locator('#btn-batch-export-cancel').click();
  await expect(page.locator('#btn-batch-export-cancel')).toBeDisabled();
  await page.evaluate(() => window.resumeExport());
  await expect(page.locator('#batch-export-title')).toHaveText('批量导出已取消');
  expect(downloads).toHaveLength(0);
  expect(await page.evaluate(() => window.exportRenders)).toEqual(['one.svg']);
  await page.locator('#btn-batch-export-close').click();
  await expect(page.locator('#btn-export-batch')).toBeEnabled();
});

test('failed photos show readable errors and retry exports only failures, including all-failed runs', async ({ page }) => {
  await upload(page);
  await page.evaluate(() => {
    window.exportRenders = [];
    const render = CanvasRenderer.render;
    CanvasRenderer.render = (file, ...args) => {
      window.exportRenders.push(file.name);
      if (window.failAll || (file.name === 'two.svg' && !window.allowRetry)) throw new Error('照片损坏，请重新导入');
      return render(file, ...args);
    };
  });
  let download = page.waitForEvent('download');
  await page.locator('#btn-export-batch').click();
  await download;
  await expect(page.locator('.batch-export-error')).toHaveText('照片损坏，请重新导入');
  await page.evaluate(() => { window.allowRetry = true; window.exportRenders = []; });
  download = page.waitForEvent('download');
  await page.locator('#btn-batch-export-retry').click();
  await download;
  await expect(page.locator('#batch-export-status')).toContainText('已导出 1 张');
  expect(await page.evaluate(() => window.exportRenders)).toEqual(['two.svg']);
  await expect(page.locator('#btn-batch-export-retry')).toBeHidden();
  await page.locator('#btn-batch-export-close').click();
  await page.evaluate(() => { window.failAll = true; });
  await page.locator('#btn-export-batch').click();
  await expect(page.locator('#batch-export-title')).toHaveText('批量导出失败');
  await expect(page.locator('#btn-batch-export-retry')).toContainText('2');
});

test('ZIP names remain unique after sanitizing and on case-insensitive file systems', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    let saved;
    window.saveAs = blob => { saved = blob; };
    const file = new File(['x'], 'placeholder.svg');
    const render = CanvasRenderer.render;
    CanvasRenderer.render = async () => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2; return canvas; };
    try {
      const jobs = ['a_2.svg', 'a.svg', 'a.png', 'A.svg', 'a?.svg', 'a*.svg'].map(name => ({ file: new File([file], name) }));
      const summary = await BatchProcessor.exportZip(jobs, () => ({ output: { filenameTemplate: '{name}' } }));
      const zip = await JSZip.loadAsync(saved);
      return { count: summary.success, names: Object.keys(zip.files).filter(name => !zip.files[name].dir) };
    } finally { CanvasRenderer.render = render; }
  });
  expect(result.count).toBe(6);
  expect(result.names).toHaveLength(6);
  expect(new Set(result.names.map(name => name.toLowerCase())).size).toBe(6);
});

test('horizontal arrows scroll lists and selecting a category keeps it visible', async ({ page }, testInfo) => {
  await page.goto('/');
  await openPanel(page, 'stickers', testInfo);
  const categories = page.locator('#sticker-categories');
  const arrow = page.getByRole('button', { name: '贴图分类向右滚动' });
  await expect(arrow).toBeVisible();
  await arrow.click();
  await expect.poll(() => categories.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await categories.locator('button').last().focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => categories.evaluate(el => {
    const active = el.querySelector('.active').getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return active.left >= box.left - 1 && active.right <= box.right + 1;
  })).toBe(true);
});

test('cancelling during ZIP packing prevents a download and restores controls', async ({ page }) => {
  await upload(page);
  await page.evaluate(() => {
    const generate = JSZip.prototype.generateAsync;
    JSZip.prototype.generateAsync = async function (...args) {
      await new Promise(resolve => { window.resumePacking = resolve; });
      return generate.apply(this, args);
    };
  });
  const downloads = [];
  page.on('download', download => downloads.push(download));
  await page.locator('#btn-export-batch').click();
  await expect(page.locator('#batch-export-status')).toContainText('正在打包 ZIP');
  await expect.poll(() => page.evaluate(() => typeof window.resumePacking)).toBe('function');
  await page.locator('#btn-batch-export-cancel').click();
  await page.evaluate(() => window.resumePacking());
  await expect(page.locator('#batch-export-title')).toHaveText('批量导出已取消');
  expect(downloads).toHaveLength(0);
  await page.locator('#btn-batch-export-close').click();
  await expect(page.locator('#btn-export-batch')).toBeEnabled();
});
