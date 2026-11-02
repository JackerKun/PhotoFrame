/**
 * PhotoFrame image decoding facade.
 * Normal browser images use object URLs; HEIC and TIFF are converted locally.
 */
window.ImageDecoder = (() => {
  const converted = new WeakMap();

  function extension(file) {
    return (file?.name?.split('.').pop() || '').toLowerCase();
  }

  async function toRenderableBlob(file) {
    if (converted.has(file)) return converted.get(file);
    const ext = extension(file);
    let promise;

    if (ext === 'heic' || ext === 'heif' || /heic|heif/i.test(file.type || '')) {
      promise = decodeHeic(file);
    } else if (ext === 'tif' || ext === 'tiff' || /tiff?/i.test(file.type || '')) {
      promise = decodeTiff(file);
    } else {
      promise = Promise.resolve(file);
    }

    converted.set(file, promise);
    promise.catch(() => converted.delete(file));
    return promise;
  }

  async function decodeHeic(file) {
    if (typeof heic2any !== 'function') {
      throw new Error('HEIC 解码组件未加载');
    }
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
    return Array.isArray(result) ? result[0] : result;
  }

  async function decodeTiff(file) {
    if (typeof UTIF === 'undefined') throw new Error('TIFF 解码组件未加载');
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    if (!ifds.length) throw new Error('TIFF 文件中没有可读取的图像');
    UTIF.decodeImage(buffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const canvas = document.createElement('canvas');
    canvas.width = ifds[0].width;
    canvas.height = ifds[0].height;
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0);
    return new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('TIFF 转换失败')),
      'image/png'
    ));
  }

  async function load(file) {
    const blob = await toRenderableBlob(file);
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`无法解码图片：${file.name}`)); };
      image.src = url;
    });
  }

  return { load, toRenderableBlob };
})();
