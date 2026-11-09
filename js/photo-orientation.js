/** Quarter turns followed by an optional horizontal mirror in screen coordinates. */
window.PhotoOrientation = (() => {
  function size(width, height, orientation) {
    return orientation?.turns % 2 ? { width: height, height: width } : { width, height };
  }

  function change(orientation, action) {
    let { turns = 0, mirrored = false } = orientation || {};
    switch (action) {
      case 'left': turns += mirrored ? 1 : -1; break;
      case 'right': turns += mirrored ? -1 : 1; break;
      case 'horizontal': mirrored = !mirrored; break;
      case 'vertical': turns += 2; mirrored = !mirrored; break;
    }
    turns = (turns + 4) % 4;
    return turns || mirrored ? { turns, mirrored } : null;
  }

  function changeCrop(crop, width, height, action) {
    const { sx, sy, sw, sh } = crop;
    switch (action) {
      case 'left': return { sx: sy, sy: width - sx - sw, sw: sh, sh: sw };
      case 'right': return { sx: height - sy - sh, sy: sx, sw: sh, sh: sw };
      case 'horizontal': return { ...crop, sx: width - sx - sw };
      case 'vertical': return { ...crop, sy: height - sy - sh };
      default: return crop;
    }
  }

  function draw(ctx, image, source, orientation, crop, x, y, w, h) {
    if (!orientation) {
      if (!crop) {
        ctx.drawImage(image, x, y, w, h);
        return;
      }
      const scaleX = (image.naturalWidth ?? image.width) / source.width;
      const scaleY = (image.naturalHeight ?? image.height) / source.height;
      ctx.drawImage(image, crop.sx * scaleX, crop.sy * scaleY, crop.sw * scaleX, crop.sh * scaleY, x, y, w, h);
      return;
    }

    const { width, height } = size(source.width, source.height, orientation);
    const { sx, sy, sw, sh } = crop || { sx: 0, sy: 0, sw: width, sh: height };
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x, y);
    ctx.scale(w / sw, h / sh);
    ctx.translate(-sx, -sy);
    if (orientation.mirrored) ctx.transform(-1, 0, 0, 1, width, 0);
    // Integer matrices keep 90° rotations aligned to the pixel grid.
    switch (orientation.turns) {
      case 1: ctx.transform(0, 1, -1, 0, width, 0); break;
      case 2: ctx.transform(-1, 0, 0, -1, width, height); break;
      case 3: ctx.transform(0, -1, 1, 0, 0, height); break;
    }
    ctx.drawImage(image, 0, 0, source.width, source.height);
    ctx.restore();
  }

  return { size, change, changeCrop, draw };
})();
