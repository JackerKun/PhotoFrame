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
  const stickerImageCache = new Map();
  const MAX_DECODED_IMAGES = 3;
  function loadImage(file) {
    if (imageCache.has(file)) {
      const cached = imageCache.get(file);
      // Map 的插入顺序作为轻量 LRU，避免浏览大量照片后一直占用解码内存。
      imageCache.delete(file);
      imageCache.set(file, cached);
      return cached;
    }
    const pending = window.ImageDecoder.load(file);
    imageCache.set(file, pending);
    while (imageCache.size > MAX_DECODED_IMAGES) {
      imageCache.delete(imageCache.keys().next().value);
    }
    pending.catch(() => imageCache.delete(file));
    return pending;
  }

  function loadStickerImage(src) {
    if (stickerImageCache.has(src)) return stickerImageCache.get(src);
    const pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('贴图加载失败'));
      img.src = src;
    });
    stickerImageCache.set(src, pending);
    pending.catch(() => stickerImageCache.delete(src));
    return pending;
  }

  async function drawStickers(ctx, canvasW, canvasH, shorter, job) {
    for (const sticker of job?.stickers || []) {
      if (!sticker?.src) continue;
      try {
        const img = await loadStickerImage(sticker.src);
        const ratio = Math.max(.05, sticker.ratio || img.naturalWidth / img.naturalHeight || 1);
        const width = Math.max(1, shorter * Math.max(.01, sticker.scale ?? .18));
        const height = width / ratio;
        ctx.save();
        ctx.translate((sticker.x ?? .5) * canvasW, (sticker.y ?? .5) * canvasH);
        ctx.rotate((sticker.rotation || 0) * Math.PI / 180);
        ctx.globalAlpha = Math.max(.05, Math.min(1, sticker.opacity ?? 1));
        ctx.drawImage(img, -width / 2, -height / 2, width, height);
        ctx.restore();
      } catch (e) {
        console.warn('[Sticker] render failed', e);
      }
    }
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

  function paintCanvasBackground(ctx, width, height, style = {}) {
    const mode = style.backgroundMode || 'solid';
    const color1 = style.color || '#FFFFFF';
    const color2 = style.backgroundColor2 || color1;
    if (mode === 'linear') {
      const angle = ((style.backgroundAngle ?? 135) - 90) * Math.PI / 180;
      const cx = width / 2, cy = height / 2, length = Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle));
      const gradient = ctx.createLinearGradient(cx - Math.cos(angle) * length / 2, cy - Math.sin(angle) * length / 2, cx + Math.cos(angle) * length / 2, cy + Math.sin(angle) * length / 2);
      gradient.addColorStop(0, color1); gradient.addColorStop(1, color2); ctx.fillStyle = gradient;
    } else if (mode === 'radial') {
      const gradient = ctx.createRadialGradient(width * .5, height * .42, 0, width * .5, height * .42, Math.max(width, height) * .7);
      gradient.addColorStop(0, color1); gradient.addColorStop(1, color2); ctx.fillStyle = gradient;
    } else ctx.fillStyle = color1;
    ctx.fillRect(0, 0, width, height);

    if (!['paper', 'linen', 'grain', 'dots'].includes(mode)) return;
    const scale = Math.max(.4, style.textureScale || 1);
    const size = Math.max(12, Math.round(48 * scale));
    const tile = document.createElement('canvas'); tile.width = size; tile.height = size;
    const t = tile.getContext('2d');
    t.clearRect(0, 0, size, size);
    if (mode === 'dots') {
      t.fillStyle = '#000'; t.beginPath(); t.arc(size / 2, size / 2, Math.max(1, size * .045), 0, Math.PI * 2); t.fill();
    } else if (mode === 'linen') {
      t.strokeStyle = '#000'; t.lineWidth = 1;
      for (let p = 2; p < size; p += Math.max(4, size / 8)) { t.globalAlpha = p % 3 ? .24 : .4; t.beginPath(); t.moveTo(p, 0); t.lineTo(p, size); t.stroke(); t.beginPath(); t.moveTo(0, p); t.lineTo(size, p); t.stroke(); }
    } else if (mode === 'paper') {
      t.strokeStyle = '#000'; t.lineWidth = .7;
      for (let p = 3; p < size; p += 5) { t.globalAlpha = .18 + (p % 4) * .04; t.beginPath(); t.moveTo(0, p); t.bezierCurveTo(size * .3, p - 2, size * .7, p + 2, size, p); t.stroke(); }
    } else {
      for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) {
        const value = (x * 17 + y * 31 + x * y * 7) % 29;
        t.fillStyle = value % 2 ? '#fff' : '#000'; t.globalAlpha = .08 + (value / 29) * .25; t.fillRect(x, y, 1.2, 1.2);
      }
    }
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(.6, style.textureOpacity ?? .16));
    ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, width, height); ctx.restore();
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
    const textScale = Math.max(.1, info.textScale ?? 1);
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
            size:     Math.max(7, Math.round(shorter * (el.fontSize    || info.subtitleFontSize || 0.026) * textScale)),
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

    const titleSize    = Math.max(10, Math.round(shorter * (info.titleFontSize    || 0.038) * textScale));
    const subtitleSize = Math.max(8,  Math.round(shorter * (info.subtitleFontSize || 0.026) * textScale));
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
    ctx.scale(info.textFlipX ? -1 : 1, info.textFlipY ? -1 : 1);
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

    // ── 逐行绘制，并记录真实文字区域供画布上的自由变换选框使用 ──────────────
    let maxLineWidth = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      ctx.font      = `${line.style} ${line.weight} ${line.size}px "${line.font}"`;
      ctx.fillStyle = line.color;
      maxLineWidth = Math.max(maxLineWidth, measureStyledTextWidth(ctx, line.text, line.tracking, line.size));
      drawStyledText(ctx, line.text, 0, curY - centerY, line.tracking, line.size, strokeWidth > 0);
      if (i < lines.length - 1) {
        curY += line.size / 2 + lines[i + 1].size / 2 + interGap(i);
      }
    }
    ctx.restore();

    const shadowPad = shadowOpacity > 0
      ? Math.max(0, (info.textShadowBlur ?? 0.006) * shorter) +
        Math.max(Math.abs((info.textShadowX ?? 0.003) * shorter), Math.abs((info.textShadowY ?? 0.003) * shorter))
      : 0;
    const visualPad = Math.max(4, strokeWidth, shadowPad);
    const localLeft = info.textAlign === 'left' ? 0 : info.textAlign === 'right' ? -maxLineWidth : -maxLineWidth / 2;
    layout.textBounds = {
      x: xPos + localLeft - visualPad,
      y: centerY - totalH / 2 - visualPad,
      width: maxLineWidth + visualPad * 2,
      height: totalH + visualPad * 2,
      pivotX: xPos,
      pivotY: centerY,
    };
  }

  function colorWithAlpha(color, alpha) {
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      const n = parseInt(color.slice(1), 16);
      return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }
    return color;
  }

  // 字距、描边和填充统一绘制；保留旧浏览器的逐字符降级路径。
  function measureStyledTextWidth(ctx, text, trackingEm, fontSize) {
    const chars = [...text];
    if (!chars.length) return 0;
    const spacing = fontSize * trackingEm;
    return chars.reduce((sum, char) => sum + ctx.measureText(char).width, 0) + spacing * Math.max(0, chars.length - 1);
  }

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
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 背景：纯色、渐变或程序化纹理
    paintCanvasBackground(ctx, canvasW, canvasH, b);

    const shadowOpacity = Math.max(0, Math.min(1, b.photoShadowOpacity || 0));
    if (shadowOpacity > 0) {
      ctx.save();
      ctx.shadowColor = colorWithAlpha(b.photoShadowColor || '#000000', shadowOpacity);
      ctx.shadowBlur = Math.max(0, (b.photoShadowBlur ?? .025) * shorter);
      ctx.shadowOffsetX = (b.photoShadowX || 0) * shorter;
      ctx.shadowOffsetY = (b.photoShadowY ?? .012) * shorter;
      ctx.fillStyle = '#fff'; roundRect(ctx, bLeft, bTop, photoW, photoH, radius); ctx.fill(); ctx.restore();
    }

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

    const strokeWidth = Math.max(0, (b.photoStrokeWidth || 0) * shorter);
    if (strokeWidth > 0 && b.photoStrokeStyle !== 'none') {
      ctx.save(); ctx.strokeStyle = b.photoStrokeColor || '#FFFFFF'; ctx.lineWidth = strokeWidth;
      roundRect(ctx, bLeft + strokeWidth / 2, bTop + strokeWidth / 2, photoW - strokeWidth, photoH - strokeWidth, Math.max(0, radius - strokeWidth / 2)); ctx.stroke();
      if (b.photoStrokeStyle === 'double' && strokeWidth > 2) {
        ctx.lineWidth = Math.max(1, strokeWidth * .28); const inset = strokeWidth * 1.35;
        roundRect(ctx, bLeft + inset, bTop + inset, photoW - inset * 2, photoH - inset * 2, Math.max(0, radius - inset)); ctx.stroke();
      }
      ctx.restore();
    }

    // 信息文字
    const info = effectiveInfo(preset, job);
    if (info.enabled !== false) {
      const layout = { canvasW, canvasH, bTop, bBottom, photoH, shorter };
      await drawInfoBar(ctx, layout, info, job);
      _lastLayout.textBounds = layout.textBounds || null;
    }

    await drawStickers(ctx, canvasW, canvasH, shorter, job);

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

  return { render, renderPreview, canvasToBlob, canvasToDataURL, resolveTemplate, calculateAutoCrop, getLastLayout, paintCanvasBackground };
})();
