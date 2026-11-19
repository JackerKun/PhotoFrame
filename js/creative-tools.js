/** Local photo finishing workflows. No photo or font is uploaded. */
window.CreativeTools = (() => {
  'use strict';
  let app, dialog, busy = false, cancelled = false, fonts = [], fontRestore;
  let carousel = { pages: 3, width: 1080, height: 1350, color: '#f4efe4', items: [] };
  let recipes = [
    { name: '竖版发布', width: 1800, height: 2400, fit: 'contain' },
    { name: '方形封面', width: 1800, height: 1800, fit: 'contain' },
    { name: '高清存档', width: 0, height: 3000, fit: 'contain' },
  ];
  let deliverySettings = {}, recipeOffsets = {}, selectedItem = null, previewVersion = 0;
  const $ = id => document.getElementById(id);
  const clone = value => structuredClone(value);
  const id = () => crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { app.showToast('本机存储空间不足，请保存工程备份', 'warn'); } };
  const deliveryIds = ['contact-title','contact-cols','contact-rows','contact-style','contact-meta','recipe-format','recipe-limit','recipe-metadata'];
  function persist() {
    for (const key of deliveryIds) if ($(key)) deliverySettings[key] = $(key).type === 'checkbox' ? $(key).checked : $(key).value;
    write('pf_creative', { carousel, recipes, recipeOffsets, deliverySettings }); app.save();
  }
  function applyDeliverySettings() {
    for (const key of deliveryIds) if ($(key) && deliverySettings[key] !== undefined) {
      if ($(key).type === 'checkbox') $(key).checked = Boolean(deliverySettings[key]);
      else $(key).value = deliverySettings[key];
    }
  }
  function checkCancel() { if (cancelled) throw new DOMException('操作已取消，未下载部分结果', 'AbortError'); }
  function status(text) { $('creative-status').textContent = text; }
  async function run(task) {
    if (busy) return;
    busy = true; cancelled = false; status('正在准备…');
    dialog.querySelectorAll('[data-creative-page], .creative-nav, .creative-scope').forEach(el => { el.inert = true; });
    $('creative-cancel').hidden = false; $('creative-close').disabled = true;
    try { await app.ready(); await fontRestore; checkCancel(); await task(); status('已完成'); }
    catch (error) { status(error.message || '操作失败'); app.showToast(error.message || '操作失败', error.name === 'AbortError' ? 'info' : 'error'); }
    finally { busy = false; cancelled = false; dialog.querySelectorAll('[data-creative-page], .creative-nav, .creative-scope').forEach(el => { el.inert = false; }); $('creative-cancel').hidden = true; $('creative-close').disabled = false; }
  }
  function jobs() {
    const scope = $('creative-scope').value;
    const result = app.state.jobs.filter(job => scope === 'all' || (scope === 'keep' ? job.pick === 'keep' : scope === 'selected' ? app.state.selectedJobIds.has(job.id) : (job.pick || 'pending') === 'pending'));
    if (!result.length) throw new Error('当前范围没有照片，请先导入照片或调整范围');
    return result;
  }
  function requireJob() { const job = app.activeJob(); if (!job) throw new Error('请先导入并选择照片'); return job; }
  async function image(job, edge = 1600) { return CanvasRenderer.render(job.file, app.merged(job), job, edge); }
  function canvas(width, height, color) {
    const out = document.createElement('canvas'); out.width = width; out.height = height;
    if (color) { const ctx = out.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, width, height); }
    return out;
  }
  function drawFit(ctx, source, x, y, width, height, fit = 'contain', offset = { x: .5, y: .5 }) {
    const scale = (fit === 'cover' ? Math.max : Math.min)(width / source.width, height / source.height);
    const w = source.width * scale, h = source.height * scale;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    ctx.drawImage(source, x + (width - w) * offset.x, y + (height - h) * offset.y, w, h); ctx.restore();
  }
  async function downloadZip(zip, name) {
    checkCancel(); status('正在打包…');
    const blob = await zip.generateAsync({ type: 'blob' }, meta => { checkCancel(); status(`正在打包 ${Math.round(meta.percent)}%`); });
    checkCancel(); saveAs(blob, name);
  }
  function setup(adapter) {
    app = adapter;
    const saved = read('pf_creative', null);
    if (saved?.carousel?.items && Array.isArray(saved.recipes)) {
      carousel = saved.carousel; recipes = saved.recipes; recipeOffsets = saved.recipeOffsets || {}; deliverySettings = saved.deliverySettings || {};
    }
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="creative-dialog" class="creative-dialog" aria-labelledby="creative-title">
        <header class="creative-header">
          <div><span class="creative-eyebrow">PHOTOFRAME / STUDIO</span><h2 id="creative-title">作品工具<span>把照片整理成一组作品</span></h2></div>
          <button id="creative-close" class="btn creative-close" type="button" aria-label="关闭作品工具">关闭 <span aria-hidden="true">×</span></button>
        </header>
        <nav class="creative-nav" aria-label="作品工具分类">
          ${[['style','配色与签名','M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-4-4-6-9-6Z'],['pick','选片','m8 12 3 3 5-6M4 3h16v18H4z'],['project','工程','M3 7V4h6l3 3h9v13H3z'],['contact','联系表','M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18'],['recipes','多规格导出','M4 4h10v10H4zM10 18v3h11V10h-3'],['carousel','连续多页','M2 6h8v12H2zM14 6h8v12h-8zM10 12h4']].map(([key,label,path]) => `<button type="button" class="btn" data-page="${key}" aria-pressed="${key === 'style'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg><span>${label}</span></button>`).join('')}
        </nav>
        <div class="creative-scope"><label><span>处理范围</span><select id="creative-scope"><option value="all">全部照片</option><option value="keep">仅保留</option><option value="pending">仅待定</option><option value="selected">胶片条中选中的照片</option></select></label><span id="creative-count"></span></div>
        <div class="creative-body">
        <section data-creative-page="style" class="creative-style-grid">
          <article class="creative-card creative-palette-card">
            <div class="creative-card-heading"><span class="creative-step">01</span><div><h3>照片配色</h3><p>从照片里寻找颜色，为整组作品搭配留白与文字。</p></div></div>
            <div class="creative-palette-layout">
              <div class="creative-palette-source"><span class="creative-caption">照片中的颜色</span><div id="palette-swatches" class="palette-swatches" aria-label="照片主色"></div><button class="btn" id="palette-extract" data-task>提取照片配色 <span aria-hidden="true">↗</span></button></div>
              <div><div class="creative-form-grid"><label>配色方案 <select id="palette-mode"><option value="dominant">主色边框</option><option value="light">浅色留白</option><option value="dark">深色展览</option></select></label><label>批量方式 <select id="palette-batch"><option value="individual">每张照片分别取色</option><option value="shared">整组使用当前选色</option></select></label></div>
              <div class="creative-action-row"><label><input id="palette-text" type="checkbox" checked>同步文字与描边</label><button id="palette-apply" class="btn btn-primary" data-task>应用配色</button></div></div>
            </div>
          </article>
          <article class="creative-card creative-font-card"><div class="creative-card-heading"><span class="creative-step">02</span><div><h3>我的字体</h3><p>导入喜欢的字体，随工程一起保存。</p></div></div>
            <label class="btn creative-upload">＋ 导入字体<input id="creative-font-file" type="file" accept=".ttf,.otf,.woff,.woff2" hidden multiple></label><span class="creative-hint">TTF / OTF / WOFF · 单个最大 20 MB</span><ul id="creative-fonts"></ul>
          </article>
          <article class="creative-card creative-signature-card"><div class="creative-card-heading"><span class="creative-step">03</span><div><h3>签名样式</h3><p>记住当前照片的文字、字体与位置，留作下次使用。</p></div></div>
            <div class="creative-input-action"><label>保存新样式<input id="signature-name" maxlength="80" placeholder="例如：我的摄影署名"></label><button class="btn" id="signature-save" data-task>保存签名</button></div>
            <div class="creative-input-action"><label>使用已有样式<select id="signature-list"></select></label><button class="btn btn-primary" id="signature-apply" data-task>应用签名</button><button class="btn creative-danger" id="signature-delete">删除</button></div>
          </article>
        </section>
        <section data-creative-page="pick" hidden>
          <article class="creative-card"><div class="creative-card-heading"><div><h3>选片标记</h3><p>挑出想留下的照片，导出时选择“仅保留”。点击缩略图可切换当前照片。</p></div></div>
          <div class="creative-pick-toolbar"><label>胶片条筛选<select id="pick-filter"><option value="all">全部</option><option value="keep">保留</option><option value="pending">待定</option><option value="reject">排除</option></select></label>
          <div class="creative-actions">${[['keep','保留'],['pending','待定'],['reject','排除']].map(([key,label]) => `<button class="btn" data-mark="${key}">标记为${label}</button>`).join('')}</div></div>
          <div id="pick-grid" class="pick-grid"></div></article>
        </section>
        <section data-creative-page="project" hidden>
          <div class="creative-project-intro"><span class="creative-eyebrow">YOUR WORK, ALL TOGETHER</span><h3>存下整个创作现场</h3><p>原图、字体、贴图和每一次排版，都放进同一个工程。</p></div>
          <div class="creative-project-grid"><article class="creative-card"><span class="creative-step">↓</span><h3>保存工程</h3><p>包含照片编辑、预设、签名、当前拼图、多页排版与导出方案。</p><button class="btn btn-primary" id="project-save" data-task>保存 .photoframe 工程</button><span class="creative-hint">包含原图 · 仅在本机打包</span></article>
          <article class="creative-card"><span class="creative-step">↑</span><h3>继续创作</h3><p>打开以前保存的工程，或在另一台设备上接着编辑。</p><label class="btn creative-upload">选择工程文件<input id="project-file" type="file" accept=".photoframe" hidden></label><span class="creative-hint">选择后先检查内容，再打开工程</span></article></div>
          <div id="project-review" class="creative-card" hidden><p id="project-summary"></p><p>打开后将替换当前工作区，请先保存当前工程。</p><button class="btn btn-primary" id="project-open" data-task>打开已检查的工程</button></div>
        </section>
        <section data-creative-page="contact" hidden>
          <article class="creative-card"><div class="creative-card-heading"><div><h3>胶卷联系表</h3><p>把照片整理为带编号的缩略图总览，方便选片与收藏。</p></div></div>
          <div class="creative-form-grid creative-form-four"><label>标题<input id="contact-title" value="我的胶卷" maxlength="120"></label><label>样式<select id="contact-style"><option value="clean">简洁选片</option><option value="film">胶片收藏</option></select></label><label>列数<input id="contact-cols" type="number" min="2" max="8" value="6"></label><label>每页行数<input id="contact-rows" type="number" min="2" max="8" value="6"></label></div>
          <div class="creative-action-row"><label><input id="contact-meta" type="checkbox" checked>显示文件名、日期与器材</label><div class="creative-actions"><button class="btn" id="contact-preview" data-task>预览首页</button><button class="btn" id="contact-jpg" data-task>导出 JPG</button><button class="btn btn-primary" id="contact-pdf" data-task>导出 PDF</button></div></div></article>
          <div class="creative-preview-stage"><canvas id="contact-canvas" hidden class="creative-preview" aria-label="联系表预览"></canvas><span class="creative-preview-empty">预览你的联系表<span>调整布局后，点击“预览首页”</span></span></div>
        </section>
        <section data-creative-page="recipes" hidden>
          <article class="creative-card"><div class="creative-card-heading"><div><h3>导出方案</h3><p>为不同用途准备不同尺寸，一次完成整组输出。宽为 0 时按原比例输出。</p></div><button id="recipe-add" class="btn">＋ 添加方案</button></div><div id="recipe-list"></div></article>
          <article class="creative-card"><div class="creative-card-heading"><div><h3>文件与拍摄信息</h3><p>图片会重新编码并移除原始 EXIF / GPS。需要时可另附 JSON 拍摄信息。</p></div></div>
          <div class="creative-form-grid creative-form-three"><label>文件格式<select id="recipe-format"><option value="jpeg">JPEG</option><option value="png">PNG</option></select></label><label>JPEG 大小上限 · MB<input id="recipe-limit" type="number" min="0" max="50" step="0.1" value="0"><small>0 为不限，必要时会降低尺寸</small></label><label>拍摄信息附档<select id="recipe-metadata"><option value="none">不附带元数据</option><option value="camera">相机、镜头与日期（不含 GPS）</option><option value="gps">拍摄信息与 GPS</option></select></label></div></article>
          <article class="creative-card"><div class="creative-card-heading"><div><h3>检查裁切</h3><p>为当前照片调整每个方案的裁切位置。</p></div></div><div class="creative-form-grid creative-form-three"><label>预览方案<select id="recipe-preview-choice"></select></label><label>水平位置<input id="recipe-x" type="range" min="0" max="1" step="0.01" value="0.5"></label><label>垂直位置<input id="recipe-y" type="range" min="0" max="1" step="0.01" value="0.5"></label></div>
          <div class="creative-actions"><button id="recipe-preview" class="btn" data-task>预览并估算大小</button><span id="recipe-estimate" class="creative-hint"></span></div><canvas id="recipe-canvas" hidden class="creative-preview" aria-label="多规格裁切预览"></canvas></article>
          <div class="creative-page-actions"><span class="creative-hint">按方案分文件夹，统一打包下载</span><button id="recipe-export" class="btn btn-primary" data-task>导出所选方案 ZIP</button></div>
        </section>
        <section data-creative-page="carousel" hidden>
          <article class="creative-card"><div class="creative-card-heading"><div><h3>连续多页排版</h3><p>让照片与文字跨越页边界，连成一个故事。参考线只在编辑时显示。</p></div></div>
          <div class="creative-form-grid creative-form-four"><label>页数<input id="carousel-pages" type="number" min="2" max="10"></label><label>单页宽 · px<input id="carousel-width" type="number" min="320" max="2400"></label><label>单页高 · px<input id="carousel-height" type="number" min="320" max="3000"></label><label>画布背景<input id="carousel-color" type="color"></label></div>
          <div class="creative-action-row"><div class="creative-actions"><button class="btn" id="carousel-photo" data-task>＋ 当前照片</button><button class="btn" id="carousel-text">＋ 文字</button><button class="btn" id="carousel-fill" data-task>自动排版</button></div><button id="carousel-export" class="btn btn-primary" data-task>切页导出 ZIP</button></div></article>
          <div class="creative-canvas-toolbar"><div class="creative-actions"><label><input id="carousel-guides" type="checkbox" checked>参考线</label><label title="取消勾选后可拖动元素"><input id="carousel-pan" type="checkbox">滑动浏览</label></div><div class="creative-actions"><button class="btn" id="carousel-prev-page" aria-label="上一页">←</button><button class="btn" id="carousel-next-page" aria-label="下一页">→</button></div></div>
          <div class="carousel-scroll"><canvas id="carousel-canvas" aria-label="连续多页编辑画布"></canvas></div>
          <article class="creative-card"><div class="creative-action-row"><label class="creative-element-select">编辑元素<select id="carousel-items"></select></label><div class="creative-actions"><button id="carousel-back" class="btn">下移一层</button><button id="carousel-front" class="btn">上移一层</button><button id="carousel-remove" class="btn creative-danger">删除元素</button></div></div><div id="carousel-inspector" class="creative-row"></div></article>
        </section>
        </div>
        <footer><span class="creative-status-dot" aria-hidden="true"></span><p id="creative-status" role="status" aria-live="polite">所有处理均在本机完成。</p><button id="creative-cancel" class="btn" hidden>取消操作</button></footer>
      </dialog>`);
    dialog = $('creative-dialog');
    decorateFields(dialog);
    $('btn-creative-tools').onclick = () => { dialog.showModal(); renderPicks(); refreshCount(); };
    $('creative-close').onclick = () => { if (!busy) dialog.close(); };
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && ['z','y'].includes(event.key.toLowerCase()))) event.stopPropagation(); });
    dialog.addEventListener('cancel', event => { if (busy) { event.preventDefault(); cancelled = true; } });
    $('creative-cancel').onclick = () => { cancelled = true; status('正在取消，等待当前照片处理结束…'); };
    dialog.querySelectorAll('[data-page]').forEach(button => { button.onclick = () => showPage(button.dataset.page); });
    $('creative-scope').onchange = refreshCount;
    $('palette-extract').onclick = () => run(extractCurrent);
    $('palette-apply').onclick = () => run(applyPalette);
    $('creative-font-file').onchange = event => run(async () => { for (const file of event.target.files) { checkCancel(); await importFont(file); } event.target.value = ''; });
    setupSignatures(); setupPicks(); setupProject(); setupContact(); setupRecipes(); setupCarousel();
    applyDeliverySettings();
    dialog.addEventListener('change', event => { if (deliveryIds.includes(event.target.id)) persist(); });
    fontRestore = restoreFonts();
    // Contextual shortcuts keep common actions close to existing controls.
    const shortcut = (parent, label, page) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn creative-shortcut'; button.textContent = label;
      button.onclick = () => { dialog.showModal(); showPage(page); refreshCount(); }; $(parent)?.append(button);
    };
    shortcut('group-background', '从照片自动配色', 'style');
    shortcut('group-typography', '导入字体 / 我的签名', 'style');
    shortcut('tab-output', '联系表 / 多规格 / 工程', 'contact');
  }
  function decorateFields(root) {
    root.querySelectorAll('label').forEach(label => {
      if (label.classList.contains('btn')) return;
      const control = label.querySelector('input, select, textarea');
      if (!control) return;
      label.classList.add(control.type === 'checkbox' ? 'creative-check' : 'creative-field');
      const textNodes = [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (textNodes.length) {
        const caption = document.createElement('span'); caption.textContent = textNodes.map(node => node.textContent.trim()).join(' ');
        textNodes[0].replaceWith(caption); textNodes.slice(1).forEach(node => node.remove());
      }
    });
  }
  function showPage(page) {
    dialog.querySelectorAll('[data-creative-page]').forEach(section => { section.hidden = section.dataset.creativePage !== page; });
    dialog.querySelectorAll('[data-page]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.page === page)));
    $('creative-dialog').querySelector('.creative-body').scrollTop = 0;
    if (page === 'pick') renderPicks();
    if (page === 'carousel') { clearCarouselCache(); syncCarousel(); renderCarousel(); }
  }
  function refreshCount() { try { $('creative-count').textContent = `${jobs().length} 张照片`; } catch { $('creative-count').textContent = '0 张照片'; } }

  // Quantized histogram, sampled at low resolution; no full-resolution pixel copy.
  async function palette(job) {
    const source = await CanvasRenderer.loadPreviewSource(job.file);
    const tiny = canvas(64, 64); const ctx = tiny.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source.image, 0, 0, 64, 64);
    const pixels = ctx.getImageData(0, 0, 64, 64).data, histogram = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      const key = [pixels[i], pixels[i+1], pixels[i+2]].map(n => Math.min(240, Math.round(n / 32) * 32)).join(',');
      histogram.set(key, (histogram.get(key) || 0) + 1);
    }
    const chosen = [];
    for (const [key] of [...histogram].sort((a,b) => b[1]-a[1])) {
      const rgb = key.split(',').map(Number);
      if (chosen.every(other => rgb.reduce((sum,n,i) => sum + (n-other[i])**2, 0) > 2500)) chosen.push(rgb);
      if (chosen.length === 6) break;
    }
    return (chosen.length ? chosen : [[240,240,240]]).map(rgb => '#' + rgb.map(n => n.toString(16).padStart(2,'0')).join(''));
  }
  let chosenColor = '#f4efe4';
  async function extractCurrent() {
    const colors = await palette(requireJob()); chosenColor = colors[0];
    $('palette-swatches').replaceChildren(...colors.map(color => {
      const button = document.createElement('button'); button.type = 'button'; button.style.background = color;
      button.setAttribute('aria-label', `选择配色 ${color}`); button.setAttribute('aria-pressed', String(color === chosenColor)); button.title = color;
      button.onclick = () => { chosenColor = color; $('palette-swatches').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button))); };
      return button;
    }));
  }
  function themeColor(hex, mode) {
    const rgb = hex.match(/\w\w/g).map(n => parseInt(n,16));
    return '#' + rgb.map(n => Math.round(mode === 'light' ? n*.18 + 255*.82 : mode === 'dark' ? n*.2 : n).toString(16).padStart(2,'0')).join('');
  }
  function textColor(hex) {
    const rgb = hex.match(/\w\w/g).map(n => { const c = parseInt(n,16)/255; return c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4; });
    return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722 > .179 ? '#171717' : '#ffffff';
  }
  async function applyPalette() {
    const targets = jobs(), patches = [];
    for (const [i, job] of targets.entries()) {
      checkCancel(); status(`配色 ${i+1} / ${targets.length}`);
      const base = $('palette-batch').value === 'individual' ? (await palette(job))[0] : chosenColor;
      patches.push([job, themeColor(base, $('palette-mode').value)]);
    }
    checkCancel(); app.recordHistory('自动照片配色');
    for (const [job, color] of patches) {
      const film = app.merged(job).border.film;
      if (film) job.borderOverrides.film = { ...film, colorPalette: { base: color, ...($('palette-text').checked ? { ink: textColor(color), marks: textColor(color) } : {}) } };
      Object.assign(job.borderOverrides, { color, backgroundMode: 'solid' });
      if ($('palette-text').checked) { job.infoOverrides.fontColor = textColor(color); job.borderOverrides.photoStrokeColor = textColor(color); }
    }
    app.refresh();
  }
  async function loadFont(record) {
    const face = new FontFace(record.id, await record.file.arrayBuffer()); await face.load(); document.fonts.add(face);
    FontLibrary.register(record.id, record.name); return face;
  }
  async function importFont(file, family = `PF_${id().replaceAll('-','')}`) {
    if (file.size > 20 * 1024 * 1024) throw new Error('单个字体文件不能超过 20 MB');
    const record = { id: family, name: file.name.replace(/\.[^.]+$/, ''), file };
    await loadFont(record); await SessionStore.saveFont(record);
    fonts = [...fonts.filter(font => font.id !== family), record]; renderFonts();
  }
  async function restoreFonts() {
    try { fonts = await SessionStore.listFonts(); for (const font of fonts) await loadFont(font); renderFonts(); app.refresh(); }
    catch { app.showToast('部分字体恢复失败，请重新导入字体文件', 'warn'); }
  }
  function renderFonts() { $('creative-fonts').replaceChildren(...fonts.map(font => { const li = document.createElement('li'); li.textContent = `${font.name} · 摄影 Film`; li.style.fontFamily = FontLibrary.cssFamily(font.id); return li; })); }
  function signatures() { return read('pf_signatures', []); }
  function signatureOptions() { $('signature-list').replaceChildren(new Option('选择已保存的签名', ''), ...signatures().map(item => new Option(item.name,item.id))); }
  function setupSignatures() {
    signatureOptions();
    $('signature-save').onclick = () => run(async () => {
      const job = requireJob(), name = $('signature-name').value.trim(); if (!name) throw new Error('请输入签名样式名称');
      const list = signatures(); list.push({ id: id(), name, info: clone(app.merged(job).infoBar) }); write('pf_signatures',list); signatureOptions(); $('signature-list').value = list.at(-1).id;
    });
    $('signature-apply').onclick = () => run(async () => {
      const signature = signatures().find(item => item.id === $('signature-list').value); if (!signature) throw new Error('请先保存或选择签名');
      const targets = jobs(); app.recordHistory('应用签名'); targets.forEach(job => { job.infoOverrides = clone(signature.info); }); app.refresh();
    });
    $('signature-delete').onclick = () => { write('pf_signatures', signatures().filter(item => item.id !== $('signature-list').value)); signatureOptions(); };
  }
  const markNames = { keep: '保留', pending: '待定', reject: '排除' };
  function setupPicks() {
    $('pick-filter').onchange = () => { app.state.pickFilter = $('pick-filter').value; const first = app.state.jobs.find(job => app.state.pickFilter === 'all' || (job.pick || 'pending') === app.state.pickFilter); if (first) app.selectJob(first.id); app.refresh(); renderPicks(); };
    dialog.querySelectorAll('[data-mark]').forEach(button => { button.onclick = () => run(async () => {
      const targets = jobs(); app.recordHistory('选片标记'); targets.forEach(job => { job.pick = button.dataset.mark; }); app.refresh(); renderPicks(); refreshCount();
    }); });
  }
  function renderPicks() {
    $('pick-grid').replaceChildren(...app.state.jobs.filter(job => $('pick-filter').value === 'all' || (job.pick || 'pending') === $('pick-filter').value).map(job => {
      const card = document.createElement('div'), button = document.createElement('button'), select = document.createElement('select');
      button.type = 'button'; button.className = 'pick-photo'; const img = document.createElement('img'); img.src = job.thumbUrl || ''; img.alt = job.file.name; button.append(img);
      button.setAttribute('aria-label', `选择照片 ${job.file.name}`); button.setAttribute('aria-pressed',String(job.id === app.state.activeJobId));
      button.onclick = () => { app.selectJob(job.id); renderPicks(); };
      for (const [key, label] of Object.entries(markNames)) select.add(new Option(label,key));
      select.value = job.pick || 'pending'; select.setAttribute('aria-label', `${job.file.name} 选片标记`);
      select.onchange = () => { app.recordHistory('选片标记'); job.pick = select.value; app.refresh(); renderPicks(); refreshCount(); };
      const name = document.createElement('small'); name.textContent = job.file.name; card.append(button,name,select); return card;
    }));
  }

  // Versioned archive: File objects have explicit binary entries, all other edits stay JSON.
  async function packProject() {
    const zip = new JSZip(), binaries = new Map();
    async function encode(value) {
      checkCancel();
      if (value instanceof Blob) {
        if (!binaries.has(value)) {
          const path = `files/${binaries.size}`; binaries.set(value,path); zip.file(path,value);
        }
        return { $file: binaries.get(value), name: value.name || 'asset', type: value.type, lastModified: value.lastModified || 0 };
      }
      if (Array.isArray(value)) return Promise.all(value.map(encode));
      if (value && typeof value === 'object') {
        const result = {};
        for (const [key, item] of Object.entries(value)) {
          if (key === 'thumbUrl' || key === 'status') continue;
          result[key] = await encode(item);
        }
        return result;
      }
      return value;
    }
    photosChanged();
    const state = app.state;
    const payload = {
      jobs: state.jobs, presets: state.presets, activePresetId: state.activePresetId, activeJobId: state.activeJobId,
      deliverySettings, presetBundle: Storage.exportPresetBundle(), customStickers: state.customStickers, fonts, signatures: signatures(), carousel, recipes, recipeOffsets,
      output: { format: state.exportFormat, quality: state.exportQuality, longEdge: state.exportLongEdge, filenameTemplate: state.exportFilenameTemplate },
      collageBook: CollageStudio.exportBook(), collageTemplates: CollageStudio.exportTemplates(),
      collage: state.collageMode ? { layout: state.collageLayout, cells: state.collageCells, style: state.collageStyle, title: $('collage-title-input').value, subtitle: $('collage-subtitle-input').value } : null,
    };
    status('正在整理原图与素材…');
    zip.file('project.json', JSON.stringify({ format:'PhotoFrame', version:1, data: await encode(payload) }));
    await downloadZip(zip, `PhotoFrame_${new Date().toISOString().slice(0,10)}.photoframe`);
  }
  async function unpackProject(file) {
    if (file.size > 1024**3) throw new Error('工程文件超过 1 GB，请拆分工程后打开');
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files);
    if (entries.length > 500) throw new Error('工程文件条目过多');
    const inflated = entries.reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0);
    if (inflated > 1024**3) throw new Error('解压后工程超过 1 GB');
    if (!zip.file('project.json')) throw new Error('不是有效的 PhotoFrame 工程');
    const manifest = JSON.parse(await zip.file('project.json').async('string'));
    if (manifest.format !== 'PhotoFrame' || manifest.version !== 1) throw new Error('暂不支持此工程版本');
    const cache = new Map(); let nodes = 0;
    async function decode(value, depth = 0) {
      if (++nodes > 200000 || depth > 40) throw new Error('工程结构过于复杂');
      checkCancel();
      if (value?.$file) {
        if (!/^files\/\d+$/.test(value.$file) || !zip.file(value.$file)) throw new Error('工程缺少原图或字体');
        if (!cache.has(value.$file)) cache.set(value.$file, new File([await zip.file(value.$file).async('arraybuffer')],value.name,{type:value.type,lastModified:value.lastModified}));
        return cache.get(value.$file);
      }
      if (Array.isArray(value)) { const out = []; for (const item of value) out.push(await decode(item, depth+1)); return out; }
      if (value && typeof value === 'object') {
        const out = {};
        for (const [key,item] of Object.entries(value)) {
          if (['__proto__','constructor','prototype'].includes(key)) throw new Error('工程含不支持的字段');
          out[key] = await decode(item,depth+1);
        }
        return out;
      }
      return value;
    }
    const data = await decode(manifest.data);
    if (!Array.isArray(data.jobs) || data.jobs.length > 72 || !Array.isArray(data.presets) || !data.presets.length || data.presets.length > 1000 || data.jobs.some(job => !(job.file instanceof File) || typeof job.id !== 'string')) throw new Error('工程照片或预设数据不完整');
    if (data.presets.some(p => !p || typeof p.id !== 'string' || !p.border || !p.infoBar) || !Array.isArray(data.customStickers)) throw new Error('工程预设或贴图数据无效');
    for (const job of data.jobs) {
      if (!job.overrides || !job.borderOverrides || !job.infoOverrides || !Array.isArray(job.stickers)) throw new Error('工程照片编辑数据无效');
    }
    if (data.collageBook) CollageEngine.validate(data.collageBook);
    if (data.collageTemplates) {
      if(!Array.isArray(data.collageTemplates)||data.collageTemplates.length>30)throw new Error('拼图版式库无效');
      data.collageTemplates.forEach(t=>{if(typeof t.name!=='string')throw new Error('拼图版式名称无效');CollageEngine.validate({pages:[t.page],index:0});});
    }
    if (data.collage && (!data.collage.layout?.cellCount || !Array.isArray(data.collage.cells) || data.collage.cells.length !== data.collage.layout.cellCount || data.collage.cells.some(cell => cell.file !== null && !(cell.file instanceof File)) || !data.collage.style)) throw new Error('工程拼图数据无效');
    if (new Set(data.jobs.map(job => job.id)).size !== data.jobs.length) throw new Error('工程照片 ID 重复');
    if (!Array.isArray(data.fonts) || data.fonts.length > 100 || !Array.isArray(data.signatures)) throw new Error('工程字体或签名数据无效');
    validateCarousel(data.carousel, data.jobs);
    validateRecipes(data.recipes);
    // Validate font binaries before changing the current editor.
    for (const font of data.fonts) {
      if (!(font.file instanceof File) || font.file.size > 20*1024**2 || !/^PF_[a-zA-Z0-9]+$/.test(font.id)) throw new Error('工程字体数据无效');
      await new FontFace(font.id, await font.file.arrayBuffer()).load();
    }
    return data;
  }
  function setupProject() {
    let pendingProject = null;
    $('project-save').onclick = () => run(packProject);
    $('project-file').onchange = event => {
      const file = event.target.files[0]; if (!file) return;
      pendingProject = null; $('project-review').hidden = true;
      run(async () => {
        const data = await unpackProject(file); checkCancel(); pendingProject = data;
        $('project-summary').textContent = `已检查：${data.jobs.length} 张照片、${data.fonts.length} 个字体、${data.carousel.items.length} 个多页元素${data.collage ? '，含当前拼图' : ''}。`;
        $('project-review').hidden = false;
      });
      event.target.value = '';
    };
    $('project-open').onclick = () => run(async () => {
      if (!pendingProject) throw new Error('请先选择并检查工程');
      const data = pendingProject;
      // Keep an in-memory copy until replacement succeeds; archives are explicitly opened by the user.
      for (const font of data.fonts) await importFont(font.file,font.id);
      if (cancelled) checkCancel();
      $('creative-cancel').hidden = true;
      await app.replaceProject(data);
      $('pick-filter').value = 'all';
      carousel = data.carousel; recipes = data.recipes; recipeOffsets = data.recipeOffsets || {}; deliverySettings = data.deliverySettings || {}; applyDeliverySettings();
      write('pf_signatures',data.signatures); signatureOptions(); persist(); renderRecipes(); syncCarousel();
      if (data.output) {
        Object.assign(app.state, { exportFormat:data.output.format, exportQuality:data.output.quality, exportLongEdge:data.output.longEdge, exportFilenameTemplate:data.output.filenameTemplate });
        $('quality-label').textContent = data.output.quality + '%';
        $('output-filename').value = data.output.filenameTemplate;
        for (const [key,value] of Object.entries({ 'output-format':data.output.format, 'output-quality':data.output.quality, 'output-resolution':data.output.longEdge })) if ($(key)) $(key).value = value;
      }
      pendingProject = null; $('project-review').hidden = true; renderPicks(); refreshCount(); app.refresh();
    });
  }

  function contactOptions() {
    return { cols:Math.round(clamp($('contact-cols').value,2,8)), rows:Math.round(clamp($('contact-rows').value,2,8)), dark:$('contact-style').value === 'film', meta:$('contact-meta').checked, title:$('contact-title').value };
  }
  async function contactPage(list, pageIndex, options) {
    const { cols,rows,dark,meta,title } = options;
    const width = 2400, margin = 80, gap = 24, cellW = (width-margin*2-gap*(cols-1))/cols;
    const photoH = cellW*.72, cellH = photoH + (meta ? 105 : 48), height = Math.ceil(160+rows*cellH+gap*(rows-1)+80);
    const out = canvas(width,height,dark ? '#171717' : '#ffffff'), ctx = out.getContext('2d');
    ctx.fillStyle = dark ? '#e9dfc7' : '#222'; ctx.font = '40px system-ui'; ctx.fillText(title || 'PhotoFrame 联系表',margin,70,width-margin*2);
    ctx.font = '22px system-ui'; ctx.fillText(`第 ${pageIndex+1} 页 · ${list.length} 张照片`,margin,110);
    const start = pageIndex*cols*rows;
    for (let i = start; i < Math.min(list.length,start+cols*rows); i++) {
      checkCancel(); status(`联系表 ${i+1} / ${list.length}`);
      const job = list[i], local = i-start, x = margin+(local%cols)*(cellW+gap), y = 160+Math.floor(local/cols)*(cellH+gap);
      const source = await image(job,Math.ceil(cellW*2)); drawFit(ctx,source,x,y,cellW,photoH); source.width = source.height = 0;
      const pick = markNames[job.pick || 'pending'];
      ctx.fillStyle = dark ? '#e9dfc7' : '#222'; ctx.font = '22px system-ui';
      ctx.fillText(`${String(i+1).padStart(2,'0')} · ${pick}`,x,y+photoH+30,cellW);
      if (meta) {
        ctx.font = '18px system-ui'; ctx.fillText(job.file.name,x,y+photoH+56,cellW);
        ctx.fillText(job.overrides?.date || job.exif?.date || '',x,y+photoH+79,cellW);
        ctx.fillText(job.overrides?.camera || job.exif?.camera || '',x,y+photoH+102,cellW);
      }
    }
    return out;
  }
  function showCanvas(target, source) { target.hidden = false; target.width = source.width; target.height = source.height; target.getContext('2d').drawImage(source,0,0); }
  // Minimal PDF writer embeds JPEG pages with exact byte offsets and no external dependency.
  async function makePDF(pages) {
    const encoder = new TextEncoder(), chunks = [], offsets = [0]; let length = 0;
    const put = value => { const bytes = typeof value === 'string' ? encoder.encode(value) : value; chunks.push(bytes); length += bytes.length; };
    const object = (n,body,stream) => {
      offsets[n] = length; put(`${n} 0 obj\n${body}`);
      if (stream) { put('\nstream\n'); put(stream); put('\nendstream'); }
      put('\nendobj\n');
    };
    put('%PDF-1.4\n'); object(1,'<< /Type /Catalog /Pages 2 0 R >>');
    object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i) => `${3+i*3} 0 R`).join(' ')}] >>`);
    for (const [i,page] of pages.entries()) {
      const n = 3+i*3, h = 595*page.height/page.width;
      object(n,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${h}] /Resources << /XObject << /Im ${n+1} 0 R >> >> /Contents ${n+2} 0 R >>`);
      object(n+1,`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>`,page.bytes);
      const stream = encoder.encode(`q 595 0 0 ${h} 0 0 cm /Im Do Q`); object(n+2,`<< /Length ${stream.length} >>`,stream);
    }
    const xref = length, count = 3+pages.length*3;
    put(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for (let i=1;i<count;i++) put(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
    put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks,{type:'application/pdf'});
  }
  function setupContact() {
    $('contact-preview').onclick = () => run(async () => { const page = await contactPage(jobs(),0,contactOptions()); showCanvas($('contact-canvas'),page); page.width = page.height = 0; });
    for (const type of ['jpg','pdf']) $('contact-'+type).onclick = () => run(async () => {
      const list = jobs(), options = contactOptions(), count = Math.ceil(list.length/(options.cols*options.rows)), zip = new JSZip(), pages = [];
      for (let i=0;i<count;i++) {
        checkCancel(); const page = await contactPage(list,i,options), width = page.width, height = page.height;
        const blob = await CanvasRenderer.canvasToBlob(page,'jpeg',.93); page.width = page.height = 0;
        if (type === 'pdf') pages.push({width,height,bytes:new Uint8Array(await blob.arrayBuffer())});
        else zip.file(`联系表_${String(i+1).padStart(2,'0')}.jpg`,blob);
      }
      checkCancel();
      if (type === 'pdf') { const blob = await makePDF(pages); checkCancel(); saveAs(blob,'PhotoFrame_联系表.pdf'); }
      else await downloadZip(zip,'PhotoFrame_联系表.zip');
    });
  }

  function validateRecipes(list) {
    if (!Array.isArray(list) || list.length < 1 || list.length > 12 || list.some(recipe => !Number.isInteger(recipe.width) || !Number.isInteger(recipe.height) || recipe.width < 0 || recipe.width > 6000 || recipe.height < 320 || recipe.height > 6000 || (recipe.width !== 0 && recipe.width < 320) || !['contain','cover'].includes(recipe.fit) || typeof recipe.name !== 'string')) throw new Error('导出方案尺寸无效：宽为 0 或 320–6000，高为 320–6000');
  }
  function renderRecipes() {
    $('recipe-list').replaceChildren(...recipes.map((recipe,i) => {
      const row = document.createElement('div'); row.className = 'recipe-row';
      row.innerHTML = `<label><input type="checkbox" data-key="enabled" ${recipe.enabled !== false ? 'checked' : ''}>导出</label>
        <label>名称<input data-key="name" value="${esc(recipe.name)}" maxlength="50"></label>
        <label>宽<input data-key="width" type="number" min="0" max="6000" value="${recipe.width}"></label>
        <label>高<input data-key="height" type="number" min="320" max="6000" value="${recipe.height}"></label>
        <label>适配<select data-key="fit"><option value="contain">完整留白</option><option value="cover">裁切填满</option></select></label>
        <button class="btn" type="button" aria-label="删除方案 ${i+1}">删除</button>`;
      row.querySelector('select').value = recipe.fit;
      row.querySelectorAll('[data-key]').forEach(input => { input.onchange = () => {
        const key = input.dataset.key;
        recipe[key] = key === 'enabled' ? input.checked : ['width','height'].includes(key) ? Math.round(Number(input.value)) : input.value;
        persist(); recipeChoices();
      }; });
      row.querySelector('button').onclick = () => { if (recipes.length === 1) return app.showToast('至少保留一个导出方案','warn'); recipes.splice(i,1); recipeOffsets = {}; persist(); renderRecipes(); };
      decorateFields(row); return row;
    }));
    recipeChoices();
  }
  function recipeChoices() {
    const previous = $('recipe-preview-choice').value;
    $('recipe-preview-choice').replaceChildren(...recipes.map((recipe,i) => new Option(recipe.name,String(i))));
    $('recipe-preview-choice').value = Number(previous) < recipes.length ? previous || '0' : '0';
  }
  function offsetKey(job,index) { return `${job.id}:${index}`; }
  async function recipeCanvas(job,recipe,index) {
    const source = await image(job,recipe.width === 0 ? recipe.height : Math.min(6000,Math.max(recipe.width,recipe.height)));
    if (!recipe.width) return source;
    const out = canvas(recipe.width,recipe.height,app.merged(job).border?.color || '#ffffff');
    drawFit(out.getContext('2d'),source,0,0,out.width,out.height,recipe.fit,recipeOffsets[offsetKey(job,index)] || {x:.5,y:.5});
    source.width = source.height = 0; return out;
  }
  async function encodeSize(source, format, limitMB) {
    let quality = .95, out = source, owned = false;
    const limit = format === 'jpeg' && limitMB > 0 ? limitMB*1024**2 : Infinity;
    try {
      for (let pass=0;pass<40;pass++) {
        checkCancel();
        const blob = await CanvasRenderer.canvasToBlob(out,format,quality);
        if (blob.size <= limit) return {blob,width:out.width,height:out.height};
        if (quality > .46) quality = Math.max(.45,quality-.1);
        else {
          const scaled = canvas(Math.max(1,Math.floor(out.width*.8)),Math.max(1,Math.floor(out.height*.8)));
          scaled.getContext('2d').drawImage(out,0,0,scaled.width,scaled.height);
          if (owned) out.width = out.height = 0;
          out = scaled; owned = true; quality = .8;
        }
      }
      throw new Error('无法满足文件大小上限，请调高上限或降低输出尺寸');
    } finally { if (owned) out.width = out.height = 0; }
  }
  function setupRecipes() {
    renderRecipes();
    $('recipe-add').onclick = () => {
      if (recipes.length >= 12) return app.showToast('最多 12 个导出方案','warn');
      recipes.push({name:`自定义 ${recipes.length+1}`,width:1800,height:2400,fit:'contain'}); persist(); renderRecipes();
    };
    $('recipe-preview-choice').onchange = () => {
      const job = app.activeJob(), offset = job && recipeOffsets[offsetKey(job,Number($('recipe-preview-choice').value))];
      $('recipe-x').value = offset?.x ?? .5; $('recipe-y').value = offset?.y ?? .5;
    };
    for (const axis of ['x','y']) $('recipe-'+axis).oninput = () => {
      const job = app.activeJob(); if (!job) return;
      recipeOffsets[offsetKey(job,Number($('recipe-preview-choice').value))] = { x:Number($('recipe-x').value), y:Number($('recipe-y').value) }; persist();
    };
    $('recipe-preview').onclick = () => run(async () => {
      validateRecipes(recipes); const job = requireJob(), index = Number($('recipe-preview-choice').value);
      const source = await recipeCanvas(job,recipes[index],index);
      try {
        const result = await encodeSize(source,$('recipe-format').value,clamp($('recipe-limit').value,0,50));
        showCanvas($('recipe-canvas'),source);
        $('recipe-estimate').textContent = `${result.width} × ${result.height} · ${(result.blob.size/1024**2).toFixed(2)} MB${result.width !== source.width ? ' · 为满足上限已降低分辨率' : ''}`;
      } finally { source.width = source.height = 0; }
    });
    $('recipe-export').onclick = () => run(async () => {
      validateRecipes(recipes);
      const list = jobs(), enabled = recipes.map((recipe,index) => ({recipe,index})).filter(({recipe}) => recipe.enabled !== false);
      if (!enabled.length) throw new Error('请至少勾选一个导出方案');
      const zip = new JSZip(), format = $('recipe-format').value, limit = clamp($('recipe-limit').value,0,50), report = [];
      for (const {recipe,index} of enabled) for (const [i,job] of list.entries()) {
        checkCancel(); status(`${recipe.name} · ${i+1} / ${list.length}`);
        const source = await recipeCanvas(job,recipe,index);
        try {
          const {blob,width,height} = await encodeSize(source,format,limit);
          const filename = BatchProcessor.resolveFilename(app.state.exportFilenameTemplate,job,i+1,format === 'jpeg' ? 'jpg' : 'png');
          const folder = `${String(index+1).padStart(2,'0')}_${recipe.name.replace(/[^\w\u4e00-\u9fff-]/g,'_') || '方案'}`;
          const path = `${folder}/${String(i+1).padStart(3,'0')}_${filename}`;
          zip.file(path,blob);
          if ($('recipe-metadata').value !== 'none') {
            const exif = job.exif || {}, manual = job.overrides || {};
            const metadata = { source:job.file.name, camera:manual.camera || exif.camera || '', lens:exif.lens || '', date:manual.date || exif.date || '', film:manual.film || '', aperture:exif.aperture || '', shutter:exif.shutter || '', iso:exif.iso || '', focalLength:exif.focalLength || '' };
            if ($('recipe-metadata').value === 'gps') metadata.gps = exif.gps || null;
            zip.file(path.replace(/\.[^.]+$/,'.json'),JSON.stringify(metadata,null,2));
          }
          report.push(`${folder}/${filename}\t${width}x${height}\t${blob.size} bytes`);
        } finally { source.width = source.height = 0; }
      }
      zip.file('导出说明.txt',`所有照片已重新编码，图片不包含原图 EXIF 和 GPS。拍摄信息附档：${$('recipe-metadata').selectedOptions[0].textContent}。JPEG 超过上限时会降低质量，必要时降低尺寸。\n${report.join('\n')}`);
      await downloadZip(zip,'PhotoFrame_多规格.zip');
    });
  }

  function validateCarousel(data, jobList) {
    if (!data || !Array.isArray(data.items) || data.items.length > 200 || !Number.isInteger(data.pages) || data.pages < 2 || data.pages > 10 || !Number.isInteger(data.width) || data.width < 320 || data.width > 2400 || !Number.isInteger(data.height) || data.height < 320 || data.height > 3000 || !/^#[0-9a-f]{6}$/i.test(data.color)) throw new Error('多页画布数据或尺寸无效');
    const jobIds = new Set(jobList.map(job => job.id));
    for (const item of data.items) {
      if (item.type === 'collage') CollageEngine.validate({pages:[item.page],index:0});
      if (!['photo','text','collage'].includes(item.type) || typeof item.id !== 'string' || ![item.x,item.y,item.w,item.h,item.rotation || 0].every(Number.isFinite) || item.w < 1 || item.h < 1 || Math.abs(item.x) > 50000 || Math.abs(item.y) > 50000 || item.w > 50000 || item.h > 50000 || (item.type === 'photo' && !jobIds.has(item.jobId)) || (item.type === 'text' && (typeof item.text !== 'string' || item.text.length > 2000))) throw new Error('多页元素数据无效或引用照片缺失');
    }
  }
  function syncCarousel() {
    for (const key of ['pages','width','height','color']) $('carousel-'+key).value = carousel[key];
    renderItemOptions();
  }
  function renderItemOptions() {
    $('carousel-items').replaceChildren(new Option('选择元素',''),...carousel.items.map((item,i) => new Option(`${i+1}. ${item.type === 'text' ? item.text.slice(0,30) : item.type === 'collage' ? '拼图页面' : app.state.jobs.find(job => job.id === item.jobId)?.file.name || '照片已移除'}`,item.id)));
    $('carousel-items').value = selectedItem || ''; renderInspector();
  }
  function currentItem() { return carousel.items.find(item => item.id === selectedItem); }
  function renderInspector() {
    const item = currentItem(), inspector = $('carousel-inspector'); inspector.replaceChildren(); if (!item) return;
    const fields = [['x','横坐标'],['y','纵坐标'],['w','宽'],['h','高'],['rotation','旋转']];
    if (item.type === 'text') fields.push(['text','文字'],['size','字号'],['color','颜色'],['font','字体']);
    else fields.push(['fit','适配']);
    for (const [key,label] of fields) {
      const wrap = document.createElement('label'); wrap.textContent = label;
      const input = document.createElement(key === 'text' ? 'textarea' : ['fit','font'].includes(key) ? 'select' : 'input');
      if (key === 'fit') { input.add(new Option('裁切填满','cover')); input.add(new Option('完整显示','contain')); }
      else if (key === 'font') FontLibrary.populate(input,item.font || 'system-ui');
      else if (key === 'text') input.maxLength = 2000;
      else input.type = key === 'color' ? 'color' : 'number';
      input.value = item[key] ?? (key === 'rotation' ? 0 : ''); input.setAttribute('aria-label',`元素${label}`);
      input.onchange = () => {
        item[key] = ['text','color','font','fit'].includes(key) ? input.value : clamp(input.value,key === 'rotation' ? -360 : ['x','y'].includes(key) ? -10000 : 1,20000);
        persist(); renderCarousel(); if (key === 'text') renderItemOptions();
      }; wrap.append(input); inspector.append(wrap);
    }
    decorateFields(inspector);
  }
  const photoCache = new Map();
  async function carouselPhoto(job,edge) {
    // Preview cache is invalidated when opening this page or adding current edits.
    const key = `${job.id}:${edge}`;
    if (!photoCache.has(key)) photoCache.set(key,image(job,edge));
    return photoCache.get(key);
  }
  function clearCarouselCache() { for (const value of photoCache.values()) value.then(c => { c.width = c.height = 0; }).catch(() => {}); photoCache.clear(); }
  async function paintCarousel(target, scale, guides, pageIndex = null) {
    const pageWidth = carousel.width, height = carousel.height, offset = pageIndex === null ? 0 : pageIndex*pageWidth;
    const width = pageIndex === null ? carousel.pages*pageWidth : pageWidth;
    target.width = Math.round(width*scale); target.height = Math.round(height*scale);
    const ctx = target.getContext('2d'); ctx.scale(scale,scale); ctx.fillStyle = carousel.color; ctx.fillRect(0,0,width,height); ctx.translate(-offset,0);
    for (const item of carousel.items) {
      checkCancel();
      ctx.save(); ctx.translate(item.x+item.w/2,item.y+item.h/2); ctx.rotate((item.rotation || 0)*Math.PI/180);
      if (item.type === 'photo') {
        const job = app.state.jobs.find(job => job.id === item.jobId);
        if (job) {
          const source = pageIndex === null ? await carouselPhoto(job,1000) : await image(job,Math.min(6000,Math.ceil(Math.max(item.w,item.h))));
          drawFit(ctx,source,-item.w/2,-item.h/2,item.w,item.h,item.fit || 'cover');
          if (pageIndex !== null) source.width = source.height = 0;
        }
      } else if (item.type === 'collage') {
        const p=item.page, cells=p.cells.map(c=>({...c,file:c.file||app.state.jobs.find(j=>j.id===c.jobId)?.file||null})), source=await CollageRenderer.render(p.layout,cells,{titleTemplate:p.title,subtitleTemplate:p.subtitle},pageIndex===null?800:Math.min(6000,Math.ceil(Math.max(item.w,item.h))),p.style);
        drawFit(ctx,source,-item.w/2,-item.h/2,item.w,item.h,'contain');source.width=source.height=0;
      } else {
        ctx.fillStyle = item.color || '#222222'; ctx.font = `${item.size || 64}px ${FontLibrary.cssFamily(item.font || 'system-ui')}`; ctx.textBaseline = 'top';
        ctx.beginPath(); ctx.rect(-item.w/2,-item.h/2,item.w,item.h); ctx.clip();
        const lines = String(item.text).split('\n'); lines.forEach((line,i) => ctx.fillText(line,-item.w/2,-item.h/2+i*(item.size || 64)*1.3,item.w));
      }
      if (guides && selectedItem === item.id) { ctx.strokeStyle = '#0984e3'; ctx.lineWidth = 3/scale; ctx.strokeRect(-item.w/2,-item.h/2,item.w,item.h); }
      ctx.restore();
    }
    if (guides) {
      ctx.strokeStyle = '#d8642a'; ctx.lineWidth = 1/scale; ctx.setLineDash([8/scale,6/scale]);
      for (let i=0;i<carousel.pages;i++) {
        ctx.strokeRect(i*pageWidth,0,pageWidth,height);
        ctx.strokeRect(i*pageWidth+pageWidth*.05,height*.05,pageWidth*.9,height*.9);
      }
    }
  }
  let carouselRendering = false, carouselQueued = false;
  async function renderCarousel() {
    if (carouselRendering) { carouselQueued = true; ++previewVersion; return; }
    carouselRendering = true;
    const version = ++previewVersion, out = canvas(1,1);
    try {
      // A bounded preview keeps 10-page panoramas usable on phones.
      await paintCarousel(out,Math.min(.5,600/carousel.height,6000/(carousel.pages*carousel.width)),$('carousel-guides').checked);
      if (version === previewVersion) showCanvas($('carousel-canvas'),out);
    } catch (error) { if (error.name !== 'AbortError') status(`多页预览失败：${error.message}`); }
    finally { out.width = out.height = 0; carouselRendering = false; if (carouselQueued) { carouselQueued = false; renderCarousel(); } }
  }
  function addPhoto(job,x = 80,y = 100) {
    if (carousel.items.length >= 200) throw new Error('最多 200 个多页元素');
    const item = {id:id(),type:'photo',jobId:job.id,x,y,w:carousel.width*.8,h:carousel.height*.7,rotation:0,fit:'cover'};
    carousel.items.push(item); selectedItem = item.id;
  }
  function setupCarousel() {
    syncCarousel();
    for (const key of ['pages','width','height','color']) $('carousel-'+key).onchange = () => {
      const bounds = {pages:[2,10],width:[320,2400],height:[320,3000]};
      carousel[key] = key === 'color' ? $('carousel-color').value : Math.round(clamp($('carousel-'+key).value,...bounds[key]));
      persist(); syncCarousel(); renderCarousel();
    };
    $('carousel-photo').onclick = () => run(async () => { addPhoto(requireJob()); clearCarouselCache(); persist(); renderItemOptions(); await renderCarousel(); });
    $('carousel-fill').onclick = () => run(async () => {
      const list = jobs(); carousel.items = []; carousel.pages = Math.max(2,Math.min(10,list.length));
      for (let page = 0; page < carousel.pages; page++) {
        const group = list.slice(Math.floor(page*list.length/carousel.pages),Math.floor((page+1)*list.length/carousel.pages));
        const cols = group.length > 2 ? 2 : 1, rows = Math.ceil(group.length/cols);
        const w = carousel.width*.88/cols, h = carousel.height*.8/Math.max(1,rows);
        group.forEach((job,i) => {
          addPhoto(job,page*carousel.width+carousel.width*.06+(i%cols)*w,carousel.height*.12+Math.floor(i/cols)*h);
          Object.assign(carousel.items.at(-1),{w:w*.96,h:h*.96});
        });
      }
      clearCarouselCache(); persist(); syncCarousel(); await renderCarousel();
    });
    $('carousel-text').onclick = () => {
      if (carousel.items.length >= 200) return app.showToast('最多 200 个多页元素','warn');
      const item = {id:id(),type:'text',text:'我的摄影故事',x:80,y:60,w:carousel.width*.8,h:180,size:64,color:'#222222',font:(app.activeJob() ? app.merged(app.activeJob())?.infoBar?.titleFont : null) || 'system-ui',rotation:0};
      carousel.items.push(item); selectedItem=item.id; persist(); renderItemOptions(); renderCarousel();
    };
    $('carousel-items').onchange = () => { selectedItem=$('carousel-items').value; renderInspector(); renderCarousel(); };
    $('carousel-guides').onchange = renderCarousel;
    $('carousel-remove').onclick = () => { carousel.items=carousel.items.filter(item => item.id !== selectedItem); selectedItem=null; persist(); renderItemOptions(); renderCarousel(); };
    for (const [name,direction] of [['back',-1],['front',1]]) $('carousel-'+name).onclick = () => {
      const index = carousel.items.findIndex(item => item.id === selectedItem), next = index+direction;
      if (index<0 || next<0 || next>=carousel.items.length) return;
      [carousel.items[index],carousel.items[next]]=[carousel.items[next],carousel.items[index]]; persist(); renderItemOptions(); renderCarousel();
    };
    let drag = null;
    const target = $('carousel-canvas'), scroll = target.parentElement;
    $('carousel-pan').checked = matchMedia('(pointer: coarse)').matches;
    const panMode = () => { target.style.touchAction = $('carousel-pan').checked ? 'pan-x pan-y' : 'none'; };
    $('carousel-pan').onchange = panMode; panMode();
    for (const [name, direction] of [['prev',-1],['next',1]]) $('carousel-'+name+'-page').onclick = () => scroll.scrollBy({ left: direction*target.width/carousel.pages, behavior:'smooth' });
    scroll.addEventListener('wheel', event => {
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const delta = event.deltaY*(event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientWidth : 1);
      const next = clamp(scroll.scrollLeft+delta,0,scroll.scrollWidth-scroll.clientWidth);
      if (Math.abs(next-scroll.scrollLeft) < 1) return;
      event.preventDefault(); scroll.scrollLeft = next;
    },{passive:false});
    const point = event => { const rect=target.getBoundingClientRect(); return {x:(event.clientX-rect.left)*carousel.pages*carousel.width/rect.width,y:(event.clientY-rect.top)*carousel.height/rect.height}; };
    target.onpointerdown = event => {
      if (busy || $('carousel-pan').checked) return;
      const p=point(event);
      const item=[...carousel.items].reverse().find(item => {
        const dx=p.x-item.x-item.w/2,dy=p.y-item.y-item.h/2,a=-(item.rotation || 0)*Math.PI/180;
        return Math.abs(dx*Math.cos(a)-dy*Math.sin(a))<=item.w/2 && Math.abs(dx*Math.sin(a)+dy*Math.cos(a))<=item.h/2;
      });
      selectedItem=item?.id || null; renderItemOptions(); renderCarousel();
      if (item) { event.preventDefault(); target.setPointerCapture(event.pointerId); drag={item,p,x:item.x,y:item.y}; }
    };
    target.onpointermove = event => { if (!drag) return; const p=point(event); drag.item.x=Math.round(drag.x+p.x-drag.p.x); drag.item.y=Math.round(drag.y+p.y-drag.p.y); renderCarousel(); };
    const finish=() => { if (drag) { drag=null; persist(); renderInspector(); } };
    target.onpointerup=finish; target.onpointercancel=finish;
    $('carousel-export').onclick = () => run(async () => {
      if (!carousel.items.length) throw new Error('请先添加照片或文字');
      validateCarousel(carousel,app.state.jobs); const zip=new JSZip();
      for (let i=0;i<carousel.pages;i++) {
        checkCancel(); status(`正在切页 ${i+1} / ${carousel.pages}`);
        const page=canvas(1,1); await paintCarousel(page,1,false,i);
        const blob=await CanvasRenderer.canvasToBlob(page,'jpeg',.95); page.width=page.height=0;
        zip.file(`PhotoFrame_${String(i+1).padStart(2,'0')}.jpg`,blob);
      }
      await downloadZip(zip,'PhotoFrame_连续多页.zip');
    });
    // Opening reflects current edits, not stale cached photos.

  }
  function photosChanged() {
    if (!app) return;
    const ids = new Set(app.state.jobs.map(job => job.id));
    carousel.items = carousel.items.filter(item => item.type !== 'photo' || ids.has(item.jobId));
    recipeOffsets = Object.fromEntries(Object.entries(recipeOffsets).filter(([key]) => ids.has(key.split(':')[0])));
    clearCarouselCache(); persist();
  }
  function addCollagePage(page) {
    if(carousel.items.length>=200)throw new Error('最多 200 个多页元素');
    const pageIndex=Math.min(carousel.pages-1,Math.floor(carousel.items.length));
    const saved=CollageEngine.copy(page);saved.cells.forEach(c=>{c.jobId=app.state.jobs.find(j=>j.file===c.file)?.id||null;c.file=null;});
    const item={id:id(),type:'collage',page:saved,x:pageIndex*carousel.width,y:0,w:carousel.width,h:carousel.height,rotation:0};
    carousel.items.push(item);selectedItem=item.id;persist();renderItemOptions();renderCarousel();
  }
  return { setup, photosChanged, addCollagePage };
})();
