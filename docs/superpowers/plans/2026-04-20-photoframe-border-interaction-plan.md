# PhotoFrame 边框交互重构 + 功能升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将边框拖拽从 HTML overlay 架构重构为 Canvas 内联渲染，消除松手重绘/拖动不实时/内外边框干扰等问题，并增加撤销重做、比例吸附、文字自由拖拽、快捷键等体验提升。

**Architecture:** 手柄绘制合并到 Canvas 渲染管线中，消除 HTML overlay 与 Canvas 之间的同步问题。外边框/内边框模式完全解耦。分 5 个阶段实施，每阶段可独立运行。

**Tech Stack:** Vanilla JavaScript (ES2022), HTML5 Canvas API, 无框架无构建工具

---

## 文件结构总览

| 文件 | 职责 | 变更类型 |
|------|------|----------|
| `js/border-handles.js` | Canvas 手柄绘制模块（新文件） | 创建新手柄绘制、命中检测、虚线预览、吸附指示器方法 |
| `js/canvas-renderer.js` | Canvas 渲染引擎 | 无需修改（手柄绘制在独立模块中） |
| `js/app.js` | 主控制器 | 重写边框拖拽逻辑、新增 UndoManager、快捷键、比例吸附、文字拖拽 |
| `index.html` | 页面结构 | 移除 HTML overlay 手柄 DOM，新增比例按钮组、撤销/重做按钮、预设搜索框、FPS 指示器 |
| `css/style.css` | 全部样式 | 移除 `.br-handle` 相关样式，新增新组件样式 |

---

### Task 1: 移除旧 HTML overlay 手柄系统

**Files:**
- Modify: `index.html:356-383` — 移除 `#border-resize-overlay` 及其所有子元素
- Modify: `css/style.css:919-980` — 移除 `#border-resize-overlay`, `.br-handle`, `.br-line` 相关样式

- [ ] **Step 1: 移除 index.html 中的 border resize overlay DOM**

找到 `index.html` 中 `<!-- 边框拖拽调整句柄 -->` 注释后的 `<div id="border-resize-overlay" hidden>` 到其闭合 `</div>`（约第 356-383 行），删除整个元素块：

```html
<!-- 修改前：第 356-383 行的整个 #border-resize-overlay 块 -->
<!-- 修改后：删除此块，不保留任何 .br-handle 或 .br-line 元素 -->
```

- [ ] **Step 2: 移除 css/style.css 中的旧边框手柄样式**

删除 `css/style.css` 中第 919-980 行的所有样式，包括：
- `#border-resize-overlay`
- `.br-handle`
- `.br-handle.br-outer`
- `.br-handle.br-inner`
- `.br-handle.br-corner`
- `.br-handle.br-outer[data-corner=...]`
- `.br-handle.br-inner[data-corner=...]`
- `.br-handle.br-edge`
- `.br-line`
- `.br-outer-line`
- `.br-inner-line`

保留 `.text-pos-handle` 相关样式不动。

- [ ] **Step 3: 验证应用仍然可以加载**

```bash
cd /Users/jackerkun/Projects/PhotoTools/PhotoFrame && python3 -m http.server 8080 &
sleep 2
curl -s http://localhost:8080/ | grep -c "border-resize-overlay"
# 预期: 0（DOM 中不再有 border-resize-overlay）
kill %1 2>/dev/null
```

- [ ] **Step 4: Commit**

```bash
git add index.html css/style.css
git commit -m "refactor: remove HTML overlay border resize handles"
```

---

### Task 2: Canvas 内联手柄绘制

**Files:**
- Create: `js/border-handles.js` — Canvas 手柄绘制模块（从 canvas-renderer 中独立出来，职责清晰）
- Modify: `js/canvas-renderer.js` — 在 return 中导出 `drawBorderHandles`, `drawDragPreviewLine`
- Modify: `index.html:537` — 新增 `<script src="js/border-handles.js">` 加载

- [ ] **Step 1: 创建 `js/border-handles.js` 模块**

这个文件负责在 Canvas 上绘制边框手柄和拖拽预览线。完整代码：

```javascript
/**
 * border-handles.js — Canvas 边框手柄绘制模块
 * 提供手柄绘制、命中检测、拖拽预览线绘制
 */
(function () {
  'use strict';

  const HANDLE_RADIUS = 7;      // 手柄半径 7px (直径 14px)
  const HANDLE_RADIUS_HOVER = 9; // 悬停时 9px (直径 18px)
  const HIT_RADIUS = 12;         // 命中检测半径 12px

  // 颜色
  const OUTER_COLOR = '#C4A248';  // 琥珀色
  const INNER_COLOR = '#4A8FC0';  // 蓝色
  const STROKE_COLOR = '#FFFFFF';
  const OUTER_DRAG_COLOR = '#FF9500';
  const INNER_DRAG_COLOR = '#007AFF';
  const GLOW_COLOR = 'rgba(255,255,255,0.3)';

  /**
   * 计算 8 个手柄的 Canvas 坐标
   * @param {Object} layout - getLastLayout() 返回值
   * @returns {{ outer: Object, inner: Object }}
   */
  function calcHandlePositions(layout) {
    const { canvasW, canvasH, bLeft, bTop, photoW, photoH } = layout;
    const ocx = canvasW / 2, ocy = canvasH / 2;
    const icx = bLeft + photoW / 2, icy = bTop + photoH / 2;
    const ir = bLeft + photoW, ib = bTop + photoH;

    return {
      outer: {
        tl: { x: 0, y: 0 }, tr: { x: canvasW, y: 0 },
        bl: { x: 0, y: canvasH }, br: { x: canvasW, y: canvasH },
        t: { x: ocx, y: 0 }, b: { x: ocx, y: canvasH },
        l: { x: 0, y: ocy }, r: { x: canvasW, y: ocy },
      },
      inner: {
        tl: { x: bLeft, y: bTop }, tr: { x: ir, y: bTop },
        bl: { x: bLeft, y: ib }, br: { x: ir, y: ib },
        t: { x: icx, y: bTop }, b: { x: icx, y: ib },
        l: { x: bLeft, y: icy }, r: { x: ir, y: icy },
      }
    };
  }

  /**
   * 绘制单个手柄
   */
  function drawHandle(ctx, x, y, color, isHovered, isDragging) {
    const r = isHovered ? HANDLE_RADIUS_HOVER : HANDLE_RADIUS;

    // 光晕
    if (isHovered || isDragging) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = GLOW_COLOR;
      ctx.fill();
    }

    // 主体
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = isDragging ? color : color;
    ctx.fill();
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /**
   * 在 Canvas 上绘制所有边框手柄
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} layout - getLastLayout() 返回值
   * @param {Object} dragState - 拖拽状态 { type, corner, hoverCorner, dragCorner }
   */
  function drawBorderHandles(ctx, layout, dragState) {
    if (!layout) return;
    const positions = calcHandlePositions(layout);
    const d = dragState || {};

    // 绘制外框手柄
    for (const [key, pos] of Object.entries(positions.outer)) {
      const isDragging = d.type === 'outer' && d.dragCorner === key;
      const isHovered = d.hoverCorner === key && !d.dragCorner;
      drawHandle(ctx, pos.x, pos.y, isDragging ? OUTER_DRAG_COLOR : OUTER_COLOR, isHovered, isDragging);
    }

    // 绘制内框手柄
    for (const [key, pos] of Object.entries(positions.inner)) {
      const isDragging = d.type === 'inner' && d.dragCorner === key;
      const isHovered = d.hoverCorner === key && !d.dragCorner;
      drawHandle(ctx, pos.x, pos.y, isDragging ? INNER_DRAG_COLOR : INNER_COLOR, isHovered, isDragging);
    }
  }

  /**
   * 绘制拖拽虚线预览框
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} layout
   * @param {Object} dragState
   */
  function drawDragPreviewLine(ctx, layout, dragState) {
    if (!dragState || !dragState.dragCorner) return;

    const { canvasW, canvasH, bLeft, bTop, photoW, photoH } = layout;
    const type = dragState.type;
    const color = type === 'outer' ? OUTER_DRAG_COLOR : INNER_DRAG_COLOR;

    // 如果是外边框模式，显示当前 canvas 边界虚线
    // 如果是内边框模式，显示当前照片区域边界虚线
    if (type === 'outer') {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, canvasW, canvasH);
      ctx.restore();
    } else {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(bLeft, bTop, photoW, photoH);
      ctx.restore();
    }
  }

  /**
   * 绘制吸附指示器（比例名称浮层）
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} layout
   * @param {string} ratioLabel - 如 "16:9"
   */
  function drawSnapIndicator(ctx, layout, ratioLabel) {
    if (!ratioLabel || !layout) return;
    const { canvasW, canvasH } = layout;

    ctx.save();
    ctx.font = 'bold 14px system-ui';
    const metrics = ctx.measureText(ratioLabel);
    const tw = metrics.width + 16;
    const th = 24;
    const tx = (canvasW - tw) / 2;
    const ty = 12;

    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, 6);
    ctx.fill();

    // 文字
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ratioLabel, canvasW / 2, ty + th / 2);
    ctx.restore();
  }

  /**
   * 命中检测：检查 (mx, my) 是否在任意手柄的命中半径内
   * @param {number} mx - 鼠标 X（Canvas 逻辑坐标）
   * @param {number} my - 鼠标 Y
   * @param {Object} layout
   * @returns {{ type: 'outer'|'inner', corner: string }|null}
   */
  function hitTestHandles(mx, my, layout) {
    if (!layout) return null;
    const positions = calcHandlePositions(layout);

    // 先检测内框（更靠近用户关注的区域）
    for (const [key, pos] of Object.entries(positions.inner)) {
      const dx = mx - pos.x, dy = my - pos.y;
      if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
        return { type: 'inner', corner: key };
      }
    }

    // 再检测外框
    for (const [key, pos] of Object.entries(positions.outer)) {
      const dx = mx - pos.x, dy = my - pos.y;
      if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
        return { type: 'outer', corner: key };
      }
    }

    return null;
  }

  window.BorderHandles = {
    drawBorderHandles,
    drawDragPreviewLine,
    drawSnapIndicator,
    hitTestHandles,
    HIT_RADIUS,
  };
})();
```

- [ ] **Step 2: 在 index.html 中加载新模块**

在 `index.html` 的 script 加载区域（约第 537 行 `js/canvas-renderer.js` 之后）添加：

```html
<script src="js/canvas-renderer.js"></script>
<script src="js/border-handles.js"></script>
<script src="js/crop-editor.js"></script>
```

- [ ] **Step 3: 在 canvas-renderer.js 的 export 中透出 BorderHandles 引用**

`canvas-renderer.js` 最后返回的对象（第 353 行附近）不需要改动，因为 `BorderHandles` 挂载到 `window` 全局对象上。但需要确保 `canvas-renderer.js` 中的 `roundRect` 方法可以被 `border-handles.js` 使用。在 `border-handles.js` 中已经使用了 `ctx.roundRect()`（原生 Canvas API，现代浏览器支持），所以不需要额外导出。

- [ ] **Step 4: Commit**

```bash
git add js/border-handles.js index.html
git commit -m "feat: add Canvas-based border handle drawing module"
```

---

### Task 3: 重写边框拖拽事件处理

**Files:**
- Modify: `js/app.js:2201-2595` — 完全重写 `setupBorderResizeMode()`, 移除 `updateBorderResizeHandles()`, `updateBorderResizeHandlesDrag()`, `enterBorderResizeMode()`, `exitBorderResizeMode()`
- Modify: `js/app.js:1373-1411` — 修改 `renderPreviewForce()` 和 `displayPreview()` 中的 `_borderDragState` 处理

- [ ] **Step 1: 重写 `setupBorderResizeMode()` 函数**

替换 `js/app.js` 中第 2201-2349 行的整个 `setupBorderResizeMode` 函数。新实现：

```javascript
function setupBorderResizeMode() {
  const btn = document.getElementById('btn-border-resize');
  btn?.addEventListener('click', () => {
    if (state.borderResizeMode) exitBorderResizeMode();
    else enterBorderResizeMode();
  });

  // 鼠标移动时更新悬停状态
  const previewCanvas = () => document.getElementById('canvas-preview');

  const onBorderDragMove = (e) => {
    if (!_borderDragState) return;
    const { shorter } = _borderDragState;
    const dxL = (e.clientX - _borderDragState.startX) / _borderDragState.initialScaleX;
    const dyL = (e.clientY - _borderDragState.startY) / _borderDragState.initialScaleY;

    const job = activeJob();
    if (!job) return;

    const { corner, type, startBTop, startBBottom, startBLeft, startBRight, startCanvasW, startCanvasH, startPhotoW, startPhotoH } = _borderDragState;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    if (type === 'outer') {
      // 外边框模式：改变 Canvas 尺寸，图片位置和大小不变
      if (corner === 'tl') {
        job.borderOverrides.left   = clamp(startBLeft   - dxL / shorter, 0, 0.60);
        job.borderOverrides.top    = clamp(startBTop    - dyL / shorter, 0, 0.60);
      } else if (corner === 'tr') {
        job.borderOverrides.right  = clamp(startBRight  + dxL / shorter, 0, 0.60);
        job.borderOverrides.top    = clamp(startBTop    - dyL / shorter, 0, 0.60);
      } else if (corner === 'bl') {
        job.borderOverrides.left   = clamp(startBLeft   - dxL / shorter, 0, 0.60);
        job.borderOverrides.bottom = clamp(startBBottom + dyL / shorter, 0, 0.60);
      } else if (corner === 'br') {
        job.borderOverrides.right  = clamp(startBRight  + dxL / shorter, 0, 0.60);
        job.borderOverrides.bottom = clamp(startBBottom + dyL / shorter, 0, 0.60);
      } else if (corner === 't') {
        job.borderOverrides.top    = clamp(startBTop    - dyL / shorter, 0, 0.60);
      } else if (corner === 'b') {
        job.borderOverrides.bottom = clamp(startBBottom + dyL / shorter, 0, 0.60);
      } else if (corner === 'l') {
        job.borderOverrides.left   = clamp(startBLeft   - dxL / shorter, 0, 0.60);
      } else if (corner === 'r') {
        job.borderOverrides.right  = clamp(startBRight  + dxL / shorter, 0, 0.60);
      }
    } else {
      // 内边框模式：只改变 border 值，Canvas 总尺寸不变
      if (corner === 'tl') {
        job.borderOverrides.top    = clamp(startBTop    + dyL / shorter, 0, 0.60);
        job.borderOverrides.left   = clamp(startBLeft   + dxL / shorter, 0, 0.60);
      } else if (corner === 'tr') {
        job.borderOverrides.top    = clamp(startBTop    + dyL / shorter, 0, 0.60);
        job.borderOverrides.right  = clamp(startBRight  - dxL / shorter, 0, 0.60);
      } else if (corner === 'bl') {
        job.borderOverrides.bottom = clamp(startBBottom - dyL / shorter, 0, 0.60);
        job.borderOverrides.left   = clamp(startBLeft   + dxL / shorter, 0, 0.60);
      } else if (corner === 'br') {
        job.borderOverrides.bottom = clamp(startBBottom - dyL / shorter, 0, 0.60);
        job.borderOverrides.right  = clamp(startBRight  - dxL / shorter, 0, 0.60);
      } else if (corner === 't') {
        job.borderOverrides.top    = clamp(startBTop    + dyL / shorter, 0, 0.60);
      } else if (corner === 'b') {
        job.borderOverrides.bottom = clamp(startBBottom - dyL / shorter, 0, 0.60);
      } else if (corner === 'l') {
        job.borderOverrides.left   = clamp(startBLeft   + dxL / shorter, 0, 0.60);
      } else if (corner === 'r') {
        job.borderOverrides.right  = clamp(startBRight  - dxL / shorter, 0, 0.60);
      }
    }

    // 同步滑块
    syncBorderSliders(job);

    scheduleSessionSave();

    // 每帧重绘
    if (_rafPreview) cancelAnimationFrame(_rafPreview);
    _rafPreview = requestAnimationFrame(() => {
      _rafPreview = null;
      renderPreviewForce();
    });
  };

  const onBorderDragEnd = () => {
    if (!_borderDragState) return;
    if (_rafPreview) { cancelAnimationFrame(_rafPreview); _rafPreview = null; }
    _borderDragState = null;
    renderPreview();
  };

  const onPointerDown = (e) => {
    if (!state.borderResizeMode) return;
    const canvas = previewCanvas();
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / (canvas.width || 1);
    const scaleY = rect.height / (canvas.height || 1);
    const mx = (e.clientX - rect.left) / scaleX;
    const my = (e.clientY - rect.top) / scaleY;

    const layout = CanvasRenderer.getLastLayout();
    const hit = BorderHandles.hitTestHandles(mx, my, layout);
    if (!hit) return;

    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    const job = activeJob();
    const preset = activePreset();
    if (!layout || !job || !preset) return;

    const b = Object.assign({}, preset.border, job.borderOverrides || {});

    canvas.style.width     = canvas.offsetWidth + 'px';
    canvas.style.height    = canvas.offsetHeight + 'px';
    canvas.style.maxWidth  = 'none';
    canvas.style.maxHeight = 'none';

    _borderDragState = {
      corner: hit.corner,
      type: hit.type,
      startX: e.clientX,
      startY: e.clientY,
      startBTop:     b.top    ?? 0.05,
      startBBottom:  b.bottom ?? 0.22,
      startBLeft:    b.left   ?? 0.05,
      startBRight:   b.right  ?? 0.05,
      startCanvasW: layout.canvasW,
      startCanvasH: layout.canvasH,
      startPhotoW: layout.photoW,
      startPhotoH: layout.photoH,
      shorter: layout.shorter,
      presetBorder: Object.assign({}, preset.border),
      initialScaleX: rect.width / (layout.canvasW || 1),
      initialScaleY: rect.height / (layout.canvasH || 1),
    };

    // 注册 move/up 监听（只注册一次）
    window.addEventListener('pointermove', onBorderDragMove);
    window.addEventListener('pointerup', onBorderDragUp, { once: true });
  };

  const onBorderDragUp = (e) => {
    const canvas = previewCanvas();
    if (canvas) {
      canvas.style.width = '';
      canvas.style.height = '';
      canvas.style.maxWidth = '';
      canvas.style.maxHeight = '';
    }
    onBorderDragEnd();
    window.removeEventListener('pointermove', onBorderDragMove);
  };

  // 在预览 Canvas 上注册 pointerdown
  const canvas = previewCanvas();
  if (canvas) {
    canvas.addEventListener('pointerdown', onPointerDown);
  }

  // 鼠标移动悬停检测
  const onHoverMove = (e) => {
    if (_borderDragState || !state.borderResizeMode) return;
    const cvs = previewCanvas();
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const layout = CanvasRenderer.getLastLayout();
    if (!layout) return;
    const scaleX = rect.width / (cvs.width || 1);
    const scaleY = rect.height / (cvs.height || 1);
    const mx = (e.clientX - rect.left) / scaleX;
    const my = (e.clientY - rect.top) / scaleY;
    const hit = BorderHandles.hitTestHandles(mx, my, layout);
    // 设置光标样式
    cvs.style.cursor = hit ? 'grab' : '';
    // 存储悬停状态供渲染使用
    cvs._borderHandleHover = hit;
    // 触发重绘以更新手柄高亮
    schedulePreviewNow();
  };

  const previewWrapper = document.getElementById('preview-wrapper');
  if (previewWrapper) {
    previewWrapper.addEventListener('pointermove', onHoverMove);
  }
}
```

- [ ] **Step 2: 重写 `enterBorderResizeMode()` 函数**

替换原有的 `enterBorderResizeMode`（约第 2445-2451 行）：

```javascript
function enterBorderResizeMode() {
  state.borderResizeMode = true;
  document.getElementById('btn-border-resize')?.classList.add('active');
  document.getElementById('btn-border-resize')?.classList.remove('hidden');
  // 在 Canvas 上绘制手柄
  schedulePreviewNow();
}
```

- [ ] **Step 3: 重写 `exitBorderResizeMode()` 函数**

替换原有的 `exitBorderResizeMode`（约第 2453-2468 行）：

```javascript
function exitBorderResizeMode() {
  state.borderResizeMode = false;
  document.getElementById('btn-border-resize')?.classList.remove('active');
  _borderDragState = null;
  const canvas = document.getElementById('canvas-preview');
  if (canvas) {
    canvas._borderHandleHover = null;
    canvas.style.cursor = '';
  }
  schedulePreview();
}
```

- [ ] **Step 4: 移除旧的 `updateBorderResizeHandles()` 和 `updateBorderResizeHandlesDrag()` 函数**

删除 `js/app.js` 中第 2352-2443 行的 `updateBorderResizeHandlesDrag()` 函数（约 92 行）。
删除 `js/app.js` 中第 2470-2595 行的 `updateBorderResizeHandles()` 函数（约 126 行）。

- [ ] **Step 5: 修改 `renderPreviewForce()` 在渲染后绘制手柄**

修改 `js/app.js` 中 `renderPreviewForce()` 函数（约第 1373-1387 行）。在 `displayPreview(canvas)` 之后添加手柄绘制：

```javascript
async function renderPreviewForce() {
  const job = activeJob();
  const preset = activePreset();
  if (!job || !preset) return;
  try {
    const mergedPreset = buildMergedPreset(preset, job);
    const canvas = await CanvasRenderer.renderPreview(job.file, mergedPreset, job, 1400);
    displayPreview(canvas);
    updateSizeInfo(canvas);

    // 绘制边框手柄
    const layout = CanvasRenderer.getLastLayout();
    if (layout && state.borderResizeMode) {
      const ctx = canvas.getContext('2d');
      const dragState = _borderDragState
        ? { type: _borderDragState.type, corner: _borderDragState.corner, dragCorner: _borderDragState.corner }
        : { hoverCorner: canvas._borderHandleHover?.corner };
      BorderHandles.drawBorderHandles(ctx, layout, dragState);
      if (_borderDragState) {
        BorderHandles.drawDragPreviewLine(ctx, layout, _borderDragState);
      }
    }
  } catch (e) {
    console.error('[renderForce] error:', e);
  }
}
```

- [ ] **Step 6: 修改 `displayPreview()` 移除旧的 `_borderDragState` 特殊处理**

修改 `js/app.js` 中 `displayPreview()` 函数（约第 1389-1411 行），简化为：

```javascript
function displayPreview(offscreenCanvas) {
  const preview = document.getElementById('canvas-preview');
  if (!preview) return;
  const wrapper = document.getElementById('preview-wrapper');

  preview.width  = offscreenCanvas.width;
  preview.height = offscreenCanvas.height;
  const ctx = preview.getContext('2d');
  ctx.drawImage(offscreenCanvas, 0, 0);
  applyZoom(wrapper, preview);
}
```

移除原有的 `_borderDragState` 分支判断。

- [ ] **Step 7: 添加 `syncBorderSliders()` 辅助函数**

在 `setupBorderResizeMode` 之前（约第 2200 行附近）添加：

```javascript
function syncBorderSliders(job) {
  ['top', 'bottom', 'left', 'right'].forEach(dir => {
    const v = job.borderOverrides[dir];
    if (v === undefined) return;
    const s = document.getElementById(`border-${dir}`);
    const n = document.getElementById(`border-${dir}-num`);
    if (s) s.value = v;
    if (n) n.value = (v * 100).toFixed(1);
  });
}
```

- [ ] **Step 8: Commit**

```bash
git add js/app.js
git commit -m "refactor: rewrite border drag to use Canvas handles with real-time rendering"
```

---

### Task 4: 撤销/重做系统

**Files:**
- Create: `js/undo-manager.js` — 撤销/重做管理类
- Modify: `js/app.js` — 集成 UndoManager，添加快捷键绑定
- Modify: `index.html` — 顶部工具栏新增撤销/重做按钮
- Modify: `css/style.css` — 撤销/重做按钮样式

- [ ] **Step 1: 创建 `js/undo-manager.js`**

```javascript
/**
 * undo-manager.js — 撤销/重做管理器
 */
(function () {
  'use strict';

  const MAX_HISTORY = 50;

  class UndoManager {
    constructor() {
      this.undoStack = [];
      this.redoStack = [];
      this._listeners = [];
    }

    push(entry) {
      this.undoStack.push({
        timestamp: Date.now(),
        ...entry,
      });
      if (this.undoStack.length > MAX_HISTORY) {
        this.undoStack.shift();
      }
      this.redoStack = [];
      this._notify();
    }

    undo() {
      if (this.undoStack.length === 0) return null;
      const entry = this.undoStack.pop();
      this.redoStack.push(entry);
      this._notify();
      return entry;
    }

    redo() {
      if (this.redoStack.length === 0) return null;
      const entry = this.redoStack.pop();
      this.undoStack.push(entry);
      this._notify();
      return entry;
    }

    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }

    onChange(fn) { this._listeners.push(fn); }
    _notify() { this._listeners.forEach(fn => fn()); }
  }

  window.UndoManager = UndoManager;
})();
```

- [ ] **Step 2: 在 index.html 中加载新模块**

在 `index.html` 的 script 加载区域（在 `js/app.js` 之前）添加：

```html
<script src="js/undo-manager.js"></script>
<script src="js/app.js"></script>
```

- [ ] **Step 3: 在 index.html 顶部工具栏添加撤销/重做按钮**

在 `index.html` 的 `<div class="topbar-actions">`（约第 39-47 行）中，在 render-indicator 之前添加：

```html
<div class="topbar-actions">
  <button id="btn-undo" class="btn btn-ghost btn-icon" title="撤销 (Ctrl+Z)" disabled>↩</button>
  <button id="btn-redo" class="btn btn-ghost btn-icon" title="重做 (Ctrl+Shift+Z)" disabled>↪</button>
  <div id="render-indicator" hidden>
```

- [ ] **Step 4: 在 css/style.css 中添加撤销/重做按钮样式**

在 `css/style.css` 的 `.topbar` 相关样式附近添加：

```css
/* ── 撤销/重做按钮 ── */
.btn-icon {
  padding: 4px 8px;
  font-size: 16px;
  line-height: 1;
}
.btn-icon:disabled {
  opacity: 0.3;
  cursor: default;
}
.btn-icon:not(:disabled):hover {
  background: var(--bg-hover);
}
```

- [ ] **Step 5: 在 app.js 中集成 UndoManager**

在 `js/app.js` 的 state 声明区域（约第 13-35 行）之后添加：

```javascript
const undoMgr = new UndoManager();
```

在 `init()` 函数中添加撤销/重做按钮绑定和快捷键：

```javascript
// 撤销/重做 UI 更新
undoMgr.onChange(() => {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.disabled = !undoMgr.canUndo();
  if (btnRedo) btnRedo.disabled = !undoMgr.canRedo();
});

document.getElementById('btn-undo')?.addEventListener('click', doUndo);
document.getElementById('btn-redo')?.addEventListener('click', doRedo);

// 全局快捷键
document.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const mod = isMac ? e.metaKey : e.ctrlKey;

  if (mod && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    doUndo();
  }
  if (mod && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    doRedo();
  }
  if (mod && e.key === 'y') {
    e.preventDefault();
    doRedo();
  }
});
```

- [ ] **Step 6: 实现 `doUndo()` 和 `doRedo()` 函数**

在 app.js 中添加：

```javascript
function doUndo() {
  const entry = undoMgr.undo();
  if (!entry) return;
  const job = activeJob();
  if (!job) return;

  // 恢复边框值
  if (entry.type === 'border_change' || entry.type === 'preset_switch') {
    job.borderOverrides = { ...entry.before.borderOverrides };
    syncBorderSliders(job);
  }
  // 恢复文字偏移
  if (entry.type === 'text_move' || entry.type === 'border_change') {
    if (entry.before.infoOverrides) {
      job.infoOverrides = { ...entry.before.infoOverrides };
    }
  }

  renderPreview();
}

function doRedo() {
  const entry = undoMgr.redo();
  if (!entry) return;
  const job = activeJob();
  if (!job) return;

  if (entry.type === 'border_change' || entry.type === 'preset_switch') {
    job.borderOverrides = { ...entry.after.borderOverrides };
    syncBorderSliders(job);
  }
  if (entry.type === 'text_move' || entry.type === 'border_change') {
    if (entry.after.infoOverrides) {
      job.infoOverrides = { ...entry.after.infoOverrides };
    }
  }

  renderPreview();
}
```

- [ ] **Step 7: 在边框拖拽结束时记录历史**

修改 `onBorderDragEnd` 函数（在 Task 3 中已重写），在 `_borderDragState = null;` 之前添加：

```javascript
// 记录撤销历史
const preset = activePreset();
undoMgr.push({
  type: 'border_change',
  before: {
    borderOverrides: { ..._borderDragState.presetBorder },
    infoOverrides: activeJob()?.infoOverrides ? { ...activeJob().infoOverrides } : {},
  },
  after: {
    borderOverrides: { ...activeJob().borderOverrides },
    infoOverrides: activeJob()?.infoOverrides ? { ...activeJob().infoOverrides } : {},
  },
});
```

- [ ] **Step 8: 在预设切换时记录历史**

在 app.js 的预设选择处理函数中（找到 preset card 点击处理逻辑，约第 680-700 行附近），在应用新预设之前保存当前状态，在之后 push 历史。找到类似 `job.presetId = presetId` 的位置，在其周围添加：

```javascript
// 在切换预设前保存 before 状态
const beforeState = {
  borderOverrides: { ...activeJob().borderOverrides },
  infoOverrides: { ...activeJob().infoOverrides },
};

// ... existing preset apply code ...

// 切换后记录历史
const preset = activePreset();
undoMgr.push({
  type: 'preset_switch',
  before: beforeState,
  after: {
    borderOverrides: { ...activeJob().borderOverrides },
    infoOverrides: { ...activeJob().infoOverrides },
  },
});
```

- [ ] **Step 9: Commit**

```bash
git add js/undo-manager.js js/app.js index.html css/style.css
git commit -m "feat: add undo/redo system with Ctrl+Z shortcuts"
```

---

### Task 5: 智能参考线 + 比例吸附

**Files:**
- Modify: `js/border-handles.js` — 已有 `drawSnapIndicator`
- Modify: `js/app.js` — 新增 `calcSnapRatio()`, `applyAspectRatio()`, 比例按钮事件

- [ ] **Step 1: 在 `js/app.js` 中添加比例吸附逻辑**

在 `setupBorderResizeMode` 之前添加：

```javascript
const ASPECT_RATIOS = [
  { label: '1:1',   ratio: 1.0 },
  { label: '4:3',   ratio: 1.333 },
  { label: '3:2',   ratio: 1.5 },
  { label: '2:3',   ratio: 0.667 },
  { label: '4:5',   ratio: 0.8 },
  { label: '16:9',  ratio: 1.778 },
  { label: '21:9',  ratio: 2.333 },
  { label: 'XPan',  ratio: 2.4 },
  { label: '612',   ratio: 2.0 },
  { label: '617',   ratio: 3.0 },
];

const SNAP_THRESHOLD = 15; // px

function calcSnapRatio(canvasW, canvasH) {
  const current = canvasW / canvasH;
  let best = null;
  let bestDist = Infinity;

  for (const item of ASPECT_RATIOS) {
    const dist = Math.abs(current - item.ratio);
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  }

  // 将比例差值转换为像素阈值判断
  const minDim = Math.min(canvasW, canvasH);
  if (bestDist * minDim < SNAP_THRESHOLD) {
    return best;
  }
  return null;
}

function applyAspectRatio(ratioLabel) {
  const job = activeJob();
  const layout = CanvasRenderer.getLastLayout();
  if (!job || !layout) return;

  const target = ASPECT_RATIOS.find(r => r.label === ratioLabel);
  if (!target) return;

  const current = layout.canvasW / layout.canvasH;
  if (Math.abs(current - target.ratio) < 0.001) return;

  // 记录 before 状态
  const before = { borderOverrides: { ...job.borderOverrides } };

  // 计算需要的边框调整
  const shorter = layout.shorter;
  const targetW = layout.canvasH * target.ratio;
  const diff = targetW - layout.canvasW;

  // 均匀分配到左右边框
  const deltaPerSide = diff / 2 / shorter;
  job.borderOverrides.left  = Math.max(0, Math.min(0.60, (job.borderOverrides.left ?? 0.05) + deltaPerSide));
  job.borderOverrides.right = Math.max(0, Math.min(0.60, (job.borderOverrides.right ?? 0.05) + deltaPerSide));

  syncBorderSliders(job);

  undoMgr.push({
    type: 'border_change',
    before,
    after: { borderOverrides: { ...job.borderOverrides } },
  });

  renderPreview();
}
```

- [ ] **Step 2: 在 index.html 的边框面板中添加比例按钮组**

在 `index.html` 的 `#tab-border` 中，在"边框宽度"区域之前（约第 150 行附近）添加：

```html
<div class="section-title">快捷比例</div>
<div class="aspect-ratio-buttons">
  <button class="aspect-btn" data-ratio="1:1">1:1</button>
  <button class="aspect-btn" data-ratio="4:3">4:3</button>
  <button class="aspect-btn" data-ratio="3:2">3:2</button>
  <button class="aspect-btn" data-ratio="4:5">4:5</button>
  <button class="aspect-btn" data-ratio="16:9">16:9</button>
  <button class="aspect-btn" data-ratio="2:3">2:3</button>
  <button class="aspect-btn" data-ratio="custom" title="自定义比例">自定义</button>
</div>
```

- [ ] **Step 3: 在 css/style.css 中添加比例按钮样式**

```css
/* ── 快捷比例按钮 ── */
.aspect-ratio-buttons {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.aspect-btn {
  padding: 3px 8px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-panel);
  color: var(--text-2);
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
}
.aspect-btn:hover { background: var(--bg-hover); color: var(--text-1); }
.aspect-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
```

- [ ] **Step 4: 在 app.js 中绑定比例按钮事件**

在 `setupBorderResizeMode` 或 init 函数中添加：

```javascript
document.querySelectorAll('.aspect-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const ratio = btn.dataset.ratio;
    if (ratio === 'custom') {
      // 自定义模式：清除吸附，让用户自由拖拽
      document.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('active'));
      return;
    }

    document.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyAspectRatio(ratio);
  });
});
```

- [ ] **Step 5: 在拖拽时集成吸附**

修改 `onBorderDragMove` 中 `renderPreviewForce()` 调用前的逻辑，添加吸附检测：

```javascript
// 检测吸附（Alt 键禁用）
if (!e.altKey) {
  const layout = CanvasRenderer.getLastLayout();
  if (layout) {
    const snapped = calcSnapRatio(layout.canvasW, layout.canvasH);
    if (snapped) {
      _borderDragState.snapLabel = snapped.label;
    } else {
      _borderDragState.snapLabel = null;
    }
  }
} else {
  _borderDragState.snapLabel = null;
}
```

在 `renderPreviewForce` 中的手柄绘制部分，添加吸附指示器：

```javascript
if (_borderDragState && _borderDragState.snapLabel) {
  BorderHandles.drawSnapIndicator(ctx, layout, _borderDragState.snapLabel);
}
```

- [ ] **Step 6: Commit**

```bash
git add js/app.js index.html css/style.css js/border-handles.js
git commit -m "feat: add aspect ratio snap and quick ratio buttons"
```

---

### Task 6: 文字区域增强

**Files:**
- Modify: `js/border-handles.js` — 新增文字拖拽手柄绘制
- Modify: `js/app.js` — 增强文字位置拖拽，支持多行独立拖拽和对齐线

- [ ] **Step 1: 增强 `border-handles.js` 添加文字对齐线绘制**

在 `border-handles.js` 末尾 `window.BorderHandles` 对象中添加：

```javascript
/**
 * 绘制文字对齐线
 */
function drawTextAlignmentGuides(ctx, layout, textX, textY) {
  if (!layout) return;
  const { canvasW, canvasH } = layout;
  const midX = canvasW / 2;
  const midY = canvasH / 2;
  const SNAP = 8;

  ctx.save();
  ctx.strokeStyle = '#007AFF';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);

  // 垂直中线吸附
  if (Math.abs(textX - midX) < SNAP) {
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, canvasH);
    ctx.stroke();
  }

  // 水平中线吸附
  if (Math.abs(textY - midY) < SNAP) {
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(canvasW, midY);
    ctx.stroke();
  }

  ctx.restore();
}

// 添加到 export
window.BorderHandles.drawTextAlignmentGuides = drawTextAlignmentGuides;
```

- [ ] **Step 2: 增强 `setupTextPosMode()` 函数**

修改 `js/app.js` 中 `setupTextPosMode()` 函数（约第 2600-2673 行），增加十字参考线：

在 `handle.addEventListener('pointermove', ...)` 的渲染部分，在 `schedulePreviewNow()` 之后，需要在 Canvas 上绘制参考线。但由于文字位置拖拽目前通过 HTML handle 实现，改为在 `schedulePreviewNow()` 触发的渲染中绘制对齐线。

修改 `renderPreviewForce()` 和 `renderPreview()` 函数，在文字位置模式下绘制对齐线：

```javascript
// 在 displayPreview 之后、手柄绘制之前添加
const layout = CanvasRenderer.getLastLayout();
if (layout && state.textPosMode) {
  const job = activeJob();
  const preset = activePreset();
  const info = Object.assign({}, preset?.infoBar, job?.infoOverrides || {});
  if (layout.bBottom) {
    const textX = layout.bLeft + layout.photoW / 2 + (info.textOffsetX || 0) * layout.canvasW;
    const textY = layout.canvasH - layout.bBottom / 2 + (info.textOffsetY || 0) * layout.bBottom;
    BorderHandles.drawTextAlignmentGuides(ctx, layout, textX, textY);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add js/border-handles.js js/app.js
git commit -m "feat: enhance text position drag with alignment guides"
```

---

### Task 7: 其他体验提升 — 快捷键 + 预设搜索 + FPS + 缩放改进

**Files:**
- Modify: `js/app.js` — 新增全局快捷键、FPS 计算、预设搜索、以鼠标为中心缩放
- Modify: `index.html` — 新增预设搜索框、FPS 指示器 DOM
- Modify: `css/style.css` — 新组件样式

- [ ] **Step 1: 在 index.html 中添加预设搜索框**

在 `index.html` 的 `#tab-presets` 中（约第 84-88 行），在 `#category-filter` 之前添加：

```html
<div class="tab-content" id="tab-presets">
  <input type="text" id="preset-search" class="preset-search" placeholder="搜索预设...">
  <div id="category-filter" class="category-filter"></div>
  <div id="preset-grid" class="preset-grid"></div>
```

- [ ] **Step 2: 在 index.html 中添加 FPS 指示器**

在 `index.html` 的预览工具栏（约第 410 行 `#preview-size-info` 之后）添加：

```html
<span class="preview-size-info" id="preview-size-info"></span>
<span id="fps-indicator" class="fps-indicator" hidden></span>
```

- [ ] **Step 3: 在 css/style.css 中添加新样式**

```css
/* ── 预设搜索框 ── */
.preset-search {
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-panel);
  color: var(--text-1);
  margin-bottom: 6px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--transition);
}
.preset-search:focus { border-color: var(--accent); }
.preset-search::placeholder { color: var(--text-3); }

/* ── FPS 指示器 ── */
.fps-indicator {
  font-size: 10px;
  font-family: monospace;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(0,0,0,0.5);
}
.fps-indicator.good { color: #4ADE80; }
.fps-indicator.warn { color: #FBBF24; }
.fps-indicator.bad  { color: #EF4444; }
```

- [ ] **Step 4: 在 app.js 中实现预设搜索**

在 `init()` 或 `setupTabs()` 之后添加：

```javascript
const searchInput = document.getElementById('preset-search');
if (searchInput) {
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    filterPresetGrid(query);
  });
}

function filterPresetGrid(query) {
  const cards = document.querySelectorAll('.preset-card');
  cards.forEach(card => {
    const name = card.querySelector('.preset-name')?.textContent?.toLowerCase() || '';
    const cat = card.querySelector('.preset-cat')?.textContent?.toLowerCase() || '';
    const match = !query || name.includes(query) || cat.includes(query);
    card.style.display = match ? '' : 'none';
  });
}
```

- [ ] **Step 5: 在 app.js 中实现 FPS 指示器**

添加 FPS 计算：

```javascript
let _frameCount = 0;
let _fpsTime = 0;
let _currentFps = 0;

function trackFps() {
  _frameCount++;
  const now = performance.now();
  if (now - _fpsTime >= 1000) {
    _currentFps = _frameCount;
    _frameCount = 0;
    _fpsTime = now;
    updateFpsDisplay();
  }
}

function updateFpsDisplay() {
  const el = document.getElementById('fps-indicator');
  if (!el) return;
  if (!_borderDragState && !state.isRendering) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = _currentFps + 'fps';
  el.className = 'fps-indicator ' +
    (_currentFps >= 30 ? 'good' : _currentFps >= 15 ? 'warn' : 'bad');
}
```

在 `displayPreview()` 函数末尾调用 `trackFps()`。

- [ ] **Step 6: 增强全局快捷键**

修改现有的键盘监听，扩展为完整快捷键系统。在现有的 keydown listener 中添加：

```javascript
// R — 旋转画布方向（横竖切换）
if (e.key === 'r' && !isInputFocused()) {
  e.preventDefault();
  toggleOrientation();
}
// F — 预览适配窗口
if (e.key === 'f' && !isInputFocused()) {
  e.preventDefault();
  setZoom('fit');
}
// C — 进入/退出裁剪模式
if (e.key === 'c' && !isInputFocused()) {
  e.preventDefault();
  const btn = document.getElementById('btn-adjust-crop');
  if (btn && !btn.hidden) btn.click();
}
// B — 进入/退出边框调整模式
if (e.key === 'b' && !isInputFocused()) {
  e.preventDefault();
  const btn = document.getElementById('btn-border-resize');
  if (btn && !btn.hidden) btn.click();
}
// T — 进入/退出文字位置模式
if (e.key === 't' && !isInputFocused()) {
  e.preventDefault();
  const btn = document.getElementById('btn-text-pos');
  if (btn && !btn.hidden) btn.click();
}
// + / - — 缩放
if ((e.key === '+' || e.key === '=') && !isInputFocused()) {
  e.preventDefault();
  changeZoom(0.1);
}
if (e.key === '-' && !isInputFocused()) {
  e.preventDefault();
  changeZoom(-0.1);
}
// 0 — 重置缩放
if (e.key === '0' && !isInputFocused()) {
  e.preventDefault();
  setZoom('fit');
}

function isInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}
```

- [ ] **Step 7: 改进缩放 — Alt+滚轮以鼠标为中心**

修改 `setupZoomControls()` 中的滚轮事件处理（约第 1435-1453 行），改为：

```javascript
wrapper.addEventListener('wheel', (e) => {
  e.preventDefault();
  const canvas = document.getElementById('canvas-preview');
  if (!canvas || !canvas.width) return;

  if (e.altKey) {
    // 以鼠标位置为中心缩放
    const rect = canvas.getBoundingClientRect();
    const pivotX = (e.clientX - rect.left) / rect.width;
    const pivotY = (e.clientY - rect.top) / rect.height;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAtPivot(factor, pivotX, pivotY);
  } else {
    // 原有行为：整体缩放
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    changeZoom(factor > 1 ? 0.1 : -0.1);
  }
}, { passive: false });

function zoomAtPivot(factor, pivotX, pivotY) {
  if (state.zoom === 'fit') state.zoom = 1;
  const canvas = document.getElementById('canvas-preview');
  if (!canvas) return;

  const oldZoom = state.zoom;
  const newZoom = Math.max(0.2, Math.min(4.0, oldZoom * factor));
  state.zoom = newZoom;

  // 计算滚动偏移以保持 pivot 点位置
  const dx = canvas.width * pivotX * (newZoom - oldZoom);
  const dy = canvas.height * pivotY * (newZoom - oldZoom);
  const wrapper = document.getElementById('preview-wrapper');
  wrapper.scrollLeft += dx;
  wrapper.scrollTop += dy;

  updateZoomLabel();
  applyZoomToCanvas();
}
```

- [ ] **Step 8: Commit**

```bash
git add js/app.js index.html css/style.css
git commit -m "feat: add keyboard shortcuts, preset search, FPS indicator, pivot zoom"
```

---

### Task 8: 自测 + 清理

**Files:**
- Modify: 各文件按需修复回归

- [ ] **Step 1: 启动 dev server 并验证基本功能**

```bash
cd /Users/jackerkun/Projects/PhotoTools/PhotoFrame
python3 -m http.server 8080 &
```

手动测试清单：
1. 上传一张照片，选择预设，预览正常显示
2. 点击"调整边框"按钮，Canvas 上出现手柄
3. 拖拽外边框手柄，边框实时变化，图片不动
4. 拖拽内边框手柄，图片位置变化，Canvas 总尺寸不变
5. 拖拽过程中不松手重新缩放
6. Ctrl+Z 撤销，Ctrl+Shift+Z 重做
7. 比例按钮点击，边框平滑过渡
8. 预设搜索框输入，实时过滤
9. 快捷键 B/C/T/R/F/+/-/0 正常工作
10. Alt+滚轮以鼠标为中心缩放

- [ ] **Step 2: 检查 console 无错误**

打开浏览器 DevTools Console，确认无 JS 错误。

- [ ] **Step 3: 最终 Commit**

```bash
git add -A
git commit -m "fix: final cleanup and regression fixes after all feature additions"
```
