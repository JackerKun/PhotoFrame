/**
 * PhotoFrame — 批量处理器
 */
window.BatchProcessor = (() => {

  /**
   * 批量渲染并打包 ZIP 下载
   * @param {Array}    jobs     PhotoJob 数组
   * @param {Function} getPreset   (presetId) => preset
   * @param {Function} onProgress  (done, total) => void
   */
  async function exportZip(jobs, getPreset, onProgress) {
    if (typeof JSZip === 'undefined') {
      alert('JSZip 未加载，请检查网络连接后重试');
      return;
    }

    const zip  = new JSZip();
    const folder = zip.folder('PhotoFrame导出');
    const total  = jobs.length;
    let done = 0;

    for (const job of jobs) {
      try {
        // getPreset 接收完整 job，返回合并后的 preset
        const preset = getPreset(job);
        if (!preset) continue;

        const out = preset.output || {};
        const canvas = await CanvasRenderer.render(
          job.file,
          preset,
          job,
          out.longEdge || 3000
        );
        const blob = await CanvasRenderer.canvasToBlob(
          canvas,
          out.format  || 'jpeg',
          (out.quality || 95) / 100
        );

        const ext  = (out.format || 'jpeg') === 'png' ? 'png' : 'jpg';
        const name = sanitizeFilename(job.file.name, ext);
        folder.file(name, blob);
      } catch (e) {
        console.error('[BatchProcessor] job 失败:', e);
      }

      done++;
      onProgress && onProgress(done, total);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    saveAs(content, `PhotoFrame_${ts}.zip`);
  }

  function sanitizeFilename(originalName, ext) {
    const base = originalName.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fff\-_.]/g, '_');
    return `${base}_frame.${ext}`;
  }

  /**
   * 单张导出
   */
  async function exportSingle(job, preset) {
    const out = preset.output || {};
    const canvas = await CanvasRenderer.render(
      job.file,
      preset,
      job,
      out.longEdge || 3000
    );
    const blob = await CanvasRenderer.canvasToBlob(
      canvas,
      out.format  || 'jpeg',
      (out.quality || 95) / 100
    );
    const ext  = (out.format || 'jpeg') === 'png' ? 'png' : 'jpg';
    const name = sanitizeFilename(job.file.name, ext);
    saveAs(blob, name);
  }

  return { exportZip, exportSingle };
})();
