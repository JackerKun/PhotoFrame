const { test, expect } = require('@playwright/test');

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#ad7656"/><circle cx="600" cy="400" r="220" fill="#f5e3c0"/></svg>');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.topbar-logo')).toContainText('PhotoFrame');
});

test('upload, preset search, edit history and export state', async ({ page }, testInfo) => {
  await expect(page.locator('#btn-export-single')).toBeDisabled();
  await page.locator('#file-input').setInputFiles({ name: 'sample.svg', mimeType: 'image/svg+xml', buffer: svg });
  await expect(page.locator('#canvas-preview')).toBeVisible();
  await expect(page.locator('#btn-export-single')).toBeEnabled();
  if (testInfo.project.name === 'mobile') {
    await page.evaluate(() => {
      document.querySelector('.panel-tab[data-tab="presets"]').click();
      document.querySelector('#panel-left').classList.add('mobile-open');
      const el = document.querySelector('#preset-search'); el.value = '135'; el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  } else await page.locator('#preset-search').fill('135');
  await expect(page.locator('.preset-card').first()).toBeVisible();
  if (testInfo.project.name === 'mobile') await page.locator('.preset-card').nth(1).evaluate(el => el.click());
  else await page.locator('.preset-card').nth(1).click();
  await expect(page.locator('#btn-undo')).toBeEnabled();
  await expect(page.locator('#output-summary strong')).not.toHaveText('等待照片');
  await page.screenshot({ path: `/tmp/photoframe-${testInfo.project.name}.png`, fullPage: true });
});

test('mobile controls open as a bottom sheet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.locator('.mobile-nav-tab[data-panel="border"]').click();
  await expect(page.locator('#panel-left')).toHaveClass(/mobile-open/);
  await expect(page.locator('#mobile-panel-backdrop')).toBeVisible();
  await page.locator('#mobile-panel-backdrop').click();
  await expect(page.locator('#panel-left')).not.toHaveClass(/mobile-open/);
});

test('professional theme and style controls affect the canvas', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.locator('#theme-select').selectOption('darkroom');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'darkroom');
  await page.locator('#file-input').setInputFiles({ name: 'sample.svg', mimeType: 'image/svg+xml', buffer: svg });
  await page.locator('.panel-tab[data-tab="border"]').click();
  await page.locator('#background-mode').selectOption('linear');
  await page.locator('#border-color').evaluate(el => { el.value = '#ff0000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#background-color-2').evaluate(el => { el.value = '#0000ff'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#font-scale').fill('1.5');
  await page.waitForTimeout(350);
  const corners = await page.locator('#canvas-preview').evaluate(canvas => {
    const ctx = canvas.getContext('2d');
    return [ctx.getImageData(2, 2, 1, 1).data.join(','), ctx.getImageData(canvas.width - 3, canvas.height - 3, 1, 1).data.join(',')];
  });
  expect(corners[0]).not.toBe(corners[1]);
  await page.screenshot({ path: '/tmp/photoframe-professional.png', fullPage: true });
});

test('syncs the first photo style to following photos without replacing unique content', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.locator('#file-input').setInputFiles([
    { name: 'first.svg', mimeType: 'image/svg+xml', buffer: svg },
    { name: 'second.svg', mimeType: 'image/svg+xml', buffer: svg },
    { name: 'third.svg', mimeType: 'image/svg+xml', buffer: svg },
  ]);
  await expect(page.locator('#sync-count-badge')).toHaveText('2');
  await page.locator('.strip-item').nth(1).click();
  await page.locator('.panel-tab[data-tab="info"]').click();
  await page.locator('#input-location').fill('上海·外滩');
  await page.locator('.strip-item').first().click();
  await page.locator('.panel-tab[data-tab="border"]').click();
  await page.locator('#background-mode').selectOption('linear');
  await page.locator('#background-color-2').evaluate(el => { el.value = '#315c8c'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#font-scale').fill('1.45');

  await page.locator('#btn-sync-edits').click();
  await expect(page.locator('#sync-edits-overlay')).toBeVisible();
  await expect(page.locator('#sync-source-summary')).toContainText('first.svg');
  await expect(page.locator('#sync-frame-style')).toBeChecked();
  await expect(page.locator('#sync-text-style')).toBeChecked();
  await expect(page.locator('#sync-text-content')).not.toBeChecked();
  await expect(page.locator('#sync-crop')).not.toBeChecked();
  await page.screenshot({ path: '/tmp/photoframe-sync-modal.png', fullPage: true });
  await page.locator('#btn-sync-confirm').click();
  await expect(page.locator('#sync-edits-overlay')).toBeHidden();

  await page.locator('.strip-item').nth(1).click();
  await expect(page.locator('#background-mode')).toHaveValue('linear');
  await expect(page.locator('#background-color-2')).toHaveValue('#315c8c');
  await expect(page.locator('#font-scale')).toHaveValue('1.45');
  await expect(page.locator('#input-location')).toHaveValue('上海·外滩');
  await page.locator('#btn-undo').click();
  await page.locator('.strip-item').nth(1).click();
  await expect(page.locator('#background-mode')).toHaveValue('solid');
});

test('keeps the sync source fixed while Ctrl and Shift select targets', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.locator('#file-input').setInputFiles([1, 2, 3, 4, 5].map(index => ({
    name: `photo-${index}.svg`, mimeType: 'image/svg+xml', buffer: svg,
  })));

  await page.locator('.strip-item').nth(1).click({ modifiers: ['Control'] });
  await page.locator('.strip-item').nth(3).click({ modifiers: ['Control'] });
  await expect(page.locator('.strip-item.active')).toHaveAttribute('data-id', await page.locator('.strip-item').first().getAttribute('data-id'));
  await expect(page.locator('.strip-item.multi-selected')).toHaveCount(3);
  await page.locator('#btn-sync-edits').click();
  await expect(page.locator('#sync-source-summary')).toContainText('photo-1.svg');
  await expect(page.locator('#sync-selected-count')).toHaveText('2');
  await page.locator('#btn-sync-cancel').click();

  await page.locator('.strip-item').first().click();
  await page.locator('.strip-item').nth(3).click({ modifiers: ['Shift'] });
  await expect(page.locator('.strip-item.active')).toHaveAttribute('data-id', await page.locator('.strip-item').first().getAttribute('data-id'));
  await expect(page.locator('.strip-item.multi-selected')).toHaveCount(4);
  await page.locator('#btn-sync-edits').click();
  await expect(page.locator('#sync-selected-count')).toHaveText('3');
});

test('pans a zoomed canvas with the hand tool', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.locator('#file-input').setInputFiles({ name: 'pan.svg', mimeType: 'image/svg+xml', buffer: svg });
  await page.locator('#btn-zoom-in').click();
  await expect(page.locator('#btn-pan')).toBeEnabled();
  await expect(page.locator('#preview-wrapper')).toHaveClass(/is-pannable/);
  const before = await page.locator('#preview-wrapper').evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));
  const box = await page.locator('#canvas-preview').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2 - 70, { steps: 5 });
  await page.mouse.up();
  const after = await page.locator('#preview-wrapper').evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));
  expect(after.left).toBeGreaterThan(before.left);
  expect(after.top).toBeGreaterThan(before.top);
  await page.locator('#btn-zoom-fit').click();
  await expect(page.locator('#btn-pan')).toBeDisabled();
});

test('collage professional styling renders', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.locator('#file-input').setInputFiles([
    { name: 'one.svg', mimeType: 'image/svg+xml', buffer: svg },
    { name: 'two.svg', mimeType: 'image/svg+xml', buffer: svg },
  ]);
  await page.getByRole('button', { name: '拼图', exact: true }).click();
  await page.locator('.preset-card').first().click();
  await expect(page.locator('#collage-overlay')).toBeVisible();
  await page.locator('#collage-gap').fill('0.03');
  await page.locator('#collage-radius').fill('0.024');
  await page.locator('#collage-background-mode').selectOption('paper');
  await page.locator('#collage-shadow').evaluate(el => { el.checked = true; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(500);
  await expect(page.locator('#collage-canvas')).toBeVisible();
  const size = await page.locator('#collage-canvas').evaluate(c => [c.width, c.height]);
  expect(size[0]).toBeGreaterThan(100);
  expect(size[1]).toBeGreaterThan(100);
});
