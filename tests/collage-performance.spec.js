const {test,expect}=require('@playwright/test');

test('nine large photos stay decoded during zoom and unchanged page thumbnails stay intact',async({page})=>{
  await page.goto('/');
  const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=3000;c.height=2000;const ctx=c.getContext('2d');const g=ctx.createLinearGradient(0,0,3000,2000);g.addColorStop(0,'#bd6f35');g.addColorStop(1,'#1c677d');ctx.fillStyle=g;ctx.fillRect(0,0,3000,2000);return Array.from(new Uint8Array(await (await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.9))).arrayBuffer()));});
  await page.locator('#file-input').setInputFiles(Array.from({length:9},(_,i)=>({name:`large-${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(bytes)})));
  await expect(page.locator('.strip-item img')).toHaveCount(9);
  await page.locator('#btn-collage').click();await page.locator('[data-layout="cl-9grid"]').click();for(let i=0;i<9;i++)await page.locator('.cf-photo').nth(i).click();await page.locator('#cf-start').click();
  await expect.poll(()=>page.locator('#collage-canvas').evaluate(c=>Math.max(c.width,c.height))).toBe(1000);
  // Explicit warm-up also covers the thumbnail path and records real source coordinates.
  const measured=await page.evaluate(async()=>{
    const p=CollageStudio.exportBook().pages[0];await CollageRenderer.renderPreview(p.layout,p.cells,{},p.style,1000);
    const original=ImageDecoder.load;let decodes=0;ImageDecoder.load=(...args)=>{decodes++;return original(...args);};
    const times=[];try{for(let i=0;i<12;i++){p.cells[0].cropRect={sx:100+i*10,sy:100,sw:1800,sh:1800};const start=performance.now();const c=await CollageRenderer.renderPreview(p.layout,p.cells,{},p.style,1000);times.push(performance.now()-start);if(c.collageGeometry.cells[0].srcW!==3000)throw Error('Preview crop lost original coordinates');c.width=c.height=0;}const previewDecodes=decodes;const exported=await CollageRenderer.render(p.layout,p.cells,{},640,p.style);exported.width=exported.height=0;return {decodes:previewDecodes,exportDecodes:decodes-previewDecodes,times};}finally{ImageDecoder.load=original;}
  });
  expect(measured.decodes).toBe(0);expect(measured.exportDecodes).toBe(9);console.log(`${test.info().project.name}: nine-photo warm renders median ${measured.times.sort((a,b)=>a-b)[6].toFixed(1)} ms, ${measured.decodes} source decodes`);
  await page.locator('#cs-page-copy').evaluate(el=>el.click());await expect(page.locator('#cs-pages button')).toHaveCount(2);await expect.poll(()=>page.locator('#cs-pages button').first().evaluate(b=>Boolean(b._previewSignature))).toBe(true);
  await page.evaluate(()=>{
    window.zoomDecodeCount=0;const load=ImageDecoder.load;ImageDecoder.load=(...args)=>{window.zoomDecodeCount++;return load(...args);};
    window.unchangedThumb=0;const c=document.querySelector('#cs-pages button canvas'),ctx=c.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(...args)=>{window.unchangedThumb++;return draw(...args);};
    const canvas=document.querySelector('#collage-canvas'),rect=canvas.getBoundingClientRect();
    for(let i=0;i<30;i++)canvas.dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+rect.width*.2,clientY:rect.top+rect.height*.2,deltaY:-3,bubbles:true,cancelable:true}));
  });
  await expect.poll(()=>page.evaluate(()=>Boolean(CollageStudio.exportBook().pages[1].cells[0].cropRect))).toBe(true);
  await page.waitForTimeout(500);expect(await page.evaluate(()=>window.zoomDecodeCount)).toBe(0);expect(await page.evaluate(()=>window.unchangedThumb)).toBe(0);
});

test('framed previews share cached results across snapshots and invalidate changed styles',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const file=new File(['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="tan"/></svg>'],'frame.svg',{type:'image/svg+xml'});
    const frame={preset:PRESETS[0],job:{}};const cells=Array.from({length:9},()=>({file,frame}));const layout=COLLAGE_LAYOUTS.find(l=>l.id==='cl-9grid');
    const original=CanvasRenderer.renderPreview;let frames=0;CanvasRenderer.renderPreview=(...args)=>{frames++;return original(...args);};
    try{await CollageRenderer.renderPreview(layout,cells,{}, {},1000);await CollageRenderer.renderPreview(layout,CollageEngine.copy(cells),{}, {},100);const initial=frames;cells[0].frame=CollageEngine.copy(frame);cells[0].frame.preset.border.color='#ee1133';await CollageRenderer.renderPreview(layout,cells,{}, {},1000);return {initial,updated:frames};}finally{CanvasRenderer.renderPreview=original;}
  });
  expect(result.initial).toBe(1);expect(result.updated).toBe(2);
});
