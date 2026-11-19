const {test,expect}=require('@playwright/test');
const photo=i=>({name:`flow-${i}.svg`,mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="${i%2?'#427e89':'#cd9265'}"/></svg>`)});
const current=page=>page.evaluate(()=>{const b=CollageStudio.exportBook();return b&&{id:b.pages[b.index].layout.id,names:b.pages[b.index].cells.map(c=>c.file?.name)};});
test('standalone collage runs from style choice and upload through ordered editing and export',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#btn-collage')).toHaveText('');await page.locator('#btn-collage').click();await expect(page.locator('#cf-resume')).toBeHidden();
  await page.locator('[data-layout="cl-2h"]').click();await expect(page.locator('#cf-start')).toBeDisabled();await page.locator('#cf-files').setInputFiles([photo(0),photo(1),photo(2)]);
  await expect(page.locator('#cf-start')).toBeEnabled();await expect(page.locator('.cf-photo')).toHaveCount(3);await page.getByRole('button',{name:'后移 flow-0.svg',exact:true}).click();await page.locator('#cf-start').click();
  expect(await current(page)).toEqual({id:'cl-2h',names:['flow-1.svg','flow-0.svg']});await expect(page.locator('#collage-layout-name')).toHaveText('横排双图');await page.locator('#btn-collage').click();await expect(page.locator('#collage-start')).toBeVisible();await page.locator('#cf-close').press('Escape');await expect(page.locator('#collage-start')).not.toBeVisible();await expect(page.locator('#collage-overlay')).toBeVisible();
  await page.locator('#cs-export-edge').evaluate(el=>{el.value='640';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const download=page.waitForEvent('download');await page.locator('#btn-collage-export').click();expect((await download).suggestedFilename()).toMatch(/\.(jpg|png)$/);
  await page.locator('#btn-collage-cancel').click();await page.locator('#btn-collage').click();await page.locator('#cf-resume').click();expect((await current(page)).names).toEqual(['flow-1.svg','flow-0.svg']);expect(errors).toEqual([]);
});
test('each new layout honors the selected geometry and cancelling preserves the saved collage',async({page})=>{
  test.setTimeout(60000);
  await page.goto('/');const max=await page.evaluate(()=>Math.max(...COLLAGE_LAYOUTS.map(l=>l.cellCount)));await page.locator('#file-input').setInputFiles(Array.from({length:max},(_,i)=>photo(i)));await expect(page.locator('.strip-item img')).toHaveCount(max);
  const layouts=await page.evaluate(()=>COLLAGE_LAYOUTS.map(l=>({id:l.id,count:l.cellCount,cells:l.cells})));
  for(const layout of layouts){await page.locator('#btn-collage').click();await page.locator(`[data-layout="${layout.id}"]`).click();for(let i=0;i<layout.count;i++)await page.locator('.cf-photo').nth(i).click();await page.locator('#cf-start').click();expect((await current(page)).id).toBe(layout.id);expect(await page.evaluate(()=>CollageStudio.exportBook().pages[0].layout.cells)).toEqual(layout.cells);}
  await page.locator('#btn-collage-cancel').click();
  const saved=await current(page);await page.locator('#btn-collage').click();await page.locator('[data-layout="cl-2h"]').click();await page.locator('#cf-back').click();await page.locator('#cf-close').click();expect(await current(page)).toEqual(saved);
});
test('photo step fits a narrow screen and supports changing photos and adding more in editor',async({page})=>{
  await page.setViewportSize({width:320,height:700});await page.goto('/');await page.locator('#btn-collage').click();await page.locator('[data-layout="cl-2h"]').click();await page.locator('#cf-files').setInputFiles([photo(0)]);await expect(page.locator('#cf-start')).toBeDisabled();await page.locator('#cf-files').setInputFiles([photo(1)]);await expect(page.locator('#cf-start')).toBeEnabled();
  await expect.poll(()=>page.locator('#collage-start').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:'/tmp/photoframe-collage-flow-mobile.png'});await page.locator('#cf-start').click();await page.locator('#cs-upload-files').setInputFiles([photo(2)]);await expect(page.locator('#cs-library img')).toHaveCount(3);expect((await current(page)).names).toEqual(['flow-0.svg','flow-1.svg']);
});
