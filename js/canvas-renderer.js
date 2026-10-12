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
  const imageCache = new Map();
  const MAX_DECODED_IMAGES = 3;
  function loadImage(file) {
    if (imageCache.has(file)) {
      const cached = imageCache.get(file);
      // Map 的插入顺序作为轻量 LRU，避免浏览大量照片后一直占用解码内存。
      imageCache.delete(file);
      imageCache.set(file, cached);
      return cached;
    }
    const pending = new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
      img.src = url;
    });
    imageCache.set(file, pending);
    while (imageCache.size > MAX_DECODED_IMAGES) {
      imageCache.delete(imageCache.keys().next().value);
    }
    pending.catch(() => imageCache.delete(file));
    return pending;
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
            weight:   el.fontWeight || info.subtitleFontWeight || 400,
            style:    el.fontStyle || 'normal',
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
    // 每行: { text, font, size, tracking, color, weight, style, isTitle }
    const lines = [];
    if (titleText) lines.push({
      text: titleText, font: info.titleFont || 'serif', size: titleSize,
      tracking: info.titleLetterSpacing ?? 0, color: info.fontColor || '#1A1A1A',
      weight: info.titleFontWeight || 400, style: info.titleFontStyle || 'normal', isTitle: true,
    });
    if (subtitleText) lines.push({
      text: subtitleText, font: info.subtitleFont || 'sans-serif', size: subtitleSize,
      tracking: info.subtitleLetterSpacing ?? 0.06, color: info.fontColor || '#1A1A1A',
      weight: info.subtitleFontWeight || 400, style: info.subtitleFontStyle || 'normal', isTitle: false,
    });
    for (const e of extras) lines.push({ ...e, isTitle: false });

    if (lines.length === 0) return;

    // 行间距：主→副 用 gapPx，其余用 subtitleSize × 0.55
    const interGap = i =>
      (lines[i].isTitle && lines.length > 1) ? gapPx : subtitleSize * (info.lineSpacing ?? 0.55);

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

    const opacity = Math.max(0, Math.min(1, info.textOpacity ?? 1));
    const rotation = (info.textRotation || 0) * Math.PI / 180;
    const strokeWidth = Math.max(0, (info.textStrokeWidth || 0) * shorter);
    const shadowOpacity = Math.max(0, Math.min(1, info.textShadowOpacity || 0));

    ctx.save();
    ctx.translate(xPos, centerY);
    if (rotation) ctx.rotate(rotation);
    ctx.globalAlpha = opacity;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = info.textStrokeColor || '#FFFFFF';
    if (shadowOpacity > 0) {
      ctx.shadowColor = colorWithAlpha(info.textShadowColor || '#000000', shadowOpacity);
      ctx.shadowBlur = Math.max(0, (info.textShadowBlur ?? 0.006) * shorter);
      ctx.shadowOffsetX = (info.textShadowX ?? 0.003) * shorter;
      ctx.shadowOffsetY = (info.textShadowY ?? 0.003) * shorter;
    }

    // ── 逐行绘制 ───────────────────────────────────────────────────────────
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      ctx.font      = `${line.style} ${line.weight} ${line.size}px "${line.font}"`;
      ctx.fillStyle = line.color;
      drawStyledText(ctx, line.text, 0, curY - centerY, line.tracking, line.size, strokeWidth > 0);
      if (i < lines.length - 1) {
        curY += line.size / 2 + lines[i + 1].size / 2 + interGap(i);
      }
    }
    ctx.restore();
  }

  function colorWithAlpha(color, alpha) {
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      const n = parseInt(color.slice(1), 16);
      return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }
    return color;
  }

  // 字距、描边和填充统一绘制；保留旧浏览器的逐字符降级路径。
  function drawStyledText(ctx, text, x, y, trackingEm, fontSize, hasStroke) {
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = `${Math.round(fontSize * trackingEm)}px`;
      if (hasStroke) ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
      ctx.letterSpacing = '0px';
      return;
    }
    const spacing  = fontSize * trackingEm;
    const totalW   = [...text].reduce((s, c) => s + ctx.measureText(c).width + spacing, -spacing);
    const align    = ctx.textAlign;
    let curX = align === 'center' ? x - totalW / 2
             : align === 'right'  ? x - totalW
             : x;
    ctx.textAlign = 'left';
    for (const ch of text) {
      if (hasStroke) ctx.strokeText(ch, curX, y);
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

  function adaptCropToRatio(crop, imgW, imgH, targetRatio) {
    if (!crop) return calculateAutoCrop(imgW, imgH, targetRatio);
    const cx = crop.sx + crop.sw / 2;
    const cy = crop.sy + crop.sh / 2;
    let sw = crop.sw;
    let sh = crop.sh;
    if (sw / sh > targetRatio) sw = sh * targetRatio;
    else sh = sw / targetRatio;
    sw = Math.min(sw, imgW);
    sh = Math.min(sh, imgH);
    const sx = Math.max(0, Math.min(imgW - sw, cx - sw / 2));
    const sy = Math.max(0, Math.min(imgH - sh, cy - sh / 2));
    return { sx, sy, sw, sh };
  }

  async function render(file, preset, job, outputLongEdge = 0) {
    const img = await loadImage(file);

    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;

    // 是否强制画幅比例（预设默认都开启，极简除外）
    const enforceRatio = preset.enforcePhotoRatio !== false;
    let targetRatio  = enforceRatio
      ? (preset.thumb?.photoRatio ?? (srcW / srcH))
      : (srcW / srcH);

    // ── 计算照片区域尺寸（输出 canvas 内的照片宽高）──────────────────────
    const b = effectiveBorder(preset, job);
    const frame = job?.frameLayout;
    let photoW, photoH, shorter;
    let bTop, bBottom, bLeft, bRight;
    let canvasW, canvasH;

    if (frame && frame.canvasW > 0 && frame.canvasH > 0 && frame.photoW > 0 && frame.photoH > 0) {
      // 专业边框模式：画布和照片使用两个独立矩形。调整内框不会改变外画布。
      const desiredLong = outputLongEdge > 0 ? outputLongEdge : Math.max(srcW, srcH);
      // 保持既有“照片长边”分辨率语义；内框变化不会导致外画布在松手后跳变。
      const referenceLong = frame.referencePhotoLong || Math.max(frame.photoW, frame.photoH);
      const scale = desiredLong / referenceLong;
      canvasW = Math.max(1, Math.round(frame.canvasW * scale));
      canvasH = Math.max(1, Math.round(frame.canvasH * scale));
      bLeft   = Math.max(0, Math.round(frame.photoX * scale));
      bTop    = Math.max(0, Math.round(frame.photoY * scale));
      photoW  = Math.max(1, Math.round(frame.photoW * scale));
      photoH  = Math.max(1, Math.round(frame.photoH * scale));
      bRight  = Math.max(0, canvasW - bLeft - photoW);
      bBottom = Math.max(0, canvasH - bTop - photoH);
      shorter = Math.min(photoW, photoH);
      targetRatio = photoW / photoH;
    } else {
      if (outputLongEdge > 0) {
        if (targetRatio >= 1) {
          photoW = outputLongEdge;
          photoH = Math.round(outputLongEdge / targetRatio);
        } else {
          photoH = outputLongEdge;
          photoW = Math.round(outputLongEdge * targetRatio);
        }
      } else {
        if (targetRatio >= 1) {
          photoW = Math.max(srcW, srcH);
          photoH = Math.round(photoW / targetRatio);
        } else {
          photoH = Math.max(srcW, srcH);
          photoW = Math.round(photoH * targetRatio);
        }
      }

      shorter = Math.min(photoW, photoH);
      bTop    = Math.round(shorter * (b.top    ?? 0.05));
      bBottom = Math.round(shorter * (b.bottom ?? 0.22));
      bLeft   = Math.round(shorter * (b.left   ?? 0.05));
      bRight  = Math.round(shorter * (b.right  ?? 0.05));
      canvasW = photoW + bLeft + bRight;
      canvasH = photoH + bTop  + bBottom;
    }
    const radius = Math.round(shorter * (b.radius ?? 0));

    // If preset specifies a target canvas aspect ratio, expand borders to fill
    if (!frame && preset.targetCanvasAspect) {
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
      const crop = adaptCropToRatio(job && job.cropRect, srcW, srcH, targetRatio);
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
