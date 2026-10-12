/**
 * PhotoFrame — 主控制器
 */
(function () {
  'use strict';

  // 文字位置拖拽范围（相对画布宽度的比例）
  const TEXT_POS_MAX = 0.35;

  // ══════════════════════════════════════════════════════════════════════════
  // 状态
  // ══════════════════════════════════════════════════════════════════════════
  const state = {
    jobs: [],
    activeJobId: null,
    activePresetId: '135-h',
    presets: [],
    zoom: 'fit',
    activeTab: 'presets',
    activeCategory: 'all',
    isRendering: false,
    exportLongEdge: 3000,
    exportFormat: 'jpeg',
    exportQuality: 95,
    cropMode: false,      // 普通单图裁切模式
    slotCropMode: false,  // 拼图格子裁切模式
    slotCropIndex: -1,    // 当前被裁切的格子索引
    collageMode: false,   // 拼图编辑模式
    collageLayout: null,  // 当前拼图布局（深拷贝）
    collageCells: [],     // [{file, cropRect}]
    collageActiveSlot: -1,
    textPosMode: false,   // 文字位置拖拽模式
    selectedJobIds: new Set(), // 多选胶片条
    borderResizeMode: false,   // 边框拖拽调整模式
    frameGridEnabled: true,    // 边框编辑三分网格
    frameSnapEnabled: true,    // 边缘/中心/三分线吸附
  };

  let _textDragState = null; // { startX, startY, startOffsetX, startOffsetY }
  let _borderDragState = null; // { corner, type, startX, startY, startBTop, ... }

  let previewDebounce = null;
  let _rafPreview = null;  // 拖拽用 RAF 节流
  let _borderRenderInFlight = false;
  let _borderRenderQueued = false;
  let _previewGeneration = 0;
  let _borderOverlaySyncRaf = null;
  let sessionSaveDebounce = null;
  let cropEditorInstance = null;
  let collagePreviewDebounce = null;

  // 图片元素缓存（避免重复解码大图）
  const imageCache = new WeakMap(); // WeakMap<File, HTMLImageElement>

  async function getJobImage(job) {
    if (imageCache.has(job.file)) return imageCache.get(job.file);
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      const url = URL.createObjectURL(job.file);
      im.onload  = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
      im.src = url;
    });
    imageCache.set(job.file, img);
    return img;
  }

  // 常见比例格式化
  function formatRatio(r) {
    const known = [
      [1,1],[3,2],[2,3],[4,3],[3,4],[7,5],[5,7],[7,6],[6,7],
      [9,6],[6,9],[2,1],[1,2],[3,1],[1,3],[17,6],[6,17],
      [65,24],[12,6],[16,9],[9,16],
    ];
    for (const [w, h] of known) {
      if (Math.abs(w / h - r) < 0.015) return `${w}:${h}`;
    }
    return `${r.toFixed(2)}:1`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 工具
  // ══════════════════════════════════════════════════════════════════════════
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function activeJob() {
    return state.jobs.find(j => j.id === state.activeJobId) || null;
  }

  function activePreset() {
    return state.presets.find(p => p.id === state.activePresetId) || state.presets[0] || null;
  }

  function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast toast-${type} show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 初始化
  // ══════════════════════════════════════════════════════════════════════════
  function init() {
    state.presets = Storage.allPresets();
    renderPresetGrid();
    setupUpload();
    setupTabs();
    setupInfoForm();
    setupBorderForm();
    setupExportControls();
    setupZoomControls();
    setupPresetSave();
    setupMobileNav();
    setupCropMode();       // 裁切模式
    setupCollageMode();    // 拼图模式
    setupTextPosMode();    // 文字位置拖拽
    setupBorderResizeMode(); // 边框拖拽调整
    setupClearSession();   // 清空会话按钮
    updateEmptyState();
    initSession();         // 恢复上次会话（异步，不阻塞 UI）
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 上传
  // ══════════════════════════════════════════════════════════════════════════
  function setupUpload() {
    const zone  = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    const emptyBtn = document.getElementById('btn-empty-upload');

    zone.addEventListener('click', () => input.click());
    emptyBtn && emptyBtn.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      handleFiles([...e.dataTransfer.files]);
    });

    input.addEventListener('change', () => {
      handleFiles([...input.files]);
      input.value = '';
    });
  }

  async function handleFiles(files) {
    const imageFiles = files.filter(f => f.type.startsWith('image/') || /\.(heic|heif|tiff?|raw|arw|cr2|nef|dng)$/i.test(f.name));
    if (!imageFiles.length) { showToast('未检测到图片文件', 'warn'); return; }

    const MAX = 100;
    if (state.jobs.length + imageFiles.length > MAX) {
      showToast(`最多支持 ${MAX} 张，已截取前 ${MAX - state.jobs.length} 张`, 'warn');
      imageFiles.splice(MAX - state.jobs.length);
    }

    for (const file of imageFiles) {
      const job = {
        id: uid(),
        file,
        exif: {},
        presetId: state.activePresetId,
        overrides: { location: '', camera: '', film: '', date: '' },
        borderOverrides: {},
        infoOverrides: {},
        thumbUrl: null,
        status: 'idle',
      };
      state.jobs.push(job);

      // 持久化：先保存文件二进制
      SessionStore.saveFile(job.id, file).catch(e => console.warn('文件保存失败', e));

      // 异步读 EXIF，读完后刷新界面并保存元数据
      ExifReader.read(file).then(exif => {
        job.exif = exif || {};
        if (state.activeJobId === job.id) {
          fillInfoForm(job);
          schedulePreview();
        }
        updateFilmstrip();
        scheduleSessionSave();
      });

      // 生成缩略图 URL，完成后保存会话（含 thumbUrl）
      createThumb(job, () => scheduleSessionSave());
    }

    if (!state.activeJobId) selectJob(state.jobs[0].id);
    updateFilmstrip();
    updateEmptyState();
    showToast(`已添加 ${imageFiles.length} 张照片`);
  }

  function createThumb(job, onDone) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const size = 120;
        const canvas = document.createElement('canvas');
        const scale = size / Math.max(img.width, img.height);
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        job.thumbUrl = canvas.toDataURL('image/jpeg', 0.8);
        updateFilmstrip();
        if (onDone) onDone();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(job.file);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 胶片条
  // ══════════════════════════════════════════════════════════════════════════
  function updateFilmstrip() {
    const strip = document.getElementById('filmstrip');
    if (!strip) return;
    strip.innerHTML = '';

    if (state.jobs.length === 0) {
      strip.hidden = true;
      return;
    }
    strip.hidden = false;

    state.jobs.forEach(job => {
      const item = document.createElement('div');
      const isActive = job.id === state.activeJobId;
      const isMultiSel = state.selectedJobIds.has(job.id) && state.selectedJobIds.size > 1;
      item.className = 'strip-item' + (isActive ? ' active' : '') + (isMultiSel ? ' multi-selected' : '');
      item.dataset.id = job.id;

      if (job.thumbUrl) {
        const img = document.createElement('img');
        img.src = job.thumbUrl;
        item.appendChild(img);
      } else {
        item.classList.add('strip-item-loading');
      }

      // 删除按钮
      const del = document.createElement('button');
      del.className = 'strip-del';
      del.innerHTML = '×';
      del.title = '移除';
      del.addEventListener('click', e => { e.stopPropagation(); removeJob(job.id); });
      item.appendChild(del);

      item.addEventListener('click', e => {
        if (e.ctrlKey || e.metaKey) {
          // Ctrl/Cmd+click: toggle in multi-selection
          if (state.selectedJobIds.has(job.id)) {
            state.selectedJobIds.delete(job.id);
          } else {
            state.selectedJobIds.add(job.id);
          }
          state.activeJobId = job.id;
          updateFilmstrip();
          const j = state.jobs.find(x => x.id === job.id);
          if (j) { fillInfoForm(j); fillBorderForm(activePreset(), j); }
        } else {
          state.selectedJobIds.clear();
          selectJob(job.id);
        }
      });
      strip.appendChild(item);
    });

    // 更新计数
    const counter = document.getElementById('photo-count');
    if (counter) counter.textContent = state.jobs.length > 1 ? `${state.jobs.length} 张` : '';
  }

  function selectJob(id) {
    state.activeJobId = id;
    const job = activeJob();

    // Sync preset from job's presetId
    if (job?.presetId && job.presetId !== state.activePresetId) {
      state.activePresetId = job.presetId;
      document.querySelectorAll('.preset-card').forEach(card => {
        card.classList.toggle('active', card.dataset.id === state.activePresetId);
      });
    }

    // Single selection
    if (!state.selectedJobIds.has(id)) {
      state.selectedJobIds.clear();
      state.selectedJobIds.add(id);
    }

    updateFilmstrip();
    if (job) {
      fillInfoForm(job);
      fillBorderForm(activePreset(), job);
    }
    updateCropButton();
    schedulePreview();
  }

  function removeJob(id) {
    state.jobs = state.jobs.filter(j => j.id !== id);
    SessionStore.deleteJob(id).catch(e => console.warn('删除记录失败', e));
    if (state.activeJobId === id) {
      state.activeJobId = state.jobs[0]?.id || null;
    }
    updateFilmstrip();
    updateEmptyState();
    if (state.activeJobId) {
      fillInfoForm(activeJob());
      schedulePreview();
    } else {
      clearPreview();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 预设网格
  // ══════════════════════════════════════════════════════════════════════════
  function renderPresetGrid() {
    renderCategoryFilter();
    filterAndRenderCards();
  }

  function renderCategoryFilter() {
    const container = document.getElementById('category-filter');
    if (!container) return;
    container.innerHTML = '';
    window.PRESET_CATEGORIES.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-btn' + (cat.id === state.activeCategory ? ' active' : '');
      btn.textContent = cat.label;
      btn.dataset.cat = cat.id;
      btn.addEventListener('click', () => {
        state.activeCategory = cat.id;
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterAndRenderCards();
      });
      container.appendChild(btn);
    });
  }

  function filterAndRenderCards() {
    const grid = document.getElementById('preset-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let list;
    if (state.activeCategory === 'collage') {
      // 拼图分类：显示 COLLAGE_LAYOUTS
      list = window.COLLAGE_LAYOUTS || [];
    } else {
      list = state.presets;
      if (state.activeCategory !== 'all') {
        if (state.activeCategory === 'custom') {
          list = list.filter(p => p.isCustom);
        } else {
          list = list.filter(p => p.category === state.activeCategory);
        }
      }
    }

    list.forEach(preset => {
      const card = buildPresetCard(preset);
      grid.appendChild(card);
    });

    if (list.length === 0) {
      grid.innerHTML = '<p class="preset-empty">此分类暂无预设</p>';
    }
  }

  function buildPresetCard(preset) {
    const card = document.createElement('div');
    const isCollage = preset.isCollage;
    card.className = 'preset-card' + (preset.id === state.activePresetId ? ' active' : '');
    card.dataset.id = preset.id;

    // SVG 缩略图
    const svg = isCollage ? buildCollageSVG(preset) : buildPresetSVG(preset);
    card.appendChild(svg);

    // ── 名称（支持双击重命名） ────────────────────────────────────────────
    const nameEl = document.createElement('span');
    nameEl.className = 'preset-name';
    nameEl.textContent = Storage.getDisplayName(preset);
    nameEl.title = '双击重命名';
    nameEl.addEventListener('dblclick', e => {
      e.stopPropagation();
      startRename(preset, nameEl);
    });
    card.appendChild(nameEl);

    if (preset.isCustom) {
      const tag = document.createElement('span');
      tag.className = 'preset-tag-custom';
      tag.textContent = '自定义';
      card.appendChild(tag);
    }

    // ── 操作菜单（悬停时显示） ────────────────────────────────────────────
    const menuBtn = document.createElement('button');
    menuBtn.className = 'preset-menu-btn';
    menuBtn.innerHTML = '…';
    menuBtn.title = '更多操作';
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      showPresetMenu(e, preset, nameEl, card);
    });
    card.appendChild(menuBtn);

    card.addEventListener('click', () => selectPreset(preset.id));
    return card;
  }

  /** 弹出预设操作菜单 */
  function showPresetMenu(e, preset, nameEl, card) {
    closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';

    const addItem = (label, fn) => {
      const item = document.createElement('button');
      item.className = 'ctx-item';
      item.textContent = label;
      item.addEventListener('click', () => { closeContextMenu(); fn(); });
      menu.appendChild(item);
    };

    addItem('✏️ 重命名', () => startRename(preset, nameEl));
    addItem(preset.isCustom ? '🗑 删除预设' : '🙈 隐藏预设', () => {
      const label = Storage.getDisplayName(preset);
      if (!confirm(`${preset.isCustom ? '删除' : '隐藏'}预设「${label}」？`)) return;
      if (preset.isCustom) {
        Storage.deleteCustomPreset(preset.id);
      } else {
        Storage.hidePreset(preset.id);
      }
      state.presets = Storage.allPresets();
      renderPresetGrid();
    });

    document.body.appendChild(menu);
    // 定位到按钮附近
    const rect = e.currentTarget.getBoundingClientRect();
    menu.style.left = Math.min(rect.left, window.innerWidth - 160) + 'px';
    menu.style.top  = rect.bottom + 4 + 'px';

    // 点击其他地方关闭
    const outsideClick = ev => {
      if (!menu.contains(ev.target)) closeContextMenu();
    };
    setTimeout(() => document.addEventListener('click', outsideClick), 0);
    menu._outsideClick = outsideClick;
    menu._id = 'ctx-menu';
  }

  function closeContextMenu() {
    const old = document.querySelector('.ctx-menu');
    if (old) {
      if (old._outsideClick) document.removeEventListener('click', old._outsideClick);
      old.remove();
    }
  }

  /** 内联重命名 */
  function startRename(preset, nameEl) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'preset-rename-input';
    input.value = Storage.getDisplayName(preset);
    input.maxLength = 30;

    const commit = () => {
      const newName = input.value.trim();
      if (newName && newName !== preset.name) {
        Storage.setNameOverride(preset.id, newName);
        if (preset.isCustom) {
          // 同时更新 localStorage 中的 name 字段
          preset.name = newName;
          Storage.saveCustomPreset(preset);
        }
      }
      state.presets = Storage.allPresets();
      // 更新卡片显示名称
      nameEl.textContent = Storage.getDisplayName(preset);
      input.replaceWith(nameEl);
    };

    input.addEventListener('blur',  commit);
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter')  { ev.preventDefault(); commit(); }
      if (ev.key === 'Escape') { ev.preventDefault(); input.replaceWith(nameEl); }
    });

    nameEl.replaceWith(input);
    input.focus();
    input.select();
  }

  /** 为拼图预设生成 SVG 缩略图 */
  function buildCollageSVG(preset) {
    const W = 80, H = 56;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const pad = 3;
    const svgW = W - pad * 2, svgH = H - pad * 2;
    const cRatio = preset.outputRatio || 1;

    let frameW, frameH;
    if (cRatio >= svgW / svgH) { frameW = svgW; frameH = svgW / cRatio; }
    else                        { frameH = svgH; frameW = svgH * cRatio; }
    const fx = pad + (svgW - frameW) / 2;
    const fy = pad + (svgH - frameH) / 2;

    // 外框
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', fx); bg.setAttribute('y', fy);
    bg.setAttribute('width', frameW); bg.setAttribute('height', frameH);
    bg.setAttribute('fill', preset.border?.color || '#FFFFFF');
    bg.setAttribute('rx', 1);
    svg.appendChild(bg);

    // border 减去后的 photo area
    const b = preset.border || {};
    const shorter = Math.min(frameW, frameH);
    const bL = shorter * (b.left   || 0.04);
    const bT = shorter * (b.top    || 0.04);
    const bR = shorter * (b.right  || 0.04);
    const bB = shorter * (b.bottom || 0.18);
    const paX = fx + bL, paY = fy + bT;
    const paW = frameW - bL - bR, paH = frameH - bT - bB;

    // 各 cell
    (preset.cells || []).forEach(cell => {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', paX + cell.x * paW);
      r.setAttribute('y', paY + cell.y * paH);
      r.setAttribute('width',  Math.max(1, cell.w * paW - 0.5));
      r.setAttribute('height', Math.max(1, cell.h * paH - 0.5));
      r.setAttribute('fill', '#C0BAB0');
      r.setAttribute('rx', 0.5);
      svg.appendChild(r);
    });
    return svg;
  }

  function buildPresetSVG(preset) {
    const W = 80, H = 56; // SVG 视口
    const b = preset.border;
    const ratio = preset.thumb.photoRatio || 1;

    // 计算 SVG 内的照片区域
    // 以 SVG 视口为画布，border 是相对于照片短边
    // 先算最大照片区域，然后加边框
    const padH = 4; // 给 SVG 留一点 padding
    const padW = 4;
    const availW = W - padW * 2;
    const availH = H - padH * 2;

    // 假设边框比例（相对短边），大致估算
    const bL = b.left  || 0.05;
    const bR = b.right || 0.05;
    const bT = b.top   || 0.05;
    const bB = b.bottom|| 0.22;

    // 对于 SVG 展示，用画布比例反算照片区域
    // canvas_w / canvas_h = (photo_w + 2*shorter*bLR) / (photo_h + shorter*(bT+bB))
    // 先简单：以 availW x availH 按 canvasRatio 缩放
    const shorter = ratio >= 1 ? 1 : ratio; // 归一化 shorter
    const photoW_norm = ratio >= 1 ? ratio : 1;
    const photoH_norm = ratio >= 1 ? 1 : 1 / ratio;
    const shorterNorm = Math.min(photoW_norm, photoH_norm);
    const cW = photoW_norm + (bL + bR) * shorterNorm;
    const cH = photoH_norm + (bT + bB) * shorterNorm;
    const cRatio = cW / cH;

    let svgW, svgH;
    if (cRatio > availW / availH) {
      svgW = availW;
      svgH = availW / cRatio;
    } else {
      svgH = availH;
      svgW = availH * cRatio;
    }

    const offX = padW + (availW - svgW) / 2;
    const offY = padH + (availH - svgH) / 2;

    const bLpx = svgW * (bL * shorterNorm / cW);
    const bRpx = svgW * (bR * shorterNorm / cW);
    const bTpx = svgH * (bT * shorterNorm / cH);
    const bBpx = svgH * (bB * shorterNorm / cH);

    const photoX = offX + bLpx;
    const photoY = offY + bTpx;
    const pW = svgW - bLpx - bRpx;
    const pH = svgH - bTpx - bBpx;

    const bgColor   = b.color || '#FFFFFF';
    // 照片区域用渐变灰表示
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('xmlns', ns);

    // 外框 + 背景
    const outer = document.createElementNS(ns, 'rect');
    outer.setAttribute('x', offX); outer.setAttribute('y', offY);
    outer.setAttribute('width', svgW); outer.setAttribute('height', svgH);
    outer.setAttribute('fill', bgColor);
    outer.setAttribute('rx', 1);
    svg.appendChild(outer);

    // 照片占位（渐变灰）
    const photo = document.createElementNS(ns, 'rect');
    photo.setAttribute('x', photoX); photo.setAttribute('y', photoY);
    photo.setAttribute('width', Math.max(pW, 1)); photo.setAttribute('height', Math.max(pH, 1));
    photo.setAttribute('fill', '#C8C4BC');
    photo.setAttribute('rx', 0.5);
    svg.appendChild(photo);

    // 文字指示线（仅当有 infoBar 时）
    if (preset.infoBar?.enabled && bBpx > 4) {
      const lineY = offY + svgH - bBpx * 0.45;
      const line1 = document.createElementNS(ns, 'rect');
      line1.setAttribute('x', offX + svgW * 0.25); line1.setAttribute('y', lineY - 1);
      line1.setAttribute('width', svgW * 0.5); line1.setAttribute('height', 1);
      line1.setAttribute('fill', '#AAAAAA'); line1.setAttribute('rx', 0.5);
      svg.appendChild(line1);

      const line2 = document.createElementNS(ns, 'rect');
      line2.setAttribute('x', offX + svgW * 0.3); line2.setAttribute('y', lineY + 2.5);
      line2.setAttribute('width', svgW * 0.4); line2.setAttribute('height', 0.8);
      line2.setAttribute('fill', '#BBBBBB'); line2.setAttribute('rx', 0.4);
      svg.appendChild(line2);
    }

    return svg;
  }

  function selectPreset(id) {
    // 拼图预设 → 进入拼图编辑器
    const collageLayout = window.COLLAGE_LAYOUTS?.find(l => l.id === id);
    if (collageLayout) {
      enterCollageMode(collageLayout);
      return;
    }

    // 若比例改变，清除旧的裁切数据
    const oldPreset = activePreset();
    state.activePresetId = id;
    const newPreset = activePreset();

    const oldRatio = oldPreset?.thumb?.photoRatio;
    const newRatio = newPreset?.thumb?.photoRatio;
    if (oldRatio !== undefined && newRatio !== undefined &&
        Math.abs(oldRatio - newRatio) > 0.01) {
      const job = activeJob();
      if (job) job.cropRect = null;
    }

    // 若当前在裁切模式中，退出（不保存）
    if (state.cropMode) exitCropMode(false);

    document.querySelectorAll('.preset-card').forEach(c => {
      c.classList.toggle('active', c.dataset.id === id);
    });
    const preset = activePreset();
    const job = activeJob();
    if (job) {
      job.presetId = id;
      // 按 presetType 决定覆盖范围
      if (preset.presetType === 'style') {
        // 仅样式预设：只覆盖 border，保留现有 infoOverrides
        job.borderOverrides = { ...preset.border };
      } else {
        // 完整预设：覆盖 border + infoBar
        job.borderOverrides = { ...preset.border };
        job.infoOverrides = { ...preset.infoBar };
      }
      job.frameLayout = null;
      fillBorderForm(preset, job);
    }

    // Apply to all multi-selected jobs
    if (state.selectedJobIds.size > 1) {
      for (const jid of state.selectedJobIds) {
        if (jid === state.activeJobId) continue;
        const j = state.jobs.find(x => x.id === jid);
        if (j) {
          j.presetId = id;
          if (preset.presetType === 'style') {
            j.borderOverrides = { ...preset.border };
            // 不触碰 infoOverrides
          } else {
            j.borderOverrides = { ...preset.border };
            j.infoOverrides = { ...preset.infoBar };
          }
          j.frameLayout = null;
          j.cropRect = null;
        }
      }
      showToast(`已同步预设到 ${state.selectedJobIds.size} 张照片`);
    }

    syncExportControlsFromPreset(preset);
    updateCropButton();
    schedulePreview();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Tabs
  // ══════════════════════════════════════════════════════════════════════════
  function setupTabs() {
    document.querySelectorAll('.panel-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        state.activeTab = tab;
        document.querySelectorAll('.panel-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.hidden = true);
        const el = document.getElementById(`tab-${tab}`);
        if (el) el.hidden = false;
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 信息表单
  // ══════════════════════════════════════════════════════════════════════════
  function setupInfoForm() {
    const fields = ['location', 'camera', 'film', 'date'];
    fields.forEach(f => {
      const el = document.getElementById(`input-${f}`);
      if (!el) return;
      el.addEventListener('input', () => {
        const job = activeJob();
        if (!job) return;
        job.overrides[f] = el.value;
        schedulePreview();
      });
    });

    // 模板输入
    ['title-tpl', 'subtitle-tpl'].forEach(key => {
      const el = document.getElementById(`input-${key}`);
      if (!el) return;
      el.addEventListener('input', () => {
        const job = activeJob();
        if (!job) return;
        const field = key === 'title-tpl' ? 'titleTemplate' : 'subtitleTemplate';
        job.infoOverrides[field] = el.value;
        schedulePreview();
      });
    });

    // 模板变量点击插入
    document.querySelectorAll('.tpl-var').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.closest('.form-group').querySelector('input');
        if (!target) return;
        const pos = target.selectionStart;
        const v = btn.dataset.var;
        target.value = target.value.slice(0, pos) + v + target.value.slice(target.selectionEnd);
        target.dispatchEvent(new Event('input'));
        target.focus();
        target.setSelectionRange(pos + v.length, pos + v.length);
      });
    });
  }

  function fillInfoForm(job) {
    if (!job) return;
    const ov = job.overrides || {};
    const exif = job.exif || {};
    setVal('input-location', ov.location || '');
    setVal('input-camera',   ov.camera || exif.camera || '');
    setVal('input-film',     ov.film || '');
    setVal('input-date',     ov.date || exif.date || '');

    const preset = activePreset();
    const info = preset ? preset.infoBar : {};
    setVal('input-title-tpl',    job.infoOverrides?.titleTemplate    ?? info?.titleTemplate    ?? '');
    setVal('input-subtitle-tpl', job.infoOverrides?.subtitleTemplate ?? info?.subtitleTemplate ?? '');

    // EXIF 详情
    updateExifDisplay(exif);
  }

  function updateExifDisplay(exif) {
    const box = document.getElementById('exif-display');
    const content = document.getElementById('exif-content');
    if (!box || !content) return;
    const entries = [
      exif.camera      && `相机: ${exif.camera}`,
      exif.lens        && `镜头: ${exif.lens}`,
      exif.focalLength && `焦距: ${exif.focalLength}`,
      exif.aperture    && `光圈: ${exif.aperture}`,
      exif.shutter     && `快门: ${exif.shutter}`,
      exif.iso         && `ISO: ${exif.iso}`,
      exif.date        && `日期: ${exif.date}`,
    ].filter(Boolean);
    if (entries.length) {
      box.hidden = false;
      content.innerHTML = entries.map(e => `<div class="exif-row">${e}</div>`).join('');
    } else {
      box.hidden = true;
    }
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 边框/字体表单
  // ══════════════════════════════════════════════════════════════════════════
  function setupBorderForm() {
    // 颜色
    bindBorderControl('border-color', 'color',  v => v);

    // 边框四个方向（范围 0–0.40）
    ['top', 'bottom', 'left', 'right'].forEach(dir => {
      const slider = document.getElementById(`border-${dir}`);
      const numIn  = document.getElementById(`border-${dir}-num`);
      if (!slider || !numIn) return;

      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        numIn.value = (v * 100).toFixed(1);
        applyBorderOverride(dir, v);
      });
      numIn.addEventListener('change', () => {
        const v = Math.min(0.40, Math.max(0, parseFloat(numIn.value) / 100)) || 0;
        slider.value = v;
        applyBorderOverride(dir, v);
      });
    });

    // 圆角
    const radiusSlider = document.getElementById('border-radius');
    const radiusNum    = document.getElementById('border-radius-num');
    if (radiusSlider) {
      radiusSlider.addEventListener('input', () => {
        const v = parseFloat(radiusSlider.value);
        if (radiusNum) radiusNum.value = (v * 100).toFixed(1);
        applyBorderOverride('radius', v);
      });
    }

    // 字体 & 颜色
    bindInfoControl('font-title',       'titleFont',       v => v);
    bindInfoControl('font-subtitle',    'subtitleFont',    v => v);
    bindInfoControl('font-title-size',  'titleFontSize',   v => parseFloat(v));
    bindInfoControl('font-sub-size',    'subtitleFontSize',v => parseFloat(v));
    bindInfoControl('font-color',       'fontColor',       v => v);
    bindInfoControl('font-title-weight','titleFontWeight', v => parseInt(v, 10));
    bindInfoControl('font-title-style', 'titleFontStyle',  v => v);
    bindInfoControl('font-title-spacing','titleLetterSpacing', v => parseFloat(v));
    bindInfoControl('font-sub-weight',  'subtitleFontWeight', v => parseInt(v, 10));
    bindInfoControl('font-sub-style',   'subtitleFontStyle', v => v);
    bindInfoControl('font-sub-spacing', 'subtitleLetterSpacing', v => parseFloat(v));
    bindInfoControl('font-line-spacing','lineSpacing',     v => parseFloat(v));
    bindInfoControl('font-opacity',     'textOpacity',     v => parseFloat(v));
    bindInfoControl('font-rotation',    'textRotation',    v => parseFloat(v));
    bindInfoControl('font-stroke-color','textStrokeColor', v => v);
    bindInfoControl('font-stroke-width','textStrokeWidth', v => parseFloat(v));
    bindInfoControl('font-shadow-color','textShadowColor', v => v);
    bindInfoControl('font-shadow-opacity','textShadowOpacity', v => parseFloat(v));
    bindInfoControl('font-shadow-blur', 'textShadowBlur',  v => parseFloat(v));
    bindInfoControl('font-shadow-x',    'textShadowX',     v => parseFloat(v));
    bindInfoControl('font-shadow-y',    'textShadowY',     v => parseFloat(v));

    const bindTextValueLabel = (inputId, labelId, format) => {
      const input = document.getElementById(inputId);
      const label = document.getElementById(labelId);
      input?.addEventListener('input', () => {
        if (label) label.textContent = format(parseFloat(input.value));
      });
    };
    bindTextValueLabel('font-title-spacing', 'title-spacing-label', v => `${v.toFixed(2)}em`);
    bindTextValueLabel('font-sub-spacing', 'sub-spacing-label', v => `${v.toFixed(2)}em`);
    bindTextValueLabel('font-line-spacing', 'line-spacing-label', v => `${v.toFixed(2)}×`);
    bindTextValueLabel('font-opacity', 'font-opacity-label', v => `${Math.round(v * 100)}%`);
    bindTextValueLabel('font-rotation', 'font-rotation-label', v => `${Math.round(v)}°`);
    bindTextValueLabel('font-stroke-width', 'font-stroke-label', v => `${(v * 100).toFixed(1)}%`);
    bindTextValueLabel('font-shadow-opacity', 'font-shadow-label', v => `${Math.round(v * 100)}%`);

    // 对齐
    document.querySelectorAll('.align-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const job = activeJob();
        if (job) { job.infoOverrides.textAlign = btn.dataset.align; schedulePreview(); }
      });
    });

    // 开关
    const infoToggle = document.getElementById('info-toggle');
    if (infoToggle) {
      infoToggle.addEventListener('change', () => {
        const job = activeJob();
        if (job) { job.infoOverrides.enabled = infoToggle.checked; schedulePreview(); }
      });
    }

    // 主副标题间距
    bindInfoControl('title-gap', 'titleGap', v => parseFloat(v));
    const gapRange = document.getElementById('title-gap');
    const gapLabel = document.getElementById('title-gap-label');
    if (gapRange && gapLabel) {
      gapRange.addEventListener('input', () => {
        gapLabel.textContent = parseFloat(gapRange.value).toFixed(2) + '×';
      });
    }

    // 文字位置偏移
    bindInfoControl('text-offset-x', 'textOffsetX', v => parseFloat(v));
    bindInfoControl('text-offset-y', 'textOffsetY', v => parseFloat(v));
    const oxRange = document.getElementById('text-offset-x');
    const oxLabel = document.getElementById('text-offset-x-label');
    const oyRange = document.getElementById('text-offset-y');
    const oyLabel = document.getElementById('text-offset-y-label');
    if (oxRange && oxLabel) oxRange.addEventListener('input', () => {
      oxLabel.textContent = parseFloat(oxRange.value).toFixed(2);
      updateTextPosHandle();
      const job = activeJob();
      if (job) updateAlignmentGuides(job.infoOverrides || {});
    });
    if (oyRange && oyLabel) oyRange.addEventListener('input', () => {
      oyLabel.textContent = parseFloat(oyRange.value).toFixed(2);
      updateTextPosHandle();
      const job = activeJob();
      if (job) updateAlignmentGuides(job.infoOverrides || {});
    });

    // 重置文字位置按钮
    const btnTextReset = document.getElementById('btn-text-pos-reset');
    if (btnTextReset) {
      btnTextReset.addEventListener('click', () => {
        const job = activeJob();
        if (!job) return;
        if (!job.infoOverrides) job.infoOverrides = {};
        job.infoOverrides.textOffsetX = 0;
        job.infoOverrides.textOffsetY = 0;
        if (oxRange) oxRange.value = 0;
        if (oxLabel) oxLabel.textContent = '0.00';
        if (oyRange) oyRange.value = 0;
        if (oyLabel) oyLabel.textContent = '0.00';
        updateTextPosHandle();
        updateAlignmentGuides(job.infoOverrides);
        schedulePreview();
      });
    }

    // 额外文字行 — 添加按钮
    const btnAddLine = document.getElementById('btn-add-extra-line');
    if (btnAddLine) {
      btnAddLine.addEventListener('click', () => {
        const job = activeJob();
        if (!job) { showToast('请先上传照片', 'warn'); return; }
        if (!job.infoOverrides.extraLines) job.infoOverrides.extraLines = [];
        job.infoOverrides.extraLines.push({ template: '', font: '', fontSize: 0, letterSpacing: 0.04 });
        rebuildExtraLinesList(job);
        schedulePreview();
      });
    }

    // 文字快捷对齐按钮
    const btnHCenter = document.getElementById('btn-text-h-center');
    const btnVCenter = document.getElementById('btn-text-v-center');
    const btnLeft = document.getElementById('btn-text-left');
    const btnRight = document.getElementById('btn-text-right');

    btnHCenter?.addEventListener('click', () => {
      const job = activeJob();
      if (!job) return;
      if (!job.infoOverrides) job.infoOverrides = {};
      job.infoOverrides.textOffsetX = 0;
      const oxR = document.getElementById('text-offset-x');
      const oxL = document.getElementById('text-offset-x-label');
      if (oxR) oxR.value = 0;
      if (oxL) oxL.textContent = '0.00';
      schedulePreview();
      updateTextPosHandle();
      updateAlignmentGuides(job.infoOverrides);
    });

    btnVCenter?.addEventListener('click', () => {
      const job = activeJob();
      if (!job) return;
      if (!job.infoOverrides) job.infoOverrides = {};
      job.infoOverrides.textOffsetY = 0;
      const oyR = document.getElementById('text-offset-y');
      const oyL = document.getElementById('text-offset-y-label');
      if (oyR) oyR.value = 0;
      if (oyL) oyL.textContent = '0.00';
      schedulePreview();
      updateTextPosHandle();
      updateAlignmentGuides(job.infoOverrides);
    });

    btnLeft?.addEventListener('click', () => {
      const job = activeJob();
      if (!job) return;
      if (!job.infoOverrides) job.infoOverrides = {};
      // 左对齐：与拖拽最大范围一致
      job.infoOverrides.textOffsetX = TEXT_POS_MAX;
      const oxR = document.getElementById('text-offset-x');
      if (oxR) oxR.value = TEXT_POS_MAX;
      schedulePreview();
      updateTextPosHandle();
      updateAlignmentGuides(job.infoOverrides);
    });

    btnRight?.addEventListener('click', () => {
      const job = activeJob();
      if (!job) return;
      if (!job.infoOverrides) job.infoOverrides = {};
      // 右对齐：与拖拽最小范围一致
      job.infoOverrides.textOffsetX = -TEXT_POS_MAX;
      const oxR = document.getElementById('text-offset-x');
      if (oxR) oxR.value = -TEXT_POS_MAX;
      schedulePreview();
      updateTextPosHandle();
      updateAlignmentGuides(job.infoOverrides);
    });

    // 边框对称按钮
    const btnHSym = document.getElementById('btn-border-h-symmetry');
    const btnVSym = document.getElementById('btn-border-v-symmetry');

    btnHSym?.addEventListener('click', () => {
      const job = activeJob();
      const preset = activePreset();
      if (!job || !preset) return;
      if (!job.borderOverrides) job.borderOverrides = {};
      const b = Object.assign({}, preset.border, job.borderOverrides);
      const avg = (b.left + b.right) / 2;
      job.borderOverrides.left = avg;
      job.borderOverrides.right = avg;
      // 更新 UI
      const lSlider = document.getElementById('border-left');
      const rSlider = document.getElementById('border-right');
      const lNum = document.getElementById('border-left-num');
      const rNum = document.getElementById('border-right-num');
      if (lSlider) lSlider.value = avg;
      if (rSlider) rSlider.value = avg;
      if (lNum) lNum.value = (avg * 100).toFixed(1);
      if (rNum) rNum.value = (avg * 100).toFixed(1);
      schedulePreview();
      requestAnimationFrame(updateBorderResizeHandles);
    });

    btnVSym?.addEventListener('click', () => {
      const job = activeJob();
      const preset = activePreset();
      if (!job || !preset) return;
      if (!job.borderOverrides) job.borderOverrides = {};
      const b = Object.assign({}, preset.border, job.borderOverrides);
      const avg = (b.top + b.bottom) / 2;
      job.borderOverrides.top = avg;
      job.borderOverrides.bottom = avg;
      const tSlider = document.getElementById('border-top');
      const bSlider = document.getElementById('border-bottom');
      const tNum = document.getElementById('border-top-num');
      const bNum = document.getElementById('border-bottom-num');
      if (tSlider) tSlider.value = avg;
      if (bSlider) bSlider.value = avg;
      if (tNum) tNum.value = (avg * 100).toFixed(1);
      if (bNum) bNum.value = (avg * 100).toFixed(1);
      schedulePreview();
      requestAnimationFrame(updateBorderResizeHandles);
    });

    // 边框居中对画布按钮
    const btnBHCenter = document.getElementById('btn-border-h-center');
    const btnBVCenter = document.getElementById('btn-border-v-center');

    btnBHCenter?.addEventListener('click', () => {
      const job = activeJob();
      if (!job) return;
      if (!job.borderOverrides) job.borderOverrides = {};
      const preset = activePreset();
      const b = Object.assign({}, preset?.border || {}, job.borderOverrides);
      // 水平居中：左右边框取平均值
      const avg = (b.left + b.right) / 2;
      job.borderOverrides.left = avg;
      job.borderOverrides.right = avg;
      // 同步 UI
      ['left', 'right'].forEach(dir => {
        const s = document.getElementById(`border-${dir}`);
        const n = document.getElementById(`border-${dir}-num`);
        if (s) s.value = avg;
        if (n) n.value = (avg * 100).toFixed(1);
      });
      schedulePreview();
      requestAnimationFrame(updateBorderResizeHandles);
    });

    btnBVCenter?.addEventListener('click', () => {
      const job = activeJob();
      if (!job) return;
      if (!job.borderOverrides) job.borderOverrides = {};
      const preset = activePreset();
      const b = Object.assign({}, preset?.border || {}, job.borderOverrides);
      // 垂直居中：上下边框取平均值
      const avg = (b.top + b.bottom) / 2;
      job.borderOverrides.top = avg;
      job.borderOverrides.bottom = avg;
      ['top', 'bottom'].forEach(dir => {
        const s = document.getElementById(`border-${dir}`);
        const n = document.getElementById(`border-${dir}-num`);
        if (s) s.value = avg;
        if (n) n.value = (avg * 100).toFixed(1);
      });
      schedulePreview();
      requestAnimationFrame(updateBorderResizeHandles);
    });
  }

  function fillBorderForm(preset, job) {
    if (!preset) return;
    const b = Object.assign({}, preset.border, job?.borderOverrides || {});
    const info = Object.assign({}, preset.infoBar, job?.infoOverrides || {});

    ['top', 'bottom', 'left', 'right'].forEach(dir => {
      const s = document.getElementById(`border-${dir}`);
      const n = document.getElementById(`border-${dir}-num`);
      if (s) s.value = b[dir] ?? 0.05;
      if (n) n.value = ((b[dir] ?? 0.05) * 100).toFixed(1);
    });
    const rs = document.getElementById('border-radius');
    const rn = document.getElementById('border-radius-num');
    if (rs) rs.value = b.radius ?? 0;
    if (rn) rn.value = ((b.radius ?? 0) * 100).toFixed(1);

    const bc = document.getElementById('border-color');
    if (bc) bc.value = b.color || '#FFFFFF';

    setVal('font-title',       info.titleFont       || 'Noto Serif SC');
    setVal('font-subtitle',    info.subtitleFont    || 'system-ui');
    setVal('font-title-size',  info.titleFontSize   || 0.038);
    setVal('font-sub-size',    info.subtitleFontSize|| 0.026);
    setVal('font-title-weight', info.titleFontWeight ?? 400);
    setVal('font-title-style', info.titleFontStyle || 'normal');
    setVal('font-title-spacing', info.titleLetterSpacing ?? 0);
    setVal('font-sub-weight', info.subtitleFontWeight ?? 400);
    setVal('font-sub-style', info.subtitleFontStyle || 'normal');
    setVal('font-sub-spacing', info.subtitleLetterSpacing ?? 0.06);
    setVal('font-line-spacing', info.lineSpacing ?? 0.55);
    setVal('font-opacity', info.textOpacity ?? 1);
    setVal('font-rotation', info.textRotation ?? 0);
    setVal('font-stroke-color', info.textStrokeColor || '#FFFFFF');
    setVal('font-stroke-width', info.textStrokeWidth ?? 0);
    setVal('font-shadow-color', info.textShadowColor || '#000000');
    setVal('font-shadow-opacity', info.textShadowOpacity ?? 0);
    setVal('font-shadow-blur', info.textShadowBlur ?? 0.006);
    setVal('font-shadow-x', info.textShadowX ?? 0.003);
    setVal('font-shadow-y', info.textShadowY ?? 0.003);

    const setTextLabel = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setTextLabel('title-spacing-label', `${(info.titleLetterSpacing ?? 0).toFixed(2)}em`);
    setTextLabel('sub-spacing-label', `${(info.subtitleLetterSpacing ?? 0.06).toFixed(2)}em`);
    setTextLabel('line-spacing-label', `${(info.lineSpacing ?? 0.55).toFixed(2)}×`);
    setTextLabel('font-opacity-label', `${Math.round((info.textOpacity ?? 1) * 100)}%`);
    setTextLabel('font-rotation-label', `${Math.round(info.textRotation ?? 0)}°`);
    setTextLabel('font-stroke-label', `${((info.textStrokeWidth ?? 0) * 100).toFixed(1)}%`);
    setTextLabel('font-shadow-label', `${Math.round((info.textShadowOpacity ?? 0) * 100)}%`);

    const fc = document.getElementById('font-color');
    if (fc) fc.value = info.fontColor || '#1A1A1A';

    document.querySelectorAll('.align-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.align === (info.textAlign || 'center'));
    });

    const it = document.getElementById('info-toggle');
    if (it) it.checked = info.enabled !== false;

    // 主副标题间距
    const gapR = document.getElementById('title-gap');
    const gapL = document.getElementById('title-gap-label');
    const gapV = info.titleGap != null ? info.titleGap : 0.45;
    if (gapR) gapR.value = gapV;
    if (gapL) gapL.textContent = gapV.toFixed(2) + '×';

    // 文字位置偏移
    const oxR = document.getElementById('text-offset-x');
    const oxL = document.getElementById('text-offset-x-label');
    const oyR = document.getElementById('text-offset-y');
    const oyL = document.getElementById('text-offset-y-label');
    const ox  = info.textOffsetX != null ? info.textOffsetX : 0;
    const oy  = info.textOffsetY != null ? info.textOffsetY : 0;
    if (oxR) oxR.value = ox; if (oxL) oxL.textContent = ox.toFixed(2);
    if (oyR) oyR.value = oy; if (oyL) oyL.textContent = oy.toFixed(2);

    // 额外文字行
    rebuildExtraLinesList(job);
  }

  function applyBorderOverride(key, val) {
    const job = activeJob();
    if (!job) return;
    job.borderOverrides[key] = val;
    if (job.frameLayout && ['top', 'bottom', 'left', 'right'].includes(key)) {
      const f = job.frameLayout;
      const shorter = Math.max(1, Math.min(f.photoW, f.photoH));
      const margin = val * shorter;
      if (key === 'left') {
        const right = f.photoX + f.photoW;
        f.photoX = Math.min(right - 40, margin);
        f.photoW = right - f.photoX;
      } else if (key === 'right') {
        f.photoW = Math.max(40, f.canvasW - margin - f.photoX);
      } else if (key === 'top') {
        const bottom = f.photoY + f.photoH;
        f.photoY = Math.min(bottom - 40, margin);
        f.photoH = bottom - f.photoY;
      } else if (key === 'bottom') {
        f.photoH = Math.max(40, f.canvasH - margin - f.photoY);
      }
      syncBorderOverridesFromFrame(job);
    }
    schedulePreview();
  }

  function bindBorderControl(id, key, transform) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const job = activeJob();
      if (!job) return;
      job.borderOverrides[key] = transform(el.value);
      schedulePreview();
    });
  }

  function bindInfoControl(id, key, transform) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const job = activeJob();
      if (!job) return;
      job.infoOverrides[key] = transform(el.value);
      schedulePreview();
    });
    el.addEventListener('change', () => el.dispatchEvent(new Event('input')));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 导出设置
  // ══════════════════════════════════════════════════════════════════════════
  function setupExportControls() {
    // 导出 Tab 按钮 → 顶部主按钮
    const s2 = document.getElementById('btn-export-single2');
    if (s2) s2.addEventListener('click', doExportSingle);
    const b2 = document.getElementById('btn-export-batch2');
    if (b2) b2.addEventListener('click', doExportBatch);

    // 字体大小 Label 同步
    const titleRange = document.getElementById('font-title-size');
    const titleLabel = document.getElementById('title-size-label');
    if (titleRange && titleLabel) {
      titleRange.addEventListener('input', () => {
        titleLabel.textContent = (parseFloat(titleRange.value) * 100).toFixed(1) + '%';
      });
    }
    const subRange = document.getElementById('font-sub-size');
    const subLabel = document.getElementById('sub-size-label');
    if (subRange && subLabel) {
      subRange.addEventListener('input', () => {
        subLabel.textContent = (parseFloat(subRange.value) * 100).toFixed(1) + '%';
      });
    }

    const fmt = document.getElementById('output-format');
    const qty = document.getElementById('output-quality');
    const qLabel = document.getElementById('quality-label');
    const res = document.getElementById('output-resolution');

    if (fmt) fmt.addEventListener('change', () => { state.exportFormat = fmt.value; });
    if (qty) qty.addEventListener('input', () => {
      state.exportQuality = parseInt(qty.value, 10);
      if (qLabel) qLabel.textContent = qty.value + '%';
    });
    if (res) res.addEventListener('change', () => { state.exportLongEdge = parseInt(res.value, 10) || 3000; });

    // 导出按钮
    const btnSingle = document.getElementById('btn-export-single');
    if (btnSingle) btnSingle.addEventListener('click', doExportSingle);

    const btnBatch = document.getElementById('btn-export-batch');
    if (btnBatch) btnBatch.addEventListener('click', doExportBatch);
  }

  function syncExportControlsFromPreset(preset) {
    if (!preset?.output) return;
    const out = preset.output;
    const fmt = document.getElementById('output-format');
    const res = document.getElementById('output-resolution');
    const qty = document.getElementById('output-quality');
    const ql  = document.getElementById('quality-label');
    if (fmt) fmt.value = out.format  || 'jpeg';
    if (res) res.value = String(out.longEdge || 3000);
    if (qty) qty.value = out.quality || 95;
    if (ql)  ql.textContent = (out.quality || 95) + '%';
    state.exportFormat    = out.format   || 'jpeg';
    state.exportQuality   = out.quality  || 95;
    state.exportLongEdge  = out.longEdge || 3000;
  }

  async function doExportSingle() {
    const job = activeJob();
    if (!job) { showToast('请先上传照片', 'warn'); return; }
    const preset = activePreset();
    if (!preset) return;

    const btn = document.getElementById('btn-export-single');
    if (btn) { btn.disabled = true; btn.textContent = '导出中…'; }

    try {
      const mergedPreset = buildMergedPreset(preset, job);
      await BatchProcessor.exportSingle(job, mergedPreset);
      showToast('保存成功！');
    } catch (e) {
      showToast('导出失败: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '保存照片'; }
    }
  }

  async function doExportBatch() {
    if (state.jobs.length === 0) { showToast('请先上传照片', 'warn'); return; }
    if (typeof saveAs === 'undefined') { showToast('FileSaver 未加载', 'error'); return; }

    const btn = document.getElementById('btn-export-batch');
    const progress = document.getElementById('batch-progress');
    if (btn) { btn.disabled = true; }
    if (progress) { progress.hidden = false; }

    try {
      await BatchProcessor.exportZip(
        state.jobs,
        job => {
          const pid = job?.presetId || state.activePresetId;
          const p = state.presets.find(p => p.id === pid) || activePreset();
          return buildMergedPreset(p, job);
        },
        (done, total) => {
          if (progress) progress.value = done / total;
          if (btn) btn.textContent = `处理中 ${done}/${total}…`;
        }
      );
      showToast(`${state.jobs.length} 张照片已打包下载`);
    } catch (e) {
      showToast('批量导出失败: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = `批量导出 (${state.jobs.length})张`; }
      if (progress) { progress.hidden = true; progress.value = 0; }
    }
  }

  function buildMergedPreset(preset, job) {
    if (!preset) return preset;
    // 从预设 infoBar 开始
    const mergedInfo = { ...preset.infoBar };
    // 只覆盖 job 中显式设置的值
    const overrides = job?.infoOverrides || {};
    for (const key of Object.keys(overrides)) {
      if (overrides[key] !== undefined) {
        mergedInfo[key] = overrides[key];
      }
    }
    // 确保 extraLines 是数组
    if (!Array.isArray(mergedInfo.extraLines)) mergedInfo.extraLines = [];
    return {
      ...preset,
      border:  Object.assign({}, preset.border,  job?.borderOverrides || {}),
      infoBar: mergedInfo,
      output: {
        format:   state.exportFormat   || preset.output?.format   || 'jpeg',
        quality:  state.exportQuality  || preset.output?.quality  || 95,
        longEdge: state.exportLongEdge || preset.output?.longEdge || 3000,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 预览渲染
  // ══════════════════════════════════════════════════════════════════════════
  function schedulePreview() {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(renderPreview, 180);
    scheduleSessionSave();
  }

  /** 拖拽专用：RAF 节流，立即渲染，跳过上一帧仍在渲染的情况 */
  function schedulePreviewNow() {
    clearTimeout(previewDebounce);
    if (_rafPreview) cancelAnimationFrame(_rafPreview);
    _rafPreview = requestAnimationFrame(() => {
      _rafPreview = null;
      if (!state.isRendering) renderPreview();
    });
    scheduleSessionSave();
  }

  async function renderPreview() {
    const generation = ++_previewGeneration;
    const job = activeJob();
    const preset = activePreset();
    if (!job || !preset) return;

    state.isRendering = true;
    const indicator = document.getElementById('render-indicator');
    if (indicator) indicator.hidden = false;

    try {
      const mergedPreset = buildMergedPreset(preset, job);
      const canvas = await CanvasRenderer.renderPreview(job.file, mergedPreset, job, 1400);
      if (generation !== _previewGeneration || job !== activeJob()) return;
      displayPreview(canvas);
      updateSizeInfo(canvas);
      updateTextPosHandle();   // 文字位置句柄跟随重渲染更新
      // 等浏览器 layout 完成后再定位边框句柄，确保 getBoundingClientRect 是最新值
      // 拖拽中：用预测算法（锁定 rect）；静止时：用实际 layout
      requestAnimationFrame(_borderDragState ? updateBorderResizeHandlesDrag : updateBorderResizeHandles);
    } catch (e) {
      console.error('[Preview] 渲染失败:', e);
    } finally {
      state.isRendering = false;
      if (indicator) indicator.hidden = true;
    }
  }

  // 拖拽中强制渲染，不设置 isRendering 标志（避免阻塞后续渲染）
  async function renderPreviewForce() {
    if (_borderRenderInFlight) { _borderRenderQueued = true; return; }
    _borderRenderInFlight = true;
    try {
      do {
        _borderRenderQueued = false;
        const job = activeJob();
        const preset = activePreset();
        if (!job || !preset || !_borderDragState) break;
        const mergedPreset = buildMergedPreset(preset, job);
        // 拖动中使用较轻的工作预览；松手后 renderPreview 会恢复 1400px 精细预览。
        const canvas = await CanvasRenderer.renderPreview(job.file, mergedPreset, job, 1000);
        if (!_borderDragState || job !== activeJob()) continue;
        displayPreview(canvas);
        updateSizeInfo(canvas);
        updateBorderResizeHandlesDrag();
      } while (_borderRenderQueued);
    } catch (e) {
      console.error('[renderForce] error:', e);
    } finally {
      _borderRenderInFlight = false;
    }
  }

  function displayPreview(offscreenCanvas) {
    const preview = document.getElementById('canvas-preview');
    if (!preview) return;
    const wrapper = document.getElementById('preview-wrapper');

    // 边框拖拽中：更新 canvas 像素尺寸以反映新边框值，但 CSS 尺寸锁定（外框不动）
    if (_borderDragState) {
      preview.width  = offscreenCanvas.width;
      preview.height = offscreenCanvas.height;
      const ctx = preview.getContext('2d');
      ctx.drawImage(offscreenCanvas, 0, 0);
      const rect = _borderDragState.currentRect || _borderDragState.startRect;
      preview.style.transform = 'none';
      preview.style.width = rect.width + 'px';
      preview.style.height = rect.height + 'px';
      // preview-wrapper 默认居中；用位移抵消居中重排，让正在拖动的边保持在指针下。
      const naturalRect = preview.getBoundingClientRect();
      const tx = rect.left - naturalRect.left;
      const ty = rect.top - naturalRect.top;
      preview.style.transform = `translate(${tx}px, ${ty}px)`;
      return;
    }

    preview.width  = offscreenCanvas.width;
    preview.height = offscreenCanvas.height;
    const ctx = preview.getContext('2d');
    ctx.drawImage(offscreenCanvas, 0, 0);

    // 画布渲染后应用缩放
    applyZoom(wrapper, preview);
  }

  function clearPreview() {
    const preview = document.getElementById('canvas-preview');
    if (!preview) return;
    preview.width = 1;
    preview.height = 1;
  }

  function updateSizeInfo(canvas) {
    const el = document.getElementById('preview-size-info');
    if (el) el.textContent = `预览 ${canvas.width} × ${canvas.height}px`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 缩放控制
  // ══════════════════════════════════════════════════════════════════════════
  function setupZoomControls() {
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => changeZoom(0.2));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => changeZoom(-0.2));
    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => setZoom('fit'));

    // Scroll-wheel zoom on the preview wrapper. Border handles and the photo mover
    // live in a fixed sibling overlay, so the same handler must be attached there too.
    const wrapper = document.getElementById('preview-wrapper');
    const handlePreviewWheel = e => {
      e.preventDefault();
      const canvas = document.getElementById('canvas-preview');
      const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      let current;
      if (state.zoom === 'fit') {
        // Compute current fit scale from actual rendered canvas size
        if (canvas && canvas.width > 1) {
          const rect = canvas.getBoundingClientRect();
          current = rect.width / canvas.width;
        } else {
          current = 1;
        }
      } else {
        current = state.zoom;
      }
      const next = Math.max(0.2, Math.min(4.0, current * delta));
      setZoom(next);
    };
    wrapper?.addEventListener('wheel', handlePreviewWheel, { passive: false });
    document.getElementById('border-resize-overlay')
      ?.addEventListener('wheel', handlePreviewWheel, { passive: false });
  }

  function changeZoom(delta) {
    const current = state.zoom === 'fit' ? 1 : state.zoom;
    setZoom(Math.max(0.2, Math.min(4, current + delta)));
  }

  function setZoom(z) {
    state.zoom = z;
    const label = document.getElementById('zoom-label');
    if (label) label.textContent = z === 'fit' ? '适应' : Math.round(z * 100) + '%';
    const wrapper = document.getElementById('preview-wrapper');
    const canvas  = document.getElementById('canvas-preview');
    if (wrapper && canvas) applyZoom(wrapper, canvas);
  }

  function applyZoom(wrapper, canvas) {
    if (!wrapper || !canvas) return;

    if (state.zoom === 'fit') {
      canvas.style.width  = '';
      canvas.style.height = '';
      canvas.style.maxWidth  = '100%';
      canvas.style.maxHeight = '100%';
    } else {
      const pxW = Math.round(canvas.width  * state.zoom);
      const pxH = Math.round(canvas.height * state.zoom);
      canvas.style.maxWidth  = 'none';
      canvas.style.maxHeight = 'none';
      canvas.style.width  = pxW + 'px';
      canvas.style.height = pxH + 'px';
    }

    // 边框编辑层使用 fixed 定位，不会自动跟随 canvas 的 CSS 尺寸变化。
    // 排入下一帧，并由 ResizeObserver 兜底处理容器重排造成的尺寸变化。
    scheduleBorderOverlaySync();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 保存自定义预设
  // ══════════════════════════════════════════════════════════════════════════
  function setupPresetSave() {
    const btnSave   = document.getElementById('btn-save-preset');
    const modal     = document.getElementById('modal-save-preset');
    const btnCancel = document.getElementById('btn-modal-cancel');
    const btnOk     = document.getElementById('btn-modal-save');

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        if (modal) modal.hidden = false;
        const nameInput = document.getElementById('preset-name-input');
        if (nameInput) nameInput.value = activePreset()?.name + ' 副本' || '我的预设';
      });
    }
    if (btnCancel) btnCancel.addEventListener('click', () => { if (modal) modal.hidden = true; });
    if (btnOk) {
      btnOk.addEventListener('click', () => {
        const nameInput = document.getElementById('preset-name-input');
        const catInput  = document.getElementById('preset-cat-input');
        const preset    = activePreset();
        const job       = activeJob();
        if (!preset) return;

        // 读取预设类型选择
        const presetTypeEl = document.querySelector('input[name="preset-type"]:checked');
        const presetType = presetTypeEl?.value || 'full';

        const merged = buildMergedPreset(preset, job);
        const newPreset = {
          ...merged,
          id: 'custom-' + uid(),
          name: nameInput?.value.trim() || '我的预设',
          category: catInput?.value || 'custom',
          isCustom: true,
          presetType: presetType,
        };

        // 仅样式预设：恢复为原始 infoBar，不保存用户修改的信息字段
        if (presetType === 'style') {
          newPreset.infoBar = { ...preset.infoBar };
        }

        Storage.saveCustomPreset(newPreset);
        state.presets = Storage.allPresets();
        renderPresetGrid();
        if (modal) modal.hidden = true;
        showToast('预设已保存');
      });
    }

    // 点击遮罩关闭
    if (modal) {
      modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 移动端导航
  // ══════════════════════════════════════════════════════════════════════════
  function setupMobileNav() {
    document.querySelectorAll('.mobile-nav-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        document.querySelectorAll('.mobile-nav-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // 映射到左侧 tab
        const map = { presets: 'presets', info: 'info', border: 'border', export: 'output' };
        const tabName = map[panel] || 'presets';
        const tabBtn = document.querySelector(`.panel-tab[data-tab="${tabName}"]`);
        if (tabBtn) tabBtn.click();

        // 移动端：显示/隐藏左侧面板
        const panelEl = document.getElementById('panel-left');
        panelEl?.classList.toggle('mobile-open', true);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 空状态
  // ══════════════════════════════════════════════════════════════════════════
  function updateEmptyState() {
    const emptyState  = document.getElementById('empty-state');
    const previewArea = document.getElementById('preview-wrapper');
    const hasJobs     = state.jobs.length > 0;
    if (emptyState)  emptyState.hidden  = hasJobs;
    if (previewArea) previewArea.hidden = !hasJobs;
    const btnBatch = document.getElementById('btn-export-batch');
    if (btnBatch) btnBatch.textContent = `批量导出 (${state.jobs.length}张)`;
    const btnClear = document.getElementById('btn-clear-session');
    if (btnClear) btnClear.hidden = !hasJobs;
    updateCropButton();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 裁切模式
  // ══════════════════════════════════════════════════════════════════════════
  function setupCropMode() {
    const btnEnter  = document.getElementById('btn-adjust-crop');
    const btnDone   = document.getElementById('btn-crop-done');
    const btnReset  = document.getElementById('btn-crop-reset');
    const btnCancel = document.getElementById('btn-crop-cancel');

    btnEnter  && btnEnter.addEventListener('click',  () => enterCropMode());
    btnDone   && btnDone.addEventListener('click',   () => {
      if (state.slotCropMode) exitSlotCropMode(true);
      else exitCropMode(true);
    });
    btnReset  && btnReset.addEventListener('click',  () => cropEditorInstance?.resetToCenter());
    btnCancel && btnCancel.addEventListener('click', () => {
      if (state.slotCropMode) exitSlotCropMode(false);
      else exitCropMode(false);
    });

    // 锁定比例开关
    const btnLockRatio = document.getElementById('btn-crop-lock-ratio');
    btnLockRatio?.addEventListener('click', () => {
      if (!cropEditorInstance) return;
      cropEditorInstance.lockRatio = !cropEditorInstance.lockRatio;
      btnLockRatio.classList.toggle('active', cropEditorInstance.lockRatio);
      btnLockRatio.textContent = cropEditorInstance.lockRatio ? '🔒 锁定比例' : '🔓 自由比例';
    });
  }

  function updateCropButton() {
    const btn = document.getElementById('btn-adjust-crop');
    if (!btn) return;
    const job    = activeJob();
    const preset = activePreset();
    // 只要有照片就显示裁切按钮
    const show = !!(job && preset);
    btn.hidden = !show;

    // 若已有自定义裁切，加 dot 提示
    btn.classList.toggle('has-crop', !!(job && job.cropRect));

    // 文字工具始终随照片显示；即使关闭了信息文字，也能从这里重新启用。
    const btnTP = document.getElementById('btn-text-pos');
    if (btnTP) btnTP.hidden = !show;

    // 边框调整按钮：有照片时显示
    const btnBR = document.getElementById('btn-border-resize');
    if (btnBR) btnBR.hidden = !show;
  }

  async function enterCropMode() {
    const job    = activeJob();
    const preset = activePreset();
    if (!job || !preset) { showToast('请先上传照片', 'warn'); return; }

    const overlay = document.getElementById('crop-overlay');
    if (!overlay) return;

    const btn = document.getElementById('btn-adjust-crop');
    if (btn) btn.disabled = true;

    try {
      const img         = await getJobImage(job);
      const targetRatio = preset.thumb?.photoRatio ?? (img.naturalWidth / img.naturalHeight);

      // 展示标题
      const titleEl = document.getElementById('crop-title');
      if (titleEl) titleEl.textContent =
        `${preset.name}  ·  ${formatRatio(targetRatio)}`;

      overlay.hidden = false;
      state.cropMode = true;

      const cropCanvas = document.getElementById('crop-canvas');
      const inner      = document.getElementById('crop-overlay-inner');
      const dpr        = window.devicePixelRatio || 1;

      // 延一帧让 overlay 完成 layout
      await new Promise(r => requestAnimationFrame(r));

      const rect = inner.getBoundingClientRect();
      cropCanvas.width  = Math.round(rect.width  * dpr);
      cropCanvas.height = Math.round(rect.height * dpr);
      cropCanvas.style.width  = rect.width  + 'px';
      cropCanvas.style.height = rect.height + 'px';

      cropEditorInstance = new CropEditor(cropCanvas, img, targetRatio, dpr);

      // 初始化锁定比例按钮状态
      const btnLockRatio = document.getElementById('btn-crop-lock-ratio');
      if (btnLockRatio) {
        btnLockRatio.classList.toggle('active', cropEditorInstance.lockRatio);
        btnLockRatio.textContent = cropEditorInstance.lockRatio ? '🔒 锁定比例' : '🔓 自由比例';
      }

      if (job.cropRect) {
        cropEditorInstance.setFromCropRect(job.cropRect);
      }

      // Enter 确认 / Esc 取消（仅在裁切模式中生效）
      const cropKeyHandler = e => {
        if (!state.cropMode) return;
        if (e.key === 'Enter')  { e.preventDefault(); exitCropMode(true);  }
        if (e.key === 'Escape') { e.preventDefault(); exitCropMode(false); }
      };
      document._cropKeyHandler = cropKeyHandler;
      document.addEventListener('keydown', cropKeyHandler);
    } catch (e) {
      showToast('进入裁切模式失败: ' + e.message, 'error');
      overlay.hidden = true;
      state.cropMode = false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function exitCropMode(apply = true) {
    // 移除 Enter/Esc 监听
    if (document._cropKeyHandler) {
      document.removeEventListener('keydown', document._cropKeyHandler);
      document._cropKeyHandler = null;
    }
    if (apply && cropEditorInstance) {
      const job = activeJob();
      if (job) { job.cropRect = cropEditorInstance.getCropData(); }
    }
    if (cropEditorInstance) { cropEditorInstance.destroy(); cropEditorInstance = null; }
    const overlay = document.getElementById('crop-overlay');
    if (overlay) overlay.hidden = true;
    state.cropMode = false;
    updateCropButton();
    if (apply) schedulePreview();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 拼图模式
  // ══════════════════════════════════════════════════════════════════════════
  function setupCollageMode() {
    document.getElementById('btn-collage-cancel')
      ?.addEventListener('click', () => exitCollageMode());
    document.getElementById('btn-collage-export')
      ?.addEventListener('click', () => doExportCollage());

    const titleInput    = document.getElementById('collage-title-input');
    const subtitleInput = document.getElementById('collage-subtitle-input');
    titleInput?.addEventListener('input', () => {
      if (state.collageLayout) scheduleCollagePreview();
    });
    subtitleInput?.addEventListener('input', () => {
      if (state.collageLayout) scheduleCollagePreview();
    });

    // 照片选择器取消
    document.getElementById('btn-picker-cancel')
      ?.addEventListener('click', closePhotoPicker);
    document.getElementById('photo-picker-overlay')
      ?.addEventListener('click', e => {
        if (e.target.id === 'photo-picker-overlay') closePhotoPicker();
      });
  }

  function enterCollageMode(layout) {
    // 退出普通裁切模式（若有）
    if (state.cropMode) exitCropMode(false);

    // 深拷贝布局（避免污染原始定义）
    state.collageLayout = JSON.parse(JSON.stringify(layout));
    state.collageCells  = Array.from({ length: layout.cellCount }, () => ({ file: null, cropRect: null }));
    state.collageActiveSlot = -1;
    state.collageMode = true;

    // 自动预填已上传的照片
    if (state.jobs.length > 0) {
      state.jobs.slice(0, layout.cellCount).forEach((job, i) => {
        state.collageCells[i].file = job.file;
      });
    }

    const overlay = document.getElementById('collage-overlay');
    if (overlay) overlay.hidden = false;

    const nameEl = document.getElementById('collage-layout-name');
    if (nameEl) nameEl.textContent = Storage.getDisplayName(layout);

    setVal('collage-title-input',    '');
    setVal('collage-subtitle-input', '');

    updateSlotList();
    scheduleCollagePreview();

    // Esc 退出拼图编辑
    const keyHandler = e => {
      if (!state.collageMode) return;
      if (e.key === 'Escape') { e.preventDefault(); exitCollageMode(); }
    };
    document._collageKeyHandler = keyHandler;
    document.addEventListener('keydown', keyHandler);
  }

  function exitCollageMode() {
    if (document._collageKeyHandler) {
      document.removeEventListener('keydown', document._collageKeyHandler);
      document._collageKeyHandler = null;
    }
    const overlay = document.getElementById('collage-overlay');
    if (overlay) overlay.hidden = true;
    state.collageMode   = false;
    state.collageLayout = null;
    state.collageCells  = [];
    state.collageActiveSlot = -1;
  }

  function scheduleCollagePreview() {
    clearTimeout(collagePreviewDebounce);
    collagePreviewDebounce = setTimeout(renderCollagePreview, 250);
  }

  async function renderCollagePreview() {
    if (!state.collageMode || !state.collageLayout) return;
    const layout = state.collageLayout;

    // 为每个 cell 载入 Image 对象
    const cellsWithImages = await Promise.all(
      state.collageCells.map(async cell => {
        if (!cell.file) return { ...cell };
        const img = imageCache.has(cell.file)
          ? imageCache.get(cell.file)
          : await getJobImage({ file: cell.file });
        return { ...cell, imgCache: img };
      })
    );

    const titleInput    = document.getElementById('collage-title-input');
    const subtitleInput = document.getElementById('collage-subtitle-input');
    const infoOverride  = {
      titleTemplate:    titleInput?.value.trim()    || '',
      subtitleTemplate: subtitleInput?.value.trim() || '',
    };

    try {
      const canvas = await CollageRenderer.renderPreview(
        layout, cellsWithImages, infoOverride, {}, 1000
      );
      const preview = document.getElementById('collage-canvas');
      if (!preview) return;
      preview.width  = canvas.width;
      preview.height = canvas.height;
      preview.getContext('2d').drawImage(canvas, 0, 0);
    } catch (e) {
      console.error('[CollagePreview]', e);
    }
  }

  function updateSlotList() {
    const container = document.getElementById('collage-slot-list');
    if (!container || !state.collageLayout) return;
    container.innerHTML = '';

    state.collageCells.forEach((cell, i) => {
      const card = document.createElement('div');
      card.className = 'collage-slot-card' + (cell.file ? ' slot-assigned' : '');
      card.dataset.slot = i;

      // 序号
      const num = document.createElement('span');
      num.className = 'collage-slot-num';
      num.textContent = i + 1;
      card.appendChild(num);

      // 缩略图
      const thumb = document.createElement('div');
      thumb.className = 'collage-slot-thumb';
      if (cell.file) {
        const job = state.jobs.find(j => j.file === cell.file);
        if (job?.thumbUrl) {
          const img = document.createElement('img');
          img.src = job.thumbUrl;
          thumb.appendChild(img);
        } else {
          thumb.innerHTML = '<span class="collage-slot-thumb-empty">·</span>';
        }
      } else {
        thumb.innerHTML = '<span class="collage-slot-thumb-empty">+</span>';
      }
      card.appendChild(thumb);

      // 文件名
      const meta = document.createElement('div');
      meta.className = 'collage-slot-meta';
      const fname = document.createElement('div');
      if (cell.file) {
        fname.className = 'collage-slot-filename';
        fname.textContent = cell.file.name.replace(/\.[^.]+$/, '');
      } else {
        fname.className = 'collage-slot-empty-label';
        fname.textContent = '未分配';
      }
      meta.appendChild(fname);
      card.appendChild(meta);

      // 操作按钮
      const actions = document.createElement('div');
      actions.className = 'collage-slot-actions';

      const assignBtn = document.createElement('button');
      assignBtn.className = 'collage-slot-btn';
      assignBtn.textContent = cell.file ? '换图' : '选图';
      assignBtn.addEventListener('click', e => { e.stopPropagation(); openPhotoPicker(i); });
      actions.appendChild(assignBtn);

      if (cell.file) {
        const cropBtn = document.createElement('button');
        cropBtn.className = 'collage-slot-btn' + (cell.cropRect ? ' has-crop' : '');
        cropBtn.textContent = cell.cropRect ? '✓裁切' : '裁切';
        cropBtn.addEventListener('click', e => { e.stopPropagation(); enterSlotCropMode(i); });
        actions.appendChild(cropBtn);

        const clearBtn = document.createElement('button');
        clearBtn.className = 'collage-slot-btn';
        clearBtn.textContent = '×';
        clearBtn.title = '移除';
        clearBtn.addEventListener('click', e => {
          e.stopPropagation();
          state.collageCells[i] = { file: null, cropRect: null };
          updateSlotList();
          scheduleCollagePreview();
        });
        actions.appendChild(clearBtn);
      }

      card.appendChild(actions);
      card.addEventListener('click', () => openPhotoPicker(i));
      container.appendChild(card);
    });
  }

  function openPhotoPicker(slotIndex) {
    state.collageActiveSlot = slotIndex;
    const overlay = document.getElementById('photo-picker-overlay');
    const grid    = document.getElementById('photo-picker-grid');
    if (!overlay || !grid) return;

    grid.innerHTML = '';
    if (state.jobs.length === 0) {
      grid.innerHTML = '<div class="photo-picker-empty">请先上传照片</div>';
    } else {
      state.jobs.forEach(job => {
        const item = document.createElement('div');
        item.className = 'photo-picker-item';
        if (job.thumbUrl) {
          const img = document.createElement('img');
          img.src = job.thumbUrl;
          item.appendChild(img);
        }
        item.addEventListener('click', () => {
          assignSlotPhoto(slotIndex, job.file);
          closePhotoPicker();
        });
        grid.appendChild(item);
      });
    }
    overlay.hidden = false;
  }

  function closePhotoPicker() {
    const overlay = document.getElementById('photo-picker-overlay');
    if (overlay) overlay.hidden = true;
    state.collageActiveSlot = -1;
  }

  function assignSlotPhoto(slotIndex, file) {
    if (slotIndex < 0 || slotIndex >= state.collageCells.length) return;
    state.collageCells[slotIndex] = { file, cropRect: null };
    updateSlotList();
    scheduleCollagePreview();
  }

  async function enterSlotCropMode(slotIndex) {
    const cell   = state.collageCells[slotIndex];
    const layout = state.collageLayout;
    if (!cell?.file || !layout) return;

    const cellDef    = layout.cells[slotIndex];
    const cellRatio  = cellDef.w / cellDef.h;
    const img        = await getJobImage({ file: cell.file });

    // 隐藏拼图 overlay，显示裁切 overlay（复用同一个）
    const collageOverlay = document.getElementById('collage-overlay');
    if (collageOverlay) collageOverlay.hidden = true;

    const cropOverlay = document.getElementById('crop-overlay');
    if (!cropOverlay) return;

    const titleEl = document.getElementById('crop-title');
    if (titleEl) titleEl.textContent = `格子 ${slotIndex + 1}  ·  ${formatRatio(cellRatio)}`;

    cropOverlay.hidden = false;
    state.slotCropMode  = true;
    state.slotCropIndex = slotIndex;

    const cropCanvas = document.getElementById('crop-canvas');
    const inner      = document.getElementById('crop-overlay-inner');
    const dpr        = window.devicePixelRatio || 1;
    await new Promise(r => requestAnimationFrame(r));

    const rect = inner.getBoundingClientRect();
    cropCanvas.width  = Math.round(rect.width  * dpr);
    cropCanvas.height = Math.round(rect.height * dpr);
    cropCanvas.style.width  = rect.width  + 'px';
    cropCanvas.style.height = rect.height + 'px';

    cropEditorInstance = new CropEditor(cropCanvas, img, cellRatio, dpr);
    if (cell.cropRect) cropEditorInstance.setFromCropRect(cell.cropRect);

    // Enter / Esc 快捷键
    const keyHandler = e => {
      if (!state.slotCropMode) return;
      if (e.key === 'Enter')  { e.preventDefault(); exitSlotCropMode(true);  }
      if (e.key === 'Escape') { e.preventDefault(); exitSlotCropMode(false); }
    };
    document._cropKeyHandler = keyHandler;
    document.addEventListener('keydown', keyHandler);
  }

  function exitSlotCropMode(apply) {
    if (document._cropKeyHandler) {
      document.removeEventListener('keydown', document._cropKeyHandler);
      document._cropKeyHandler = null;
    }

    if (apply && cropEditorInstance) {
      const idx = state.slotCropIndex;
      if (idx >= 0 && idx < state.collageCells.length) {
        state.collageCells[idx].cropRect = cropEditorInstance.getCropData();
      }
    }
    if (cropEditorInstance) { cropEditorInstance.destroy(); cropEditorInstance = null; }

    const cropOverlay    = document.getElementById('crop-overlay');
    const collageOverlay = document.getElementById('collage-overlay');
    if (cropOverlay)    cropOverlay.hidden    = true;
    if (collageOverlay) collageOverlay.hidden = false;

    state.slotCropMode  = false;
    state.slotCropIndex = -1;

    updateSlotList();
    if (apply) scheduleCollagePreview();
  }

  async function doExportCollage() {
    const layout = state.collageLayout;
    if (!layout) return;

    if (state.collageCells.every(c => !c.file)) {
      showToast('请至少为一个格子分配照片', 'warn');
      return;
    }

    const btn = document.getElementById('btn-collage-export');
    if (btn) { btn.disabled = true; btn.textContent = '导出中…'; }

    try {
      const cellsWithImages = await Promise.all(
        state.collageCells.map(async cell => {
          if (!cell.file) return { ...cell };
          const img = imageCache.has(cell.file)
            ? imageCache.get(cell.file)
            : await getJobImage({ file: cell.file });
          return { ...cell, imgCache: img };
        })
      );

      const titleEl    = document.getElementById('collage-title-input');
      const subtitleEl = document.getElementById('collage-subtitle-input');
      const infoOverride = {
        titleTemplate:    titleEl?.value.trim()    || layout.infoBar.titleTemplate    || '',
        subtitleTemplate: subtitleEl?.value.trim() || layout.infoBar.subtitleTemplate || '',
        enabled: layout.infoBar.enabled !== false,
      };

      const longEdge = state.exportLongEdge || layout.output?.longEdge || 3000;
      const canvas = await CollageRenderer.render(
        layout, cellsWithImages, infoOverride, longEdge
      );

      const fmt     = state.exportFormat || layout.output?.format || 'jpeg';
      const quality = (state.exportQuality || layout.output?.quality || 95) / 100;
      const mimeType = fmt === 'png' ? 'image/png' : 'image/jpeg';

      canvas.toBlob(blob => {
        if (!blob) { showToast('导出失败', 'error'); return; }
        const a = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `collage-${layout.id}-${Date.now()}.${fmt === 'png' ? 'png' : 'jpg'}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        showToast('拼图已导出！');
      }, mimeType, quality);

    } catch (e) {
      showToast('导出失败: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '导出拼图'; }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 额外文字行 UI
  // ══════════════════════════════════════════════════════════════════════════
  function rebuildExtraLinesList(job) {
    const container = document.getElementById('extra-lines-list');
    if (!container) return;
    container.innerHTML = '';

    const preset  = activePreset();
    // 合并：预设 extraLines + job override extraLines（override 优先）
    const baseLines = (preset?.infoBar?.extraLines) || [];
    const overLines = job?.infoOverrides?.extraLines;
    // 若 job override 有 extraLines，使用它；否则用 preset 的（显示但不可编辑默认值）
    const lines = overLines !== undefined ? overLines : [...baseLines];

    if (lines.length === 0) return;

    lines.forEach((line, i) => {
      const item = document.createElement('div');
      item.className = 'extra-line-item';

      // 顶行：序号 + 内容输入 + 删除
      const header = document.createElement('div');
      header.className = 'extra-line-header';

      const idx = document.createElement('span');
      idx.className = 'extra-line-index';
      idx.textContent = i + 1;
      header.appendChild(idx);

      const tplInput = document.createElement('input');
      tplInput.type = 'text';
      tplInput.className = 'extra-line-template';
      tplInput.value = line.template || '';
      tplInput.placeholder = '内容，支持 {location} {camera} 等变量';
      tplInput.addEventListener('input', () => {
        ensureExtraLinesOverride(job, baseLines);
        job.infoOverrides.extraLines[i].template = tplInput.value;
        schedulePreview();
      });
      header.appendChild(tplInput);

      const delBtn = document.createElement('button');
      delBtn.className = 'extra-line-del';
      delBtn.textContent = '×';
      delBtn.title = '删除';
      delBtn.addEventListener('click', () => {
        ensureExtraLinesOverride(job, baseLines);
        job.infoOverrides.extraLines.splice(i, 1);
        rebuildExtraLinesList(job);
        schedulePreview();
      });
      header.appendChild(delBtn);
      item.appendChild(header);

      // 第二行：字体 + 字号
      const opts = document.createElement('div');
      opts.className = 'extra-line-opts';

      const fontSel = document.createElement('select');
      [['', '继承副标题字体'], ['Noto Serif SC', '宋体'], ['EB Garamond', 'EB Garamond'],
       ['system-ui', '系统无衬线'], ['monospace', '等宽']].forEach(([v, l]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = l;
        if ((line.font || '') === v) o.selected = true;
        fontSel.appendChild(o);
      });
      fontSel.addEventListener('change', () => {
        ensureExtraLinesOverride(job, baseLines);
        job.infoOverrides.extraLines[i].font = fontSel.value;
        schedulePreview();
      });
      opts.appendChild(fontSel);

      const sizeInput = document.createElement('input');
      sizeInput.type = 'number';
      sizeInput.min = '0.5'; sizeInput.max = '6'; sizeInput.step = '0.1';
      sizeInput.value = line.fontSize ? (line.fontSize * 100).toFixed(1) : '';
      sizeInput.placeholder = '大小%';
      sizeInput.title = '字号（% 短边）';
      sizeInput.addEventListener('change', () => {
        ensureExtraLinesOverride(job, baseLines);
        const v = parseFloat(sizeInput.value);
        job.infoOverrides.extraLines[i].fontSize = isNaN(v) ? 0 : v / 100;
        schedulePreview();
      });
      opts.appendChild(sizeInput);
      item.appendChild(opts);

      container.appendChild(item);
    });
  }

  function ensureExtraLinesOverride(job, baseLines) {
    if (!job) return;
    if (!job.infoOverrides) job.infoOverrides = {};
    if (!Array.isArray(job.infoOverrides.extraLines)) {
      // 深拷贝 preset 的 extraLines 作为起点
      job.infoOverrides.extraLines = baseLines.map(l => ({ ...l }));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 边框拖拽调整
  // ══════════════════════════════════════════════════════════════════════════
  function ensureFrameLayout(job) {
    if (job?.frameLayout) return job.frameLayout;
    const layout = CanvasRenderer.getLastLayout();
    if (!job || !layout) return null;
    job.frameLayout = {
      canvasW: layout.canvasW,
      canvasH: layout.canvasH,
      photoX: layout.bLeft,
      photoY: layout.bTop,
      photoW: layout.photoW,
      photoH: layout.photoH,
      referencePhotoLong: Math.max(layout.photoW, layout.photoH),
    };
    return job.frameLayout;
  }

  function syncBorderOverridesFromFrame(job) {
    const f = job?.frameLayout;
    if (!f) return;
    const shorter = Math.max(1, Math.min(f.photoW, f.photoH));
    job.borderOverrides = job.borderOverrides || {};
    job.borderOverrides.left = f.photoX / shorter;
    job.borderOverrides.top = f.photoY / shorter;
    job.borderOverrides.right = Math.max(0, f.canvasW - f.photoX - f.photoW) / shorter;
    job.borderOverrides.bottom = Math.max(0, f.canvasH - f.photoY - f.photoH) / shorter;
  }

  function syncBorderInputs(job) {
    ['top', 'bottom', 'left', 'right'].forEach(dir => {
      const value = job.borderOverrides?.[dir];
      if (value == null) return;
      const slider = document.getElementById(`border-${dir}`);
      const number = document.getElementById(`border-${dir}-num`);
      if (slider) slider.value = value;
      if (number) number.value = (value * 100).toFixed(1);
    });
  }

  function snapCoordinate(value, targets, threshold) {
    if (!state.frameSnapEnabled) return { value, target: null };
    let nearest = null;
    let distance = threshold + 1;
    for (const target of targets) {
      const d = Math.abs(value - target);
      if (d < distance) { nearest = target; distance = d; }
    }
    return distance <= threshold ? { value: nearest, target: nearest } : { value, target: null };
  }

  function snapMovingRect(position, size, containerSize, threshold) {
    if (!state.frameSnapEnabled) return { value: position, guide: null };
    const guides = [0, containerSize / 3, containerSize / 2, containerSize * 2 / 3, containerSize];
    const anchors = [0, size / 2, size];
    let best = { value: position, guide: null, distance: threshold + 1 };
    for (const guide of guides) {
      for (const anchor of anchors) {
        const candidate = guide - anchor;
        const distance = Math.abs(position - candidate);
        if (distance < best.distance) best = { value: candidate, guide, distance };
      }
    }
    return best.distance <= threshold ? best : { value: position, guide: null };
  }

  function positionPhotoMover(rect, frame) {
    const mover = document.getElementById('frame-photo-mover');
    if (!mover || !rect || !frame) return;
    const scaleX = rect.width / frame.canvasW;
    const scaleY = rect.height / frame.canvasH;
    mover.style.left = (rect.left + frame.photoX * scaleX) + 'px';
    mover.style.top = (rect.top + frame.photoY * scaleY) + 'px';
    mover.style.width = (frame.photoW * scaleX) + 'px';
    mover.style.height = (frame.photoH * scaleY) + 'px';
  }

  function updateFrameGrid(rect, frame, snapX = null, snapY = null) {
    const grid = document.getElementById('frame-grid');
    if (!grid || !rect || !frame) return;
    grid.style.left = rect.left + 'px';
    grid.style.top = rect.top + 'px';
    grid.style.width = rect.width + 'px';
    grid.style.height = rect.height + 'px';
    grid.classList.toggle('visible', state.frameGridEnabled || snapX != null || snapY != null);
    grid.querySelectorAll('.frame-grid-line').forEach(line => {
      const ratio = Number(line.dataset.ratio);
      if (line.dataset.axis === 'x') {
        line.style.left = (ratio * 100) + '%';
        line.classList.toggle('snap-active', snapX != null && Math.abs(snapX / frame.canvasW - ratio) < 0.002);
      } else {
        line.style.top = (ratio * 100) + '%';
        line.classList.toggle('snap-active', snapY != null && Math.abs(snapY / frame.canvasH - ratio) < 0.002);
      }
    });
  }

  function queueBorderPreview() {
    if (_rafPreview) return;
    _rafPreview = requestAnimationFrame(() => {
      _rafPreview = null;
      renderPreviewForce();
    });
  }

  function scheduleBorderOverlaySync() {
    if ((!state.borderResizeMode && !state.textPosMode) || _borderDragState || _borderOverlaySyncRaf) return;
    _borderOverlaySyncRaf = requestAnimationFrame(() => {
      _borderOverlaySyncRaf = null;
      if (state.borderResizeMode && !_borderDragState) updateBorderResizeHandles();
      if (state.textPosMode) updateTextPosHandle();
    });
  }

  function setupBorderResizeMode() {
    const btn = document.getElementById('btn-border-resize');
    btn?.addEventListener('click', () => {
      if (state.borderResizeMode) exitBorderResizeMode();
      else enterBorderResizeMode();
    });

    const onBorderDragMove = (e) => {
      if (!_borderDragState) return;
      e.preventDefault();
      const drag = _borderDragState;
      const job = activeJob();
      if (!job) return;
      const start = drag.startFrame;
      const frame = { ...start };
      const dx = (e.clientX - drag.startX) / drag.initialScaleX;
      const dy = (e.clientY - drag.startY) / drag.initialScaleY;
      const movesLeft = drag.corner.includes('l');
      const movesRight = drag.corner.includes('r');
      const movesTop = drag.corner.includes('t');
      const movesBottom = drag.corner.includes('b');
      const minPhoto = 40;
      drag.snapX = null;
      drag.snapY = null;

      if (drag.type === 'move') {
        const snappedX = snapMovingRect(start.photoX + dx, start.photoW, start.canvasW, 8 / drag.initialScaleX);
        const snappedY = snapMovingRect(start.photoY + dy, start.photoH, start.canvasH, 8 / drag.initialScaleY);
        frame.photoX = Math.max(0, Math.min(start.canvasW - start.photoW, snappedX.value));
        frame.photoY = Math.max(0, Math.min(start.canvasH - start.photoH, snappedY.value));
        frame.photoW = start.photoW;
        frame.photoH = start.photoH;
        drag.snapX = snappedX.guide;
        drag.snapY = snappedY.guide;
      } else if (drag.type === 'inner') {
        const xTargets = [0, start.canvasW / 3, start.canvasW / 2, start.canvasW * 2 / 3, start.canvasW];
        const yTargets = [0, start.canvasH / 3, start.canvasH / 2, start.canvasH * 2 / 3, start.canvasH];
        const thresholdX = 8 / drag.initialScaleX;
        const thresholdY = 8 / drag.initialScaleY;
        let left = start.photoX;
        let right = start.photoX + start.photoW;
        let top = start.photoY;
        let bottom = start.photoY + start.photoH;

        if (movesLeft) {
          const snapped = snapCoordinate(start.photoX + dx, [...xTargets, start.canvasW - right], thresholdX);
          left = Math.max(0, Math.min(right - minPhoto, snapped.value));
          drag.snapX = snapped.target;
        }
        if (movesRight) {
          const snapped = snapCoordinate(right + dx, [...xTargets, start.canvasW - left], thresholdX);
          right = Math.min(start.canvasW, Math.max(left + minPhoto, snapped.value));
          drag.snapX = snapped.target;
        }
        if (movesTop) {
          const snapped = snapCoordinate(start.photoY + dy, [...yTargets, start.canvasH - bottom], thresholdY);
          top = Math.max(0, Math.min(bottom - minPhoto, snapped.value));
          drag.snapY = snapped.target;
        }
        if (movesBottom) {
          const snapped = snapCoordinate(bottom + dy, [...yTargets, start.canvasH - top], thresholdY);
          bottom = Math.min(start.canvasH, Math.max(top + minPhoto, snapped.value));
          drag.snapY = snapped.target;
        }
        frame.photoX = left;
        frame.photoY = top;
        frame.photoW = right - left;
        frame.photoH = bottom - top;
      } else {
        if (movesLeft) {
          const maxDelta = start.photoX;
          const delta = Math.min(maxDelta, dx);
          frame.canvasW = start.canvasW - delta;
          frame.photoX = start.photoX - delta;
        }
        if (movesRight) frame.canvasW = Math.max(start.photoX + start.photoW, start.canvasW + dx);
        if (movesTop) {
          const maxDelta = start.photoY;
          const delta = Math.min(maxDelta, dy);
          frame.canvasH = start.canvasH - delta;
          frame.photoY = start.photoY - delta;
        }
        if (movesBottom) frame.canvasH = Math.max(start.photoY + start.photoH, start.canvasH + dy);
      }

      job.frameLayout = frame;
      syncBorderOverridesFromFrame(job);
      syncBorderInputs(job);
      if (drag.type === 'outer') {
        drag.currentRect = {
          left: movesLeft ? drag.startRect.right - frame.canvasW * drag.initialScaleX : drag.startRect.left,
          top: movesTop ? drag.startRect.bottom - frame.canvasH * drag.initialScaleY : drag.startRect.top,
          width: frame.canvasW * drag.initialScaleX,
          height: frame.canvasH * drag.initialScaleY,
        };
      } else {
        drag.currentRect = drag.startRect;
      }
      scheduleSessionSave();
      updateBorderResizeHandlesDrag();
      queueBorderPreview();
    };

    const onBorderDragEnd = (e) => {
      if (!_borderDragState) return;
      if (_rafPreview) { cancelAnimationFrame(_rafPreview); _rafPreview = null; }
      if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      _borderDragState = null;
      document.body.classList.remove('border-frame-dragging');
      document.getElementById('frame-photo-mover')?.classList.remove('dragging');
      renderPreview();
    };

    const beginFrameDrag = (e, type, corner, target) => {
      if (!state.borderResizeMode) return;
      e.preventDefault();
      e.stopPropagation();
      const layout = CanvasRenderer.getLastLayout();
      const job = activeJob();
      if (!layout || !job || !activePreset()) return;
      const frame = ensureFrameLayout(job);
      const canvas = document.getElementById('canvas-preview');
      if (!frame || !canvas) return;
      ++_previewGeneration;
      target.setPointerCapture(e.pointerId);
      const startRect = canvas.getBoundingClientRect();
      canvas.style.width = canvas.offsetWidth + 'px';
      canvas.style.height = canvas.offsetHeight + 'px';
      canvas.style.maxWidth = 'none';
      canvas.style.maxHeight = 'none';
      _borderDragState = {
        corner,
        type,
        startX: e.clientX,
        startY: e.clientY,
        startRect,
        currentRect: startRect,
        startFrame: { ...frame },
        initialScaleX: startRect.width / frame.canvasW,
        initialScaleY: startRect.height / frame.canvasH,
        snapX: null,
        snapY: null,
      };
      document.body.classList.add('border-frame-dragging');
      if (type === 'move') target.classList.add('dragging');
    };

    document.querySelectorAll('.br-handle').forEach(handle => {
      handle.addEventListener('pointerdown', (e) => {
        beginFrameDrag(e, handle.dataset.type, handle.dataset.corner, handle);
      });

      handle.addEventListener('pointermove', onBorderDragMove);
      handle.addEventListener('pointerup', onBorderDragEnd);
      handle.addEventListener('pointercancel', onBorderDragEnd);
    });

    const mover = document.getElementById('frame-photo-mover');
    mover?.addEventListener('pointerdown', e => beginFrameDrag(e, 'move', 'move', mover));
    mover?.addEventListener('pointermove', onBorderDragMove);
    mover?.addEventListener('pointerup', onBorderDragEnd);
    mover?.addEventListener('pointercancel', onBorderDragEnd);

    // Canvas 尺寸变化时重新定位内外框、网格和抓手；滚动预览区时
    // 也需要同步使用 fixed 定位的编辑浮层。
    const previewCanvas = document.getElementById('canvas-preview');
    const previewWrapper = document.getElementById('preview-wrapper');
    if (previewCanvas && typeof ResizeObserver !== 'undefined') {
      const borderOverlayObserver = new ResizeObserver(scheduleBorderOverlaySync);
      borderOverlayObserver.observe(previewCanvas);
    }
    previewWrapper?.addEventListener('scroll', scheduleBorderOverlaySync, { passive: true });

    // 浏览器窗口缩放时重新定位
    let resizeRaf = null;
    window.addEventListener('resize', () => {
      if (!state.borderResizeMode) return;
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        updateBorderResizeHandles();
      });
    });

    document.getElementById('btn-frame-grid')?.addEventListener('click', e => {
      state.frameGridEnabled = !state.frameGridEnabled;
      e.currentTarget.classList.toggle('active', state.frameGridEnabled);
      updateBorderResizeHandles();
    });
    document.getElementById('btn-frame-snap')?.addEventListener('click', e => {
      state.frameSnapEnabled = !state.frameSnapEnabled;
      e.currentTarget.classList.toggle('active', state.frameSnapEnabled);
    });
    document.querySelectorAll('.frame-align-btn').forEach(button => {
      button.addEventListener('click', () => {
        const job = activeJob();
        const f = ensureFrameLayout(job);
        if (!job || !f) return;
        const action = button.dataset.frameAlign;
        if (action === 'left') f.photoX = 0;
        if (action === 'h-center') f.photoX = (f.canvasW - f.photoW) / 2;
        if (action === 'right') f.photoX = f.canvasW - f.photoW;
        if (action === 'top') f.photoY = 0;
        if (action === 'v-center') f.photoY = (f.canvasH - f.photoH) / 2;
        if (action === 'bottom') f.photoY = f.canvasH - f.photoH;
        syncBorderOverridesFromFrame(job);
        syncBorderInputs(job);
        scheduleSessionSave();
        renderPreview();
      });
    });
  }

  // ── 拖拽期间预测性句柄定位（不依赖 _lastLayout，避免一帧延迟抖动）──────────
  function updateBorderResizeHandlesDrag() {
    const overlay = document.getElementById('border-resize-overlay');
    if (!overlay || !_borderDragState || !state.borderResizeMode) return;

    const job    = activeJob();
    const f = job?.frameLayout;
    if (!f) return;
    const rect = _borderDragState.currentRect || _borderDragState.startRect;
    const scaleX = rect.width / f.canvasW;
    const scaleY = rect.height / f.canvasH;
    const canvasW = f.canvasW, canvasH = f.canvasH;
    const bLeft = f.photoX, bTop = f.photoY;
    const photoW = f.photoW, photoH = f.photoH;
    positionPhotoMover(rect, f);

    // 外框句柄位置
    const ocx = canvasW / 2, ocy = canvasH / 2;
    const outerHP = {
      tl: { x: 0,       y: 0       }, tr: { x: canvasW, y: 0       },
      bl: { x: 0,       y: canvasH }, br: { x: canvasW, y: canvasH },
      t:  { x: ocx,     y: 0       }, b:  { x: ocx,     y: canvasH },
      l:  { x: 0,       y: ocy     }, r:  { x: canvasW, y: ocy     },
    };
    // 内框句柄位置
    const icx = bLeft + photoW / 2, icy = bTop + photoH / 2;
    const ir  = bLeft + photoW,     ib  = bTop + photoH;
    const innerHP = {
      tl: { x: bLeft, y: bTop }, tr: { x: ir,   y: bTop },
      bl: { x: bLeft, y: ib   }, br: { x: ir,   y: ib   },
      t:  { x: icx,  y: bTop  }, b:  { x: icx,  y: ib   },
      l:  { x: bLeft,y: icy   }, r:  { x: ir,   y: icy   },
    };

    overlay.querySelectorAll('.br-handle').forEach(h => {
      const pos = (h.dataset.type === 'outer' ? outerHP : innerHP)[h.dataset.corner];
      if (!pos) return;
      h.style.left = (rect.left + pos.x * scaleX) + 'px';
      h.style.top  = (rect.top  + pos.y * scaleY) + 'px';
    });

    const outerL = {
      top:    { left: rect.left,                    top: rect.top,                    width: canvasW * scaleX, height: 1 },
      bottom: { left: rect.left,                    top: rect.top + canvasH * scaleY, width: canvasW * scaleX, height: 1 },
      left:   { left: rect.left,                    top: rect.top,                    width: 1,                height: canvasH * scaleY },
      right:  { left: rect.left + canvasW * scaleX, top: rect.top,                    width: 1,                height: canvasH * scaleY },
    };
    const innerL = {
      top:    { left: rect.left + bLeft * scaleX, top: rect.top + bTop * scaleY, width: photoW * scaleX, height: 1 },
      bottom: { left: rect.left + bLeft * scaleX, top: rect.top + ib   * scaleY, width: photoW * scaleX, height: 1 },
      left:   { left: rect.left + bLeft * scaleX, top: rect.top + bTop * scaleY, width: 1,               height: photoH * scaleY },
      right:  { left: rect.left + ir    * scaleX, top: rect.top + bTop * scaleY, width: 1,               height: photoH * scaleY },
    };

    overlay.querySelectorAll('.br-line').forEach(l => {
      const pos = (l.dataset.type === 'outer' ? outerL : innerL)[l.dataset.line];
      if (!pos) return;
      l.style.left   = pos.left   + 'px';
      l.style.top    = pos.top    + 'px';
      l.style.width  = pos.width  + 'px';
      l.style.height = pos.height + 'px';
    });

    // 对称参考线
    const bForGuide = job.borderOverrides || {};

    const hDiff = Math.abs(bForGuide.left - bForGuide.right);
    const guideV = document.getElementById('guide-v');
    if (guideV) guideV.style.display = hDiff < 0.01 ? 'block' : 'none';

    const vDiff = Math.abs(bForGuide.top - bForGuide.bottom);
    const guideH = document.getElementById('guide-h');
    if (guideH) guideH.style.display = vDiff < 0.01 ? 'block' : 'none';

    // 边框数值标签
    const topLabel = document.querySelector('.br-top');
    const bottomLabel = document.querySelector('.br-bottom');
    const leftLabel = document.querySelector('.br-left');
    const rightLabel = document.querySelector('.br-right');
    if (topLabel) topLabel.textContent = `上 ${(bForGuide.top * 100).toFixed(1)}%`;
    if (bottomLabel) bottomLabel.textContent = `下 ${(bForGuide.bottom * 100).toFixed(1)}%`;
    if (leftLabel) leftLabel.textContent = `左 ${(bForGuide.left * 100).toFixed(1)}%`;
    if (rightLabel) rightLabel.textContent = `右 ${(bForGuide.right * 100).toFixed(1)}%`;

    updateFrameGrid(rect, f, _borderDragState.snapX, _borderDragState.snapY);
  }

  function enterBorderResizeMode() {
    if (state.textPosMode) exitTextPosMode();
    state.borderResizeMode = true;
    document.getElementById('btn-border-resize')?.classList.add('active');
    const overlay = document.getElementById('border-resize-overlay');
    if (overlay) overlay.hidden = false;
    const tools = document.getElementById('frame-tools');
    if (tools) tools.hidden = false;
    document.getElementById('btn-frame-grid')?.classList.toggle('active', state.frameGridEnabled);
    document.getElementById('btn-frame-snap')?.classList.toggle('active', state.frameSnapEnabled);
    updateBorderResizeHandles();
  }

  function exitBorderResizeMode() {
    state.borderResizeMode = false;
    document.getElementById('btn-border-resize')?.classList.remove('active');
    const overlay = document.getElementById('border-resize-overlay');
    if (overlay) overlay.hidden = true;
    const tools = document.getElementById('frame-tools');
    if (tools) tools.hidden = true;
    document.getElementById('frame-grid')?.classList.remove('visible');
    _borderDragState = null;
    document.body.classList.remove('border-frame-dragging');
    const preview = document.getElementById('canvas-preview');
    if (preview) preview.style.transform = '';

    // Reset alignment guides
    const guideV = document.getElementById('guide-v');
    const guideH = document.getElementById('guide-h');
    if (guideV) guideV.style.display = 'none';
    if (guideH) guideH.style.display = 'none';

    // 退出时渲染最终结果，让用户看到新的边框效果
    schedulePreview();
  }

  function updateBorderResizeHandles() {
    const overlay = document.getElementById('border-resize-overlay');
    if (!overlay) return;
    if (!state.borderResizeMode) { overlay.hidden = true; return; }

    const layout = CanvasRenderer.getLastLayout();
    const canvas = document.getElementById('canvas-preview');
    if (!layout || !canvas) return;

    overlay.hidden = false;

    const rect   = canvas.getBoundingClientRect();
    const scaleX = rect.width  / (canvas.width  || 1);
    const scaleY = rect.height / (canvas.height || 1);

    const { canvasW, canvasH, bLeft, bTop, photoW, photoH } = layout;
    const frameForGrid = activeJob()?.frameLayout || { canvasW, canvasH, photoX: bLeft, photoY: bTop, photoW, photoH };
    updateFrameGrid(rect, frameForGrid);
    positionPhotoMover(rect, frameForGrid);

    // ── 外框：画布边界 ─────────────────────────────────────────────────────
    const ocx = canvasW / 2;
    const ocy = canvasH / 2;
    const outerHandlePos = {
      tl: { x: 0,       y: 0       },
      tr: { x: canvasW, y: 0       },
      bl: { x: 0,       y: canvasH },
      br: { x: canvasW, y: canvasH },
      t:  { x: ocx,     y: 0       },
      b:  { x: ocx,     y: canvasH },
      l:  { x: 0,       y: ocy     },
      r:  { x: canvasW, y: ocy     },
    };

    // ── 内框：照片显示区域 ──────────────────────────────────────────────────
    const icx = bLeft + photoW / 2;
    const icy = bTop  + photoH / 2;
    const ir  = bLeft + photoW;
    const ib  = bTop  + photoH;
    const innerHandlePos = {
      tl: { x: bLeft, y: bTop },
      tr: { x: ir,    y: bTop },
      bl: { x: bLeft, y: ib   },
      br: { x: ir,    y: ib   },
      t:  { x: icx,   y: bTop },
      b:  { x: icx,   y: ib   },
      l:  { x: bLeft, y: icy  },
      r:  { x: ir,    y: icy  },
    };

    overlay.querySelectorAll('.br-handle').forEach(handle => {
      const map = handle.dataset.type === 'outer' ? outerHandlePos : innerHandlePos;
      const pos = map[handle.dataset.corner];
      if (!pos) return;
      handle.style.left = (rect.left + pos.x * scaleX) + 'px';
      handle.style.top  = (rect.top  + pos.y * scaleY) + 'px';
    });

    // ── 外框边界线（画布四边）───────────────────────────────────────────────
    const outerLines = {
      top:    { left: rect.left,                         top: rect.top,                         width: canvasW * scaleX, height: 1 },
      bottom: { left: rect.left,                         top: rect.top + canvasH * scaleY,      width: canvasW * scaleX, height: 1 },
      left:   { left: rect.left,                         top: rect.top,                         width: 1,                height: canvasH * scaleY },
      right:  { left: rect.left + canvasW * scaleX,      top: rect.top,                         width: 1,                height: canvasH * scaleY },
    };

    // ── 内框边界线（照片四边）───────────────────────────────────────────────
    const innerLines = {
      top:    { left: rect.left + bLeft * scaleX,  top: rect.top + bTop * scaleY,  width: photoW * scaleX, height: 1 },
      bottom: { left: rect.left + bLeft * scaleX,  top: rect.top + ib   * scaleY,  width: photoW * scaleX, height: 1 },
      left:   { left: rect.left + bLeft * scaleX,  top: rect.top + bTop * scaleY,  width: 1,               height: photoH * scaleY },
      right:  { left: rect.left + ir    * scaleX,  top: rect.top + bTop * scaleY,  width: 1,               height: photoH * scaleY },
    };

    overlay.querySelectorAll('.br-line').forEach(line => {
      const map = line.dataset.type === 'outer' ? outerLines : innerLines;
      const pos = map[line.dataset.line];
      if (!pos) return;
      line.style.left   = pos.left   + 'px';
      line.style.top    = pos.top    + 'px';
      line.style.width  = pos.width  + 'px';
      line.style.height = pos.height + 'px';
    });

    // ── 对称检测 + 数值标签 ─────────────────────────────────────────────────
    const job = activeJob();
    const preset = activePreset();
    if (!job || !preset) return;
    const b = Object.assign({}, preset.border, job.borderOverrides || {});
    const bLeftPct = b.left * 100;
    const bRightPct = b.right * 100;
    const bTopPct = b.top * 100;
    const bBottomPct = b.bottom * 100;

    // 更新四边数值标签
    const setVal = (id, pct) => { const el = document.getElementById(id); if (el) el.textContent = pct.toFixed(1) + '%'; };
    setVal('br-left-val', bLeftPct);
    setVal('br-right-val', bRightPct);
    setVal('br-top-val', bTopPct);
    setVal('br-bottom-val', bBottomPct);

    // 水平对称检测：左右差值 < 1% 显示中线
    const hDiff = Math.abs(bLeftPct - bRightPct);
    const guideV = document.getElementById('guide-v');
    if (guideV) {
      if (hDiff < 1) {
        const midX = rect.left + (bLeft + photoW / 2) * scaleX;
        guideV.style.left = midX + 'px';
        guideV.style.display = 'block';
        guideV.style.background = 'rgba(255, 100, 100, 0.6)';
      } else {
        guideV.style.display = 'none';
      }
    }

    // 垂直对称检测：上下差值 < 1% 显示中线
    const vDiff = Math.abs(bTopPct - bBottomPct);
    const guideH = document.getElementById('guide-h');
    if (guideH) {
      if (vDiff < 1) {
        const midY = rect.top + (bTop + photoH / 2) * scaleY;
        guideH.style.top = midY + 'px';
        guideH.style.display = 'block';
        guideH.style.background = 'rgba(255, 100, 100, 0.6)';
      } else {
        guideH.style.display = 'none';
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 文字位置拖拽
  // ══════════════════════════════════════════════════════════════════════════
  function setupTextPosMode() {
    const btn = document.getElementById('btn-text-pos');
    btn?.addEventListener('click', () => {
      if (state.textPosMode) exitTextPosMode();
      else {
        const job = activeJob();
        if (job) {
          job.infoOverrides = job.infoOverrides || {};
          job.infoOverrides.enabled = true;
          const toggle = document.getElementById('info-toggle');
          if (toggle) toggle.checked = true;
        }
        enterTextPosMode();
        schedulePreview();
      }
    });

    const handle = document.getElementById('text-pos-handle');
    if (handle) {
      handle.addEventListener('pointerdown', e => {
        if (!state.textPosMode) return;
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        handle.classList.add('dragging');

        const job    = activeJob();
        const preset = activePreset();
        const info   = Object.assign({}, preset?.infoBar, job?.infoOverrides || {});
        _textDragState = {
          startX: e.clientX,
          startY: e.clientY,
          startOffsetX: info.textOffsetX || 0,
          startOffsetY: info.textOffsetY || 0,
        };
      });

      handle.addEventListener('pointermove', e => {
        if (!_textDragState) return;
        const layout = CanvasRenderer.getLastLayout();
        const canvas = document.getElementById('canvas-preview');
        if (!layout || !canvas) return;

        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvasRect.width  / (canvas.width  || 1);
        const scaleY = canvasRect.height / (canvas.height || 1);

        const dxLogical = (e.clientX - _textDragState.startX) / scaleX;
        const dyLogical = (e.clientY - _textDragState.startY) / scaleY;

        const newOX = Math.max(-TEXT_POS_MAX, Math.min(TEXT_POS_MAX, _textDragState.startOffsetX + dxLogical / layout.canvasW));
        const newOY = Math.max(-0.70, Math.min(0.70, _textDragState.startOffsetY + dyLogical / (layout.bBottom || 1)));

        const job = activeJob();
        if (job) {
          if (!job.infoOverrides) job.infoOverrides = {};
          job.infoOverrides.textOffsetX = newOX;
          job.infoOverrides.textOffsetY = newOY;
        }

        // 同步滑块
        const oxR = document.getElementById('text-offset-x');
        const oxL = document.getElementById('text-offset-x-label');
        const oyR = document.getElementById('text-offset-y');
        const oyL = document.getElementById('text-offset-y-label');
        if (oxR) oxR.value = newOX; if (oxL) oxL.textContent = newOX.toFixed(2);
        if (oyR) oyR.value = newOY; if (oyL) oyL.textContent = newOY.toFixed(2);

        schedulePreviewNow();   // 拖拽时立即渲染，不走 180ms 防抖
      });

      handle.addEventListener('pointerup', () => {
        _textDragState = null;
        handle.classList.remove('dragging');
        updateTextPosHandle();
      });
    }

    // Esc 退出文字位置模式
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.textPosMode && !state.cropMode && !state.slotCropMode) {
        exitTextPosMode();
        return;
      }
      if (!state.textPosMode || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      if (/input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
      const job = activeJob();
      const layout = CanvasRenderer.getLastLayout();
      if (!job || !layout) return;
      e.preventDefault();
      job.infoOverrides = job.infoOverrides || {};
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      job.infoOverrides.textOffsetX = Math.max(-TEXT_POS_MAX, Math.min(TEXT_POS_MAX,
        (job.infoOverrides.textOffsetX || 0) + dx / Math.max(1, layout.canvasW)));
      job.infoOverrides.textOffsetY = Math.max(-0.7, Math.min(0.7,
        (job.infoOverrides.textOffsetY || 0) + dy / Math.max(1, layout.bBottom || 1)));
      fillBorderForm(activePreset(), job);
      schedulePreviewNow();
    });
  }

  function enterTextPosMode() {
    if (state.borderResizeMode) exitBorderResizeMode();
    state.textPosMode = true;
    document.getElementById('btn-text-pos')?.classList.add('active');
    updateTextPosHandle();
  }

  function exitTextPosMode() {
    state.textPosMode = false;
    document.getElementById('btn-text-pos')?.classList.remove('active');
    const handle = document.getElementById('text-pos-handle');
    if (handle) handle.hidden = true;
    // 隐藏参考线
    const guideV = document.getElementById('guide-v');
    const guideH = document.getElementById('guide-h');
    if (guideV) guideV.style.display = 'none';
    if (guideH) guideH.style.display = 'none';
  }

  function updateTextPosHandle() {
    const handle = document.getElementById('text-pos-handle');
    if (!handle) return;

    if (!state.textPosMode) { handle.hidden = true; return; }

    const job    = activeJob();
    const preset = activePreset();
    if (!job || !preset) { handle.hidden = true; return; }

    const info = Object.assign({}, preset.infoBar, job.infoOverrides || {});
    if (info.enabled === false) { handle.hidden = true; return; }

    const layout = CanvasRenderer.getLastLayout();
    const canvas  = document.getElementById('canvas-preview');
    if (!layout || !canvas) { handle.hidden = true; return; }

    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width  / (canvas.width  || 1);
    const scaleY = canvasRect.height / (canvas.height || 1);

    const offsetX  = (info.textOffsetX || 0) * layout.canvasW;
    const offsetY  = (info.textOffsetY || 0) * (layout.bBottom || 1);
    const barTop   = layout.bTop + layout.photoH;
    const textCenterX = layout.canvasW / 2 + offsetX;
    const textCenterY = barTop + (layout.bBottom || 0) * 0.5 + offsetY;

    handle.hidden = false;
    handle.style.left = (canvasRect.left + textCenterX * scaleX) + 'px';
    handle.style.top  = (canvasRect.top  + textCenterY * scaleY) + 'px';

    updateAlignmentGuides(info);
  }

  function updateAlignmentGuides(info) {
    const guideV = document.getElementById('guide-v');
    if (guideV) guideV.style.display = Math.abs(info.textOffsetX || 0) < 0.02 ? 'block' : 'none';
    const guideH = document.getElementById('guide-h');
    if (guideH) guideH.style.display = Math.abs(info.textOffsetY || 0) < 0.02 ? 'block' : 'none';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 会话持久化
  // ══════════════════════════════════════════════════════════════════════════

  /** 节流保存：800ms 内只触发一次 */
  function scheduleSessionSave() {
    clearTimeout(sessionSaveDebounce);
    sessionSaveDebounce = setTimeout(doSaveSession, 800);
  }

  /** 保存所有 job 元数据 + 当前激活状态到 IndexedDB */
  async function doSaveSession() {
    try {
      for (const job of state.jobs) {
        const { file: _f, ...meta } = job; // 去掉 File 对象
        await SessionStore.saveJob(meta);
      }
      await SessionStore.saveSessionState({
        activePresetId: state.activePresetId,
        activeJobId:    state.activeJobId,
      });
    } catch (e) {
      console.warn('会话保存失败', e);
    }
  }

  /** 页面加载时尝试恢复上次未完成的编辑 */
  async function initSession() {
    try {
      const { jobs, sessionState } = await SessionStore.restoreSession();
      if (!jobs.length) return;

      state.jobs = jobs;

      // 恢复激活状态
      if (sessionState?.activeJobId && jobs.find(j => j.id === sessionState.activeJobId)) {
        state.activeJobId = sessionState.activeJobId;
      } else {
        state.activeJobId = jobs[0].id;
      }
      if (sessionState?.activePresetId) {
        state.activePresetId = sessionState.activePresetId;
        // 更新预设网格高亮
        renderPresetGrid();
      }

      // 重建缩略图（thumbUrl 已存入 DB，但如果缺失则重新生成）
      for (const job of state.jobs) {
        if (!job.thumbUrl) createThumb(job);
      }

      updateFilmstrip();
      updateEmptyState();
      const job = activeJob();
      if (job) {
        fillInfoForm(job);
        fillBorderForm(activePreset(), job);
        schedulePreview();
      }

      showToast(`已恢复上次编辑（${jobs.length} 张）`, 'info');
    } catch (e) {
      console.warn('会话恢复失败', e);
    }
  }

  /** 清空会话按钮设置 */
  function setupClearSession() {
    const btn = document.getElementById('btn-clear-session');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!confirm(`确认清空所有 ${state.jobs.length} 张照片？此操作不可恢复。`)) return;
      try {
        await SessionStore.clearAll();
      } catch (e) {
        console.warn('清空失败', e);
      }
      state.jobs = [];
      state.activeJobId = null;
      clearPreview();
      updateFilmstrip();
      updateEmptyState();
      showToast('已清空所有照片', 'info');
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 启动
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', init);

})();
