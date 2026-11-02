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

test('built-in and personal stickers render and remain editable', async ({ page }, testInfo) => {
  await page.locator('#file-input').setInputFiles({ name: 'sticker-photo.svg', mimeType: 'image/svg+xml', buffer: svg });
  await expect(page.locator('#canvas-preview')).toBeVisible();
  if (testInfo.project.name === 'desktop') {
    const uploadZone = await page.locator('#upload-zone').boundingBox();
    expect(uploadZone.height).toBeLessThan(52);
  }
  const before = await page.locator('#canvas-preview').evaluate(canvas => canvas.toDataURL());

  await page.locator('.panel-tab[data-tab="stickers"]').evaluate(el => el.click());
  if (testInfo.project.name === 'mobile') await page.locator('#panel-left').evaluate(el => el.classList.add('mobile-open'));
  await expect(page.locator('.sticker-category-btn')).toHaveCount(9);
  await expect.poll(() => page.locator('.sticker-card').count()).toBeGreaterThan(220);
  await expect.poll(() => page.locator('.sticker-card img').evaluateAll(images => images.filter(image => image.complete && image.naturalWidth === 0).length)).toBe(0);
  const ratioMismatches = await page.evaluate(() => window.StickerLibrary.builtIns.filter(asset => {
    if (!asset.src.startsWith('data:image/svg+xml')) return false;
    const match = decodeURIComponent(asset.src).match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    return !match || Math.abs(asset.ratio - Number(match[1]) / Number(match[2])) > .01;
  }).map(asset => asset.id));
  expect(ratioMismatches).toEqual([]);
  const filmIdentity = await page.evaluate(() => {
    const find = id => decodeURIComponent(window.StickerLibrary.builtIns.find(asset => asset.id === id).src);
    return {
      velvia135: find('135-cassette-velvia100'),
      velvia120: find('120-velvia100'),
      cassetteMarkup: find('135-cassette-portra400'),
    };
  });
  expect(filmIdentity.velvia135).toContain('#383878');
  expect(filmIdentity.velvia120).toContain('#383878');
  expect(filmIdentity.cassetteMarkup).toContain('rotate(-90)');
  expect(filmIdentity.cassetteMarkup).toContain('135 · 36 EXP');
  await page.getByRole('button', { name: /120 胶片/ }).click();
  await expect(page.locator('#sticker-tags')).toBeVisible();
  await page.getByRole('button', { name: 'B&W', exact: true }).click();
  await expect.poll(() => page.locator('.sticker-card').count()).toBeGreaterThan(15);
  await page.getByRole('button', { name: '反转片', exact: true }).click();
  const beforeVelvia120 = await page.locator('#canvas-preview').evaluate(canvas => canvas.toDataURL());
  await page.locator('.sticker-card[data-sticker-id="120-velvia100"]').evaluate(el => el.click());
  await expect(page.locator('#sticker-selected-name')).toHaveText('VELVIA 100');
  await expect.poll(() => page.locator('#canvas-preview').evaluate(canvas => canvas.toDataURL())).not.toBe(beforeVelvia120);
  await page.screenshot({ path: `/tmp/photoframe-velvia120-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: /全部/ }).first().click();
  await page.locator('.sticker-card[data-sticker-id="135-portra400"]').evaluate(el => el.click());
  await expect(page.locator('#sticker-inspector')).toBeVisible();
  await expect(page.locator('#sticker-transform-handle')).toBeVisible();
  await expect.poll(() => page.locator('#canvas-preview').evaluate(canvas => canvas.toDataURL())).not.toBe(before);
  const afterFilm = await page.locator('#canvas-preview').evaluate(canvas => canvas.toDataURL());
  await page.getByRole('button', { name: /135 胶片/ }).click();
  await page.getByRole('button', { name: '胶卷暗盒', exact: true }).click();
  await expect.poll(() => page.locator('.sticker-card').count()).toBeGreaterThan(50);
  await page.locator('.sticker-card[data-sticker-id="135-cassette-portra400"]').evaluate(el => el.click());
  await expect(page.locator('#sticker-selected-name')).toHaveText('PORTRA 400 暗盒');
  const cassetteHandle = await page.locator('#sticker-transform-handle').boundingBox();
  expect(Math.abs(cassetteHandle.width / cassetteHandle.height - .70)).toBeLessThan(.08);
  await page.screenshot({ path: `/tmp/photoframe-cassettes-${testInfo.project.name}.png`, fullPage: true });
  const beforeVelvia135 = await page.locator('#canvas-preview').evaluate(canvas => canvas.toDataURL());
  await page.locator('.sticker-card[data-sticker-id="135-cassette-velvia100"]').evaluate(el => el.click());
  await expect(page.locator('#sticker-selected-name')).toHaveText('VELVIA 100 暗盒');
  await expect.poll(() => page.locator('#canvas-preview').evaluate(canvas => canvas.toDataURL())).not.toBe(beforeVelvia135);
  await page.screenshot({ path: `/tmp/photoframe-velvia135-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: /135 矢量/ }).click();
  await page.locator('.sticker-card[data-sticker-id="camera-nikon-f"]').evaluate(el => el.click());
  await expect.poll(() => page.locator('#canvas-preview').evaluate(canvas => canvas.toDataURL())).not.toBe(afterFilm);
  await expect(page.locator('#sticker-attribution')).toBeHidden();
  const vectorCameraSrc = await page.evaluate(() => window.StickerLibrary.builtIns.find(asset => asset.id === 'camera-nikon-f').src);
  expect(vectorCameraSrc).toMatch(/^data:image\/svg\+xml/);
  const cameraHandle = await page.locator('#sticker-transform-handle').boundingBox();
  expect(cameraHandle).not.toBeNull();
  const cameraRatio = await page.evaluate(() => window.StickerLibrary.builtIns.find(asset => asset.id === 'camera-nikon-f').ratio);
  expect(Math.abs(cameraHandle.width / cameraHandle.height - cameraRatio)).toBeLessThan(0.08);
  if (testInfo.project.name === 'desktop') {
    await page.locator('#btn-zoom-in').click();
    await expect.poll(async () => (await page.locator('#sticker-transform-handle').boundingBox()).width).toBeGreaterThan(cameraHandle.width * 1.1);
    const zoomedCanvas = await page.locator('#canvas-preview').boundingBox();
    const zoomedHandle = await page.locator('#sticker-transform-handle').boundingBox();
    expect(Math.abs(zoomedHandle.x + zoomedHandle.width / 2 - (zoomedCanvas.x + zoomedCanvas.width / 2))).toBeLessThan(3);
    expect(Math.abs(zoomedHandle.y + zoomedHandle.height / 2 - (zoomedCanvas.y + zoomedCanvas.height / 2))).toBeLessThan(3);
    await page.locator('#btn-zoom-fit').click();
  }
  await page.getByRole('button', { name: /135 实体/ }).click();
  await page.locator('.sticker-card[data-sticker-id="camera-real-nikon-f"]').evaluate(el => el.click());
  await expect(page.locator('#sticker-attribution')).toBeVisible();
  await expect(page.locator('#sticker-attribution')).toHaveAttribute('href', /commons\.wikimedia\.org/);
  const realCameraSrc = await page.evaluate(() => window.StickerLibrary.builtIns.find(asset => asset.id === 'camera-real-nikon-f').src);
  expect(realCameraSrc).toBe('assets/camera-cutouts/nikon-f.svg');
  await page.screenshot({ path: `/tmp/photoframe-cameras-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: /其他/ }).click();
  await page.getByRole('button', { name: '旅行', exact: true }).click();
  const fitCanvas = await page.locator('#canvas-preview').boundingBox();
  const target = { x: fitCanvas.width * .24, y: fitCanvas.height * .32 };
  if (testInfo.project.name === 'desktop') {
    await page.locator('.sticker-card[data-sticker-id="travel-pin"]').dragTo(page.locator('#canvas-preview'), { targetPosition: target });
  } else {
    await page.locator('.sticker-card[data-sticker-id="travel-pin"]').evaluate(el => el.click());
  }
  await expect(page.locator('#sticker-selected-name')).toHaveText('地点标记');
  const iconHandle = await page.locator('#sticker-transform-handle').boundingBox();
  expect(iconHandle).not.toBeNull();
  expect(Math.abs(iconHandle.width / iconHandle.height - 1)).toBeLessThan(0.08);
  if (testInfo.project.name === 'desktop') {
    expect(Math.abs(iconHandle.x + iconHandle.width / 2 - (fitCanvas.x + target.x))).toBeLessThan(4);
    expect(Math.abs(iconHandle.y + iconHandle.height / 2 - (fitCanvas.y + target.y))).toBeLessThan(4);
  }
  const beforeEffects = await page.locator('#canvas-preview').evaluate(canvas => canvas.toDataURL());
  await page.locator('#sticker-stroke-width').fill('0.05');
  await page.locator('#sticker-stroke-color').fill('#fff4d6');
  await page.locator('#sticker-shadow-enabled').uncheck();
  await expect.poll(() => page.locator('#canvas-preview').evaluate(canvas => canvas.toDataURL())).not.toBe(beforeEffects);
  if (testInfo.project.name === 'desktop') {
    await page.locator('#btn-adjust-crop').click();
    await expect(page.locator('#crop-overlay')).toBeVisible();
    await expect(page.locator('#sticker-transform-handle')).toBeHidden();
    await page.locator('#btn-crop-cancel').click();
    await expect(page.locator('#sticker-transform-handle')).toBeVisible();
  }
  const cards = await page.locator('.sticker-card').evaluateAll(items => items.slice(0, 6).map(item => { const r = item.getBoundingClientRect(); return { top:r.top, height:r.height }; }));
  expect(cards.every(card => card.height >= 110)).toBeTruthy();
  expect(cards[3].top).toBeGreaterThanOrEqual(cards[0].top + cards[0].height);
  await page.screenshot({ path: `/tmp/photoframe-stickers-${testInfo.project.name}.png`, fullPage: true });

  await page.locator('#sticker-rotation').fill('24');
  await expect(page.locator('#sticker-rotation-label')).toHaveText('24°');
  const personal = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" rx="24" fill="#6236ff"/><text x="100" y="62" fill="white" text-anchor="middle" font-size="30">MY FILM</text></svg>');
  await page.locator('#sticker-upload').setInputFiles({ name: 'my-film.svg', mimeType: 'image/svg+xml', buffer: personal });
  await expect(page.locator('.sticker-card[data-sticker-id^="custom-"]')).toHaveCount(1);
  await page.reload();
  await page.locator('.panel-tab[data-tab="stickers"]').evaluate(el => el.click());
  await expect(page.locator('.sticker-card[data-sticker-id^="custom-"]')).toHaveCount(1);
});

test('mobile controls open as a bottom sheet', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.locator('.mobile-nav-tab[data-panel="border"]').click();
  await expect(page.locator('#panel-left')).toHaveClass(/mobile-open/);
  await expect(page.locator('#mobile-panel-backdrop')).toBeVisible();
  await page.locator('#mobile-panel-backdrop').click();
  await expect(page.locator('#panel-left')).not.toHaveClass(/mobile-open/);
});

test('mobile preview toolbar uses compact icon controls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.locator('#file-input').setInputFiles({ name: 'mobile-toolbar.svg', mimeType: 'image/svg+xml', buffer: svg });
  await expect(page.locator('#btn-text-pos')).toBeVisible();
  await expect(page.locator('#btn-border-resize')).toBeVisible();

  const metrics = await page.locator('.preview-toolbar').evaluate(toolbar => ({
    height: toolbar.getBoundingClientRect().height,
    labels: [...toolbar.querySelectorAll('.tool-label')].map(label => getComputedStyle(label).display),
    buttons: [...toolbar.querySelectorAll('.preview-tool-icon')]
      .filter(button => !button.hidden)
      .map(button => {
        const bounds = button.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      }),
  }));

  expect(metrics.height).toBeLessThanOrEqual(58);
  expect(metrics.labels.every(display => display === 'none')).toBeTruthy();
  expect(metrics.buttons.every(button => button.width <= 42 && button.height <= 42)).toBeTruthy();
  await page.screenshot({ path: '/tmp/photoframe-mobile-toolbar.png', fullPage: true });
});

test('mobile keeps tools visible and pans a tall zoomed canvas vertically', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  const portraitSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600"><rect width="800" height="1600" fill="#d8cdbd"/><path d="M0 800h800M400 0v1600" stroke="#514b43" stroke-width="24"/></svg>');
  await page.locator('#file-input').setInputFiles({ name: 'portrait.svg', mimeType: 'image/svg+xml', buffer: portraitSvg });
  await page.locator('#btn-zoom-in').click();
  await expect(page.locator('#btn-pan')).toBeEnabled();

  const viewportHeight = page.viewportSize().height;
  const toolbarBox = await page.locator('.preview-toolbar').boundingBox();
  const navBox = await page.locator('.mobile-nav').boundingBox();
  expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(navBox.y + 2);
  expect(navBox.y + navBox.height).toBeLessThanOrEqual(viewportHeight + 1);

  const before = await page.locator('#preview-wrapper').evaluate(wrapper => ({
    top: wrapper.scrollTop,
    scrollHeight: wrapper.scrollHeight,
    clientHeight: wrapper.clientHeight,
  }));
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

  const wrapperBox = await page.locator('#preview-wrapper').boundingBox();
  const x = wrapperBox.x + wrapperBox.width / 2;
  const startY = wrapperBox.y + wrapperBox.height * .7;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await page.mouse.move(x, startY - 180, { steps: 8 });
  await page.mouse.up();

  const afterTop = await page.locator('#preview-wrapper').evaluate(wrapper => wrapper.scrollTop);
  expect(afterTop).toBeGreaterThan(before.top + 100);
  await page.screenshot({ path: '/tmp/photoframe-mobile-vertical-pan.png', fullPage: true });
});

test('mobile frame tools stay compact and pinch zoom only affects the canvas', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.locator('#file-input').setInputFiles({ name: 'pinch.svg', mimeType: 'image/svg+xml', buffer: svg });
  await page.locator('#btn-border-resize').click();
  await expect(page.locator('#frame-tools')).toBeVisible();

  const toolMetrics = await page.locator('#frame-tools').evaluate(tools => ({
    labels: [...tools.querySelectorAll('.frame-tool-label')].map(label => getComputedStyle(label).display),
    buttons: [...tools.querySelectorAll('button')].map(button => {
      const bounds = button.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    }),
  }));
  expect(toolMetrics.labels.every(display => display === 'none')).toBeTruthy();
  expect(toolMetrics.buttons.every(button => button.width <= 38 && button.height <= 38)).toBeTruthy();
  await expect(page.locator('#preview-wrapper')).toHaveCSS('touch-action', 'none');

  const canvas = page.locator('#canvas-preview');
  const beforeBounds = await canvas.boundingBox();
  const beforePageScale = await page.evaluate(() => window.visualViewport?.scale || 1);
  const centerX = beforeBounds.x + beforeBounds.width / 2;
  const centerY = beforeBounds.y + beforeBounds.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: centerX - 35, y: centerY, id: 11 },
      { x: centerX + 35, y: centerY, id: 12 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: centerX - 90, y: centerY, id: 11 },
      { x: centerX + 90, y: centerY, id: 12 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);

  const afterBounds = await canvas.boundingBox();
  const afterPageScale = await page.evaluate(() => window.visualViewport?.scale || 1);
  expect(afterBounds.width).toBeGreaterThan(beforeBounds.width * 1.5);
  expect(afterPageScale).toBe(beforePageScale);
  await expect(page.locator('#zoom-label')).not.toHaveText('适应');
  await page.screenshot({ path: '/tmp/photoframe-mobile-pinch-tools.png', fullPage: true });
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

test('measures the full text selection and keeps hand panning available', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.locator('#file-input').setInputFiles({ name: 'text-pan.svg', mimeType: 'image/svg+xml', buffer: svg });
  await page.locator('.panel-tab[data-tab="info"]').click();
  await page.locator('#input-title-tpl').fill('{location}');
  await page.locator('#input-subtitle-tpl').fill('');
  await page.locator('#input-location').fill('A');
  await page.locator('#btn-text-pos').click();
  await expect(page.locator('#text-pos-handle')).toBeVisible();
  const shortWidth = (await page.locator('#text-pos-handle').boundingBox()).width;

  await page.locator('#input-location').fill('SONY ILCE-7RM3 / COMPLETE TEXT REGION');
  await page.waitForTimeout(350);
  const longWidth = (await page.locator('#text-pos-handle').boundingBox()).width;
  expect(longWidth).toBeGreaterThan(shortWidth * 4);
  await page.screenshot({ path: '/tmp/photoframe-text-selection.png', fullPage: true });

  await page.locator('#btn-zoom-in').click();
  await expect(page.locator('#preview-wrapper')).toHaveClass(/is-pannable/);
  const before = await page.locator('#preview-wrapper').evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));
  const wrapperBox = await page.locator('#preview-wrapper').boundingBox();
  const startX = wrapperBox.x + wrapperBox.width / 2;
  const startY = wrapperBox.y + wrapperBox.height * .35;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 80, startY - 60, { steps: 5 });
  await page.mouse.up();
  const after = await page.locator('#preview-wrapper').evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop }));
  expect(after.left).toBeGreaterThan(before.left);
  expect(after.top).toBeGreaterThan(before.top);
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
  await expect(page.locator('.collage-inspector')).toBeVisible();
  await expect(page.locator('#btn-collage-shuffle')).toBeVisible();
  await page.waitForTimeout(400);

  const balancedMargins = await page.locator('#collage-canvas').evaluate(canvas => {
    const { width, height } = canvas;
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    const bg = [data[0], data[1], data[2]];
    let top = height, bottom = -1;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        const difference = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
        if (difference > 45) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
      }
    }
    return { top, bottom: height - 1 - bottom };
  });
  expect(Math.abs(balancedMargins.top - balancedMargins.bottom)).toBeLessThanOrEqual(6);

  await page.locator('#collage-canvas-ratio').selectOption('1');
  await page.locator('#collage-scale').fill('0.72');
  await page.locator('#collage-margin').fill('0.05');
  await page.locator('[data-collage-align="center,bottom"]').click();
  await expect(page.locator('[data-collage-align="center,bottom"]')).toHaveClass(/active/);
  await page.locator('#collage-gap').fill('0.03');
  await page.locator('#collage-radius').fill('0.024');
  await page.locator('#collage-background-mode').selectOption('paper');
  await page.locator('#collage-shadow').evaluate(el => { el.checked = true; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(500);
  await expect(page.locator('#collage-canvas')).toBeVisible();
  const size = await page.locator('#collage-canvas').evaluate(c => [c.width, c.height]);
  expect(size[0]).toBeGreaterThan(100);
  expect(size[1]).toBe(size[0]);
  await page.screenshot({ path: '/tmp/photoframe-collage-workbench.png', fullPage: true });
});

test('mobile collage workbench uses swipeable full-width panels', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.locator('#file-input').setInputFiles([
    { name: 'mobile-one.svg', mimeType: 'image/svg+xml', buffer: svg },
    { name: 'mobile-two.svg', mimeType: 'image/svg+xml', buffer: svg },
  ]);
  await page.evaluate(() => {
    document.querySelector('#panel-left').classList.add('mobile-open');
    document.querySelector('.panel-tab[data-tab="presets"]').click();
  });
  await page.getByRole('button', { name: '拼图', exact: true }).click();
  await page.locator('.preset-card').first().evaluate(card => card.click());
  await page.evaluate(() => {
    document.querySelector('#panel-left').classList.remove('mobile-open');
    document.querySelector('#mobile-panel-backdrop').hidden = true;
  });
  await expect(page.locator('#collage-overlay')).toBeVisible();
  const panelMetrics = await page.locator('.collage-body').evaluate(body => {
    const preview = body.querySelector('.collage-preview-panel').getBoundingClientRect();
    return { clientWidth: body.clientWidth, scrollWidth: body.scrollWidth, previewWidth: preview.width };
  });
  expect(panelMetrics.scrollWidth).toBeGreaterThan(panelMetrics.clientWidth * 2);
  expect(panelMetrics.previewWidth).toBeGreaterThanOrEqual(panelMetrics.clientWidth - 2);
  await page.locator('.collage-body').evaluate(body => { body.scrollLeft = body.scrollWidth; });
  await expect(page.locator('.collage-inspector')).toBeInViewport();
});
