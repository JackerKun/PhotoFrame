/** Film scan-style borders, drawn at the same scale as the photograph. */
window.FilmFrame = (() => {
  const styles = {
    dark: { base: '#20201f', ink: '#d19a64', marks: '#a47752', holes: '#54504a' },
    light: { base: '#dedbd4', ink: '#353431', marks: '#848078', holes: '#aaa69d' },
    cinema: { base: '#171a1e', ink: '#f1eee4', marks: '#e48254', holes: '#474a50' },
  };

  function defaults(stockId, format) {
    return {
      stockId, format, style: 'dark', frame: '01',
      edgeA: '{stock}   ▸   {frame}',
      edgeB: '{format}   {camera}   {lens}   {aperture}   {shutter}   {iso}   {date}',
    };
  }

  function padding(film, short, portrait) {
    const rail = Math.round(short * (film.format === '135' ? .13 : .09));
    const end = Math.round(short * .024);
    return portrait
      ? { top: end, bottom: end, left: rail, right: rail }
      : { top: rail, bottom: rail, left: end, right: end };
  }

  function draw(ctx, layout, film, resolveEdge, paintBackground) {
    const { canvasW, canvasH, bTop, bBottom, bLeft, bRight, shorter, filmPortrait: portrait } = layout;
    const palette = Object.hasOwn(styles, film.style) ? styles[film.style] : styles.dark;
    const perforated = film.format === '135';
    const length = portrait ? canvasH : canvasW;
    const cross = portrait ? canvasW : canvasH;
    const firstRail = portrait ? bRight : bTop;
    const secondRail = portrait ? bLeft : bBottom;
    const fontSize = Math.max(1, shorter * (perforated ? .026 : .030));
    const inset = shorter * .032;

    paintBackground(ctx, canvasW, canvasH, {
      color: palette.base, backgroundMode: 'grain', textureOpacity: film.style === 'light' ? .34 : .25,
    });
    ctx.save();
    if (portrait) {
      ctx.translate(canvasW, 0);
      ctx.rotate(Math.PI / 2);
    }

    function rail(start, width, label, first) {
      if (width <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, start, length, width);
      ctx.clip();

      const far = start + width;
      const textY = start + width * (perforated ? (first ? .25 : .75) : .5);
      const marksY = start + width * (first ? .68 : .32);
      if (perforated) {
        const pitch = shorter * .10;
        const holeW = shorter * .043;
        const holeH = Math.min(width * .36, shorter * .053);
        ctx.fillStyle = palette.holes;
        ctx.beginPath();
        for (let x = pitch / 2; x < length; x += pitch) {
          ctx.roundRect(x - holeW / 2, marksY - holeH / 2, holeW, holeH, holeW * .23);
        }
        ctx.fill();
      } else {
        // Medium-format roll film has continuous edges with printed markings.
        ctx.fillStyle = palette.marks;
        ctx.globalAlpha = .48;
        const ruleY = first ? far - width * .18 : start + width * .18;
        ctx.fillRect(0, ruleY, length, Math.max(1, shorter * .001));
        for (let i = 0; i < 16; i++) {
          const bar = shorter * (i % 3 === 0 ? .004 : .0015);
          ctx.fillRect(length - inset - i * shorter * .006, textY - fontSize * .38, bar, fontSize * .76);
        }
        ctx.globalAlpha = 1;
      }

      const text = resolveEdge(label);
      if (text) {
        ctx.font = `600 ${fontSize}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.fillStyle = palette.ink;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, inset, textY, Math.max(1, length - inset * (perforated ? 2 : 6)));
      }
      if (film.style === 'cinema' && first) {
        ctx.fillStyle = palette.marks;
        ctx.beginPath();
        ctx.arc(length - inset / 2, textY, fontSize * .14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    rail(0, firstRail, film.edgeA, true);
    rail(cross - secondRail, secondRail, film.edgeB, false);
    ctx.restore();
  }

  return { defaults, padding, draw };
})();
