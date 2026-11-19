const {test:base,expect}=require('@playwright/test');
const {readFile}=require('node:fs/promises');
const JSZip=require('jszip');
const test=base.extend({page:async({page},use)=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));await use(page);expect(errors).toEqual([]);}});
const photo=(i,w=240,h=160)=>({name:`shot-${i}.svg`,mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g"><stop stop-color="#b03d2d"/><stop offset="1" stop-color="#3075aa"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w*.2}" cy="${h*.3}" r="20" fill="#fff"/></svg>`)});
async function open(page,count=7){
  await page.goto('/');await page.locator('#file-input').setInputFiles(Array.from({length:count},(_,i)=>photo(i,...(i%2?[160,240]:[320,180]))));
  await expect(page.locator('.strip-item img')).toHaveCount(count);
  await page.getByRole('button',{name:'拼图',exact:true}).evaluate(el=>el.click());
  await page.locator('.preset-card[data-id="cl-2h"]').evaluate(el=>el.click());
  await page.locator('.cf-photo').nth(0).click();await page.locator('.cf-photo').nth(1).click();await page.locator('#cf-start').click();
  await expect(page.locator('#collage-overlay')).toBeVisible();
  await expect.poll(()=>page.locator('#collage-canvas').evaluate(c=>c.width)).toBeGreaterThan(300);
}
async function reveal(page,id){await page.locator(id).evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;el.scrollIntoView({block:'center'});});}
async function click(page,id){await reveal(page,id);await page.locator(id).click();}
async function select(page,id,value){await reveal(page,id);await page.locator(id).selectOption(value);}
const book=page=>page.evaluate(()=>JSON.parse(JSON.stringify(CollageStudio.exportBook(),(k,v)=>v instanceof Blob?{name:v.name,size:v.size}:v)));
async function complete(page){await expect(page.locator('#cs-stop')).toBeHidden();}
async function generate(page,mode='preserve'){
  await select(page,'#cs-layout-mode',mode);await click(page,'#cs-generate');await complete(page);await expect(page.locator('#cs-candidates button')).not.toHaveCount(0);await click(page,'#cs-candidates button:first-child');
}
async function exportDownload(page,id){const waiting=page.waitForEvent('download');await click(page,id);const d=await waiting;await complete(page);return readFile(await d.path());}

test('mixed-aspect photos get complete candidate previews, hero selection, locks and independent undo',async({page})=>{
  await open(page);await generate(page);let data=await book(page);
  expect(data.pages[0].cells).toHaveLength(7);expect(data.pages[0].cells.every(c=>c.fit==='contain')).toBeTruthy();
  const original=data.pages[0].layout.cells[0];await click(page,'#cs-lock');await generate(page,'cover');
  data=await book(page);const fixed=data.pages[0].cells.findIndex(c=>c.locked);expect(data.pages[0].layout.cells[fixed]).toEqual(original);expect(data.pages[0].cells[fixed].fit).toBe('contain');
  await click(page,'#cs-undo');expect((await book(page)).pages[0].layout.outputRatio).toBeGreaterThan(0);
  await click(page,'#cs-redo');expect((await book(page)).pages[0].cells.some(c=>c.locked)).toBeTruthy();
  await page.evaluate(()=>CollageStudio.select(CollageStudio.exportBook().pages[0].cells.findIndex(c=>c.locked)));
  await click(page,'#cs-lock');await page.evaluate(()=>CollageStudio.select(3));const heroName=(await book(page)).pages[0].cells[3].file.name;await click(page,'#cs-hero');await generate(page,'hero');
  data=await book(page);expect(data.pages[0].cells[0].file.name).toBe(heroName);expect(data.pages[0].layout.cells[0].w).toBeGreaterThan(.5);
});

test('original-ratio stitching and gallery use all selected photos and preserve their ratios',async({page})=>{
  await open(page,10);await click(page,'#cs-vertical');await complete(page);let p=(await book(page)).pages[0];expect(p.cells).toHaveLength(10);
  p.layout.cells.forEach((c,i)=>expect(c.w/c.h*p.layout.outputRatio).toBeCloseTo(i%2?2/3:16/9,4));expect(p.layout.cells.every(c=>c.x===0&&c.w===1)).toBeTruthy();
  await click(page,'#cs-horizontal');await complete(page);p=(await book(page)).pages[0];p.layout.cells.forEach((c,i)=>expect(c.w/c.h*p.layout.outputRatio).toBeCloseTo(i%2?2/3:16/9,4));expect(p.layout.cells.every(c=>c.y===0&&c.h===1)).toBeTruthy();
  await click(page,'#cs-gallery');await complete(page);p=(await book(page)).pages[0];expect(p.cells.every(c=>c.fit==='contain')).toBeTruthy();
  const total=p.layout.cells.reduce((sum,c)=>sum+c.w*c.h,0);expect(total).toBeCloseTo(1,6);
  await reveal(page,'#cs-export-edge');await page.locator('#cs-export-edge').fill('1200');
  const zip=await JSZip.loadAsync(await exportDownload(page,'#cs-export'));expect(Object.keys(zip.files)).toEqual(['001.jpg']);
  const bytes=await zip.file('001.jpg').async('nodebuffer');expect(await page.evaluate(async data=>{const img=await createImageBitmap(new Blob([new Uint8Array(data)]));return Math.max(img.width,img.height);},Array.from(bytes))).toBe(1200);
  const waiting=page.waitForEvent('download');await click(page,'#btn-collage-export');const current=await readFile(await (await waiting).path());expect(current[0]).toBe(0xff);expect(current[1]).toBe(0xd8);await expect(page.locator('#btn-collage-export')).toBeEnabled();
});

test('split, merge, descriptions, saved designs and layout switching retain edits',async({page})=>{
  await open(page,3);await reveal(page,'#cs-caption');await page.locator('#cs-caption').fill('主图说明');await page.locator('#cs-caption').press('Tab');
  await click(page,'#cs-split-y');expect((await book(page)).pages[0].cells).toHaveLength(3);
  await click(page,'#cs-merge');await page.evaluate(()=>CollageStudio.select(1));expect((await book(page)).pages[0].cells).toHaveLength(2);
  await select(page,'#cs-existing-layout','2');let p=(await book(page)).pages[0];expect(p.cells[0].caption).toBe('主图说明');expect(p.cells[0].file.name).toBe('shot-0.svg');
  await select(page,'#cs-photo-style','film');await click(page,'#cs-apply-photo-style');await reveal(page,'#cs-template-name');await page.locator('#cs-template-name').fill('旅行版式');await click(page,'#cs-template-save');await select(page,'#cs-photo-style','none');await click(page,'#cs-apply-photo-style');await select(page,'#cs-template','0');await click(page,'#cs-template-apply');expect((await book(page)).pages[0].cells[0].frame.preset.border.film).toBeTruthy();
  expect((await book(page)).pages[0].cells[0].caption).toBe('主图说明');await click(page,'#btn-collage-cancel');
  await expect.poll(()=>page.evaluate(async()=>(await SessionStore.restoreSession()).sessionState?.collageBook?.pages[0].layout.cellCount)).toBe(3);await page.reload();await expect(page.locator('.strip-item img')).toHaveCount(3);await page.locator('#btn-collage').click();await page.locator('#cf-resume').click();
  expect((await book(page)).pages[0].layout.cellCount).toBe(3);await reveal(page,'#cs-template');await expect(page.locator('#cs-template')).toContainText('旅行版式');
});

test('multi-page creation, ordering, style sharing, ZIP, continuous strip and carousel bridge',async({page})=>{
  await open(page,8);await reveal(page,'#collage-title-input');await page.locator('#collage-title-input').fill('旅行故事');
  await reveal(page,'#cs-bookends');await page.locator('#cs-bookends').check();await click(page,'#cs-paginate');await complete(page);
  let b=await book(page);expect(b.pages).toHaveLength(4);expect(b.pages.flatMap(p=>p.cells).filter(c=>c.file)).toHaveLength(8);
  expect(b.pages[0].title).toBe('旅行故事');await click(page,'#cs-page-copy');expect((await book(page)).pages).toHaveLength(5);await click(page,'#cs-page-delete');expect((await book(page)).pages).toHaveLength(4);
  await click(page,'#cs-page-next');expect((await book(page)).index).toBe(2);await click(page,'#cs-page-prev');
  await reveal(page,'#collage-bg-color');await page.locator('#collage-bg-color').fill('#224433');await click(page,'#cs-share-style');expect((await book(page)).pages.every(p=>p.style.color==='#224433')).toBeTruthy();
  await reveal(page,'#cs-export-edge');await page.locator('#cs-export-edge').fill('600');const zip=await JSZip.loadAsync(await exportDownload(page,'#cs-export'));expect(Object.keys(zip.files)).toHaveLength(4);
  const strip=await exportDownload(page,'#cs-strip');expect(strip.length).toBeGreaterThan(1000);
  await click(page,'#cs-carousel');await expect(page.locator('#cs-status')).toContainText('已加入');
  await click(page,'#btn-collage-cancel');await page.locator('#btn-creative-tools').click();await page.locator('[data-page="carousel"]').click();await expect(page.locator('#carousel-items')).toContainText('拼图页面');await expect.poll(()=>page.evaluate(async()=>(await SessionStore.restoreSession()).jobs.length)).toBe(8);await page.reload();await expect(page.locator('.strip-item img')).toHaveCount(8);await page.locator('#btn-creative-tools').click();await page.locator('[data-page="carousel"]').click();await expect(page.locator('#carousel-items')).toContainText('拼图页面');const download=page.waitForEvent('download');await page.locator('#carousel-export').click();await download;await expect(page.locator('#creative-status')).toHaveText('已完成');
});

test('complete project round-trip restores multiple pages and framed photos in a fresh browser',async({page,browser})=>{
  await open(page,5);await click(page,'#cs-paginate');await complete(page);await select(page,'#cs-photo-style','film');await click(page,'#cs-apply-photo-style');
  await click(page,'#btn-collage-cancel');await page.locator('#btn-creative-tools').click();await page.locator('[data-page="project"]').click();
  const waiting=page.waitForEvent('download');await page.locator('#project-save').click();const archive=await readFile(await (await waiting).path());const zip=await JSZip.loadAsync(archive);const data=JSON.parse(await zip.file('project.json').async('string')).data;
  expect(data.collageBook.pages).toHaveLength(2);expect(data.collageBook.pages[0].cells[0].frame.preset.border.film).toBeTruthy();
  const context=await browser.newContext(),other=await context.newPage();await other.goto('/');await other.locator('#btn-creative-tools').click();await other.locator('[data-page="project"]').click();await other.locator('#project-file').setInputFiles({name:'pages.photoframe',mimeType:'application/zip',buffer:archive});await expect(other.locator('#project-review')).toBeVisible();await other.locator('#project-open').click();await expect(other.locator('#creative-status')).toHaveText('已完成');await other.locator('#creative-close').click();
  expect((await book(other)).pages).toHaveLength(2);await expect(other.locator('#collage-overlay')).toBeVisible();await context.close();
});

test('canvas drag pans, wheel zooms, swap exchanges photos and divider resizes adjacent cells',async({page},info)=>{
  test.skip(info.project.name==='mobile','Mouse gestures are covered on desktop; touch uses the same pointer path.');
  await open(page,2);await reveal(page,'#collage-canvas');await page.waitForTimeout(500);
  const box=await page.locator('#collage-canvas').boundingBox(),x=box.x+box.width*.28,y=box.y+box.height*.4;
  await page.mouse.move(x,y);await page.mouse.wheel(0,-160);await page.waitForTimeout(500);const zoomed=(await book(page)).pages[0].cells[0].cropRect;expect(zoomed.sw).toBeLessThan(320);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+20,y+10,{steps:5});await page.mouse.up();expect((await book(page)).pages[0].cells[0].cropRect.sx).not.toBe(zoomed.sx);
  await select(page,'#cs-edit-mode','swap');await reveal(page,'#collage-canvas');await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(box.x+box.width*.75,y,{steps:6});await page.mouse.up();expect((await book(page)).pages[0].cells[0].file.name).toBe('shot-1.svg');
  await select(page,'#cs-edit-mode','compose');await reveal(page,'#collage-canvas');const before=(await book(page)).pages[0].layout.cells[0].w;
  await page.mouse.move(box.x+box.width*.5,y);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,y,{steps:5});await page.mouse.up();expect((await book(page)).pages[0].layout.cells[0].w).toBeGreaterThan(before);
});

test('studio controls fit narrow screens and page thumbnails remain reachable',async({page})=>{
  await page.setViewportSize({width:320,height:700});await open(page,4);await click(page,'#cs-paginate');await complete(page);
  const metrics=await page.locator('#collage-overlay').evaluate(el=>{const box=el.getBoundingClientRect(),bar=el.querySelector('.cs-page-bar').getBoundingClientRect();return {w:box.width,scroll:el.scrollWidth,bottom:bar.bottom,viewport:innerHeight};});expect(metrics.scroll).toBeLessThanOrEqual(metrics.w+1);expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewport);
  await click(page,'#cs-page-copy');expect((await book(page)).pages).toHaveLength(3);
  await page.screenshot({path:'/tmp/photoframe-collage-studio-320.png',fullPage:true});
});


test('two-finger touch zoom works on the collage canvas',async({page,context},info)=>{
  test.skip(info.project.name!=='mobile','Real touch input is exercised in the mobile project.');
  await open(page,2);await reveal(page,'#collage-canvas');await page.waitForTimeout(500);
  const box=await page.locator('#collage-canvas').boundingBox(),x=box.x+box.width*.26,y=box.y+box.height*.4;
  const client=await context.newCDPSession(page);
  const points=(distance)=>[{x:x-distance,y,id:1},{x:x+distance,y,id:2}];
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(10)});
  for(let d=14;d<=30;d+=4)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(d)});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>Boolean((await book(page)).pages[0].cells[0].cropRect)).toBeTruthy();
  expect((await book(page)).pages[0].cells[0].cropRect.sw).toBeLessThan(200);
});
