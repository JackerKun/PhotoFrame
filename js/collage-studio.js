/** A single collage workbench: layouts, direct manipulation, reusable designs and pages. */
window.CollageStudio = (() => {
  const E=window.CollageEngine, $=id=>document.getElementById(id);
  let app, state, book={pages:[],index:0}, selected=0, picked=new Set(), history=[],future=[],last='', geometry=null;
  let thumbsVersion=0, busy=false, abort=false, candidateSeed=0, candidates=[], gesture=null;
  const pointers=new Map(), dimensions=new WeakMap();
  let templates=[];
  try { templates=JSON.parse(localStorage.getItem('pf_collage_templates')||'[]'); if(!Array.isArray(templates))templates=[]; } catch{}
  const snapshot=()=>({layout:E.copy(state.collageLayout),cells:E.copy(state.collageCells),style:E.copy(state.collageStyle),title:$('collage-title-input').value,subtitle:$('collage-subtitle-input').value});
  function commit(){if(state.collageLayout&&book.pages.length)book.pages[book.index]=snapshot();}
  function exportBook(){commit();return book.pages.length?E.copy(book):null;}
  const fileIds=new WeakMap();let nextFileId=0;
  function fingerprint(value=book){return JSON.stringify(value,(key,value)=>{
    if(!(value instanceof Blob))return value;if(!fileIds.has(value))fileIds.set(value,++nextFileId);return `file:${fileIds.get(value)}`;
  });}
  function baseline(){commit();last=fingerprint();}
  function changed(){
    if(!state.collageLayout)return;commit();const now=fingerprint();
    if(now!==last){if(last)history.push({book:E.copy(savedBook),selected});history=history.slice(-50);future=[];last=now;savedBook=E.copy(book);}
    app.save();buttons();renderPages();
  }
  let savedBook=E.copy(book);
  function refresh(){app.sync();app.slots();app.preview();renderSelection();}
  function clearCandidates(){candidates=[];$('cs-candidates')?.replaceChildren();}
  function loadPage(index){
    clearCandidates();gesture=null;pointers.clear();
    book.index=index;mergeFrom=null;const p=book.pages[index];if(!p)return;
    state.collageLayout=E.copy(p.layout);state.collageCells=E.copy(p.cells);state.collageStyle=E.copy(p.style);
    $('collage-title-input').value=p.title||'';$('collage-subtitle-input').value=p.subtitle||'';
    $('collage-layout-name').textContent=p.layout.name||'拼图工作台';selected=0;refresh();renderPages();buttons();
  }
  function opened(resume=false){
    selected=0;mergeFrom=null;clearCandidates();gesture=null;pointers.clear();geometry=null;
    if(resume&&book.pages.length){loadPage(book.index);}else{book={pages:[snapshot()],index:0};}
    picked=new Set(state.jobs.map(j=>j.id));renderLibrary();history=[];future=[];baseline();savedBook=E.copy(book);renderTemplates();renderPages();buttons();
  }
  function restore(value,show=false){
    abort=true;clearCandidates();gesture=null;pointers.clear();++thumbsVersion;$('cs-pages')?.replaceChildren();
    const preview=$('collage-canvas');if(preview)preview.getContext('2d').clearRect(0,0,preview.width,preview.height);
    history=[];future=[];geometry=null;
    book=value?E.copy(E.validate(value)):{pages:[],index:0};
    if(show&&book.pages.length){picked=new Set(state.jobs.map(j=>j.id));renderLibrary();state.collageMode=true;$('collage-overlay').hidden=false;loadPage(book.index);}
    baseline();savedBook=E.copy(book);
  }
  function sessionBook(){
    const value=exportBook();if(!value)return null;
    value.pages.forEach(p=>p.cells.forEach(c=>{c.jobId=state.jobs.find(j=>j.file===c.file)?.id||null;c.file=null;}));return value;
  }
  function restoreSession(value){const book=E.copy(value);book.pages.forEach(p=>p.cells.forEach(c=>{c.file=state.jobs.find(j=>j.id===c.jobId)?.file||null;}));restore(book);}
  function closed(){changed();app.flush();abort=true;clearCandidates();gesture=null;pointers.clear();geometry=null;++thumbsVersion;}
  function undo(redo=false){
    const from=redo?future:history,to=redo?history:future;if(!from.length)return;
    commit();to.push({book:E.copy(book),selected});const entry=from.pop();book=entry.book;loadPage(book.index);selected=entry.selected;baseline();savedBook=E.copy(book);app.save();buttons();
  }
  function buttons(){
    $('cs-undo').disabled=!history.length;$('cs-redo').disabled=!future.length;
    $('cs-page-delete').disabled=book.pages.length<2;$('cs-page-prev').disabled=book.index===0;$('cs-page-next').disabled=book.index===book.pages.length-1;
    $('cs-lock').textContent=state.collageCells[selected]?.locked?'解锁格子':'锁定格子';
    $('cs-hero').textContent=state.collageCells[selected]?.hero?'取消主图':'设为主图';
  }
  function status(message){$('cs-status').textContent=message;}
  async function task(fn){
    if(busy)return;busy=true;abort=false;$('cs-stop').hidden=false;
    document.querySelectorAll('[data-cs-task]').forEach(b=>b.disabled=true);
    try{await fn();if(!abort)status('已完成');}catch(e){status(e.name==='AbortError'?'已取消':e.message);}
    finally{busy=false;$('cs-stop').hidden=true;document.querySelectorAll('[data-cs-task]').forEach(b=>b.disabled=false);}
  }
  function check(){if(abort)throw new DOMException('取消','AbortError');}
  async function aspect(file){if(!dimensions.has(file)){const source=await CanvasRenderer.loadPreviewSource(file);dimensions.set(file,source.width/source.height);}return dimensions.get(file);}
  function libraryCells(){return state.jobs.filter(j=>picked.has(j.id)).map(j=>{
    const existing=state.collageCells.find(c=>c.file===j.file);return existing?E.copy(existing):{file:j.file,cropRect:null};
  });}
  function renderLibrary(){
    const root=$('cs-library');root.replaceChildren();
    state.jobs.forEach(j=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=picked.has(j.id);input.setAttribute('aria-label',`参与排版 ${j.file.name}`);
      input.onchange=()=>{input.checked?picked.add(j.id):picked.delete(j.id);$('cs-photo-count').textContent=`已选 ${picked.size} / ${state.jobs.length}`;};
      const img=document.createElement('img');img.src=j.thumbUrl||'';img.alt='';const span=document.createElement('span');span.textContent=j.file.name;label.title=j.file.name;label.append(input,img,span);root.append(label);});
    $('cs-photo-count').textContent=`已选 ${picked.size} / ${state.jobs.length}`;
  }
  function applyLayout(layout,cells=null){
    mergeFrom=null;const old=state.collageCells;
    state.collageLayout=E.copy(layout);
    state.collageCells=layout.cells.map((_,i)=>E.copy(cells?.[i]||old[i]||{file:null,cropRect:null}));
    state.collageStyle.canvasRatio='auto';selected=Math.min(selected,state.collageCells.length-1);
    $('collage-layout-name').textContent=layout.name;refresh();changed();
  }
  async function generate(){
    const cells=libraryCells();if(!cells.length)throw new Error('请先在左侧选择照片');
    const seed=++candidateSeed;
    if(seed>1){const free=cells.filter(c=>!c.locked&&!c.hero),shift=(seed-1)%Math.max(1,free.length);free.push(...free.splice(0,shift));let i=0;cells.forEach((c,k)=>{if(!c.locked&&!c.hero)cells[k]=free[i++];});}
    const mode=$('cs-layout-mode').value,ratios=await Promise.all(cells.map(c=>aspect(c.file)));check();
    const r=Number(state.collageStyle.canvasRatio)||state.collageLayout.outputRatio||1;
    const options=E.candidates(ratios,mode,r,seed);
    const locked=state.collageCells.map((c,i)=>c.locked?i:-1).filter(i=>i>=0);
    candidates=options.map(l=>{
      let mapped=E.copy(cells);
      if(mode==='hero'){const hero=mapped.findIndex(c=>c.hero);if(hero>0)[mapped[0],mapped[hero]]=[mapped[hero],mapped[0]];}
      if(locked.length){
        // Keep locked rectangles and repartition each remaining rectangle locally.
        const fixed=locked.map(i=>E.copy(state.collageLayout.cells[i]));
        const unlocked=state.collageLayout.cells.map((c,i)=>({c,i})).filter(v=>!locked.includes(v.i));
        if(!unlocked.length)throw new Error('全部格子已锁定，请先解锁');
        const files=mapped.filter(c=>!locked.some(i=>state.collageCells[i].file===c.file));
        const rects=[],data=[];
        for(let k=0;k<unlocked.length;k++){
          const group=files.slice(Math.floor(k*files.length/unlocked.length),Math.floor((k+1)*files.length/unlocked.length));if(!group.length)continue;
          const box=unlocked[k].c,sub=E.grid(group.length,box.w/box.h,options.indexOf(l)%3);
          sub.cells.forEach((c,i)=>{rects.push({x:box.x+c.x*box.w,y:box.y+c.y*box.h,w:c.w*box.w,h:c.h*box.h});data.push(group[i]);});
        }
        fixed.forEach((rect,i)=>{rects.push(rect);data.push(E.copy(state.collageCells[locked[i]]));});
        l={...E.copy(state.collageLayout),name:l.name,cells:rects,cellCount:rects.length};mapped=data;
      }
      if(l.cellCount>72)throw new Error('锁定格子与所选照片合计超过 72 格，请减少照片');
      mapped.forEach(c=>{if(!c.locked)c.fit=mode==='preserve'?'contain':'cover';});
      return {layout:l,cells:mapped};
    });
    const root=$('cs-candidates');root.replaceChildren();
    for(let i=0;i<candidates.length;i++){
      check();const item=candidates[i],button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`应用排版方案 ${i+1}`);
      const canvas=await CollageRenderer.renderPreview(item.layout,item.cells,{}, {...state.collageStyle,canvasRatio:'auto'},220);check();
      const label=document.createElement('span');label.textContent=item.layout.name;button.append(canvas,label);
      button.onclick=()=>{applyLayout(item.layout,item.cells);root.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));};root.append(button);
    }status('点击缩略图应用方案；当前编辑保留到应用时');
  }
  async function stitch(mode){
    const cells=libraryCells();if(!cells.length)throw new Error('请先选择照片');
    const ratios=await Promise.all(cells.map(c=>aspect(c.file)));check();
    const cols=mode==='gallery'?Number($('cs-columns').value):1;
    cells.forEach(c=>c.fit='contain');applyLayout(E.gallery(ratios,cols,mode==='horizontal'),cells);
  }
  function cellAction(fn){const cell=state.collageCells[selected];if(!cell)return;fn(cell);refresh();changed();buttons();}
  function split(axis){
    const cell=state.collageLayout.cells[selected];if(!cell)return;if(state.collageCells.length>=72)return status('每页最多 72 个格子');
    if(state.collageCells[selected]?.locked)return status('请先解锁格子');
    const a=E.copy(cell),b=E.copy(cell),key=axis==='x'?'w':'h';a[key]/=2;b[key]/=2;b[axis]+=a[key];
    state.collageLayout.cells.splice(selected,1,a,b);state.collageCells.splice(selected+1,0,{file:null,cropRect:null});state.collageLayout.cellCount++;refresh();changed();
  }
  let mergeFrom=null;
  function select(index){
    if(mergeFrom!==null){
      const a=mergeFrom;mergeFrom=null;
      if(a===index)return status('请选择另一个相邻格子');
      if(state.collageCells[a]?.locked||state.collageCells[index]?.locked)return status('请先解锁格子');
      const merged=E.merge(state.collageLayout.cells[a],state.collageLayout.cells[index]);
      if(!merged)return status('只能合并有完整共同边的相邻格子');
      state.collageLayout.cells[a]=merged;state.collageLayout.cells.splice(index,1);state.collageCells.splice(index,1);state.collageLayout.cellCount--;selected=a-(index<a?1:0);refresh();changed();
    }else{selected=index;renderSelection();buttons();drawHandles();}
  }
  function renderSelection(){
    const cell=state.collageCells[selected];$('cs-selection').textContent=`格子 ${selected+1}${cell?.file?' · '+cell.file.name:' · 未分配'}`;
    $('cs-caption').value=cell?.caption||'';$('cs-fit').value=cell?.fit||'cover';
    $('cs-caption-color').value=state.collageStyle.captionColor||'#333333';$('cs-caption-font').value=state.collageStyle.captionFont||'system-ui';
    $('cs-title-font').value=state.collageStyle.titleFont||state.collageLayout.infoBar?.titleFont||'Songti SC';$('cs-subtitle-font').value=state.collageStyle.subtitleFont||'system-ui';$('cs-title-color').value=state.collageStyle.titleColor||'#1a1a1a';
    document.querySelectorAll('.collage-slot-card').forEach((el,i)=>el.classList.toggle('cs-selected',i===selected));buttons();
  }
  function renderTemplates(){
    $('cs-template').replaceChildren(new Option('选择已保存的版式',''),...templates.map((t,i)=>new Option(t.name,String(i))));
    $('cs-existing-layout').replaceChildren(new Option('切换内置布局（保留照片）',''),...COLLAGE_LAYOUTS.map((l,i)=>new Option(l.name,String(i))));
  }
  function saveTemplate(){
    const name=$('cs-template-name').value.trim();if(!name)return status('请填写版式名称');
    const p=snapshot();p.cells=p.cells.map(c=>({file:null,cropRect:null,fit:c.fit,caption:c.caption||'',hero:!!c.hero,frameStyle:E.copy(c.frame?.preset||c.frameStyle||null)}));
    const t={name,page:p},index=templates.findIndex(t=>t.name===name);
    if(index>=0)templates[index]=t;else if(templates.length<30)templates.push(t);else return status('最多保存 30 个版式');
    try{localStorage.setItem('pf_collage_templates',JSON.stringify(templates));renderTemplates();status('版式已保存，不含照片');}catch{status('版式保存失败，浏览器存储空间不足');}
  }
  function applyTemplate(){const t=templates[Number($('cs-template').value)];if(!t||$('cs-template').value==='')return;
    state.collageStyle=E.copy(t.page.style);$('collage-title-input').value=t.page.title;$('collage-subtitle-input').value=t.page.subtitle;
    const cells=t.page.cells.map((c,i)=>{
      const old=state.collageCells[i]||{},cell={...E.copy(c),file:old.file||null,cropRect:E.copy(old.cropRect||null)};
      if(c.frameStyle&&cell.file){const job=E.copy(state.jobs.find(j=>j.file===cell.file));if(job){delete job.file;delete job.thumbUrl;cell.frame={preset:E.copy(c.frameStyle),job};}}
      return cell;
    });applyLayout(t.page.layout,cells);
  }
  function photoStyle(kind){
    const cells=state.collageCells,shared=kind==='current'?null:kind;
    cells.forEach(c=>{
      if(!c.file)return;
      const j=state.jobs.find(j=>j.file===c.file);if(!j)return;
      if(kind==='none'){delete c.frame;return;}
      const preset=E.copy(app.merged(j));
      if(kind==='film'){preset.border.film=FilmFrame.defaults('custom','135');}
      if(kind==='white'){delete preset.border.film;Object.assign(preset.border,{color:'#ffffff',top:.05,bottom:.05,left:.05,right:.05});}
      const job=E.copy(j);delete job.file;delete job.thumbUrl;
      c.frame={preset,job};c.fit='contain';
    });
    if(shared==='film'){state.collageStyle.color='#171717';state.collageStyle.captionColor='#dddddd';}
    refresh();changed();
  }
  function captions(){
    const tpl=$('cs-caption-template').value;
    state.collageCells.forEach((c,i)=>{const j=state.jobs.find(j=>j.file===c.file);if(!j)return;c.caption=tpl==='filename'?j.file.name.replace(/\.[^.]+$/,''):tpl==='number'?String(i+1).padStart(2,'0'):CanvasRenderer.resolveTemplate('{camera}  {lens}  {date}',j);});refresh();changed();
  }
  function pageOperation(op){
    commit();if(op==='add'||op==='duplicate'){
      if(book.pages.length>=72)return status('最多 72 页');
      const p=E.copy(book.pages[book.index]);if(op==='add'){p.cells=p.cells.map(()=>({file:null,cropRect:null}));p.title='';p.subtitle='';}
      book.pages.splice(book.index+1,0,p);loadPage(book.index+1);
    }else if(op==='delete'&&book.pages.length>1){book.pages.splice(book.index,1);loadPage(Math.min(book.index,book.pages.length-1));}
    else if(op==='prev'||op==='next'){
      const to=book.index+(op==='prev'?-1:1);if(to<0||to>=book.pages.length)return;
      [book.pages[book.index],book.pages[to]]=[book.pages[to],book.pages[book.index]];loadPage(to);
    }changed();
  }
  async function paginate(){
    const cells=libraryCells();if(!cells.length)throw new Error('请先选择照片');
    const size=Number($('cs-per-page').value),pages=[],style=E.copy(state.collageStyle),ratio=Number(style.canvasRatio)||state.collageLayout.outputRatio||1;
    const cover=$('cs-bookends').checked;
    if(cover)pages.push({layout:E.layout([{x:0,y:0,w:1,h:1}],ratio,'封面'),cells:[cells.shift()],style:E.copy(style),title:$('collage-title-input').value,subtitle:$('collage-subtitle-input').value});
    let ending=null;if(cover&&cells.length>1)ending=cells.pop();
    for(let i=0;i<cells.length;i+=size){const group=cells.slice(i,i+size);pages.push({layout:E.grid(group.length,ratio,1),cells:group,style:E.copy(style),title:'',subtitle:''});}
    if(ending)pages.push({layout:E.layout([{x:0,y:0,w:1,h:1}],ratio,'结束页'),cells:[ending],style:E.copy(style),title:'',subtitle:''});
    check();book={pages,index:0};loadPage(0);changed();
  }
  function renderPages(){
    const version=++thumbsVersion,root=$('cs-pages');
    // Reuse the thumbnail DOM while editing so horizontal scrolling stays stable.
    while(root.children.length>book.pages.length)root.lastChild.remove();
    book.pages.forEach((page,index)=>{
      let button=root.children[index];if(!button){button=document.createElement('button');button.type='button';button.append(document.createElement('canvas'),document.createElement('span'));root.append(button);}
      button.classList.toggle('active',index===book.index);button.setAttribute('aria-label',`第 ${index+1} 页`);button.lastChild.textContent=`${index+1} · ${page.layout.name||'拼图'}`;
      button.onclick=()=>{commit();loadPage(index);app.save();};
      button.draggable=true;button.ondragstart=e=>e.dataTransfer.setData('text/collage-page',String(index));button.ondragover=e=>e.preventDefault();
      button.ondrop=e=>{e.preventDefault();const raw=e.dataTransfer.getData('text/collage-page');if(raw==='')return;const from=Number(raw);if(!Number.isInteger(from)||from<0||from>=book.pages.length)return;commit();const [p]=book.pages.splice(from,1);book.pages.splice(index,0,p);loadPage(index);changed();};
      // Keep unchanged pages out of the render queue during crop/zoom edits.
    });
    (async()=>{for(let i=0;i<book.pages.length;i++){
      if(version!==thumbsVersion)return;const p=book.pages[i];
      const button=root.children[i],signature=fingerprint(p);if(button?._previewSignature===signature)continue;
      try{const c=await CollageRenderer.renderPreview(p.layout,p.cells,{titleTemplate:p.title,subtitleTemplate:p.subtitle},p.style,100);if(version!==thumbsVersion){c.width=c.height=0;return;}const target=button?.firstChild;if(target){target.width=c.width;target.height=c.height;target.getContext('2d').drawImage(c,0,0);button._previewSignature=signature;}c.width=c.height=0;}catch{}
    }})();
  }
  function rendered(canvas){geometry=canvas.collageGeometry;drawHandles();}
  function canvasPoint(e){const c=$('collage-canvas'),r=c.getBoundingClientRect();return {x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};}
  function hit(p){if(!geometry)return -1;const a=geometry.area;return state.collageLayout.cells.findIndex(c=>p.x>=a.x+c.x*a.w&&p.x<=a.x+(c.x+c.w)*a.w&&p.y>=a.y+c.y*a.h&&p.y<=a.y+(c.y+c.h)*a.h);}
  function drawHandles(){
    if(!geometry||!state.collageLayout)return;
    const c=$('collage-canvas'),svg=$('cs-handles'),r=c.getBoundingClientRect(),parent=$('collage-preview-wrapper').getBoundingClientRect();
    if(!r.width||!r.height)return;
    Object.assign(svg.style,{left:`${r.left-parent.left}px`,top:`${r.top-parent.top}px`,width:`${r.width}px`,height:`${r.height}px`});svg.setAttribute('viewBox',`0 0 ${c.width} ${c.height}`);svg.replaceChildren();
    const a=geometry.area,cell=state.collageLayout.cells[selected];
    function shape(tag,attrs){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));svg.append(el);}
    if(cell)shape('rect',{x:a.x+cell.x*a.w,y:a.y+cell.y*a.h,width:cell.w*a.w,height:cell.h*a.h,fill:'none',stroke:'var(--accent-warm)','stroke-width':2*c.width/r.width});
    E.dividers(state.collageLayout.cells).forEach(line=>{
      const vertical=line.axis==='x';shape('line',{x1:a.x+(vertical?line.p:line.start)*a.w,x2:a.x+(vertical?line.p:line.end)*a.w,y1:a.y+(vertical?line.start:line.p)*a.h,y2:a.y+(vertical?line.end:line.p)*a.h,stroke:'var(--accent-warm)','stroke-opacity':'.6','stroke-width':1*c.width/r.width,'stroke-dasharray':`${4*c.width/r.width} ${4*c.width/r.width}`});
    });
  }
  function nearestDivider(p){
    const a=geometry.area,c=$('collage-canvas'),r=c.getBoundingClientRect(),threshold=9*c.width/r.width;
    return E.dividers(state.collageLayout.cells).find(l=>l.axis==='x'?Math.abs(p.x-a.x-l.p*a.w)<threshold&&p.y>=a.y+l.start*a.h&&p.y<=a.y+l.end*a.h:Math.abs(p.y-a.y-l.p*a.h)<threshold&&p.x>=a.x+l.start*a.w&&p.x<=a.x+l.end*a.w);
  }
  function setupGestures(){
    const c=$('collage-canvas');
    c.addEventListener('pointerdown',e=>{
      if(!geometry||busy)return;const p=canvasPoint(e);pointers.set(e.pointerId,p);c.setPointerCapture(e.pointerId);
      if(pointers.size===2){const values=[...pointers.values()];const g=geometry.cells[selected];if(g){gesture={type:'pinch',index:selected,rect:E.copy(g.crop),g:E.copy(g),distance:Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y)};}return;}
      const divider=nearestDivider(p),index=hit(p);
      if(divider&&$('cs-edit-mode').value==='compose'){
        if([...divider.before,...divider.after].some(i=>state.collageCells[i].locked))return status('请先解锁分隔线相邻格子');
        gesture={type:'divider',line:divider,cells:E.copy(state.collageLayout.cells)};return;
      }
      if(index<0)return;select(index);const g=geometry.cells[index];
      if(state.collageCells[index].locked)return;
      gesture={type:$('cs-edit-mode').value==='swap'?'swap':'pan',index,start:p,g:E.copy(g),rect:g?E.copy(g.crop):null};
    });
    c.addEventListener('pointermove',e=>{
      const p=canvasPoint(e);if(pointers.has(e.pointerId))pointers.set(e.pointerId,p);
      if(!gesture||!pointers.has(e.pointerId))return;
      if(gesture.type==='divider'){
        state.collageLayout.cells=E.copy(gesture.cells);const a=geometry.area;E.moveDivider(state.collageLayout.cells,gesture.line,gesture.line.axis==='x'?(p.x-a.x)/a.w:(p.y-a.y)/a.h);app.preview(true);drawHandles();
      }else if(gesture.type==='pan'&&gesture.rect){
        const cell=state.collageCells[gesture.index];if(cell.fit==='contain'||cell.frame)return;
        const g=gesture.g,r=gesture.rect;cell.cropRect={...r,sx:E.clamp(r.sx-(p.x-gesture.start.x)*r.sw/g.w,0,g.srcW-r.sw),sy:E.clamp(r.sy-(p.y-gesture.start.y)*r.sh/g.h,0,g.srcH-r.sh)};app.preview(true);
      }else if(gesture.type==='pinch'&&pointers.size===2){
        const values=[...pointers.values()],distance=Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);zoom(gesture.index,gesture.distance/Math.max(1,distance),gesture.rect,gesture.g);app.preview(true);
      }
    });
    function end(e){
      if(!pointers.has(e.pointerId))return;
      if(gesture?.type==='swap'&&e.type!=='pointercancel'){
        const target=hit(canvasPoint(e)),from=gesture.index;if(target>=0&&target!==from&&!state.collageCells[target].locked){[state.collageCells[from],state.collageCells[target]]=[state.collageCells[target],state.collageCells[from]];selected=target;}
      }
      pointers.delete(e.pointerId);if(pointers.size===0){gesture=null;refresh();changed();}
    }
    c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
    let wheelTimer;
    c.addEventListener('wheel',e=>{
      if(!geometry)return;e.preventDefault();const index=hit(canvasPoint(e));if(index<0)return;if(index!==selected)select(index);
      zoom(index,Math.exp(E.clamp(e.deltaY,-150,150)*.002));app.preview(true);clearTimeout(wheelTimer);wheelTimer=setTimeout(changed,180);
    },{passive:false});
    c.addEventListener('dblclick',e=>{const index=hit(canvasPoint(e));if(index>=0){select(index);app.pick(index);}});
    new ResizeObserver(drawHandles).observe($('collage-preview-wrapper'));
  }
  function zoom(index,factor,base=null,given=null){
    const cell=state.collageCells[index],g=given||geometry.cells[index];if(!cell||!g||cell.locked||cell.fit==='contain'||cell.frame)return;
    const r=base||cell.cropRect||g.crop,max=E.crop(g.srcW,g.srcH,g.w/g.h),w=E.clamp(r.sw*factor,max.sw/12,max.sw),h=w/(g.w/g.h);
    cell.cropRect={sx:E.clamp(r.sx+r.sw/2-w/2,0,g.srcW-w),sy:E.clamp(r.sy+r.sh/2-h/2,0,g.srcH-h),sw:w,sh:h};
  }
  async function renderPage(p,edge){check();return CollageRenderer.render(p.layout,p.cells,{titleTemplate:p.title,subtitleTemplate:p.subtitle},edge,p.style);}
  async function blob(c,mime='image/jpeg'){const out=await new Promise(resolve=>c.toBlob(resolve,mime,(state.exportQuality||95)/100));if(!out)throw new Error('图片尺寸过大，无法编码，请降低导出尺寸');return out;}
  function download(data,name){const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  async function exportPages(strip=false){
    commit();const pages=E.copy(book.pages);if(!pages.some(p=>p.cells.some(c=>c.file)))throw new Error('请先分配照片');
    const edge=Math.min(12000,Math.max(320,Number($('cs-export-edge').value)||3000)),mime=state.exportFormat==='png'?'image/png':'image/jpeg',ext=mime==='image/png'?'png':'jpg';
    if(strip){
      const ratio=Number(pages[0].style.canvasRatio)||pages[0].layout.outputRatio;
      if(pages.some(p=>Math.abs((Number(p.style.canvasRatio)||p.layout.outputRatio)-ratio)>.001))throw new Error('连续长卷需要每页比例相同，请先统一画布比例');
      const width=Math.round(ratio>=1?edge:edge*ratio),height=Math.round(ratio>=1?edge/ratio:edge);
      if(width*pages.length>30000||width*height*pages.length>64000000)throw new Error('连续长卷尺寸过大，请降低长边尺寸或减少页面');
      const target=document.createElement('canvas');target.width=width*pages.length;target.height=height;
      for(let i=0;i<pages.length;i++){check();status(`拼接 ${i+1} / ${pages.length}`);const c=await renderPage(pages[i],edge);target.getContext('2d').drawImage(c,i*width,0,width,height);c.width=c.height=0;}
      const out=await blob(target,mime);check();download(out,`PhotoFrame-连续长卷.${ext}`);target.width=target.height=0;
    }else{
      const zip=new JSZip();for(let i=0;i<pages.length;i++){
        check();status(`导出 ${i+1} / ${pages.length}`);const c=await renderPage(pages[i],edge);const out=await blob(c,mime);check();zip.file(`${String(i+1).padStart(3,'0')}.${ext}`,out);c.width=c.height=0;
      }
      const archive=await zip.generateAsync({type:'blob'});check();download(archive,'PhotoFrame-多页作品.zip');
    }
  }
  function setup(adapter){
    app=adapter;state=app.state;
    $('btn-collage-cancel').textContent='返回编辑';
    const toolbar=document.createElement('div');toolbar.className='cs-toolbar';toolbar.innerHTML=`
      <div class="cs-tool-group"><button id="cs-undo" type="button">撤销</button><button id="cs-redo" type="button">重做</button></div>
      <label>操作<select id="cs-edit-mode"><option value="compose">构图 / 分隔线</option><option value="swap">交换照片</option></select></label>
      <span id="cs-selection"></span><span id="cs-status" role="status" aria-live="polite"></span><button id="cs-stop" type="button" hidden>停止</button>`;
    $('collage-overlay').insertBefore(toolbar,document.querySelector('.collage-body'));
    const nav=document.createElement('nav');nav.className='cs-panel-nav';nav.setAttribute('aria-label','拼图编辑面板');
    const body=document.querySelector('.collage-body');
    [['画布','.collage-preview-panel'],['照片','.collage-slots-panel'],['排版与样式','.collage-inspector']].forEach(([label,selector])=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{const panel=body.querySelector(selector);body.scrollTo({left:body.scrollLeft+panel.getBoundingClientRect().left-body.getBoundingClientRect().left,behavior:'smooth'});};nav.append(button);});
    $('collage-overlay').insertBefore(nav,body);
    const library=document.createElement('details');library.className='cs-library-card';library.open=true;library.innerHTML=`<summary>参与排版的照片 <small id="cs-photo-count"></small></summary><div class="cs-tool-group"><button id="cs-upload" type="button">添加照片</button><input id="cs-upload-files" type="file" accept="image/*,.heic,.heif,.tif,.tiff" multiple hidden><button id="cs-all" type="button">全选</button><button id="cs-none" type="button">清空选择</button></div><div id="cs-library"></div>`;
    $('collage-slots-panel').insertBefore(library,$('collage-slot-list'));
    $('cs-upload').onclick=()=>$('cs-upload-files').click();
    $('cs-upload-files').onchange=async e=>{
      const files=Array.from(e.target.files);e.target.value='';if(!files.length)return;
      const before=new Set(state.jobs.map(j=>j.id));$('cs-upload').disabled=true;status('正在导入照片…');
      try{await app.importFiles(files);await app.ready();state.jobs.filter(j=>!before.has(j.id)).forEach(j=>picked.add(j.id));renderLibrary();status('照片已添加，点击格子可更换照片');}catch(error){status(error.message);}finally{$('cs-upload').disabled=false;}
    };
    const inspector=document.querySelector('.collage-inspector'),controls=document.createElement('div');controls.className='cs-controls';controls.innerHTML=`
      <details class="collage-control-card" open><summary>自动排版与拼接</summary>
        <label>排版倾向<select id="cs-layout-mode"><option value="preserve">尽量保留完整照片</option><option value="cover">裁切铺满画布</option><option value="hero">突出主图</option></select></label>
        <button id="cs-generate" type="button" data-cs-task>生成 / 换一批方案</button><div id="cs-candidates"></div>
        <div class="cs-button-grid"><button id="cs-vertical" type="button" data-cs-task>纵向长图</button><button id="cs-horizontal" type="button" data-cs-task>横向拼接</button></div>
        <label>画廊每行照片<select id="cs-columns"><option>2</option><option selected>3</option><option>4</option><option>5</option><option>6</option></select></label><button id="cs-gallery" type="button" data-cs-task>生成多行画廊</button>
        <select id="cs-existing-layout" aria-label="内置拼图布局"></select><small>切换布局保留照片与文字；多余照片保留在照片库。</small>
      </details>
      <details class="collage-control-card" open><summary>当前格子</summary>
        <div class="cs-button-grid"><button id="cs-lock" type="button">锁定格子</button><button id="cs-hero" type="button">设为主图</button><button id="cs-split-x" type="button">左右分格</button><button id="cs-split-y" type="button">上下分格</button><button id="cs-merge" type="button">合并相邻格</button><button id="cs-reset-crop" type="button">重置构图</button><button id="cs-pick" type="button">更换照片</button></div>
        <label>适配<select id="cs-fit"><option value="cover">裁切铺满</option><option value="contain">完整显示</option></select></label><label>照片说明<input id="cs-caption" maxlength="500" placeholder="跟随照片移动"></label>
      </details>
      <details class="collage-control-card"><summary>摄影组图与版式库</summary>
        <label>逐图边框<select id="cs-photo-style"><option value="none">原始照片</option><option value="current">继承各照片当前编辑</option><option value="white">统一白边</option><option value="film">统一胶片边框</option></select></label><button id="cs-apply-photo-style" type="button">应用到本页照片</button>
        <label>批量图注<select id="cs-caption-template"><option value="filename">文件名</option><option value="number">顺序编号</option><option value="exif">相机、镜头与日期</option></select></label><button id="cs-captions" type="button">生成本页图注</button>
        <label>标题字体<select id="cs-title-font"></select></label><label>副标题字体<select id="cs-subtitle-font"></select></label><label>标题颜色<input id="cs-title-color" type="color" value="#1a1a1a"></label><label>图注字体<select id="cs-caption-font"></select></label><label>图注颜色<input id="cs-caption-color" type="color" value="#333333"></label>
        <label>版式名称<input id="cs-template-name" maxlength="60" placeholder="例如：旅行三联"></label><button id="cs-template-save" type="button">保存当前版式</button><select id="cs-template" aria-label="已保存版式"></select><div class="cs-button-grid"><button id="cs-template-apply" type="button">使用版式</button><button id="cs-template-delete" type="button">删除版式</button></div>
      </details>
      <details class="collage-control-card"><summary>多页作品与导出</summary>
        <label>每页照片<select id="cs-per-page"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>6</option><option>9</option></select></label>
        <label class="cs-check"><input type="checkbox" id="cs-bookends">自动添加封面与结束页</label><button id="cs-paginate" type="button" data-cs-task>用所选照片重新分页</button><small>重新分页会替换所有页面，可撤销。</small>
        <button id="cs-share-style" type="button">将本页样式应用到所有页</button><label>导出长边像素<input id="cs-export-edge" type="number" min="320" max="12000" value="3000"></label><div class="cs-button-grid"><button id="cs-export" type="button" data-cs-task>全部页 ZIP</button><button id="cs-strip" type="button" data-cs-task>连续长卷</button></div><button id="cs-carousel" type="button">将本页布局加入连续轮播</button>
      </details>`;
    inspector.insertBefore(controls,inspector.children[1]);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='cs-handles';svg.setAttribute('aria-hidden','true');$('collage-preview-wrapper').append(svg);
    const pages=document.createElement('div');pages.className='cs-page-bar';pages.innerHTML=`<div class="cs-page-actions"><button id="cs-page-add" type="button">＋ 页面</button><button id="cs-page-copy" type="button">复制页</button><button id="cs-page-delete" type="button">删除页</button><button id="cs-page-prev" type="button" aria-label="页面前移">←</button><button id="cs-page-next" type="button" aria-label="页面后移">→</button></div><div id="cs-pages" aria-label="作品页面"></div>`;
    $('collage-overlay').insertBefore(pages,document.querySelector('.collage-hint'));
    document.querySelector('.collage-hint').textContent='拖动照片调整构图 · 拖动虚线调整格子 · 滚轮 / 双指缩放 · 双击换图 · 页面自动保存';
    const on=(id,fn)=>$(id).onclick=fn;
    on('cs-undo',()=>undo());on('cs-redo',()=>undo(true));on('cs-stop',()=>{abort=true;});
    on('cs-all',()=>{picked=new Set(state.jobs.map(j=>j.id));renderLibrary();});on('cs-none',()=>{picked.clear();renderLibrary();});
    on('cs-generate',()=>task(generate));on('cs-vertical',()=>task(()=>stitch('vertical')));on('cs-horizontal',()=>task(()=>stitch('horizontal')));on('cs-gallery',()=>task(()=>stitch('gallery')));
    on('cs-lock',()=>cellAction(c=>c.locked=!c.locked));on('cs-hero',()=>cellAction(c=>{const next=!c.hero;state.collageCells.forEach(c=>c.hero=false);c.hero=next;}));
    on('cs-split-x',()=>split('x'));on('cs-split-y',()=>split('y'));on('cs-merge',()=>{mergeFrom=selected;status('在画布上选择要合并的相邻格子');});on('cs-reset-crop',()=>cellAction(c=>c.cropRect=null));on('cs-pick',()=>app.pick(selected));
    $('cs-fit').onchange=()=>cellAction(c=>c.fit=$('cs-fit').value);$('cs-caption').onchange=()=>cellAction(c=>c.caption=$('cs-caption').value);
    $('cs-existing-layout').onchange=()=>{const value=$('cs-existing-layout').value;if(value!=='')applyLayout(COLLAGE_LAYOUTS[Number(value)]);};
    on('cs-apply-photo-style',()=>photoStyle($('cs-photo-style').value));on('cs-captions',captions);
    FontLibrary.populate($('cs-caption-font'),'system-ui');
    FontLibrary.populate($('cs-title-font'),'Songti SC');FontLibrary.populate($('cs-subtitle-font'),'system-ui');
    for(const [id,key] of [['cs-title-font','titleFont'],['cs-subtitle-font','subtitleFont'],['cs-title-color','titleColor']])$(id).onchange=()=>{state.collageStyle[key]=$(id).value;refresh();changed();};
    $('cs-caption-font').onchange=()=>{state.collageStyle.captionFont=$('cs-caption-font').value;refresh();changed();};$('cs-caption-color').oninput=()=>{state.collageStyle.captionColor=$('cs-caption-color').value;app.preview();changed();};
    on('cs-template-save',saveTemplate);on('cs-template-apply',applyTemplate);on('cs-template-delete',()=>{const v=$('cs-template').value;if(v==='')return;templates.splice(Number(v),1);localStorage.setItem('pf_collage_templates',JSON.stringify(templates));renderTemplates();});
    on('cs-page-add',()=>pageOperation('add'));on('cs-page-copy',()=>pageOperation('duplicate'));on('cs-page-delete',()=>pageOperation('delete'));on('cs-page-prev',()=>pageOperation('prev'));on('cs-page-next',()=>pageOperation('next'));
    on('cs-paginate',()=>task(paginate));on('cs-share-style',()=>{commit();book.pages.forEach(p=>p.style=E.copy(state.collageStyle));changed();status('全部页面样式已统一，照片和文字保留');});
    on('cs-export',()=>task(()=>exportPages()));on('cs-strip',()=>task(()=>exportPages(true)));
    on('cs-carousel',()=>{commit();try{CreativeTools.addCollagePage(snapshot());status('已加入作品工具的连续轮播，可继续跨页排版');}catch(e){status(e.message);}});
    // Existing controls keep their behavior; capture completed edits in collage-specific history.
    $('collage-overlay').addEventListener('input',e=>{if(e.target.closest('.cs-controls,.cs-toolbar,.cs-library-card,.cs-page-bar'))return;clearTimeout(legacyTimer);legacyTimer=setTimeout(changed,350);});
    $('collage-overlay').addEventListener('click',e=>{if(e.target.closest('[id^="btn-collage"],[data-collage-align],.collage-slot-btn'))setTimeout(()=>{if(state.collageLayout)changed();},0);});
    document.addEventListener('keydown',e=>{if(e.target.closest?.('dialog[open]')||state.cropMode||state.slotCropMode||!$('photo-picker-overlay').hidden)return;if(!state.collageMode||e.target.matches('input,textarea,select'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopImmediatePropagation();undo(e.shiftKey);}},{capture:true});
    $('cs-pages').addEventListener('wheel',e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){e.preventDefault();$('cs-pages').scrollLeft+=e.deltaY;}},{passive:false});
    setupGestures();renderTemplates();
  }
  let legacyTimer;
  function restoreTemplates(value){if(!Array.isArray(value)||value.length>30)return;templates=E.copy(value);localStorage.setItem('pf_collage_templates',JSON.stringify(templates));renderTemplates();}
  const exportTemplates=()=>E.copy(templates);
  const cellRatio=index=>geometry?.cells[index]?geometry.cells[index].w/geometry.cells[index].h:null;
  return {setup,opened,closed,changed,rendered,exportBook,restore,select,sessionBook,restoreSession,restoreTemplates,exportTemplates,cellRatio};
})();
