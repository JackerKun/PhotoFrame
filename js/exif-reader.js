/**
 * PhotoFrame — EXIF 读取模块
 * 依赖: exifr (CDN)
 */
window.ExifReader = (() => {
  /**
   * 从 File 对象读取 EXIF，返回标准化字段对象
   * 读取失败时返回空对象（不抛出异常）
   */
  async function read(file) {
    try {
      if (typeof exifr === 'undefined') return {};
      const raw = await exifr.parse(file, {
        tiff: true,
        exif: true,
        gps: true,
        ifd0: true,
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
      });
      if (!raw) return {};
      return normalize(raw);
    } catch (e) {
      console.warn('[ExifReader] 读取失败:', e.message);
      return {};
    }
  }

  function normalize(raw) {
    const make  = raw.Make  || '';
    const model = raw.Model || '';
    const camera = [make, model].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    const aperture = raw.FNumber
      ? `f/${Number(raw.FNumber).toFixed(1)}`
      : (raw.ApertureValue ? `f/${Number(Math.pow(2, raw.ApertureValue / 2)).toFixed(1)}` : '');

    const shutter = raw.ExposureTime
      ? formatShutter(raw.ExposureTime)
      : '';

    const iso = raw.ISO || raw.ISOSpeedRatings || '';

    const focalLength = raw.FocalLength
      ? `${Math.round(raw.FocalLength)}mm`
      : '';

    const lens = raw.LensModel || raw.Lens || '';

    const date = raw.DateTimeOriginal
      ? formatDate(raw.DateTimeOriginal)
      : (raw.DateTime ? formatDate(raw.DateTime) : '');

    const gps = (raw.latitude && raw.longitude)
      ? { lat: raw.latitude, lng: raw.longitude }
      : null;

    return { camera, make, model, aperture, shutter, iso, focalLength, lens, date, gps };
  }

  function formatShutter(value) {
    if (!value) return '';
    if (value >= 1) return `${value}s`;
    const denom = Math.round(1 / value);
    return `1/${denom}s`;
  }

  function formatDate(d) {
    try {
      const dt = d instanceof Date ? d : new Date(String(d).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
      if (isNaN(dt)) return String(d).substring(0, 10);
      return dt.toISOString().substring(0, 10);
    } catch { return ''; }
  }

  return { read };
})();
