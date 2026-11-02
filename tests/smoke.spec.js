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
  if (testInfo.project.name === 'mobile') await page.locator('.mobile-nav-tab[data-panel="presets"]').click();
  await page.locator('#preset-search').fill('135');
  await expect(page.locator('.preset-card').first()).toBeVisible();
  await page.locator('.preset-card').nth(1).click();
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
