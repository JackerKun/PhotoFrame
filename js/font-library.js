/** Shared system font choices for titles, subtitles and extra lines. */
window.FontLibrary = (() => {
  const groups = [
    ['系统通用', [
      ['system-ui', '系统无衬线'], ['sans-serif', '无衬线'], ['serif', '衬线'],
      ['monospace', '等宽'], ['cursive', '手写'],
    ]],
    ['中文 · 黑体', [
      ['PingFang SC', '苹方（macOS）'], ['Microsoft YaHei', '微软雅黑（Windows）'],
      ['Microsoft JhengHei', '微软正黑体（Windows）'], ['Heiti SC', '黑体（macOS）'],
      ['SimHei', '中易黑体（Windows）'], ['DengXian', '等线（Windows）'],
      ['Noto Sans CJK SC', '思源黑体 / Noto Sans CJK SC'], ['Source Han Sans SC', '思源黑体 / Source Han Sans'],
    ]],
    ['中文 · 宋体与仿宋', [
      ['Songti SC', '宋体（macOS）'], ['SimSun', '中易宋体（Windows）'],
      ['NSimSun', '新宋体（Windows）'], ['STSong', '华文宋体'],
      ['FangSong', '仿宋（Windows）'], ['STFangsong', '华文仿宋'],
      ['Noto Serif CJK SC', '思源宋体 / Noto Serif CJK SC'], ['Source Han Serif SC', '思源宋体 / Source Han Serif'],
    ]],
    ['中文 · 楷体与装饰', [
      ['Kaiti SC', '楷体（macOS）'], ['KaiTi', '楷体（Windows）'], ['STKaiti', '华文楷体'],
      ['STXingkai', '华文行楷'], ['STLiti', '华文隶书'], ['STHupo', '华文琥珀'],
      ['STYuanti', '华文圆体'], ['STXinwei', '华文新魏'],
    ]],
    ['西文 · 无衬线', [
      ['Arial', 'Arial'], ['Helvetica Neue', 'Helvetica Neue'], ['Segoe UI', 'Segoe UI'],
      ['Verdana', 'Verdana'], ['Tahoma', 'Tahoma'], ['Trebuchet MS', 'Trebuchet MS'], ['Gill Sans', 'Gill Sans'],
    ]],
    ['西文 · 衬线', [
      ['Georgia', 'Georgia'], ['Times New Roman', 'Times New Roman'], ['Palatino', 'Palatino'],
      ['Cambria', 'Cambria'], ['Baskerville', 'Baskerville'], ['Didot', 'Didot'], ['Constantia', 'Constantia'],
    ]],
    ['西文 · 等宽与装饰', [
      ['Courier New', 'Courier New'], ['Consolas', 'Consolas'], ['Menlo', 'Menlo'],
      ['Monaco', 'Monaco'], ['Impact', 'Impact'], ['Copperplate', 'Copperplate'],
    ]],
  ];
  const generic = new Set(['system-ui', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy']);

  function cssFamily(family) {
    return generic.has(family) ? family : `${JSON.stringify(family || 'system-ui')}, system-ui`;
  }

  const names = new Map(groups.flatMap(([, fonts]) => fonts));
  const availability = new Map();
  const context = document.createElement('canvas').getContext('2d');
  const sample = '摄影照片永远 Film 0123456789 Wm@';

  // Comparing against several fallbacks avoids treating a missing font as installed.
  // This is a best-effort check: browser privacy settings may hide local fonts.
  function isAvailable(family) {
    if (generic.has(family)) return true;
    if (!availability.has(family)) {
      const detected = ['monospace', 'serif', 'sans-serif'].some(fallback => {
        context.font = `72px ${fallback}`;
        const baseline = context.measureText(sample).width;
        context.font = `72px ${JSON.stringify(family)}, ${fallback}`;
        return Math.abs(context.measureText(sample).width - baseline) > .01;
      });
      availability.set(family, detected);
    }
    return availability.get(family);
  }

  function recentFonts() {
    try {
      const value = JSON.parse(localStorage.getItem('pf_recent_fonts') || '[]');
      return Array.isArray(value) ? value.filter(font => names.has(font)).slice(0, 6) : [];
    } catch { return []; }
  }

  function updatePreview(select) {
    const preview = select._fontPreview;
    if (!preview) return;
    const family = select.value || document.getElementById('font-subtitle')?.value || 'system-ui';
    preview.style.fontFamily = cssFamily(family);
    preview.textContent = `摄影时光 Film 2026 · ${isAvailable(family) ? '本机可用' : '未检测到，将使用替代字体'}`;
  }

  function selectValue(select, value) {
    if (value && !Array.from(select.options).some(option => option.value === value)) {
      select.add(new Option(`${value}（预设字体）`, value));
    }
    select.value = value;
    select.style.fontFamily = cssFamily(value);
    updatePreview(select);
  }

  function renderOptions(select, value) {
    select.replaceChildren();
    if (select._fontInherit) select.add(new Option('继承副标题字体', ''));
    const recent = recentFonts();
    const used = new Set();
    const addGroup = (label, fonts) => {
      const entries = fonts.filter(([family]) => !used.has(family));
      if (!entries.length) return;
      const group = document.createElement('optgroup');
      group.label = label;
      entries.forEach(([family, name]) => {
        used.add(family);
        const option = new Option(`${name}${isAvailable(family) ? '' : '（未检测到）'}`, family);
        option.style.fontFamily = cssFamily(family);
        group.appendChild(option);
      });
      select.appendChild(group);
    };
    addGroup('最近使用', recent.map(font => [font, names.get(font)]));
    addGroup('本机可用 · 系统通用', groups.flatMap(([, fonts]) => fonts).filter(([font]) => isAvailable(font)));
    groups.forEach(([label, fonts]) => addGroup(`${label} · 其他设备字体`, fonts));
    selectValue(select, value);
  }

  function populate(select, value, inherit = false) {
    select._fontInherit = inherit;
    renderOptions(select, value);
    select.dataset.fontPicker = 'true';
    const preview = document.createElement('div');
    preview.className = 'font-preview';
    select._fontPreview = preview;
    // Extra-line selects are populated before insertion into the document.
    queueMicrotask(() => {
      if (!select.isConnected) return;
      const item = select.closest('.extra-line-item');
      if (item) item.appendChild(preview);
      else select.after(preview);
      updatePreview(select);
    });
    select.addEventListener('change', () => {
      if (select.value) {
        try { localStorage.setItem('pf_recent_fonts', JSON.stringify([select.value, ...recentFonts().filter(font => font !== select.value)].slice(0, 6))); } catch {}
      }
      for (const picker of document.querySelectorAll('select[data-font-picker]')) {
        renderOptions(picker, picker.value);
      }
    });
  }

  function register(family, label = family) {
    names.set(family, label); availability.set(family, true);
    let group = groups.find(([name]) => name === '我的字体');
    if (!group) { group = ['我的字体', []]; groups.unshift(group); }
    if (!group[1].some(([name]) => name === family)) group[1].push([family, label]);
    for (const picker of document.querySelectorAll('select[data-font-picker]')) renderOptions(picker, picker.value);
  }
  return { register, populate, selectValue, cssFamily, isAvailable };
})();
