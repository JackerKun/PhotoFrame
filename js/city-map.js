/** Extract the layers needed for the city overlay from OpenMapTiles vectors. */
window.CityMap = (() => {
  const SOURCE = 'https://tiles.openfreemap.org/planet';
  const GRID = 4096;
  const GROUPS = ['roads', 'major', 'water', 'streams'];
  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
  const MINOR = new Set(['minor', 'service', 'residential', 'unclassified', 'living_street']);
  const WATERWAYS = new Set(['river', 'canal']);
  const PLACES = new Set(['suburb', 'quarter', 'neighbourhood', 'town', 'village', 'island']);
  const tileCache = new Map();
  const pathsByMap = new WeakMap();
  let metadata;

  async function request(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('城市地图数据暂不可用');
    return response;
  }

  async function tileSource() {
    if (!metadata) metadata = request(SOURCE).then(response => response.json());
    try {
      return await metadata;
    } catch (error) {
      metadata = null;
      throw error;
    }
  }

  async function readTile(url, VectorTile, Pbf) {
    if (tileCache.has(url)) return tileCache.get(url);
    const pending = request(url).then(response => response.arrayBuffer())
      .then(data => new VectorTile(new Pbf(data)));
    tileCache.set(url, pending);
    if (tileCache.size > 24) tileCache.delete(tileCache.keys().next().value);
    try {
      return await pending;
    } catch (error) {
      tileCache.delete(url);
      throw error;
    }
  }

  function packPaths(paths) {
    const packed = new Int16Array(paths.reduce((size, path) => size + path.length + 1, 0));
    let offset = 0;
    for (const path of paths) {
      packed[offset++] = path.length;
      packed.set(path, offset);
      offset += path.length;
    }
    return packed;
  }

  function unpackSample(encoded) {
    const bytes = Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0));
    const data = new DataView(bytes.buffer);
    return Int16Array.from({ length: bytes.length / 2 }, (_, i) => data.getInt16(i * 2, true));
  }

  function extract(tile, tileX, tileY, count, bounds) {
    const convert = (x, y) => [
      Math.round((x / count - bounds.left) / bounds.width * GRID),
      Math.round((y / count - bounds.top) / bounds.height * GRID),
    ];
    const rect = [...convert(tileX, tileY), ...convert(tileX + 1, tileY + 1)];
    const roads = [];
    const major = [];
    const water = [];
    const streams = [];
    const labels = [];

    function addLabel(feature, point, rank) {
      if (!point) return;
      const name = feature.properties['name:zh-Hans'] || feature.properties['name:zh']
        || feature.properties['name:en'] || feature.properties.name;
      const [x, y] = point;
      if (name && x >= .07 * GRID && x <= .83 * GRID && y >= .24 * GRID && y <= .86 * GRID) {
        labels.push({ x, y, name: String(name).slice(0, 48), rank });
      }
    }

    function each(layerName, callback) {
      const layer = tile.layers[layerName];
      for (let index = 0; index < (layer?.length ?? 0); index++) {
        const feature = layer.feature(index);
        callback(feature, () => feature.loadGeometry().map(path => path.map(point =>
          convert(tileX + point.x / feature.extent, tileY + point.y / feature.extent)
        )));
      }
    }

    function addPaths(group, geometry) {
      for (const path of geometry) {
        if (path.length < 2) continue;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const points = [];
        for (const [x, y] of path) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          if (points.at(-2) !== x || points.at(-1) !== y) points.push(x, y);
        }
        if (points.length >= 4 && maxX >= 0 && minX <= GRID && maxY >= 0 && minY <= GRID) group.push(points);
      }
    }

    each('transportation', (feature, geometry) => {
      const kind = feature.properties.class;
      if (MAJOR.has(kind)) addPaths(major, geometry());
      else if (MINOR.has(kind)) addPaths(roads, geometry());
    });
    each('water', (feature, geometry) => {
      if (feature.type === 3) addPaths(water, geometry());
    });
    each('waterway', (feature, geometry) => {
      if (!WATERWAYS.has(feature.properties.class)) return;
      const paths = geometry();
      addPaths(streams, paths);
      const line = paths[0];
      if (line?.length > 2) addLabel(feature, line[Math.floor(line.length / 2)], 0);
    });
    each('place', (feature, geometry) => {
      if (PLACES.has(feature.properties.class)) addLabel(feature, geometry()[0]?.[0], 1);
    });
    return {
      rect, labels,
      roads: packPaths(roads), major: packPaths(major), water: packPaths(water), streams: packPaths(streams),
    };
  }

  function chooseLabels(labels) {
    const selected = [];
    for (const label of labels.sort((a, b) => a.rank - b.rank)) {
      if (selected.some(other => other.name === label.name || Math.hypot(label.x - other.x, label.y - other.y) < 700)) continue;
      selected.push(label);
      if (selected.length === 4) break;
    }
    return selected;
  }

  async function load(center, widthKm) {
    const [{ VectorTile }, { default: Pbf }, source] = await Promise.all([
      import('../vendor/vector-tile.mjs'), import('../vendor/pbf.mjs'), tileSource(),
    ]);
    const bounds = TerrainMap.area(center, widthKm);
    if (bounds.top < 0 || bounds.top + bounds.height >= 1) throw new Error('请缩小地图范围或选择更靠近赤道的中心点');
    const z = Math.min(source.maxzoom, Math.max(source.minzoom, Math.floor(Math.log2(4 / bounds.width))));
    const count = 2 ** z;
    const requests = [];
    for (let y = Math.floor(bounds.top * count); y <= Math.floor((bounds.top + bounds.height) * count); y++) {
      for (let x = Math.floor(bounds.left * count); x <= Math.floor((bounds.left + bounds.width) * count); x++) {
        requests.push([x, y]);
      }
    }
    const tiles = [];
    const labels = [];
    try {
      for (let i = 0; i < requests.length; i += 4) {
        const batch = await Promise.all(requests.slice(i, i + 4).map(async ([x, y]) => {
          const url = source.tiles[0].replace('{z}', z).replace('{x}', (x % count + count) % count).replace('{y}', y);
          return extract(await readTile(url, VectorTile, Pbf), x, y, count, bounds);
        }));
        for (const { labels: candidates, ...tile } of batch) {
          tiles.push(tile);
          labels.push(...candidates);
        }
      }
    } catch (error) {
      metadata = null;
      throw error;
    }
    return { tiles, labels: chooseLabels(labels) };
  }

  async function demo() {
    const response = await fetch('./assets/maps/saint-petersburg.json');
    if (!response.ok) throw new Error('无法载入城市样例');
    const sample = await response.json();
    for (const tile of sample.city.tiles) {
      for (const group of GROUPS) tile[group] = unpackSample(tile[group]);
    }
    return sample;
  }

  function paths(city, width, height) {
    const cached = pathsByMap.get(city);
    if (cached) return cached;
    function makePath(lines, close = false) {
      const path = new Path2D();
      for (let start = 0; start < lines.length;) {
        const length = lines[start++] & 0xffff;
        if (length < 4 || length % 2 || start + length > lines.length) break;
        path.moveTo(lines[start] / GRID * width, lines[start + 1] / GRID * height);
        for (let i = start + 2; i < start + length; i += 2) {
          path.lineTo(lines[i] / GRID * width, lines[i + 1] / GRID * height);
        }
        if (close) path.closePath();
        start += length;
      }
      return path;
    }
    const result = city.tiles.map(tile => ({
      rect: tile.rect.map((n, i) => n / GRID * (i % 2 ? height : width)),
      water: makePath(tile.water, true), streams: makePath(tile.streams),
      roads: makePath(tile.roads), major: makePath(tile.major),
    }));
    pathsByMap.set(city, result);
    return result;
  }

  function draw(ctx, city, width, height, fade, ink, pin, label) {
    function gradient(alpha) {
      const fill = ctx.createLinearGradient(0, 0, 0, height);
      fill.addColorStop(0, `rgba(${ink.rgb},${alpha})`);
      fill.addColorStop(.28, `rgba(${ink.rgb},${alpha})`);
      fill.addColorStop(1, `rgba(${ink.rgb},${alpha * (1 - fade)})`);
      return fill;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    const water = gradient(.19);
    const minor = gradient(.43);
    const major = gradient(.77);
    const streams = gradient(.56);
    for (const tile of paths(city, width, height)) {
      ctx.save();
      const [left, top, right, bottom] = tile.rect;
      ctx.beginPath();
      ctx.rect(left, top, right - left, bottom - top);
      ctx.clip();
      ctx.fillStyle = water;
      ctx.fill(tile.water);
      ctx.strokeStyle = streams;
      ctx.lineWidth = 1.05;
      ctx.stroke(tile.streams);
      ctx.strokeStyle = minor;
      ctx.lineWidth = .68;
      ctx.stroke(tile.roads);
      ctx.strokeStyle = major;
      ctx.lineWidth = 1.4;
      ctx.stroke(tile.major);
      ctx.restore();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.lineWidth = 2.1;
    ctx.fillStyle = ink.text;
    ctx.strokeStyle = ink.outline;
    const opacity = ctx.globalAlpha;
    for (const place of city.labels) {
      if (label.includes(place.name) || Math.hypot(place.x / GRID - pin.x, place.y / GRID - pin.y) < .09) continue;
      const x = place.x / GRID * width;
      const y = place.y / GRID * height;
      ctx.globalAlpha = opacity * (1 - fade * Math.max(0, (y / height - .28) / .72));
      ctx.strokeText(place.name, x + 5, y, width - x - 10);
      ctx.fillText(place.name, x + 5, y, width - x - 10);
    }
    ctx.restore();
  }

  return { load, demo, draw };
})();
