/**
 * PhotoFrame — Canvas 渲染引擎
 *
 * 坐标系约定：
 *  border.top/bottom/left/right 均为相对于照片「短边」的比例
 *  titleFontSize / subtitleFontSize 也是相对照片「短边」的比例
 */
window.CanvasRenderer = (() => {

  // 最近一次渲染的布局信息（供外部文字拖拽使用）
  let _lastLayout = null;
  function getLastLayout() { return _lastLayout; }

  // ── 加载图片 ──────────────────────────────────────────────────────────────
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
      img.src = url;
    });
  }

  // ── 合并预设与 job 覆盖 ───────────────────────────────────────────────────
  function effectiveBorder(preset, job) {
    return Object.assign({}, preset.border, job.borderOverrides || {});
  }

  function effectiveInfo(preset, job) {
    return Object.assign({}, preset.infoBar, job.infoOverrides || {});
  }

  // ── 模板变量替换 ──────────────────────────────────────────────────────────
  function resolveTemplate(tpl, job) {
    if (!tpl) return '';
    const exif = job.exif || {};
    const ov   = job.overrides || {};
    return tpl
      .replace(/\{location\}/g, ov.location || '')
      .replace(/\{camera\}/g,   ov.camera   || exif.camera   || '')
      .replace(/\{film\}/g,     ov.film     || '')
      .replace(/\{lens\}/g,     ov.lens     || exif.lens     || '')
      .replace(/\{focal\}/g,    exif.focalLength || '')
      .replace(/\{aperture\}/g, exif.aperture || '')
      .replace(/\{shutter\}/g,  exif.shutter  || '')
      .replace(/\{iso\}/g,      exif.iso ? `ISO ${exif.iso}` : '')
      .replace(/\{date\}/g,     ov.date || exif.date || '')
      .trim();
  }

  // ── 圆角矩形路径 ─────────────────────────────────────────────────────────
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ── 字体加载等待 ──────────────────────────────────────────────────────────
  const fontCache = new Set();
  async function ensureFont(fontFamily, size) {
    const key = `${fontFamily}-${size}`;
    if (fontCache.has(key)) return;
    try {
      await document.fonts.load(`${size}px "${fontFamily}"`);
      fontCache.add(key);
    } catch (_) { /* 降级为系统字体 */ }
  }

  // ── 绘制信息文字 ──────────────────────────────────────────────────────────
  async function drawInfoBar(ctx, layout, info, job) {
    const { canvasW, bTop, bBottom, photoH, shorter } = layout;
    if (!bBottom || bBottom < 8) return;

    const titleText    = resolveTemplate(info.titleTemplate    || '', job);
    const subtitleText = resolveTemplate(info.subtitleTemplate || '', job);

    // 额外自定义行
    const extras = [];
    if (Array.isArray(info.extraLines)) {
      for (const el of info.extraLines) {
        const t = resolveTemplate(el.template || '', job).trim();
        if (t) {
          extras.push({
            text:     t,
            font:     el.font     || info.subtitleFont || 'sans-serif',
            size:     Math.max(7, Math.round(shorter * (el.fontSize    || info.subtitleFontSize || 0.026))),
            tracking: el.letterSpacing != null ? el.letterSpacing : 0.04,
            color:    el.color || info.fontColor || '#1A1A1A',
          });
        }
      }
    }

    if (!titleText && !subtitleText && extras.length === 0) return;

    const barTop = bTop + photoH;
    const barH   = bBottom;

    const titleSize    = Math.max(10, Math.round(shorter * (info.titleFontSize    || 0.038)));
    const subtitleSize = Math.max(8,  Math.round(shorter * (info.subtitleFontSize || 0.026)));
    // 主副标题间距（倍数 × titleSize）
    const gapPx = titleSize * (info.titleGap != null ? info.titleGap : 0.45);

    await ensureFont(info.titleFont    || 'serif',      titleSize);
    await ensureFont(info.subtitleFont || 'sans-serif', subtitleSize);

    // ── 构建行列表 ──────────────────────────────────────────────────────────
    // 每行: { text, font, size, tracking, color, isTitle }
    const lines = [];
    if (titleText)    lines.push({ text: titleText,    font: info.titleFont    || 'serif',      size: titleSize,    tracking: 0,    color: info.fontColor || '#1A1A1A', isTitle: true  });
    if (subtitleText) lines.push({ text: subtitleText, font: info.subtitleFont || 'sans-serif', size: subtitleSize, tracking: 0.06, color: info.fontColor || '#1A1A1A', isTitle: false });
    for (const e of extras) lines.push({ ...e, isTitle: false });

    if (lines.length === 0) return;

    // 行间距：主→副 用 gapPx，其余用 subtitleSize × 0.55
    const interGap = i =>
      (lines[i].isTitle && lines.length > 1) ? gapPx : subtitleSize * 0.55;

    // 总布局高度
    let totalH = lines.reduce((s, l) => s + l.size, 0);
    for (let i = 0; i < lines.length - 1; i++) totalH += interGap(i);

    // ── 位置偏移 ───────────────────────────────────────────────────────────
    const offsetX = (info.textOffsetX || 0) * canvasW;
    const offsetY = (info.textOffsetY || 0) * barH;
    const centerY = barTop + barH * 0.5 + offsetY;
    let curY = centerY - totalH / 2 + lines[0].size / 2;

    // ── X 基准 ─────────────────────────────────────────────────────────────
    let xBase;
    if      (info.textAlign === 'left')  { ctx.textAlign = 'left';   xBase = canvasW * 0.08; }
    else if (info.textAlign === 'right') { ctx.textAlign = 'right';  xBase = canvasW * 0.92; }
    else                                 { ctx.textAlign = 'center'; xBase = canvasW / 2;    }
    const xPos = xBase + offsetX;

    ctx.textBaseline = 'middle';

    // ── 逐行绘制 ───────────────────────────────────────────────────────────
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      ctx.font      = `${line.size}px "${line.font}"`;
      ctx.fillStyle = line.color;
      if (line.tracking > 0) {
        drawTrackedText(ctx, line.text, xPos, curY, line.tracking);
      } else {
        ctx.fillText(line.text, xPos, curY);
      }
      if (i < lines.length - 1) {
        curY += line.size / 2 + lines[i + 1].size / 2 + interGap(i);
      }
    }
  }

  // 手动实现字符间距（letter-spacing）兼容旧浏览器
  function drawTrackedText(ctx, text, x, y, trackingEm) {
    if ('letterSpacing' in ctx) {
      const fs = parseFloat(ctx.font);
      ctx.letterSpacing = `${Math.round(fs * trackingEm)}px`;
      ctx.fillText(text, x, y);
      ctx.letterSpacing = '0px';
      return;
    }
    // fallback: measure each char
    const fontSize = parseFloat(ctx.font);
    const spacing  = fontSize * trackingEm;
    const totalW   = [...text].reduce((s, c) => s + ctx.measureText(c).width + spacing, -spacing);
    const align    = ctx.textAlign;
    let curX = align === 'center' ? x - totalW / 2
             : align === 'right'  ? x - totalW
             : x;
    ctx.textAlign = 'left';
    for (const ch of text) {
      ctx.fillText(ch, curX, y);
      curX += ctx.measureText(ch).width + spacing;
    }
    ctx.textAlign = align;
  }

  // ── 核心渲染函数 ──────────────────────────────────────────────────────────
  /**
   * @param {File}    file         照片文件
   * @param {Object}  preset       预设对象
   * @param {Object}  job          PhotoJob（含 overrides/exif 等）
   * @param {number}  outputLongEdge  输出长边像素（0 = 原始尺寸）
   * @returns {Promise<HTMLCanvasElement>}
   */
  // ── 自动居中裁切（无用户调整时的默认行为）────────────────────────────────
  function calculateAutoCrop(imgW, imgH, targetRatio) {
    const imgRatio = imgW / imgH;
    let sw, sh;
    if (imgRatio > targetRatio) {
      // 图片比目标更宽：裁切左右
      sh = imgH;
      sw = imgH * targetRatio;
    } else {
      // 图片比目标更高：裁切上下
      sw = imgW;
      sh = imgW / targetRatio;
    }
    sw = Math.min(sw, imgW);
    sh = Math.min(sh, imgH);
    return {
      sx: (imgW - sw) / 2,
      sy: (imgH - sh) / 2,
      sw, sh,
    };
  }

  async function render(file, preset, job, outputLongEdge = 0) {
    const img = await loadImage(file);

    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;

    // 是否强制画幅比例（预设默认都开启，极简除外）
    const enforceRatio = preset.enforcePhotoRatio !== false;
    const targetRatio  = enforceRatio
      ? (preset.thumb?.photoRatio ?? (srcW / srcH))
      : (srcW / srcH);

    // ── 计算照片区域尺寸（输出 canvas 内的照片宽高）──────────────────────
    let photoW, photoH;
    if (outputLongEdge > 0) {
      if (targetRatio >= 1) {
        photoW = outputLongEdge;
        photoH = Math.round(outputLongEdge / targetRatio);
      } else {
        photoH = outputLongEdge;
        photoW = Math.round(outputLongEdge * targetRatio);
      }
    } else {
      // 保持源图像素数
      if (targetRatio >= 1) {
        photoW = Math.max(srcW, srcH);
        photoH = Math.round(photoW / targetRatio);
      } else {
        photoH = Math.max(srcW, srcH);
        photoW = Math.round(photoH * targetRatio);
      }
    }

    const shorter = Math.min(photoW, photoH);
    const b = effectiveBorder(preset, job);

    let bTop    = Math.round(shorter * (b.top    ?? 0.05));
    let bBottom = Math.round(shorter * (b.bottom ?? 0.22));
    let bLeft   = Math.round(shorter * (b.left   ?? 0.05));
    let bRight  = Math.round(shorter * (b.right  ?? 0.05));
    const radius  = Math.round(shorter * (b.radius ?? 0));

    let canvasW = photoW + bLeft + bRight;
    let canvasH = photoH + bTop  + bBottom;

    // If preset specifies a target canvas aspect ratio, expand borders to fill
    if (preset.targetCanvasAspect) {
      const targetAspect = preset.targetCanvasAspect; // W / H
      const currentAspect = canvasW / canvasH;
      if (currentAspect > targetAspect) {
        // Canvas too wide → expand top/bottom
        const targetH = Math.round(canvasW / targetAspect);
        const extra   = targetH - canvasH;
        bTop    += Math.floor(extra / 2);
        bBottom += extra - Math.floor(extra / 2);
        canvasH  = targetH;
      } else if (currentAspect < targetAspect) {
        // Canvas too tall → expand left/right
        const targetW = Math.round(canvasH * targetAspect);
        const extra   = targetW - canvasW;
        bLeft  += Math.floor(extra / 2);
        bRight += extra - Math.floor(extra / 2);
        canvasW = targetW;
      }
    }

    // 保存布局信息供外部使用（文字拖拽定位）
    _lastLayout = { canvasW, canvasH, bTop, bBottom, bLeft, bRight, photoW, photoH, shorter };

    const canvas = document.createElement('canvas');
    canvas.width  = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 背景
    ctx.fillStyle = b.color || '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // ── 照片绘制（含圆角 + 裁切）──────────────────────────────────────────
    if (radius > 0) {
      ctx.save();
      roundRect(ctx, bLeft, bTop, photoW, photoH, radius);
      ctx.clip();
    }

    if (enforceRatio) {
      // 使用用户调整的裁切框，或自动居中
      const crop = (job && job.cropRect) || calculateAutoCrop(srcW, srcH, targetRatio);
      ctx.drawImage(img,
        crop.sx, crop.sy, crop.sw, crop.sh,  // 源区域
        bLeft,   bTop,    photoW,  photoH    // 目标区域
      );
    } else {
      ctx.drawImage(img, bLeft, bTop, photoW, photoH);
    }

    if (radius > 0) ctx.restore();

    // 信息文字
    const info = effectiveInfo(preset, job);
    if (info.enabled !== false) {
      const layout = { canvasW, canvasH, bTop, bBottom, photoH, shorter };
      await drawInfoBar(ctx, layout, info, job);
    }

    return canvas;
  }

  // ── 快速预览渲染（低分辨率） ──────────────────────────────────────────────
  async function renderPreview(file, preset, job, maxLongEdge = 1200) {
    return render(file, preset, job, maxLongEdge);
  }

  // ── Canvas → Blob ─────────────────────────────────────────────────────────
  function canvasToBlob(canvas, format = 'jpeg', quality = 0.95) {
    return new Promise((resolve, reject) => {
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('toBlob 失败')),
        mimeType,
        quality
      );
    });
  }

  // ── Canvas → Data URL ─────────────────────────────────────────────────────
  function canvasToDataURL(canvas, format = 'jpeg', quality = 0.95) {
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(mimeType, quality);
  }

  return { render, renderPreview, canvasToBlob, canvasToDataURL, resolveTemplate, calculateAutoCrop, getLastLayout };
})();
