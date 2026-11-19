/**
 * PhotoFrame — 批量处理器
 */
window.BatchProcessor = (() => {

  /**
   * 批量渲染并打包 ZIP 下载
   * @param {Array}    jobs     PhotoJob 数组
   * @param {Function} getPreset   (job) => preset
   * @param {Function} onProgress  (done, total, { phase, job, failed, percent }) => void
   * @param {Object} options Optional AbortSignal; cancellation never downloads a partial ZIP.
   */
  async function exportZip(jobs, getPreset, onProgress, { signal } = {}) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 未加载，请刷新页面后重试');
    }

    const checkCancelled = () => {
      if (signal?.aborted) throw new DOMException('已取消批量导出', 'AbortError');
    };
    checkCancelled();
    const zip  = new JSZip();
    const folder = zip.folder('PhotoFrame导出');
    const total  = jobs.length;
    let done = 0;
    const failed = [];
    const usedNames = new Set();

    for (const [index, job] of jobs.entries()) {
      checkCancelled();
      onProgress?.(done, total, { phase: 'rendering', job, failed });
      // Give the dialog a chance to paint before decoding/rendering a large photo.
      await new Promise(resolve => setTimeout(resolve, 0));
      checkCancelled();
      try {
        // getPreset 接收完整 job，返回合并后的 preset
        const preset = getPreset(job);
        if (!preset) throw new Error('未找到照片对应的预设');

        const out = preset.output || {};
        const blob = await renderBlob(job, preset, out);

        const ext  = (out.format || 'jpeg') === 'png' ? 'png' : 'jpg';
        let name = resolveFilename(out.filenameTemplate, job, index + 1, ext);
        const stem = name.slice(0, -(ext.length + 1));
        let suffix = 2;
        while (usedNames.has(name.toLowerCase())) name = `${stem}_${suffix++}.${ext}`;
        usedNames.add(name.toLowerCase());
        folder.file(name, blob);
      } catch (e) {
        console.error('[BatchProcessor] job 失败:', e);
        failed.push({ job, error: e });
      }

      done++;
      onProgress?.(done, total, { phase: 'rendered', job, failed });
    }

    checkCancelled();
    if (!total || failed.length === total) {
      const error = new Error('没有可导出的照片，请检查照片后重试');
      error.failed = failed;
      throw error;
    }
    onProgress?.(done, total, { phase: 'packing', failed, percent: 0 });
    const content = await zip.generateAsync({ type: 'blob' }, metadata => {
      checkCancelled();
      onProgress?.(done, total, { phase: 'packing', failed, percent: metadata.percent });
    });
    checkCancelled();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    saveAs(content, `PhotoFrame_${ts}.zip`);
    return { success: total - failed.length, failed };
  }

  function resolveFilename(template, job, index, ext) {
    const base = job.file.name.replace(/\.[^.]+$/, '');
    const date = job.overrides?.date || job.exif?.date || new Date().toISOString().slice(0, 10);
    const camera = job.overrides?.camera || job.exif?.camera || '';
    const resolved = (template || '{name}_frame_{index}')
      .replace(/\{name\}/g, base).replace(/\{date\}/g, date)
      .replace(/\{camera\}/g, camera).replace(/\{index\}/g, String(index).padStart(2, '0'))
      .replace(/[^\w\u4e00-\u9fff\-_.]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return `${resolved || 'PhotoFrame'}.${ext}`;
  }

  /**
   * 单张导出
   */
  async function exportSingle(job, preset) {
    const out = preset.output || {};
    const blob = await renderBlob(job, preset, out);
    const ext  = (out.format || 'jpeg') === 'png' ? 'png' : 'jpg';
    const name = resolveFilename(out.filenameTemplate, job, 1, ext);
    saveAs(blob, name);
  }

  async function renderBlob(job, preset, out) {
    const canvas = await CanvasRenderer.render(job.file, preset, job, out.longEdge ?? 0);
    try {
      return await CanvasRenderer.canvasToBlob(canvas, out.format || 'jpeg', (out.quality || 95) / 100);
    } finally {
      canvas.width = canvas.height = 0;
    }
  }

  return { exportZip, exportSingle, resolveFilename };
})();
