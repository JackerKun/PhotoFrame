/** Terrarium elevation sampling and resolution-independent terrain overlay. */
window.TerrainMap = (() => {
  const WIDTH = 97;
  const HEIGHT = 65;
  const VIEW_W = 660;
  const VIEW_H = 440;
  const RATIO = VIEW_W / VIEW_H;
  const MAX_LAT = 85.05112878;
  const TILE_SIZE = 256;
  const TILE_ORIGIN = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium';
  const tiles = new Map();
  const pathsByGrid = new WeakMap();

  function validPoint(point) {
    return Number.isFinite(point?.lat) && Number.isFinite(point?.lon)
      && Math.abs(point.lat) <= MAX_LAT && Math.abs(point.lon) <= 180;
  }

  function project({ lat, lon }) {
    return {
      x: (lon + 180) / 360,
      y: (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2,
    };
  }

  function area(center, widthKm) {
    const { x, y } = project(center);
    const width = widthKm / (40075.0167 * Math.cos(center.lat * Math.PI / 180));
    const height = width / RATIO;
    return { left: x - width / 2, top: y - height / 2, width, height };
  }

  function pinDetails(map) {
    const bounds = area(map.center, map.widthKm);
    const x = bounds.left + map.pin.x * bounds.width;
    const y = bounds.top + map.pin.y * bounds.height;
    const lon = ((x % 1 + 1) % 1) * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;
    const col = Math.round(map.pin.x * (WIDTH - 1));
    const row = Math.round(map.pin.y * (HEIGHT - 1));
    return { lat, lon, elevation: map.grid?.[row * WIDTH + col] };
  }

  function coordinates({ lat, lon }) {
    return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}  ·  ${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`;
  }

  async function getTile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (tiles.has(key)) return tiles.get(key);
    const pending = (async () => {
      const response = await fetch(`${TILE_ORIGIN}/${key}.png`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('地形瓦片暂不可用');
      const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none' });
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = TILE_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
      } finally {
        bitmap.close();
      }
    })();
    tiles.set(key, pending);
    if (tiles.size > 24) tiles.delete(tiles.keys().next().value);
    try {
      return await pending;
    } catch (error) {
      if (tiles.get(key) === pending) tiles.delete(key);
      throw error;
    }
  }

  async function load(center, widthKm) {
    if (!validPoint(center)) throw new Error('请输入有效的纬度和经度');
    const bounds = area(center, widthKm);
    if (bounds.top < 0 || bounds.top + bounds.height >= 1) throw new Error('请缩小地图范围或选择更靠近赤道的中心点');
    const z = Math.max(1, Math.min(13, Math.floor(Math.log2(2 / bounds.width))));
    const count = 2 ** z;
    const worldPixels = count * TILE_SIZE;
    const left = Math.floor(bounds.left * count);
    const right = Math.floor((bounds.left + bounds.width) * count);
    const top = Math.floor(bounds.top * count);
    const bottom = Math.floor((bounds.top + bounds.height) * count);
    const localTiles = new Map();
    const requests = [];
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const wrappedX = (x % count + count) % count;
        requests.push(getTile(z, wrappedX, y).then(data => localTiles.set(`${x}/${y}`, data)));
      }
    }
    await Promise.all(requests);
    const grid = new Int16Array(WIDTH * HEIGHT);
    for (let row = 0; row < HEIGHT; row++) {
      const y = Math.floor((bounds.top + row / (HEIGHT - 1) * bounds.height) * worldPixels);
      for (let col = 0; col < WIDTH; col++) {
        const x = Math.floor((bounds.left + col / (WIDTH - 1) * bounds.width) * worldPixels);
        const tileX = Math.floor(x / TILE_SIZE);
        const tileY = Math.floor(y / TILE_SIZE);
        const data = localTiles.get(`${tileX}/${tileY}`);
        const i = ((y - tileY * TILE_SIZE) * TILE_SIZE + x - tileX * TILE_SIZE) * 4;
        grid[row * WIDTH + col] = data[i] * 256 + data[i + 1] - 32768;
      }
    }
    return grid;
  }

  async function demo() {
    const response = await fetch('./assets/maps/val-di-funes.json');
    if (!response.ok) throw new Error('无法载入内置样例');
    const { samples, ...info } = await response.json();
    const bytes = Uint8Array.from(atob(samples), ch => ch.charCodeAt(0));
    if (bytes.length !== WIDTH * HEIGHT * 2) throw new Error('内置地形数据不完整');
    const data = new DataView(bytes.buffer);
    const grid = Int16Array.from({ length: WIDTH * HEIGHT }, (_, i) => data.getInt16(i * 2, true));
    return { ...info, grid };
  }

  function niceDistance(value) {
    const power = 10 ** Math.floor(Math.log10(value));
    const digit = value / power;
    return power * (digit >= 5 ? 5 : digit >= 2 ? 2 : 1);
  }

  function contourPaths(grid) {
    const cached = pathsByGrid.get(grid);
    if (cached) return cached;
    const bands = Array.from({ length: 12 }, () => [new Path2D(), new Path2D()]);
    const step = Math.max(10, niceDistance((Math.max(...grid) - Math.min(...grid)) / 20 || 1));
    const dx = VIEW_W / (WIDTH - 1);
    const dy = VIEW_H / (HEIGHT - 1);
    for (let row = 0; row < HEIGHT - 1; row++) {
      for (let col = 0; col < WIDTH - 1; col++) {
        const i = row * WIDTH + col;
        const corners = [grid[i], grid[i + 1], grid[i + WIDTH + 1], grid[i + WIDTH]];
        const low = Math.min(...corners);
        const high = Math.max(...corners);
        const x = col * dx;
        const y = row * dy;
        const positions = [[x, y], [x + dx, y], [x + dx, y + dy], [x, y + dy]];
        for (let level = (Math.floor(low / step) + 1) * step; level <= high; level += step) {
          const cuts = [];
          for (let edge = 0; edge < 4; edge++) {
            const next = (edge + 1) % 4;
            const a = corners[edge];
            const b = corners[next];
            if ((a >= level) === (b >= level)) continue;
            const t = (level - a) / (b - a);
            cuts.push(positions[edge].map((value, axis) => value + t * (positions[next][axis] - value)));
          }
          if (cuts.length === 4) {
            const centerHigh = corners.reduce((sum, v) => sum + v, 0) / 4 >= level;
            if (centerHigh !== (corners[0] >= level)) cuts.push(cuts.shift());
          }
          for (let j = 0; j < cuts.length; j += 2) {
            const [start, end] = [cuts[j], cuts[j + 1]];
            const band = Math.min(bands.length - 1, Math.floor((start[1] + end[1]) / 2 / VIEW_H * bands.length));
            const path = bands[band][Number(level % (step * 5) === 0)];
            path.moveTo(...start);
            path.lineTo(...end);
          }
        }
      }
    }
    pathsByGrid.set(grid, bands);
    return bands;
  }

  function text(ctx, value, x, y, maxWidth) {
    ctx.strokeText(value, x, y, maxWidth);
    ctx.fillText(value, x, y, maxWidth);
  }

  function inkMode(map) {
    if (map.ink === 'light' || map.ink === 'dark') return map.ink;
    if (map.background !== 'solid' || !/^#[\da-f]{6}$/i.test(map.backgroundColor)) return 'light';
    const rgb = [1, 3, 5].map(i => parseInt(map.backgroundColor.slice(i, i + 2), 16));
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > 150 ? 'dark' : 'light';
  }

  function drawContours(ctx, map, ink, opacity) {
    contourPaths(map.grid).forEach(([minor, major], band, bands) => {
      const lower = Math.max(0, ((band + .5) / bands.length - .30) / .70);
      ctx.globalAlpha = opacity * (1 - map.fade * lower);
      ctx.strokeStyle = `rgba(${ink.rgb},.50)`;
      ctx.lineWidth = .75;
      ctx.stroke(minor);
      ctx.strokeStyle = `rgba(${ink.rgb},.80)`;
      ctx.lineWidth = 1.25;
      ctx.stroke(major);
    });
  }

  function draw(ctx, map, width) {
    ctx.save();
    const opacity = ctx.globalAlpha;
    const scale = width / VIEW_W;
    ctx.scale(scale, scale);
    ctx.translate(-VIEW_W / 2, -VIEW_H / 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const ink = inkMode(map) === 'dark'
      ? { rgb: '31,48,56', text: '#21343d', outline: 'rgba(250,246,231,.92)' }
      : { rgb: '255,246,223', text: '#fff5df', outline: 'rgba(26,29,31,.82)' };
    if (map.background === 'solid') {
      ctx.globalAlpha = opacity * (map.backgroundOpacity ?? .88);
      ctx.fillStyle = map.backgroundColor || '#263842';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = opacity;
    }
    if (map.mode === 'city') CityMap.draw(ctx, map.city, VIEW_W, VIEW_H, map.fade, ink, map.pin, map.label);
    else drawContours(ctx, map, ink, opacity);

    ctx.globalAlpha = opacity;
    ctx.fillStyle = ink.text;
    ctx.strokeStyle = ink.outline;
    ctx.lineWidth = 2.2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '600 30px Georgia, serif';
    text(ctx, map.label, 14, 11, 510);
    const point = pinDetails(map);
    ctx.font = '15px system-ui, sans-serif';
    if (map.showCoordinates) text(ctx, coordinates(point), 15, 51, 495);
    if (map.showElevation && Number.isFinite(point.elevation)) text(ctx, `≈ ${point.elevation.toLocaleString('en-US')} m`, 15, map.showCoordinates ? 73 : 51, 200);

    const pinX = map.pin.x * VIEW_W;
    const pinY = map.pin.y * VIEW_H;
    ctx.beginPath();
    ctx.arc(pinX, pinY, 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#e34636';
    ctx.strokeStyle = '#fff5df';
    ctx.lineWidth = 1.7;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = ink.text;
    ctx.strokeStyle = ink.outline;
    ctx.lineWidth = 2.2;
    ctx.font = '14px system-ui, sans-serif';
    if (map.showNorth) {
      text(ctx, 'N', VIEW_W - 24, 10, 15);
      ctx.beginPath();
      ctx.moveTo(VIEW_W - 19, 28);
      ctx.lineTo(VIEW_W - 25, 49);
      ctx.lineTo(VIEW_W - 19, 45);
      ctx.lineTo(VIEW_W - 13, 49);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }
    if (map.showScale) {
      const km = niceDistance(map.widthKm / 5);
      const end = 15 + km / map.widthKm * VIEW_W;
      ctx.beginPath();
      ctx.moveTo(15, VIEW_H - 34);
      ctx.lineTo(15, VIEW_H - 28);
      ctx.lineTo(end, VIEW_H - 28);
      ctx.lineTo(end, VIEW_H - 34);
      ctx.stroke();
      ctx.strokeStyle = ink.text;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = ink.outline;
      text(ctx, `${km} km`, 15, VIEW_H - 24, 100);
    }
    ctx.globalAlpha = 1;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    const { lat, lon } = map.center;
    const european = lat >= 34 && lat <= 72 && lon >= -25 && lon <= 45;
    const terrainCredit = european ? 'Terrain · Mapzen / Copernicus EU-DEM / USGS' : 'Terrain · Mapzen / USGS · mapzen.com/rights';
    if (map.mode === 'city') {
      text(ctx, '© OpenMapTiles · © OpenStreetMap contributors', VIEW_W - 10, VIEW_H - 21, 410);
    } else {
      if (map.geocoded) text(ctx, '© OpenStreetMap contributors', VIEW_W - 10, VIEW_H - 35, 410);
      text(ctx, terrainCredit, VIEW_W - 10, VIEW_H - 21, 410);
    }
    ctx.restore();
  }

  return { RATIO, validPoint, area, load, demo, draw, pinDetails, coordinates, inkMode };
})();
