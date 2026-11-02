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
