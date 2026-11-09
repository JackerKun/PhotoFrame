/** The map centre, geographic pin and sticker placement are independent. */
window.TerrainMapEditor = (() => {
  const DEFAULTS = {
    fade: .8, showCoordinates: true, showElevation: true, showScale: true, showNorth: true,
    background: 'transparent', backgroundColor: '#263842', backgroundOpacity: .88, ink: 'auto',
  };
  function setup({ activeJob, selectSticker, addMap, getGPS, recordHistory, schedulePreview, showToast }) {
    const byId = id => document.getElementById(id);
    const panel = byId('terrain-map-panel');
    const toggle = byId('terrain-map-open');
    const status = byId('terrain-map-status');
    const results = byId('terrain-map-results');
    const canvas = byId('terrain-map-preview');
    const position = byId('terrain-map-center');
    const range = byId('terrain-map-range');
    const mode = byId('terrain-map-mode');
    const label = byId('terrain-map-label');
    const styles = byId('terrain-map-style');
    let selected = null;
    let owner = null;
    let requestId = 0;
    let searchId = 0;
    let resultQuery = '';
    let lastSearch = 0;

    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '返回贴图库' : '地图叠层';
      byId('tab-stickers').classList.toggle('terrain-editing', open);
    }

    function updatePin() {
      const map = selected.terrain;
      canvas.dataset.ink = TerrainMap.inkMode(map);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      TerrainMap.draw(ctx, map, canvas.width);
      ctx.restore();
      const point = TerrainMap.pinDetails(map);
      const height = Number.isFinite(point.elevation) ? ` · 约 ${point.elevation} m` : '';
      byId('terrain-map-pin').textContent = `红点 ${TerrainMap.coordinates(point)}${height}`;
    }

    function refreshMode() {
      const city = mode.value === 'city';
      byId('terrain-map-query').placeholder = city ? '搜城市、街区或地标' : '搜山峰、村庄或观景台';
      byId('terrain-map-demo').textContent = city ? '试用圣彼得堡' : '试用 Val di Funes';
    }

    function refresh() {
      styles.hidden = !selected;
      if (!selected) { refreshMode(); return; }
      const map = selected.terrain;
      mode.value = map.mode || 'terrain';
      refreshMode();
      byId('terrain-map-elevation-option').hidden = map.mode === 'city';
      byId('terrain-map-terrain-credit').hidden = map.mode === 'city';
      byId('terrain-map-city-credit').hidden = map.mode !== 'city';
      byId('terrain-map-background-fields').hidden = map.background !== 'solid';
      position.value = `${map.center.lat.toFixed(5)}, ${map.center.lon.toFixed(5)}`;
      range.value = map.widthKm;
      label.value = map.label;
      for (const input of styles.querySelectorAll('[data-map-field]')) {
        const key = input.dataset.mapField;
        const value = map[key] ?? DEFAULTS[key];
        if (input.type === 'checkbox') input.checked = value;
        else input.value = value;
      }
      updatePin();
    }

    function sync(sticker) {
      const job = activeJob();
      const next = sticker?.terrain ? sticker : null;
      if (owner === job && selected === next) {
        if (sticker && !next) setOpen(false);
        return;
      }
      ++requestId;
      ++searchId;
      owner = job;
      selected = next;
      results.replaceChildren();
      status.textContent = '';
      resultQuery = '';
      if (!next) {
        position.value = '';
        range.value = 12;
        mode.value = 'terrain';
      }
      setOpen(Boolean(next));
      refresh();
    }

    toggle.addEventListener('click', () => {
      const job = activeJob();
      if (!job) { showToast('请先上传照片', 'warn'); return; }
      if (!panel.hidden) { ++requestId; ++searchId; setOpen(false); return; }
      const mapSticker = selected || job.stickers?.find(sticker => sticker.terrain);
      if (mapSticker) selectSticker(mapSticker);
      setOpen(true);
      refresh();
    });

    mode.addEventListener('change', () => {
      ++requestId;
      if (!selected) range.value = mode.value === 'city' ? 6 : 12;
      refreshMode();
      status.textContent = '选好地图样式后，生成地图或打开内置样例。';
    });

    async function loadMap(center, name, { demo = false, geocoded = false } = {}) {
      const job = activeJob();
      if (!job) return;
      if (!demo && !TerrainMap.validPoint(center)) {
        status.textContent = '请输入纬度, 经度，例如 46.6440, 11.7220';
        return;
      }

      const existing = selected;
      const previous = existing?.terrain;
      const mapMode = mode.value;
      const cityMode = mapMode === 'city';
      let widthKm = Number(range.value);
      let pin = { x: .5, y: .5 };
      const sameCenter = !demo && previous &&
        Math.abs(previous.center.lat - center.lat) < .00001 && Math.abs(previous.center.lon - center.lon) < .00001;
      if (sameCenter) {
        const factor = previous.widthKm / widthKm;
        pin = { x: .5 + (previous.pin.x - .5) * factor, y: .5 + (previous.pin.y - .5) * factor };
        if (pin.x < 0 || pin.x > 1 || pin.y < 0 || pin.y > 1) {
          const { lat, lon } = TerrainMap.pinDetails(previous);
          center = { lat, lon };
          pin = { x: .5, y: .5 };
        }
      }

      const token = ++requestId;
      status.textContent = cityMode ? '正在载入城市街道和水系…' : '正在载入高程数据…';
      try {
        let grid, city;
        if (demo) {
          ({ center, widthKm, grid, city, label: name } = await (cityMode ? CityMap.demo() : TerrainMap.demo()));
        } else if (cityMode) {
          city = await CityMap.load(center, widthKm);
        } else {
          grid = await TerrainMap.load(center, widthKm);
        }
        if (token !== requestId || job !== activeJob()) return;
        const map = {
          ...DEFAULTS, ...previous, mode: mapMode, center, widthKm, grid, city, pin,
          label: name.trim().slice(0, 72) || (cityMode ? '城市地图' : '山地地图'),
          geocoded: geocoded || Boolean(sameCenter && previous.geocoded),
        };
        if (existing) {
          recordHistory('更新地图叠层');
          existing.terrain = map;
          existing.name = cityMode ? '城市地图' : '山地地图';
          selectSticker(existing);
          refresh();
          schedulePreview();
        } else {
          addMap(map);
        }
        status.textContent = '点选小地图移动红点，拖动画布上的叠层调整摆放。';
      } catch (error) {
        if (token !== requestId) return;
        status.textContent = error.name === 'TimeoutError' || error instanceof TypeError
          ? '地图服务暂不可用。可重试或使用内置样例。' : error.message;
      }
    }

    byId('terrain-map-location-form').addEventListener('submit', event => {
      event.preventDefault();
      const values = position.value.trim().split(/[,，\s]+/);
      const center = values.length === 2 && values.every(Boolean)
        ? { lat: Number(values[0]), lon: Number(values[1]) } : null;
      loadMap(center, label.value);
    });

    byId('terrain-map-demo').addEventListener('click', () => loadMap(null, '', { demo: true }));
    byId('terrain-map-gps').addEventListener('click', async () => {
      const job = activeJob();
      if (!job) return;
      const token = ++requestId;
      const gps = await getGPS(job);
      if (job !== activeJob() || token !== requestId) return;
      const center = { lat: gps?.lat, lon: gps?.lng };
      if (!TerrainMap.validPoint(center)) {
        status.textContent = '这张照片没有可用的 GPS 坐标，可搜索或手动输入。';
        return;
      }
      loadMap(center, job.overrides?.location || '拍摄地点');
    });

    byId('terrain-map-search-form').addEventListener('submit', async event => {
      event.preventDefault();
      const query = byId('terrain-map-query').value.trim();
      if (query.length < 2 || query === resultQuery || Date.now() - lastSearch < 1200) return;
      const token = ++searchId;
      lastSearch = Date.now();
      resultQuery = query;
      results.replaceChildren();
      status.textContent = '正在搜索地点…';
      try {
        const url = new URL('https://photon.komoot.io/api/');
        url.search = new URLSearchParams({ q: query, limit: '6' });
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('地名搜索暂不可用');
        const { features } = await response.json();
        if (token !== searchId) return;
        for (const feature of features || []) {
          const [lon, lat] = feature.geometry?.coordinates || [];
          const center = { lat, lon };
          if (!TerrainMap.validPoint(center)) continue;
          const props = feature.properties || {};
          const name = props.name || props.city || query;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn btn-outline';
          button.textContent = [...new Set([name, props.state, props.country].filter(Boolean))].join(' · ');
          button.addEventListener('click', () => loadMap(center, name, { geocoded: true }));
          results.append(button);
        }
        status.textContent = results.childElementCount ? '选择一个地点生成地图。' : '没有找到匹配的地点，可直接输入经纬度。';
      } catch {
        if (token !== searchId) return;
        resultQuery = '';
        status.textContent = '地名搜索暂不可用，可重试或直接输入经纬度。';
      }
    });

    styles.addEventListener('change', event => {
      if (!selected) return;
      const input = event.target;
      const key = input.dataset.mapField;
      if (!key) return;
      recordHistory('修改地图叠层');
      selected.terrain[key] = input.type === 'checkbox' ? input.checked
        : input.type === 'range' ? Number(input.value) : input.value.trim();
      byId('terrain-map-background-fields').hidden = selected.terrain.background !== 'solid';
      updatePin();
      schedulePreview();
    });

    canvas.addEventListener('click', event => {
      if (!selected) return;
      const rect = canvas.getBoundingClientRect();
      const fraction = (value, size) => Math.max(0, Math.min(1, value / size));
      recordHistory('移动地图红点');
      selected.terrain.pin = {
        x: fraction(event.clientX - rect.left, rect.width),
        y: fraction(event.clientY - rect.top, rect.height),
      };
      updatePin();
      schedulePreview();
    });

    return { sync };
  }

  return { setup };
})();
