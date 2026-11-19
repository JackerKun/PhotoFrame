// Capture only the collage documentation assets against an already running local app.
const {chromium,expect}=require('@playwright/test');
const {writeFile}=require('node:fs/promises');
const {resolve}=require('node:path');
const {demoArtwork,rasterize,webp}=require('./screenshots.cjs');
(async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1440,height:960}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.PHOTOFRAME_CAPTURE_URL||'http://127.0.0.1:4173');
    const files=[];
    for(let i=0;i<7;i++)files.push({name:`Field-notes-${i+1}.jpg`,mimeType:'image/jpeg',buffer:await rasterize(page,demoArtwork(i%4).svg,'image/jpeg')});
    await page.locator('#file-input').setInputFiles(files);await expect(page.locator('.strip-item img')).toHaveCount(7);
    await page.locator('#btn-collage').click();
    await writeFile(resolve(__dirname,'../docs/screenshots/collage-start.webp'),await webp(page,await page.screenshot()));
    await page.locator('[data-layout="cl-1l2r"]').click();
    for(let i=0;i<3;i++)await page.locator('.cf-photo').nth(i).click();
    await page.setViewportSize({width:390,height:844});await expect(page.locator('#cf-start')).toBeEnabled();await page.waitForTimeout(250);
    await writeFile(resolve(__dirname,'../docs/screenshots/collage-start-mobile.webp'),await webp(page,await page.screenshot()));
    await page.setViewportSize({width:1440,height:960});await page.locator('#cf-start').click();
    await page.locator('#collage-title-input').fill('山野来信 / FIELD NOTES');await page.locator('#collage-subtitle-input').fill('Seven frames · Autumn collection');
    await page.locator('#cs-generate').click();await expect(page.locator('#cs-candidates button')).toHaveCount(5);
    await page.locator('#cs-candidates button').nth(1).click();
    await page.locator('#collage-gap').fill('0.012');await page.locator('#collage-radius').fill('0.008');
    await page.locator('.collage-inspector').evaluate(el=>el.scrollTop=0);
    await page.waitForTimeout(800);
    const bytes=await page.screenshot();await writeFile(resolve(__dirname,'../docs/screenshots/collage-studio.webp'),await webp(page,bytes));
    await page.setViewportSize({width:390,height:844});
    await page.locator('.cs-panel-nav button').first().click();await page.waitForTimeout(500);
    const mobile=await page.screenshot();await writeFile(resolve(__dirname,'../docs/screenshots/collage-studio-mobile.webp'),await webp(page,mobile));
    expect(errors).toEqual([]);console.log('Captured collage studio desktop and mobile documentation assets.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
