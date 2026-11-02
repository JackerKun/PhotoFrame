/**
 * PhotoFrame — localStorage 封装
 */
window.Storage = (() => {
  const KEY_PRESETS  = 'pf_custom_presets';
  const KEY_NAMES    = 'pf_preset_names';    // { id: displayName }
  const KEY_HIDDEN   = 'pf_hidden_presets';  // [ id, ... ]
  const KEY_FAVORITES = 'pf_favorite_presets';
  const KEY_RECENT = 'pf_recent_presets';
  const KEY_SETTINGS = 'pf_settings';

  function readArray(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  }

  function getFavoriteIds() { return readArray(KEY_FAVORITES); }
  function isFavorite(id) { return getFavoriteIds().includes(id); }
  function toggleFavorite(id) {
    const ids = getFavoriteIds();
    const next = ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id];
    localStorage.setItem(KEY_FAVORITES, JSON.stringify(next));
    return next.includes(id);
  }

  function getRecentIds() { return readArray(KEY_RECENT); }
  function recordRecent(id) {
    const next = [id, ...getRecentIds().filter(item => item !== id)].slice(0, 12);
    localStorage.setItem(KEY_RECENT, JSON.stringify(next));
  }

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(KEY_SETTINGS) || '{}'); }
    catch { return {}; }
  }
  function setSetting(key, value) {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify({ ...getSettings(), [key]: value }));
  }

  // ── 自定义预设 ────────────────────────────────────────────────────────────
  function getCustomPresets() {
    try { return JSON.parse(localStorage.getItem(KEY_PRESETS) || '[]'); }
    catch { return []; }
  }

  function saveCustomPreset(preset) {
    const list = getCustomPresets().filter(p => p.id !== preset.id);
    list.push({ ...preset, isCustom: true });
    localStorage.setItem(KEY_PRESETS, JSON.stringify(list));
  }

  function deleteCustomPreset(id) {
    const list = getCustomPresets().filter(p => p.id !== id);
    localStorage.setItem(KEY_PRESETS, JSON.stringify(list));
    // 同时清除名称覆盖
    const names = getNameOverrides();
    delete names[id];
    localStorage.setItem(KEY_NAMES, JSON.stringify(names));
  }

  // ── 名称覆盖（对内置预设重命名） ─────────────────────────────────────────
  function getNameOverrides() {
    try { return JSON.parse(localStorage.getItem(KEY_NAMES) || '{}'); }
    catch { return {}; }
  }

  function setNameOverride(id, name) {
    const names = getNameOverrides();
    if (name) names[id] = name.trim();
    else      delete names[id];
    localStorage.setItem(KEY_NAMES, JSON.stringify(names));
  }

  /** 获取预设的最终显示名称（考虑用户改名） */
  function getDisplayName(preset) {
    const overrides = getNameOverrides();
    return overrides[preset.id] || preset.name;
  }

  // ── 隐藏内置预设 ─────────────────────────────────────────────────────────
  function getHiddenIds() {
    try { return JSON.parse(localStorage.getItem(KEY_HIDDEN) || '[]'); }
    catch { return []; }
  }

  function hidePreset(id) {
    const list = getHiddenIds();
    if (!list.includes(id)) list.push(id);
    localStorage.setItem(KEY_HIDDEN, JSON.stringify(list));
  }

  function unhidePreset(id) {
    const list = getHiddenIds().filter(i => i !== id);
    localStorage.setItem(KEY_HIDDEN, JSON.stringify(list));
  }

  // ── 全量预设（含自定义，排除隐藏） ───────────────────────────────────────
  function allPresets() {
    const hidden = getHiddenIds();
    const builtin = window.PRESETS.filter(p => !hidden.includes(p.id));
    return [...builtin, ...getCustomPresets()];
  }

  return {
    getCustomPresets, saveCustomPreset, deleteCustomPreset,
    getNameOverrides, setNameOverride, getDisplayName,
    getHiddenIds, hidePreset, unhidePreset,
    getFavoriteIds, isFavorite, toggleFavorite, getRecentIds, recordRecent,
    getSettings, setSetting,
    allPresets,
  };
})();
