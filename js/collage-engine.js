/** Geometry and layout generation shared by preview, hit testing and export. */
window.CollageEngine = (() => {
  const copy = value => value instanceof Blob ? value : Array.isArray(value) ? value.map(copy) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k,copy(v)])) : value;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  function layout(cells, ratio, name='自动排版') {
    return { id:'generated', name, cellCount:cells.length, outputRatio:ratio, cells, border:{top:0,bottom:0,left:0,right:0,color:'#ffffff'}, infoBar:{enabled:true}, output:{longEdge:3000,format:'jpeg',quality:95} };
  }
  // Justified rows preserve all aspect ratios, without cropping any photograph.
  function gallery(aspects, columns=3, vertical=false) {
    if (!aspects.length) return layout([],1);
    const ratios = aspects.map(a=>clamp(a,.001,1000));
    if (vertical) ratios.forEach((a,i)=>ratios[i]=1/a);
    const groups=[];
    for(let i=0;i<ratios.length;i+=columns) groups.push(ratios.slice(i,i+columns));
    const heights=groups.map(row=>1/row.reduce((a,b)=>a+b,0)), total=heights.reduce((a,b)=>a+b,0);
    const cells=[]; let y=0;
    groups.forEach((row,r)=>{let x=0;row.forEach(a=>{const w=a*heights[r];cells.push({x,y:y/total,w,h:heights[r]/total});x+=w;});y+=heights[r];});
    if(vertical) return layout(cells.map(c=>({x:c.y,y:c.x,w:c.h,h:c.w})),total,'横向拼接');
    return layout(cells,1/total,columns===1?'原比例长图':'多行画廊');
  }
  function grid(n,ratio,variant=0) {
    const cols=clamp(Math.round(Math.sqrt(n*ratio))+(variant-1),1,n), rows=Math.ceil(n/cols), cells=[];
    for(let r=0,i=0;r<rows;r++) { const count=Math.min(cols,n-i); for(let c=0;c<count;c++,i++) cells.push({x:c/count,y:r/rows,w:1/count,h:1/rows}); }
    return layout(cells,ratio,'铺满画布');
  }
  function hero(n,ratio,variant=0) {
    if(n<2)return grid(n,ratio,1);
    const p=[.56,.66,.72][variant%3], cells=[{x:0,y:0,w:p,h:1}];
    const sub=grid(n-1,ratio*(1-p),1);
    sub.cells.forEach(c=>cells.push({x:p+c.x*(1-p),y:c.y,w:c.w*(1-p),h:c.h}));
    return layout(cells,ratio,'主图与细节');
  }
  function fitted(aspects,ratio,rows) {
    // Partition consecutive photos into rows near the desired physical row ratio.
    // A dynamic program avoids a final row with just one narrow portrait.
    const n=aspects.length,target=ratio*rows,dp=Array.from({length:rows+1},()=>Array(n+1).fill(Infinity)),prev=Array.from({length:rows+1},()=>[]);
    dp[0][0]=0;
    for(let r=1;r<=rows;r++)for(let end=r;end<=n;end++) {
      let sum=0;for(let start=end-1;start>=r-1;start--){sum+=aspects[start];const score=dp[r-1][start]+Math.log(sum/target)**2;if(score<dp[r][end]){dp[r][end]=score;prev[r][end]=start;}}
    }
    const groups=[];let end=n;for(let r=rows;r>0;r--){const start=prev[r][end];groups.unshift(aspects.slice(start,end));end=start;}
    const heights=groups.map(g=>1/g.reduce((a,b)=>a+b,0)),total=heights.reduce((a,b)=>a+b,0),cells=[];let y=0;
    groups.forEach((g,r)=>{let x=0;g.forEach(a=>{const w=a*heights[r];cells.push({x,y:y/total,w,h:heights[r]/total});x+=w;});y+=heights[r];});
    return layout(cells,ratio,'按照片比例铺满');
  }
  function candidates(aspects,mode,ratio=1,seed=0) {
    const n=aspects.length;if(!n)return [];
    const choices=[];
    if(mode==='preserve') {
      const counts=[1,2,3,4,Math.max(1,Math.round(Math.sqrt(n)))];
      for(const cols of [...new Set(counts)].filter(c=>c<=n))choices.push(gallery(aspects,cols));
      choices.push(gallery(aspects,1,true));
    } else if(mode==='hero')for(let i=0;i<3;i++)choices.push(hero(n,ratio,i));
    else {const ideal=Math.max(1,Math.round(Math.sqrt(aspects.reduce((a,b)=>a+b,0)/ratio)));for(const rows of [...new Set([ideal-1,ideal,ideal+1,ideal+2].map(r=>clamp(r,1,n)))])choices.push(fitted(aspects,ratio,rows));}
    if(mode==='cover' && n>2) choices.push(hero(n,ratio,seed%3));
    return choices.map((l,i)=>({...l,id:`auto-${mode}-${seed}-${i}`,name:`${l.name} ${i+1}`}));
  }
  function crop(width,height,ratio,old=null) {
    const base=width/height>ratio?{sw:height*ratio,sh:height}:{sw:width,sh:width/ratio};
    const zoom=old?clamp(Math.min(base.sw/old.sw,base.sh/old.sh),1,12):1;
    const sw=base.sw/zoom,sh=base.sh/zoom;
    return {sx:clamp(old?old.sx+old.sw/2-sw/2:(width-sw)/2,0,width-sw),sy:clamp(old?old.sy+old.sh/2-sh/2:(height-sh)/2,0,height-sh),sw,sh};
  }
  // Return shared boundaries, including T junctions. Moving one affects every cell on the line.
  function dividers(cells) {
    const out=[];
    for(const axis of ['x','y']) {
      const size=axis==='x'?'w':'h',other=axis==='x'?'y':'x',span=axis==='x'?'h':'w',positions=[];
      cells.forEach((a,i)=>cells.forEach((b,j)=>{
        const edge=a[axis]+a[size],gap=b[axis]-edge;
        if(i!==j&&gap>=-.0001&&gap<=.012&&Math.min(a[other]+a[span],b[other]+b[span])-Math.max(a[other],b[other])>.0001){const p=(edge+b[axis])/2;if(!positions.some(v=>Math.abs(v-p)<.0001))positions.push(p);}
      }));
      for(const p of positions) {
        const before=[],after=[],offsets={};
        cells.forEach((c,i)=>{
          const edge=c[axis]+c[size];
          if(edge<=p+.0001&&p-edge<.0061){before.push(i);offsets['b'+i]=edge-p;}
          if(c[axis]>=p-.0001&&c[axis]-p<.0061){after.push(i);offsets['a'+i]=c[axis]-p;}
        });
        if(!before.length||!after.length)continue;
        const ids=[...before,...after];out.push({axis,p,before,after,offsets,start:Math.min(...ids.map(i=>cells[i][other])),end:Math.max(...ids.map(i=>cells[i][other]+cells[i][span]))});
      }
    }return out;
  }
  function moveDivider(cells,line,p) {
    const axis=line.axis,size=axis==='x'?'w':'h',offsets=line.offsets||{};
    const low=Math.max(...line.before.map(i=>cells[i][axis]+.025-(offsets['b'+i]||0))),high=Math.min(...line.after.map(i=>cells[i][axis]+cells[i][size]-.025-(offsets['a'+i]||0)));
    p=clamp(p,low,high);
    line.before.forEach(i=>cells[i][size]=p+(offsets['b'+i]||0)-cells[i][axis]);
    line.after.forEach(i=>{const end=cells[i][axis]+cells[i][size];cells[i][axis]=p+(offsets['a'+i]||0);cells[i][size]=end-cells[i][axis];});
  }
  function merge(a,b) {
    const eq=(x,y)=>Math.abs(x-y)<.0001,adj=(x,y)=>Math.abs(x-y)<.0121;
    if(eq(a.y,b.y)&&eq(a.h,b.h)&&(adj(a.x+a.w,b.x)||adj(b.x+b.w,a.x)))return {x:Math.min(a.x,b.x),y:a.y,w:Math.max(a.x+a.w,b.x+b.w)-Math.min(a.x,b.x),h:a.h};
    if(eq(a.x,b.x)&&eq(a.w,b.w)&&(adj(a.y+a.h,b.y)||adj(b.y+b.h,a.y)))return {x:a.x,y:Math.min(a.y,b.y),w:a.w,h:Math.max(a.y+a.h,b.y+b.h)-Math.min(a.y,b.y)};
    return null;
  }
  function validate(book) {
    if(!book||!Array.isArray(book.pages)||!book.pages.length||book.pages.length>72||!Number.isInteger(book.index)||book.index<0||book.index>=book.pages.length)throw new Error('拼图页面数据无效');
    for(const p of book.pages) {
      if(!p.layout||!Array.isArray(p.cells)||p.cells.length<1||p.cells.length>72||p.cells.length!==p.layout.cellCount||p.layout.cells?.length!==p.cells.length||!p.style||typeof p.style!=='object'||Array.isArray(p.style)||!Array.isArray(p.layout.cells)||!Number.isFinite(p.layout.outputRatio)||p.layout.outputRatio<=0||p.layout.outputRatio>1000)throw new Error('拼图布局无效');
      for(const c of p.layout.cells)if(![c.x,c.y,c.w,c.h].every(Number.isFinite)||c.x<0||c.y<0||c.w<=0||c.h<=0||c.x+c.w>1.001||c.y+c.h>1.001)throw new Error('拼图格子范围无效');
      for(const c of p.cells){
        if(!c||typeof c!=='object'||(c.file!==null&&!(c.file instanceof Blob)))throw new Error('拼图照片无效');
        if(c.cropRect&&(![c.cropRect.sx,c.cropRect.sy,c.cropRect.sw,c.cropRect.sh].every(Number.isFinite)||c.cropRect.sx<0||c.cropRect.sy<0||c.cropRect.sw<=0||c.cropRect.sh<=0))throw new Error('拼图构图数据无效');
        if(c.frame&&(!c.frame.preset?.border||!c.frame.preset?.infoBar||!c.frame.job))throw new Error('拼图边框数据无效');
      }
    }return book;
  }
  return {copy,clamp,layout,gallery,grid,hero,candidates,crop,dividers,moveDivider,merge,validate};
})();
