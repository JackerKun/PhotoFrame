/**
 * PhotoFrame — 会话持久化（IndexedDB）
 *
 * 数据库结构：
 *   files   — { id, name, type, lastModified, buf: ArrayBuffer }
 *   jobs    — job 的所有元数据字段（不含 File 对象）
 *   session — { key: 'state', activePresetId, activeJobId }
 *
 * 文件二进制数据以 ArrayBuffer 形式存储，恢复时重建为 File 对象。
 */
window.SessionStore = (() => {
  const DB_NAME    = 'PhotoFrameDB';
  const DB_VERSION = 1;
  let _db = null;

  // ── 打开数据库 ───────────────────────────────────────────────────────────
  function open() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('files'))
          db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('jobs'))
          db.createObjectStore('jobs',  { keyPath: 'id' });
        if (!db.objectStoreNames.contains('session'))
          db.createObjectStore('session', { keyPath: 'key' });
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ── 通用 IDB 操作 ────────────────────────────────────────────────────────
  function idbPut(storeName, value) {
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror    = e => reject(e.target.error);
    });
  }

  function idbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror    = e => reject(e.target.error);
    });
  }

  function idbGetAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx  = _db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = e => resolve(e.target.result || []);
      req.onerror   = e => reject(e.target.error);
    });
  }

  function idbGet(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx  = _db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror   = e => reject(e.target.error);
    });
  }

  function idbClear(storeName) {
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = e => reject(e.target.error);
    });
  }

  // ── 公开 API ─────────────────────────────────────────────────────────────

  /**
   * 保存文件二进制（每张照片上传时调用一次）
   * @param {string} id   job.id
   * @param {File}   file 原始 File 对象
   */
  async function saveFile(id, file) {
    await open();
    const buf = await file.arrayBuffer();
    await idbPut('files', {
      id,
      name:         file.name,
      type:         file.type,
      lastModified: file.lastModified,
      buf,
    });
  }

  /**
   * 保存 job 元数据（不含 File 对象）
   * @param {Object} jobMeta  job 对象去掉 .file 后的所有字段
   */
  async function saveJob(jobMeta) {
    await open();
    await idbPut('jobs', jobMeta);
  }

  /**
   * 删除某张照片的文件与元数据
   * @param {string} id  job.id
   */
  async function deleteJob(id) {
    await open();
    await Promise.all([
      idbDelete('files', id),
      idbDelete('jobs',  id),
    ]);
  }

  /**
   * 保存会话状态（当前激活的 preset / job 等）
   * @param {Object} data  { activePresetId, activeJobId }
   */
  async function saveSessionState(data) {
    await open();
    await idbPut('session', { key: 'state', ...data });
  }

  /**
   * 恢复上次会话
   * @returns {{ jobs: Object[], sessionState: Object|null }}
   *   jobs 中的每项已重建 .file（File 对象）
   */
  async function restoreSession() {
    await open();
    const [fileRecords, jobRecords, sessionState] = await Promise.all([
      idbGetAll('files'),
      idbGetAll('jobs'),
      idbGet('session', 'state'),
    ]);

    // 重建 File 对象
    const fileMap = {};
    for (const rec of fileRecords) {
      fileMap[rec.id] = new File([rec.buf], rec.name, {
        type:         rec.type,
        lastModified: rec.lastModified,
      });
    }

    // 合并 job 元数据与重建的 File
    const jobs = jobRecords
      .filter(meta => fileMap[meta.id])        // 只保留有对应文件的 job
      .map(meta => ({ ...meta, file: fileMap[meta.id] }));

    return { jobs, sessionState: sessionState || null };
  }

  /**
   * 清除所有持久化数据
   */
  async function clearAll() {
    await open();
    await Promise.all([
      idbClear('files'),
      idbClear('jobs'),
      idbClear('session'),
    ]);
  }

  return { open, saveFile, saveJob, deleteJob, saveSessionState, restoreSession, clearAll };
})();
