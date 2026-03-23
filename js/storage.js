/**
 * PhotoFrame — localStorage 封装
 */
window.Storage = (() => {
  const KEY_PRESETS  = 'pf_custom_presets';
  const KEY_NAMES    = 'pf_preset_names';    // { id: displayName }
  const KEY_HIDDEN   = 'pf_hidden_presets';  // [ id, ... ]

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
    allPresets,
  };
})();
