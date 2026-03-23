/**
 * PhotoFrame — 拼图布局定义 & 渲染器
 *
 * cells[i].x/y/w/h = 相对于「照片区域」的归一化坐标（0-1）
 * 照片区域 = 输出画布 减去 border 后的矩形
 * outputRatio = 输出画布宽高比（含 border）
 */

// ── 布局辅助函数 ──────────────────────────────────────────────────────────
function _grid(cols, rows, gx = 0.004, gy = 0.004) {
  const cW = (1 - gx * (cols - 1)) / cols;
  const cH = (1 - gy * (rows - 1)) / rows;
  const cells = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      cells.push({ x: c * (cW + gx), y: r * (cH + gy), w: cW, h: cH });
  return cells;
}

const _bar = {
  enabled: true, titleTemplate: '', subtitleTemplate: '',
  titleFont: 'Noto Serif SC', subtitleFont: 'system-ui',
  titleFontSize: 0.038, subtitleFontSize: 0.026,
  fontColor: '#1A1A1A', textAlign: 'center',
};

window.COLLAGE_LAYOUTS = [

  // ══════════════════════════════════════════════
  // 双图
  // ══════════════════════════════════════════════
  {
    id: 'cl-2h',
    name: '横排双图',
    outputRatio: 1.72,
    cellCount: 2,
    border: { top: 0.04, bottom: 0.22, left: 0.04, right: 0.04, color: '#FFFFFF' },
    cells: [
      { x: 0,     y: 0, w: 0.498, h: 1 },
      { x: 0.502, y: 0, w: 0.498, h: 1 },
    ],
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },
  {
    id: 'cl-2v',
    name: '竖排双图',
    outputRatio: 0.58,
    cellCount: 2,
    border: { top: 0.04, bottom: 0.16, left: 0.04, right: 0.04, color: '#FFFFFF' },
    cells: [
      { x: 0, y: 0,     w: 1, h: 0.498 },
      { x: 0, y: 0.502, w: 1, h: 0.498 },
    ],
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },
  {
    id: 'cl-1l2r',
    name: '左主右副',
    outputRatio: 1.42,
    cellCount: 3,
    border: { top: 0.04, bottom: 0.20, left: 0.04, right: 0.04, color: '#FFFFFF' },
    cells: (() => {
      const gx = 0.004, gy = 0.004;
      const lw = 0.499, rw = 1 - lw - gx;
      const rh = (1 - gy) / 2;
      return [
        { x: 0,       y: 0,      w: lw, h: 1    },
        { x: lw + gx, y: 0,      w: rw, h: rh   },
        { x: lw + gx, y: rh + gy,w: rw, h: rh   },
      ];
    })(),
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },
  {
    id: 'cl-2l1r',
    name: '右主左副',
    outputRatio: 1.42,
    cellCount: 3,
    border: { top: 0.04, bottom: 0.20, left: 0.04, right: 0.04, color: '#FFFFFF' },
    cells: (() => {
      const gx = 0.004, gy = 0.004;
      const rw = 0.499, lw = 1 - rw - gx;
      const lh = (1 - gy) / 2;
      return [
        { x: 0,       y: 0,      w: lw, h: lh   },
        { x: 0,       y: lh + gy,w: lw, h: lh   },
        { x: lw + gx, y: 0,      w: rw, h: 1    },
      ];
    })(),
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },

  // ══════════════════════════════════════════════
  // 三图
  // ══════════════════════════════════════════════
  {
    id: 'cl-3h',
    name: '横排三图',
    outputRatio: 2.55,
    cellCount: 3,
    border: { top: 0.04, bottom: 0.20, left: 0.04, right: 0.04, color: '#FFFFFF' },
    cells: _grid(3, 1, 0.004),
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 4000 },
  },
  {
    id: 'cl-1t2b',
    name: '上主下副双图',
    outputRatio: 1.00,
    cellCount: 3,
    border: { top: 0.04, bottom: 0.20, left: 0.04, right: 0.04, color: '#FFFFFF' },
    cells: (() => {
      const gy = 0.004, gx = 0.004;
      const th = 0.499, bh = 1 - th - gy;
      const bw = (1 - gx) / 2;
      return [
        { x: 0,       y: 0,      w: 1,  h: th },
        { x: 0,       y: th + gy,w: bw, h: bh },
        { x: bw + gx, y: th + gy,w: bw, h: bh },
      ];
    })(),
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },
  {
    id: 'cl-2t1b',
    name: '上副双图下主',
    outputRatio: 1.00,
    cellCount: 3,
    border: { top: 0.04, bottom: 0.20, left: 0.04, right: 0.04, color: '#FFFFFF' },
    cells: (() => {
      const gy = 0.004, gx = 0.004;
      const bh = 0.499, th = 1 - bh - gy;
      const tw = (1 - gx) / 2;
      return [
        { x: 0,       y: 0,      w: tw, h: th },
        { x: tw + gx, y: 0,      w: tw, h: th },
        { x: 0,       y: th + gy,w: 1,  h: bh },
      ];
    })(),
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },

  // ══════════════════════════════════════════════
  // 四图
  // ══════════════════════════════════════════════
  {
    id: 'cl-4grid',
    name: '四宫格',
    outputRatio: 0.92,
    cellCount: 4,
    border: { top: 0.04, bottom: 0.22, left: 0.04, right: 0.04, color: '#FFFFFF' },
    cells: _grid(2, 2, 0.004, 0.004),
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },
  {
    id: 'cl-1l3r',
    name: '左主右三格',
    outputRatio: 1.34,
    cellCount: 4,
    border: { top: 0.04, bottom: 0.20, left: 0.04, right: 0.04, color: '#FFFFFF' },
    cells: (() => {
      const gx = 0.004, gy = 0.004;
      const lw = 0.499, rw = 1 - lw - gx;
      const rh = (1 - gy * 2) / 3;
      return [
        { x: 0,       y: 0,             w: lw, h: 1    },
        { x: lw + gx, y: 0,             w: rw, h: rh   },
        { x: lw + gx, y: rh + gy,       w: rw, h: rh   },
        { x: lw + gx, y: (rh + gy) * 2, w: rw, h: rh   },
      ];
    })(),
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },

  // ══════════════════════════════════════════════
  // 多图 / 特殊格式
  // ══════════════════════════════════════════════
  {
    id: 'cl-9grid',
    name: '九宫格',
    outputRatio: 0.90,
    cellCount: 9,
    border: { top: 0.03, bottom: 0.18, left: 0.03, right: 0.03, color: '#FFFFFF' },
    cells: _grid(3, 3, 0.003, 0.003),
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },
  {
    id: 'cl-film3',
    name: '胶片横三联',
    outputRatio: 2.80,
    cellCount: 3,
    border: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05, color: '#111111' },
    cells: _grid(3, 1, 0.006),
    infoBar: { ..._bar, enabled: false, fontColor: '#E8E4DC' },
    output: { format: 'jpeg', quality: 95, longEdge: 4000 },
  },
  {
    id: 'cl-story2',
    name: '竖版故事双图',
    outputRatio: 0.55,
    cellCount: 2,
    border: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05, color: '#F5F4F0' },
    cells: [
      { x: 0, y: 0,     w: 1, h: 0.498 },
      { x: 0, y: 0.502, w: 1, h: 0.498 },
    ],
    infoBar: { ..._bar, enabled: false },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },
  {
    id: 'cl-banner3',
    name: 'Banner 横幅',
    outputRatio: 3.10,
    cellCount: 3,
    border: { top: 0.03, bottom: 0.20, left: 0.03, right: 0.03, color: '#FFFFFF' },
    cells: (() => {
      const gx = 0.004;
      const w1 = 0.40, w2 = 0.205, w3 = 0.205;
      return [
        { x: 0,             y: 0, w: w1, h: 1 },
        { x: w1 + gx,       y: 0, w: w2, h: 1 },
        { x: w1 + w2 + gx*2,y: 0, w: w3, h: 1 },
      ];
    })(),
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 4000 },
  },
  {
    id: 'cl-polaroid2',
    name: '拍立得双图',
    outputRatio: 1.80,
    cellCount: 2,
    border: { top: 0.06, bottom: 0.06, left: 0.06, right: 0.06, color: '#F2EFE8' },
    cells: (() => {
      // 两张宽白边小图
      const gx = 0.04;
      const cw = (1 - gx) / 2;
      const innerPad = 0.05;
      return [
        { x: 0,       y: innerPad, w: cw, h: 1 - innerPad * 2 },
        { x: cw + gx, y: innerPad, w: cw, h: 1 - innerPad * 2 },
      ];
    })(),
    infoBar: { ..._bar, enabled: false },
    output: { format: 'jpeg', quality: 95, longEdge: 3200 },
  },
  {
    id: 'cl-featured',
    name: '精选大图+小图',
    outputRatio: 1.30,
    cellCount: 3,
    border: { top: 0.04, bottom: 0.20, left: 0.04, right: 0.04, color: '#FFFFFF' },
    cells: (() => {
      const gy = 0.004, gx = 0.004;
      const th = 0.60, bh = 1 - th - gy;
      const bw = (1 - gx) / 2;
      return [
        { x: 0,       y: 0,      w: 1,  h: th },
        { x: 0,       y: th + gy,w: bw, h: bh },
        { x: bw + gx, y: th + gy,w: bw, h: bh },
      ];
    })(),
    infoBar: { ..._bar },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },

  // ══════════════════════════════════════════════
  // 社交平台专用
  // ══════════════════════════════════════════════
  {
    id: 'cl-xhs-3v',
    name: '小红书三连竖',
    outputRatio: 9/16,
    cellCount: 3,
    border: { top: 0.02, bottom: 0.02, left: 0.02, right: 0.02, color: '#FFFFFF' },
    cells: _grid(1, 3, 0, 0.004),
    infoBar: { ..._bar, enabled: false },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },
  {
    id: 'cl-wechat-9',
    name: '朋友圈九宫格',
    outputRatio: 1,
    cellCount: 9,
    border: { top: 0.03, bottom: 0.03, left: 0.03, right: 0.03, color: '#FFFFFF' },
    cells: _grid(3, 3, 0.003, 0.003),
    infoBar: { ..._bar, enabled: false },
    output: { format: 'jpeg', quality: 95, longEdge: 3000 },
  },
  {
    id: 'cl-wechat-panorama',
    name: '朋友圈横幅三格',
    outputRatio: 3,
    cellCount: 3,
    border: { top: 0.02, bottom: 0.02, left: 0.02, right: 0.02, color: '#FFFFFF' },
    cells: _grid(3, 1, 0.003, 0),
    infoBar: { ..._bar, enabled: false },
    output: { format: 'jpeg', quality: 95, longEdge: 4000 },
  },
];

// ── 分类标签 ─────────────────────────────────────────────────────────────
window.COLLAGE_CATEGORIES = [
  { id: 'all',     label: '全部' },
  { id: 'dual',    label: '双图' },
  { id: 'triple',  label: '三图' },
  { id: 'quad',    label: '四图+' },
  { id: 'special', label: '特殊' },
];

const _collageCategory = {
  'cl-2h': 'dual', 'cl-2v': 'dual', 'cl-1l2r': 'dual', 'cl-2l1r': 'dual',
  'cl-3h': 'triple', 'cl-1t2b': 'triple', 'cl-2t1b': 'triple',
  'cl-4grid': 'quad', 'cl-1l3r': 'quad', 'cl-9grid': 'quad',
  'cl-film3': 'special', 'cl-story2': 'special', 'cl-banner3': 'special',
  'cl-polaroid2': 'special', 'cl-featured': 'special',
  'cl-xhs-3v': 'special', 'cl-wechat-9': 'quad', 'cl-wechat-panorama': 'special',
};
window.COLLAGE_LAYOUTS.forEach(l => {
  l.collageCategory = _collageCategory[l.id] || 'all';
  l.isCollage = true;
});

// ══════════════════════════════════════════════════════════════════════════
// CollageRenderer — 拼图渲染引擎
// ══════════════════════════════════════════════════════════════════════════
window.CollageRenderer = (() => {

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(); };
      img.src = url;
    });
  }

  function autoCrop(imgW, imgH, targetRatio) {
    const imgR = imgW / imgH;
    let sw, sh;
    if (imgR > targetRatio) { sh = imgH; sw = imgH * targetRatio; }
    else                     { sw = imgW; sh = imgW / targetRatio; }
    return { sx: (imgW - sw) / 2, sy: (imgH - sh) / 2, sw, sh };
  }

  /**
   * 渲染拼图
   * @param {Object}   layout       COLLAGE_LAYOUTS 中的一项
   * @param {Array}    cells        [{file, cropRect, imgCache?}, ...] 与 layout.cells 等长
   * @param {Object}   infoOverride 可覆盖 layout.infoBar 的字段
   * @param {number}   outputLongEdge
   * @param {Object}   borderOverride
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function render(layout, cells, infoOverride = {}, outputLongEdge = 3000, borderOverride = {}) {
    const ratio = layout.outputRatio || 1;
    let canvasW, canvasH;
    if (ratio >= 1) { canvasW = outputLongEdge; canvasH = Math.round(outputLongEdge / ratio); }
    else            { canvasH = outputLongEdge; canvasW = Math.round(outputLongEdge * ratio); }

    const b       = Object.assign({}, layout.border, borderOverride);
    const shorter = Math.min(canvasW, canvasH);
    const bTop    = Math.round(shorter * (b.top    || 0.04));
    const bBottom = Math.round(shorter * (b.bottom || 0.20));
    const bLeft   = Math.round(shorter * (b.left   || 0.04));
    const bRight  = Math.round(shorter * (b.right  || 0.04));

    const paW = canvasW - bLeft - bRight;   // photo-area width
    const paH = canvasH - bTop  - bBottom;  // photo-area height

    const canvas = document.createElement('canvas');
    canvas.width  = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 背景
    ctx.fillStyle = b.color || '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 绘制各单元格
    for (let i = 0; i < layout.cells.length; i++) {
      const cellDef = layout.cells[i];
      const cellData = cells[i];
      if (!cellData?.file) continue;

      const img = cellData.imgCache || await loadImage(cellData.file);

      const cellX = Math.round(bLeft + cellDef.x * paW);
      const cellY = Math.round(bTop  + cellDef.y * paH);
      const cellW = Math.round(cellDef.w * paW);
      const cellH = Math.round(cellDef.h * paH);

      const cellRatio = cellW / cellH;
      const crop = cellData.cropRect || autoCrop(img.naturalWidth, img.naturalHeight, cellRatio);

      ctx.save();
      ctx.beginPath();
      ctx.rect(cellX, cellY, cellW, cellH);
      ctx.clip();
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, cellX, cellY, cellW, cellH);
      ctx.restore();
    }

    // 信息文字
    const info = Object.assign({}, layout.infoBar, infoOverride);
    if (info.enabled !== false && (info.titleTemplate || info.subtitleTemplate)) {
      await drawInfo(ctx, canvasW, canvasH, bTop, bBottom, paH, shorter, info);
    }

    return canvas;
  }

  async function drawInfo(ctx, cW, cH, bTop, bBottom, paH, shorter, info) {
    if (!bBottom || bBottom < 8) return;
    const barTop = bTop + paH;
    const title    = (info.titleTemplate    || '').trim();
    const subtitle = (info.subtitleTemplate || '').trim();
    if (!title && !subtitle) return;

    const tSize = Math.max(10, Math.round(shorter * (info.titleFontSize    || 0.038)));
    const sSize = Math.max(8,  Math.round(shorter * (info.subtitleFontSize || 0.026)));

    ctx.fillStyle    = info.fontColor || '#1A1A1A';
    ctx.textBaseline = 'middle';
    const align = info.textAlign || 'center';
    ctx.textAlign = align;
    const x = align === 'left' ? cW * 0.08 : align === 'right' ? cW * 0.92 : cW / 2;

    if (title && subtitle) {
      ctx.font = `${tSize}px "${info.titleFont || 'serif'}"`;
      ctx.fillText(title,    x, barTop + bBottom * 0.38);
      ctx.font = `${sSize}px "${info.subtitleFont || 'sans-serif'}"`;
      ctx.fillText(subtitle, x, barTop + bBottom * 0.65);
    } else {
      ctx.font = `${(title ? tSize : sSize)}px "${(title ? info.titleFont : info.subtitleFont) || 'serif'}"`;
      ctx.fillText(title || subtitle, x, barTop + bBottom * 0.50);
    }
  }

  /** 快速预览（低分辨率） */
  async function renderPreview(layout, cells, infoOverride, borderOverride, maxEdge = 1200) {
    return render(layout, cells, infoOverride, maxEdge, borderOverride);
  }

  return { render, renderPreview };
})();
