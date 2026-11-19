const { test: base, expect } = require('@playwright/test');
const test = base.extend({ page: async ({ page }, use) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await use(page); expect(errors).toEqual([]);
} });
const { readFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const JSZip = require('jszip');
const photo = (name, color = '#ad7656') => ({ name, mimeType:'image/svg+xml', buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="180" height="120" fill="${color}"/></svg>`) });
async function start(page, count = 2) {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles(Array.from({length:count},(_,i) => photo(`photo-${i+1}.svg`,i ? '#174c79' : '#ad7656')));
  await expect(page.locator('.strip-item img')).toHaveCount(count);
  await page.locator('#btn-creative-tools').click();
}
async function tab(page, name) { await page.locator(`[data-page="${name}"]`).click(); }
async function done(page) { await expect(page.locator('#creative-status')).toHaveText('已完成'); }
async function download(page, selector) {
  const waiting=page.waitForEvent('download'); await page.locator(selector).click();
  const result=await waiting; const bytes=await readFile(await result.path()); await done(page); return bytes;
}
async function dimensions(page, bytes) {
  return page.evaluate(async data => { const bitmap=await createImageBitmap(new Blob([new Uint8Array(data)])); return [bitmap.width,bitmap.height]; },Array.from(bytes));
}

test('photo palette, signature styles and pick markers apply to the selected scope and survive reload', async ({page}) => {
  await start(page);
  await page.locator('#palette-extract').click(); await done(page);
  await expect(page.locator('#palette-swatches button')).toHaveCount(1);
  await page.locator('#palette-mode').selectOption('dark');
  await page.locator('#palette-apply').click(); await done(page);
  await page.locator('#signature-name').fill('摄影署名');
  await page.locator('#signature-save').click(); await done(page);
  await page.locator('#signature-apply').click(); await done(page);
  await tab(page,'pick');
  await page.getByRole('combobox',{name:'photo-1.svg 选片标记',exact:true}).selectOption('keep');
  await page.getByRole('combobox',{name:'photo-2.svg 选片标记',exact:true}).selectOption('reject');
  await page.locator('#pick-filter').selectOption('keep');
  await expect(page.locator('#pick-grid > div')).toHaveCount(1);
  await page.locator('#creative-close').click();
  await expect(page.locator('.strip-item:visible')).toHaveCount(1);
  // Wait for the actual IndexedDB save, not just the DOM update.
  await expect.poll(() => page.evaluate(async () => (await SessionStore.restoreSession()).jobs.filter(job => job.pick).length)).toBe(2);
  await page.reload(); await expect(page.locator('.strip-item img')).toHaveCount(2);
  await page.locator('#btn-creative-tools').click();
  await expect(page.locator('#signature-list')).toContainText('摄影署名');
  const saved=await page.evaluate(async () => (await SessionStore.restoreSession()).jobs);
  expect(saved.map(job=>job.pick).sort()).toEqual(['keep','reject']);
  expect(saved.every(job=>job.borderOverrides.color.startsWith('#') && job.infoOverrides.fontColor==='#ffffff')).toBeTruthy();
});

test('complete project preserves original bytes, custom assets, captions, picks and carousel in a fresh browser', async ({page,browser}) => {
  await start(page);
  await page.locator('#creative-close').click();
  await page.locator('#input-title-tpl').evaluate(input => { input.value = '我的原始标题'; input.dispatchEvent(new Event('input',{bubbles:true})); });
  await page.locator('#sticker-upload').setInputFiles(photo('personal.svg','#33aa77'));
  await expect(page.locator('.sticker-card[data-sticker-id^="custom-"]')).toHaveCount(1);
  await page.locator('.sticker-card[data-sticker-id^="custom-"]').evaluate(button=>button.click());
  await page.locator('#btn-creative-tools').click();
  await page.locator('#signature-name').fill('工程签名'); await page.locator('#signature-save').click(); await done(page);
  await tab(page,'pick'); await page.getByRole('combobox',{name:'photo-1.svg 选片标记',exact:true}).selectOption('keep');
  await tab(page,'carousel'); await page.locator('#carousel-photo').click(); await done(page);
  await page.locator('#carousel-text').click(); await page.getByRole('textbox',{name:'元素文字',exact:true}).fill('旅行故事'); await page.getByRole('textbox',{name:'元素文字',exact:true}).press('Tab');
  await tab(page,'project');
  const archive=await download(page,'#project-save'), zip=await JSZip.loadAsync(archive), manifest=JSON.parse(await zip.file('project.json').async('string'));
  expect(manifest.data.customStickers).toHaveLength(1);
  expect(manifest.data.jobs[0].infoOverrides.titleTemplate).toBe('我的原始标题');
  expect(manifest.data.jobs[0].stickers).toHaveLength(1);
  expect(manifest.data.jobs).toHaveLength(2); expect(manifest.data.carousel.items).toHaveLength(2);
  const first=manifest.data.jobs[0];
  expect(await zip.file(first.file.$file).async('nodebuffer')).toEqual(photo('photo-1.svg').buffer);
  const context=await browser.newContext({viewport:{width:900,height:800}}), other=await context.newPage();
  await other.goto('/'); await other.locator('#btn-creative-tools').click(); await tab(other,'project');
  await other.locator('#project-file').setInputFiles({name:'saved.photoframe',mimeType:'application/zip',buffer:archive});
  await expect(other.locator('#project-summary')).toContainText('2 张照片');
  await other.locator('#project-open').click(); await done(other);
  await other.locator('#creative-close').click(); await expect(other.locator('.strip-item img')).toHaveCount(2);
  await expect(other.locator('.strip-item[data-pick="keep"]')).toHaveCount(1);
  await other.locator('#btn-creative-tools').click(); await tab(other,'carousel');
  await expect(other.locator('#carousel-items option')).toHaveCount(3);
  await expect(other.locator('#carousel-items')).toContainText('旅行故事');
  await other.reload(); await expect(other.locator('.strip-item img')).toHaveCount(2);
  await other.locator('#btn-creative-tools').click(); await tab(other,'carousel'); await expect(other.locator('#carousel-items')).toContainText('旅行故事');
  await context.close();
});

test('rejects malformed projects without changing the current photos', async ({page}) => {
  await start(page); await tab(page,'project');
  const zip=new JSZip(); zip.file('project.json',JSON.stringify({format:'PhotoFrame',version:99,data:{}}));
  await page.locator('#project-file').setInputFiles({name:'bad.photoframe',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
  await expect(page.locator('#creative-status')).toContainText('暂不支持此工程版本');
  await expect(page.locator('#project-review')).toBeHidden();
  await page.locator('#creative-close').click(); await expect(page.locator('.strip-item')).toHaveCount(2);
});

test('contact sheet exports all photos across JPG and valid PDF pages', async ({page}) => {
  await start(page,5); await tab(page,'contact');
  await page.locator('#contact-cols').fill('2'); await page.locator('#contact-rows').fill('2');
  await page.locator('#contact-preview').click(); await done(page);
  await expect(page.locator('#contact-canvas')).toBeVisible();
  const zip=await JSZip.loadAsync(await download(page,'#contact-jpg'));
  expect(Object.keys(zip.files).filter(name=>name.endsWith('.jpg'))).toHaveLength(2);
  const pdf=await download(page,'#contact-pdf'), text=pdf.toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBeTruthy(); expect(text).toContain('/Count 2');
  const xref=Number(text.match(/startxref\n(\d+)/)[1]); expect(text.slice(xref,xref+4)).toBe('xref');
});

test('multi-recipe export honors scope, dimensions, PNG and JPEG file limits', async ({page}) => {
  await start(page); await tab(page,'pick');
  await page.getByRole('combobox',{name:'photo-1.svg 选片标记',exact:true}).selectOption('keep');
  await page.locator('#creative-scope').selectOption('keep'); await tab(page,'recipes');
  const rows=page.locator('.recipe-row');
  await rows.nth(0).locator('[data-key=width]').fill('320'); await rows.nth(0).locator('[data-key=height]').fill('400');
  await rows.nth(1).locator('[data-key=width]').fill('400'); await rows.nth(1).locator('[data-key=height]').fill('400');
  await rows.nth(2).locator('[data-key=enabled]').uncheck();
  await page.locator('#recipe-format').selectOption('png');
  const pngZip=await JSZip.loadAsync(await download(page,'#recipe-export'));
  const names=Object.keys(pngZip.files).filter(name=>name.endsWith('.png'));
  expect(names).toHaveLength(2);
  expect(await dimensions(page,await pngZip.file(names[0]).async('nodebuffer'))).toEqual([320,400]);
  expect(await dimensions(page,await pngZip.file(names[1]).async('nodebuffer'))).toEqual([400,400]);
  await page.locator('#recipe-format').selectOption('jpeg'); await page.locator('#recipe-limit').fill('0.1');
  const jpgZip=await JSZip.loadAsync(await download(page,'#recipe-export'));
  for (const name of Object.keys(jpgZip.files).filter(name=>name.endsWith('.jpg'))) expect((await jpgZip.file(name).async('nodebuffer')).length).toBeLessThanOrEqual(.1*1024**2);
});

test('continuous canvas splits cross-page images without guide lines and persists edits', async ({page}) => {
  await start(page); await tab(page,'carousel');
  await page.locator('#carousel-pages').fill('2'); await page.locator('#carousel-width').fill('320'); await page.locator('#carousel-height').fill('400');
  await page.locator('#carousel-photo').click(); await done(page);
  for (const [label,value] of [['横坐标','0'],['纵坐标','0'],['宽','640'],['高','400']]) { await page.getByRole('spinbutton',{name:'元素'+label,exact:true}).fill(value); await page.getByRole('spinbutton',{name:'元素'+label,exact:true}).press('Tab'); }
  const zip=await JSZip.loadAsync(await download(page,'#carousel-export'));
  const files=Object.keys(zip.files).filter(name=>name.endsWith('.jpg')); expect(files).toHaveLength(2);
  const images=await Promise.all(files.map(name=>zip.file(name).async('nodebuffer')));
  for (const bytes of images) expect(await dimensions(page,bytes)).toEqual([320,400]);
  const seam=await page.evaluate(async data => {
    const pixels=[];
    for (let i=0;i<data.length;i++) {
      const img=await createImageBitmap(new Blob([new Uint8Array(data[i])])); const c=document.createElement('canvas'); c.width=320;c.height=400;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0);pixels.push(Array.from(ctx.getImageData(i===0?319:0,200,1,1).data));
    } return pixels;
  },images.map(bytes=>Array.from(bytes)));
  expect(seam[0].slice(0,3).every((value,index)=>Math.abs(value-seam[1][index])<5)).toBeTruthy();
  await page.reload(); await page.locator('#btn-creative-tools').click(); await tab(page,'carousel');
  await expect(page.locator('#carousel-pages')).toHaveValue('2'); await expect(page.locator('#carousel-items option')).toHaveCount(2);
});

test('cancelling a new export downloads no partial archive and unlocks controls', async ({page}) => {
  await start(page); await tab(page,'recipes');
  let downloads=0; page.on('download',()=>downloads++);
  await page.evaluate(() => { const render=CanvasRenderer.render; CanvasRenderer.render=async (...args)=>{await new Promise(resolve=>{window.resumeCreative=resolve;});return render(...args);}; });
  await page.locator('#recipe-export').click(); await expect(page.locator('#creative-cancel')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>typeof window.resumeCreative)).toBe('function');
  await page.locator('#creative-cancel').click(); await page.evaluate(()=>window.resumeCreative());
  await expect(page.locator('#creative-status')).toContainText('操作已取消'); expect(downloads).toBe(0);
  await expect(page.locator('#creative-cancel')).toBeHidden(); await page.locator('#creative-close').click();
});

const fontPath='/System/Library/Fonts/SFHebrewRounded.ttf';
test('imported fonts load, persist, and are embedded in complete projects', async ({page}) => {
  test.skip(!existsSync(fontPath),'Font import uses a local system font fixture on macOS');
  await start(page);
  await page.locator('#creative-font-file').setInputFiles(fontPath); await done(page);
  await expect(page.locator('#creative-fonts li')).toHaveCount(1);
  const fonts=await page.evaluate(()=>SessionStore.listFonts()); expect(fonts[0].id).toMatch(/^PF_/);
  await tab(page,'project'); const zip=await JSZip.loadAsync(await download(page,'#project-save'));
  const manifest=JSON.parse(await zip.file('project.json').async('string'));
  expect(manifest.data.fonts).toHaveLength(1);
  expect(await zip.file(manifest.data.fonts[0].file.$file).async('nodebuffer')).toEqual(await readFile(fontPath));
  await page.reload(); await page.locator('#btn-creative-tools').click(); await expect(page.locator('#creative-fonts li')).toHaveCount(1);
  expect(await page.evaluate(family=>FontLibrary.isAvailable(family),fonts[0].id)).toBeTruthy();
});

test('complete projects restore the editable collage and shared original files', async ({page,browser},testInfo) => {
  await start(page); await page.locator('#creative-close').click();
  if (testInfo.project.name === 'mobile') await page.locator('.mobile-nav-tab[data-panel="presets"]').click();
  await page.locator('.cat-btn[data-cat="collage"]').click();
  await page.locator('.preset-card[data-id="cl-2h"]').click();
  for(let i=0;i<2;i++)await page.locator('.cf-photo').nth(i).click();await page.locator('#cf-start').click();
  await expect(page.locator('#collage-overlay')).toBeVisible();
  await page.locator('#collage-title-input').fill('我的双联照片');
  await page.locator('#collage-gap').fill('0.03');
  await page.locator('#btn-creative-tools').click(); await tab(page,'project');
  const archive=await download(page,'#project-save'),zip=await JSZip.loadAsync(archive),manifest=JSON.parse(await zip.file('project.json').async('string'));
  expect(manifest.data.collage.title).toBe('我的双联照片');
  expect(manifest.data.collage.cells[0].file.$file).toBe(manifest.data.jobs[0].file.$file);
  const context=await browser.newContext(),other=await context.newPage();
  await other.goto('/');await other.locator('#btn-creative-tools').click();await tab(other,'project');
  await other.locator('#project-file').setInputFiles({name:'collage.photoframe',mimeType:'application/zip',buffer:archive});
  await expect(other.locator('#project-review')).toBeVisible();await other.locator('#project-open').click();await done(other);
  await other.locator('#creative-close').click();
  await expect(other.locator('#collage-overlay')).toBeVisible();await expect(other.locator('#collage-title-input')).toHaveValue('我的双联照片');
  await expect(other.locator('#collage-gap')).toHaveValue('0.03');
  await context.close();
});

test('JPEG budget reduces noisy output size and records actual dimensions', async ({page}) => {
  await page.goto('/');
  const bytes=await page.evaluate(async () => {
    const c=document.createElement('canvas');c.width=c.height=800;const ctx=c.getContext('2d'),pixels=ctx.createImageData(800,800);
    let seed=91;
    for (let i=0;i<pixels.data.length;i+=4) { for (let channel=0;channel<3;channel++) {seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data[i+channel]=seed>>>24;}pixels.data[i+3]=255; }
    ctx.putImageData(pixels,0,0);return Array.from(new Uint8Array(await (await new Promise(resolve=>c.toBlob(resolve))).arrayBuffer()));
  });
  await page.locator('#file-input').setInputFiles({name:'noise.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
  await expect(page.locator('.strip-item img')).toHaveCount(1);await page.locator('#btn-creative-tools').click();await tab(page,'recipes');
  const rows=page.locator('.recipe-row');
  await rows.nth(0).locator('[data-key=width]').fill('800');await rows.nth(0).locator('[data-key=height]').fill('800');
  await rows.nth(1).locator('[data-key=enabled]').uncheck();await rows.nth(2).locator('[data-key=enabled]').uncheck();
  await page.locator('#recipe-limit').fill('0.1');
  const zip=await JSZip.loadAsync(await download(page,'#recipe-export')),name=Object.keys(zip.files).find(name=>name.endsWith('.jpg'));
  const jpg=await zip.file(name).async('nodebuffer');expect(jpg.length).toBeLessThanOrEqual(.1*1024**2);
  const size=await dimensions(page,jpg);expect(size[0]).toBeLessThan(800);
  expect(await zip.file('导出说明.txt').async('string')).toContain(size.join('x'));
});

test('metadata sidecars exclude GPS by default and include it only when selected', async ({page}) => {
  await page.goto('/');
  await page.evaluate(()=>{ExifReader.read=async()=>({camera:'Test Camera',lens:'50mm',date:'2026-11-19',gps:{lat:31.2,lng:121.4}});});
  await page.locator('#file-input').setInputFiles(photo('private.svg'));
  await expect(page.locator('.strip-item img')).toHaveCount(1);await page.locator('#btn-creative-tools').click();await tab(page,'recipes');
  const rows=page.locator('.recipe-row');await rows.nth(1).locator('[data-key=enabled]').uncheck();await rows.nth(2).locator('[data-key=enabled]').uncheck();
  await rows.nth(0).locator('[data-key=width]').fill('320');await rows.nth(0).locator('[data-key=height]').fill('400');
  for (const mode of ['none','camera','gps']) {
    await page.locator('#recipe-metadata').selectOption(mode);
    const zip=await JSZip.loadAsync(await download(page,'#recipe-export')),sidecars=Object.keys(zip.files).filter(name=>name.endsWith('.json'));
    if (mode==='none') expect(sidecars).toHaveLength(0);
    else {
      const metadata=JSON.parse(await zip.file(sidecars[0]).async('string'));expect(metadata.camera).toBe('Test Camera');
      if (mode==='gps') expect(metadata.gps).toEqual({lat:31.2,lng:121.4});else expect(metadata).not.toHaveProperty('gps');
    }
    const jpgName=Object.keys(zip.files).find(name=>name.endsWith('.jpg')),jpg=await zip.file(jpgName).async('nodebuffer');
    const gps=await page.evaluate(async bytes=>exifr.gps(new Uint8Array(bytes)).catch(()=>undefined),Array.from(jpg));expect(gps).toBeUndefined();
  }
});

test('project transaction abort preserves stored originals when a write fails', async ({page}) => {
  await start(page);
  await expect.poll(()=>page.evaluate(async ()=>(await SessionStore.restoreSession()).jobs.length)).toBe(2);
  const result=await page.evaluate(async()=>{
    const before=await SessionStore.restoreSession(),put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value){if(this.name==='jobs')throw new DOMException('Simulated quota failure','QuotaExceededError');return put.call(this,value);};
    let failed=false;
    try {await SessionStore.replaceSession(before.jobs,{activeJobId:before.jobs[0].id});}catch{failed=true;}finally{IDBObjectStore.prototype.put=put;}
    const after=await SessionStore.restoreSession();return {failed,names:after.jobs.map(job=>job.file.name).sort()};
  });
  expect(result).toEqual({failed:true,names:['photo-1.svg','photo-2.svg']});
});

test('long carousel canvases support wheel and page navigation without secure UUID support', async ({page}) => {
  await page.addInitScript(()=>Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true}));
  await start(page,1);await tab(page,'carousel');await page.locator('#carousel-pages').fill('10');
  await page.locator('#carousel-photo').click();await done(page);
  await expect(page.locator('#carousel-items option')).toHaveCount(2);
  const viewport=page.locator('.carousel-scroll');
  await expect.poll(()=>viewport.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeGreaterThan(0);
  await viewport.hover();await page.mouse.wheel(0,200);
  await expect.poll(()=>viewport.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  await viewport.evaluate(el=>{el.scrollLeft=0;});
  await page.locator('#carousel-next-page').click();await expect.poll(()=>viewport.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  await page.locator('#carousel-pan').check();await expect(page.locator('#carousel-canvas')).toHaveCSS('touch-action','pan-x pan-y');
  await page.locator('#carousel-pan').uncheck();await expect(page.locator('#carousel-canvas')).toHaveCSS('touch-action','none');
});

test('studio forms stay aligned and inside the dialog across desktop and narrow screens', async ({page},testInfo) => {
  await start(page);
  for (const width of [1280,768,390,320]) {
    await page.setViewportSize({width,height:900});
    for (const name of ['style','pick','project','contact','recipes','carousel']) {
      await tab(page,name);
      const layout=await page.locator('#creative-dialog').evaluate(dialog=>{
        const body=dialog.querySelector('.creative-body'), rect=dialog.getBoundingClientRect();
        const controls=[...body.querySelectorAll('input:not([hidden]),select,textarea')].filter(control=>control.getClientRects().length);
        return {
          fits:rect.left>=-1 && rect.right<=innerWidth+1 && rect.top>=-1 && rect.bottom<=innerHeight+1,
          overflow:body.scrollWidth-body.clientWidth,
          fields:controls.filter(control=>{
            const field=control.closest('label');if(!field)return false;
            const box=control.getBoundingClientRect(),parent=field.getBoundingClientRect();
            return box.left<parent.left-1 || box.right>parent.right+1;
          }).map(control=>control.id),
          scopeCaptionHeight:dialog.querySelector('.creative-scope label > span').getBoundingClientRect().height,
          clippedNumbers:controls.filter(control=>control.type==='number' && control.getBoundingClientRect().width<72).map(control=>control.id || control.dataset.key),
          footerVisible:dialog.querySelector('footer').getBoundingClientRect().bottom<=innerHeight+1,
        };
      });
      expect(layout,`${width}px ${name}`).toMatchObject({fits:true,fields:[],clippedNumbers:[],footerVisible:true});
      expect(layout.overflow,`${width}px ${name} overflow`).toBeLessThanOrEqual(1);
      expect(layout.scopeCaptionHeight).toBeLessThan(22);
      if ((width===1280 || width===390) && ['style','recipes','carousel'].includes(name) && testInfo.project.name==='desktop') {
        await page.screenshot({path:`/tmp/photoframe-studio-${name}-${width}.png`});
      }
    }
  }
});
