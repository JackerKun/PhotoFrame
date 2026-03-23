/**
 * PhotoFrame — 裁切编辑器
 *
 * 交互方式
 *  - 鼠标拖拽 / 单指触摸：平移照片
 *  - 滚轮 / 双指捏合：缩放
 *  - Keyboard ← → ↑ ↓：微调平移
 *  - +/- 键：微调缩放
 *
 * 坐标系
 *  photoX/Y = 照片左上角在 canvas 上的坐标（canvas px）
 *  photoScale = 照片绘制缩放比（canvas px / 源图 px）
 *  帧框（frameX/Y/W/H）固定在 canvas 中央
 */

class CropEditor {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLImageElement}  img
   * @param {number}            targetRatio  宽/高，如 1.5 表示 3:2
   * @param {number}            dpr          devicePixelRatio，用于 HiDPI 渲染
   */
  constructor(canvas, img, targetRatio, dpr = 1) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.img    = img;
    this.targetRatio = targetRatio || (img.naturalWidth / img.naturalHeight);
    this.dpr    = dpr;

    this.frameX = 0; this.frameY = 0;
    this.frameW = 0; this.frameH = 0;
    this.photoX = 0; this.photoY = 0;
    this.photoScale = 1; this.minScale = 1;

    this._dragging = false;
    this._lastX = 0; this._lastY = 0;
    this._lastTouchDist = 0;
    this._raf = null;
    this._dirty = false;

    this._handlers = {};
    this._setupFrame();
    this._setupEvents();
    this._draw();
  }

  // ── 初始化帧框与最小缩放 ─────────────────────────────────────────────────
  _setupFrame() {
    const W = this.canvas.width  / this.dpr;
    const H = this.canvas.height / this.dpr;
    const margin = Math.round(Math.min(W, H) * 0.06);

    const avW = W - margin * 2;
    const avH = H - margin * 2;

    if (this.targetRatio >= avW / avH) {
      this.frameW = avW;
      this.frameH = avW / this.targetRatio;
    } else {
      this.frameH = avH;
      this.frameW = avH * this.targetRatio;
    }
    this.frameX = (W - this.frameW) / 2;
    this.frameY = (H - this.frameH) / 2;

    // 最小缩放 = 恰好覆盖帧框（contain/cover 选 cover）
    const scaleByW = this.frameW / this.img.naturalWidth;
    const scaleByH = this.frameH / this.img.naturalHeight;
    this.minScale  = Math.max(scaleByW, scaleByH);

    this.photoScale = this.minScale;
    this._centerPhoto();
  }

  _centerPhoto() {
    const pW = this.img.naturalWidth  * this.photoScale;
    const pH = this.img.naturalHeight * this.photoScale;
    this.photoX = this.frameX + (this.frameW - pW) / 2;
    this.photoY = this.frameY + (this.frameH - pH) / 2;
  }

  // ── 边界约束（保证帧框始终被照片覆盖）──────────────────────────────────
  _clamp() {
    const pW = this.img.naturalWidth  * this.photoScale;
    const pH = this.img.naturalHeight * this.photoScale;
    const minX = this.frameX + this.frameW - pW;
    const minY = this.frameY + this.frameH - pH;
    const maxX = this.frameX;
    const maxY = this.frameY;
    this.photoX = Math.max(minX, Math.min(maxX, this.photoX));
    this.photoY = Math.max(minY, Math.min(maxY, this.photoY));
  }

  // ── 公开操作 API ─────────────────────────────────────────────────────────
  pan(dx, dy) {
    this.photoX += dx;
    this.photoY += dy;
    this._clamp();
    this._schedDraw();
  }

  /**
   * 以屏幕坐标 (pivotX, pivotY) 为中心缩放
   * factor > 1 放大，< 1 缩小
   */
  zoom(factor, pivotX, pivotY) {
    const newScale = Math.max(
      this.minScale,
      Math.min(this.minScale * 8, this.photoScale * factor)
    );
    const sc = newScale / this.photoScale;
    // 缩放时保持 pivot 点在屏幕上的位置不变
    this.photoX = pivotX - (pivotX - this.photoX) * sc;
    this.photoY = pivotY - (pivotY - this.photoY) * sc;
    this.photoScale = newScale;
    this._clamp();
    this._schedDraw();
  }

  resetToCenter() {
    this.photoScale = this.minScale;
    this._centerPhoto();
    this._schedDraw();
  }

  /** 获取源图裁切矩形（像素坐标） */
  getCropData() {
    const sx = (this.frameX - this.photoX) / this.photoScale;
    const sy = (this.frameY - this.photoY) / this.photoScale;
    const sw = this.frameW / this.photoScale;
    const sh = this.frameH / this.photoScale;
    return {
      sx: Math.max(0, Math.round(sx)),
      sy: Math.max(0, Math.round(sy)),
      sw: Math.min(this.img.naturalWidth,  Math.round(sw)),
      sh: Math.min(this.img.naturalHeight, Math.round(sh)),
    };
  }

  /** 从已保存的裁切矩形恢复状态 */
  setFromCropRect(cropRect) {
    if (!cropRect) return;
    const scale = this.frameW / cropRect.sw;
    this.photoScale = Math.max(this.minScale, scale);
    this.photoX = this.frameX - cropRect.sx * this.photoScale;
    this.photoY = this.frameY - cropRect.sy * this.photoScale;
    this._clamp();
    this._schedDraw();
  }

  destroy() {
    const c = this.canvas;
    Object.entries(this._handlers).forEach(([evt, fn]) => {
      c.removeEventListener(evt, fn);
    });
    document.removeEventListener('keydown', this._handlers._keydown);
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  // ── 绘制 ─────────────────────────────────────────────────────────────────
  _schedDraw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._draw();
    });
  }

  _draw() {
    const ctx  = this.ctx;
    const dpr  = this.dpr;
    const W    = this.canvas.width;
    const H    = this.canvas.height;
    const pW   = this.img.naturalWidth  * this.photoScale * dpr;
    const pH   = this.img.naturalHeight * this.photoScale * dpr;
    const pX   = this.photoX * dpr;
    const pY   = this.photoY * dpr;
    const fX   = this.frameX * dpr;
    const fY   = this.frameY * dpr;
    const fW   = this.frameW * dpr;
    const fH   = this.frameH * dpr;

    ctx.clearRect(0, 0, W, H);

    // 背景
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(0, 0, W, H);

    // ① 画暗化版照片（帧框外）
    ctx.globalAlpha = 0.32;
    ctx.drawImage(this.img, pX, pY, pW, pH);
    ctx.globalAlpha = 1;

    // ② 帧框内画亮照片
    ctx.save();
    ctx.beginPath();
    ctx.rect(fX, fY, fW, fH);
    ctx.clip();
    ctx.drawImage(this.img, pX, pY, pW, pH);
    ctx.restore();

    // ③ 帧框边线
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = dpr;
    ctx.strokeRect(fX + 0.5, fY + 0.5, fW - 1, fH - 1);

    // ④ 三等分网格
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = dpr * 0.75;
    ctx.setLineDash([]);
    for (let i = 1; i <= 2; i++) {
      const gx = fX + (fW / 3) * i;
      const gy = fY + (fH / 3) * i;
      ctx.beginPath(); ctx.moveTo(gx, fY); ctx.lineTo(gx, fY + fH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fX, gy); ctx.lineTo(fX + fW, gy); ctx.stroke();
    }

    // ⑤ 四角把手
    const hs = 14 * dpr;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth   = 2 * dpr;
    const corners = [
      [fX, fY,  1,  1],
      [fX + fW, fY,  -1, 1],
      [fX, fY + fH,  1, -1],
      [fX + fW, fY + fH, -1, -1],
    ];
    corners.forEach(([cx, cy, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx * hs, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * hs);
      ctx.stroke();
    });

    // ⑥ 缩放比例提示
    const zoomPct = Math.round((this.photoScale / this.minScale) * 100);
    const label   = `${zoomPct}%`;
    ctx.font = `${13 * dpr}px system-ui`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(label).width + 16 * dpr;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect?.(fX + fW - tw, fY + fH + 4 * dpr, tw, 20 * dpr, 4 * dpr) ||
    ctx.rect(fX + fW - tw, fY + fH + 4 * dpr, tw, 20 * dpr);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(label, fX + fW - 6 * dpr, fY + fH + 22 * dpr);
  }

  // ── 事件绑定 ─────────────────────────────────────────────────────────────
  _setupEvents() {
    const c = this.canvas;

    // 鼠标
    const onDown = e => {
      this._dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      c.style.cursor = 'grabbing';
    };
    const onMove = e => {
      if (!this._dragging) return;
      const dx = (e.clientX - this._lastX);
      const dy = (e.clientY - this._lastY);
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.pan(dx, dy);
    };
    const onUp = () => { this._dragging = false; c.style.cursor = 'grab'; };

    c.addEventListener('mousedown', onDown);
    c.addEventListener('mousemove', onMove);
    c.addEventListener('mouseup',   onUp);
    c.addEventListener('mouseleave',onUp);
    this._handlers.mousedown  = onDown;
    this._handlers.mousemove  = onMove;
    this._handlers.mouseup    = onUp;
    this._handlers.mouseleave = onUp;

    // 滚轮缩放
    const onWheel = e => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (c.width / rect.width  / this.dpr);
      const py = (e.clientY - rect.top)  * (c.height / rect.height / this.dpr);
      const f  = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.zoom(f, px, py);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    this._handlers.wheel = onWheel;

    // 触摸
    const onTouchStart = e => {
      e.preventDefault();
      if (e.touches.length === 1) {
        this._dragging = true;
        this._lastX = e.touches[0].clientX;
        this._lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        this._dragging = false;
        this._lastTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };
    const onTouchMove = e => {
      e.preventDefault();
      if (e.touches.length === 1 && this._dragging) {
        const dx = e.touches[0].clientX - this._lastX;
        const dy = e.touches[0].clientY - this._lastY;
        this._lastX = e.touches[0].clientX;
        this._lastY = e.touches[0].clientY;
        this.pan(dx, dy);
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / (this._lastTouchDist || dist);
        this._lastTouchDist = dist;
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = c.getBoundingClientRect();
        const px = (mx - rect.left) * (c.width / rect.width  / this.dpr);
        const py = (my - rect.top)  * (c.height / rect.height / this.dpr);
        this.zoom(factor, px, py);
      }
    };
    const onTouchEnd = e => { if (e.touches.length === 0) this._dragging = false; };

    c.addEventListener('touchstart', onTouchStart, { passive: false });
    c.addEventListener('touchmove',  onTouchMove,  { passive: false });
    c.addEventListener('touchend',   onTouchEnd);
    this._handlers.touchstart = onTouchStart;
    this._handlers.touchmove  = onTouchMove;
    this._handlers.touchend   = onTouchEnd;

    // 键盘
    const step = 8;
    const onKey = e => {
      const W = this.canvas.width / this.dpr;
      const H = this.canvas.height / this.dpr;
      const cx = W / 2, cy = H / 2;
      switch (e.key) {
        case 'ArrowLeft':  this.pan(-step,  0); break;
        case 'ArrowRight': this.pan( step,  0); break;
        case 'ArrowUp':    this.pan( 0, -step); break;
        case 'ArrowDown':  this.pan( 0,  step); break;
        case '+': case '=': this.zoom(1.1, cx, cy); break;
        case '-': case '_': this.zoom(1/1.1, cx, cy); break;
        default: return;
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    this._handlers._keydown = onKey;

    c.style.cursor = 'grab';
  }
}
