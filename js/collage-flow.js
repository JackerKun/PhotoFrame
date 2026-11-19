/** Dedicated collage entry: choose a layout, choose ordered photos, then edit. */
window.CollageFlow = (() => {
  let app, dialog, layout, chosen=[], step=1, pending=false;
  const $=id=>document.getElementById(id);
  function sketch(value){
    const preview=document.createElement('span');preview.className='cf-sketch';preview.style.aspectRatio=value.outputRatio;preview.style.setProperty('--cf-ratio',value.outputRatio);
    value.cells.forEach(cell=>{const rect=document.createElement('i');Object.assign(rect.style,{left:`${cell.x*100}%`,top:`${cell.y*100}%`,width:`${cell.w*100}%`,height:`${cell.h*100}%`});preview.append(rect);});const stage=document.createElement('span');stage.className='cf-preview';stage.append(preview);return stage;
  }
  function showStep(value){dialog.scrollTop=0;step=value;$('cf-layouts').hidden=value!==1;$('cf-photos').hidden=value!==2;$('cf-back').hidden=value===1;$('cf-start').hidden=value===1;$('cf-step').textContent=value===1?'01 选择样式 → 02 选择照片 → 03 编辑与导出':'01 选择样式 ✓ → 02 选择照片 → 03 编辑与导出';render();}
  function render(){
    const saved=CollageStudio.exportBook();$('cf-resume').hidden=step!==1||!saved?.pages.length;
    if(!layout)return;
    $('cf-choice').replaceChildren(sketch(layout));const name=document.createElement('strong');name.textContent=layout.name;$('cf-choice').append(name);
    $('cf-photo-hint').textContent=`此样式需要 ${layout.cellCount} 张照片 · 已选 ${chosen.length} 张。按下方顺序填入格子，可用箭头调整。`;
    const grid=$('cf-library');grid.replaceChildren();
    app.state.jobs.forEach(job=>{const button=document.createElement('button');button.type='button';button.className='cf-photo';const index=chosen.indexOf(job.id);button.setAttribute('aria-pressed',String(index>=0));button.setAttribute('aria-label',`选择照片 ${job.file.name}`);
      const img=document.createElement('img');img.src=job.thumbUrl||'';img.alt='';const label=document.createElement('span');label.textContent=job.file.name;const badge=document.createElement('b');badge.textContent=index<0?'+':String(index+1);button.append(img,label,badge);
      button.onclick=()=>{if(pending)return;if(index>=0)chosen.splice(index,1);else if(chosen.length<layout.cellCount)chosen.push(job.id);else{$('cf-feedback').textContent=`已选满 ${layout.cellCount} 张，请先取消一张再更换。`;return;}$('cf-feedback').textContent='';render();};grid.append(button);
    });
    $('cf-empty').hidden=app.state.jobs.length>0;
    const order=$('cf-order');order.replaceChildren();chosen.forEach((id,index)=>{const job=app.state.jobs.find(j=>j.id===id);if(!job)return;const row=document.createElement('div');const label=document.createElement('span');label.textContent=`${index+1}. ${job.file.name}`;row.append(label);[['前移',-1],['后移',1],['移除',0]].forEach(([text,direction])=>{const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',`${text} ${job.file.name}`);button.disabled=pending||(direction<0&&index===0)||(direction>0&&index===chosen.length-1);button.onclick=()=>{if(direction)[chosen[index],chosen[index+direction]]=[chosen[index+direction],chosen[index]];else chosen.splice(index,1);render();};row.append(button);});order.append(row);});
    $('cf-start').disabled=pending||chosen.length!==layout.cellCount;$('cf-upload').disabled=pending;$('cf-back').disabled=pending;$('cf-close').disabled=pending;
  }
  async function open(selected){
    await app.ready();layout=selected||null;chosen=[];$('cf-feedback').textContent='';showStep(selected?2:1);if(!dialog.open)dialog.showModal();
  }
  function setup(adapter){
    app=adapter;dialog=document.createElement('dialog');dialog.id='collage-start';dialog.className='cf-dialog';dialog.innerHTML=`
      <header class="cf-header"><div><small>PHOTOFRAME / COLLAGE</small><h2>拼图</h2><p id="cf-step"></p></div><button id="cf-close" type="button" aria-label="关闭拼图入口">关闭</button></header>
      <section id="cf-layouts"><div class="cf-section-heading"><div><h3>从喜欢的样式开始</h3><p>先选版式，再放入照片。每个样式都会保留自己的排列。</p></div><button id="cf-resume" type="button" hidden>继续上次拼图</button></div><div id="cf-styles" class="cf-styles"></div></section>
      <section id="cf-photos" hidden><div id="cf-choice" class="cf-choice"></div><div class="cf-section-heading"><div><h3>选择照片</h3><p id="cf-photo-hint"></p></div><button id="cf-upload" class="btn btn-primary" type="button">上传照片</button><input id="cf-files" type="file" accept="image/*,.heic,.heif,.tif,.tiff" multiple hidden></div><p id="cf-empty">还没有照片，点击「上传照片」添加。</p><div id="cf-library" class="cf-library"></div><div id="cf-order" class="cf-order" aria-label="照片排列顺序"></div></section>
      <footer class="cf-footer"><span id="cf-feedback" role="status" aria-live="polite"></span><button id="cf-back" type="button">返回选样式</button><button id="cf-start" class="btn btn-primary" type="button">开始编辑</button></footer>`;
    document.body.append(dialog);
    COLLAGE_LAYOUTS.forEach(value=>{const button=document.createElement('button');button.type='button';button.className='cf-style';button.dataset.layout=value.id;button.append(sketch(value));const title=document.createElement('strong');title.textContent=value.name;const detail=document.createElement('small');detail.textContent=`${value.cellCount} 张照片`;button.append(title,detail);button.onclick=()=>{layout=value;chosen=[];$('cf-feedback').textContent='';showStep(2);};$('cf-styles').append(button);});
    $('btn-collage').onclick=()=>open();$('cf-close').onclick=()=>dialog.close();$('cf-back').onclick=()=>showStep(1);
    dialog.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});
    dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
    $('cf-resume').onclick=()=>{const saved=CollageStudio.exportBook();if(!saved?.pages.length)return;dialog.close();app.start(saved.pages[saved.index].layout,[],true);};
    $('cf-upload').onclick=()=>$('cf-files').click();$('cf-files').onchange=async e=>{
      const files=Array.from(e.target.files);e.target.value='';if(!files.length)return;pending=true;render();$('cf-feedback').textContent='正在导入照片…';const before=new Set(app.state.jobs.map(j=>j.id));
      try{await app.importFiles(files);await app.ready();for(const job of app.state.jobs)if(!before.has(job.id)&&chosen.length<layout.cellCount)chosen.push(job.id);$('cf-feedback').textContent=chosen.length===layout.cellCount?'照片已就绪，可以开始编辑。':'照片已导入，请继续选择。';}catch(error){$('cf-feedback').textContent=`导入失败：${error.message}`;}finally{pending=false;render();}
    };
    $('cf-start').onclick=()=>{if(pending||chosen.length!==layout.cellCount)return;const jobs=chosen.map(id=>app.state.jobs.find(j=>j.id===id)).filter(Boolean);if(jobs.length!==layout.cellCount){chosen=jobs.map(j=>j.id);render();return;}dialog.close();app.start(layout,jobs);};
  }
  return {setup,open};
})();
