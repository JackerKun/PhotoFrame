const { test, expect } = require('@playwright/test');
const sample = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><path fill="#508b82" d="M0 0h1200v800H0z"/><circle cx="800" cy="260" r="110" fill="#f3d7a2"/></svg>',
);

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/');
});
async function openPanel(page, panel) {
  await page.locator(`.mobile-nav-tab[data-panel="${panel}"]`).tap();
  await expect(page.locator('#panel-left')).toHaveClass(/mobile-open/);
}
async function hitTarget(locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      locator.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit === el || el.contains(hit) ? 'target' : hit?.id || hit?.className || 'outside';
      }),
    )
    .toBe('target');
}
async function upload(page) {
  await page.locator('#file-input').setInputFiles([
    { name: 'one.svg', mimeType: 'image/svg+xml', buffer: sample },
    { name: 'two.svg', mimeType: 'image/svg+xml', buffer: sample },
  ]);
  await expect(page.locator('#btn-export-single')).toBeEnabled();
}

test('mobile sheet inputs receive the touch above their backdrop', async ({ page }) => {
  await openPanel(page, 'info');
  const location = page.locator('#input-location');
  await hitTarget(location);
  await location.tap();
  await expect(location).toBeFocused();
  await location.fill('上海 · 外滩');
  await expect(page.locator('#panel-left')).toHaveClass(/mobile-open/);
});

for (const theme of ['studio', 'darkroom', 'warm', 'midnight']) {
  test(`all five mobile tools remain touchable and scrollable in ${theme}`, async ({ page }) => {
    await upload(page);
    await page.locator('#theme-select').selectOption(theme);
    for (const [panel, id] of [
      ['presets', 'preset-search'],
      ['info', 'input-subtitle-tpl'],
      ['border', 'border-top-num'],
      ['stickers', 'sticker-search'],
      ['export', 'output-filename'],
    ]) {
      await openPanel(page, panel);
      const control = page.locator('#' + id);
      await hitTarget(control);
      await control.tap();
      await expect(control).toBeFocused();
      await expect(page.locator('#panel-left')).toHaveClass(/mobile-open/);
      await page.locator('#mobile-panel-backdrop').tap({ position: { x: 8, y: 8 } });
      await expect(page.locator('#panel-left')).not.toHaveClass(/mobile-open/);
      await expect(page.locator('#mobile-panel-backdrop')).toBeHidden();
    }
  });
}

test('save-preset dialog and its buttons are above an open mobile sheet', async ({ page }) => {
  await openPanel(page, 'presets');
  await page.locator('#btn-save-preset').tap();
  const input = page.locator('#preset-name-input');
  await hitTarget(input);
  await input.tap();
  await input.fill('手机可操作预设');
  await page.locator('#btn-modal-save').tap();
  await expect(page.locator('#modal-save-preset')).toBeHidden();
  await expect(page.locator('.preset-card').filter({ hasText: '手机可操作预设' })).toHaveCount(1);
  await expect(page.locator('#panel-left')).toHaveClass(/mobile-open/);
  await page.locator('.preset-card').last().locator('.preset-menu-btn').tap();
  const menu = page.locator('.ctx-menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox(),
    viewport = page.viewportSize();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await hitTarget(menu.locator('.ctx-item').first());
  await menu.locator('.ctx-item').first().tap();
  await expect(page.locator('.preset-rename-input')).toBeFocused();
});

for (const viewport of [
  { width: 390, height: 480 },
  { width: 320, height: 568 },
]) {
  test(`sync dialog stays within ${viewport.width}x${viewport.height} and can scroll to confirmation`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await upload(page);
    await page.locator('#btn-sync-edits').tap();
    const modal = page.locator('#sync-edits-overlay .modal');
    await expect(modal).toBeVisible();
    const box = await modal.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    const option = page
      .locator('label.sync-option')
      .filter({ has: page.locator('#sync-text-content') });
    await hitTarget(option);
    await option.tap();
    await expect(page.locator('#sync-text-content')).toBeChecked();
    const confirm = page.locator('#btn-sync-confirm');
    await hitTarget(confirm);
    await confirm.tap();
    await expect(page.locator('#sync-edits-overlay')).toBeHidden();
  });
}

test('choosing a collage dismisses the sheet and its photo picker and crop controls receive touch', async ({
  page,
}) => {
  await upload(page);
  await openPanel(page, 'presets');
  await page.getByRole('button', { name: '拼图', exact: true }).tap();
  await page.locator('.preset-card[data-id="cl-2h"]').tap();
  await expect(page.locator('#panel-left')).not.toHaveClass(/mobile-open/);
  await expect(page.locator('#mobile-panel-backdrop')).toBeHidden();
  await expect(page.locator('#collage-overlay')).toBeVisible();
  await page.locator('.collage-slots-panel').scrollIntoViewIfNeeded();
  const slot = page.locator('.collage-slot-card').first();
  const replace = slot.getByRole('button', { name: '换图', exact: true });
  await hitTarget(replace);
  await replace.tap();
  const chosen = page.locator('.photo-picker-item').last();
  await hitTarget(chosen);
  await chosen.tap();
  await expect(page.locator('#photo-picker-overlay')).toBeHidden();
  await slot.getByRole('button', { name: '裁切', exact: true }).tap();
  await expect(page.locator('#crop-overlay')).toBeVisible();
  await hitTarget(page.locator('#btn-crop-cancel'));
  await page.locator('#btn-crop-cancel').tap();
  await expect(page.locator('#crop-overlay')).toBeHidden();
  await hitTarget(page.locator('#btn-collage-cancel'));
  await page.locator('#btn-collage-cancel').tap();
  await expect(page.locator('#collage-overlay')).toBeHidden();
});

test('orientation changes clear stale mobile backdrops and allow reopening tools', async ({
  page,
}) => {
  await openPanel(page, 'info');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#panel-left')).not.toHaveClass(/mobile-open/);
  await expect(page.locator('#mobile-panel-backdrop')).toHaveAttribute('hidden', '');
  await page.setViewportSize({ width: 390, height: 844 });
  await openPanel(page, 'info');
  await hitTarget(page.locator('#input-location'));
  await page.locator('#input-location').tap();
  await expect(page.locator('#input-location')).toBeFocused();
});
