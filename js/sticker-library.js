/** PhotoFrame 内置贴图库：全部为可离线缩放的原创 SVG。 */
window.StickerLibrary = (() => {
  const data = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const wrap = (body, w = 180, h = 120) => data(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`);
  const canister = (id, name, bg, fg, accent, iso, sub = '36 EXP') => ({
    id, name, category: 'film', tags: `${name} 胶片 暗盒 35mm ${iso}`, ratio: 1.18,
    src: wrap(`<defs><filter id="s"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity=".28"/></filter></defs><g filter="url(#s)"><ellipse cx="90" cy="18" rx="58" ry="13" fill="#252525"/><rect x="32" y="18" width="116" height="82" rx="11" fill="#252525"/><rect x="39" y="27" width="102" height="62" rx="5" fill="${bg}"/><path d="M39 68h102v21H39z" fill="${accent}"/><text x="90" y="48" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="${fg}">${name}</text><text x="90" y="65" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="900" fill="${fg}">${iso}</text><text x="90" y="83" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="${fg}">${sub}</text><rect x="75" y="4" width="30" height="13" rx="3" fill="#b8b8b8"/><path d="M80 4v13m8-13v13m8-13v13" stroke="#666"/></g>`, 180, 120),
  });
  const box = (id, name, bg, fg, accent, iso) => ({ id, name, category:'film-box', tags:`${name} 胶片 包装 盒 ${iso}`, ratio:1.42,
    src:wrap(`<defs><filter id="s"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity=".22"/></filter></defs><g filter="url(#s)"><rect x="18" y="16" width="164" height="110" rx="7" fill="${bg}"/><path d="M18 16h164v25H18z" fill="${accent}"/><text x="30" y="33" font-family="Arial" font-size="12" font-weight="800" fill="${fg}">${name}</text><text x="30" y="86" font-family="Arial" font-size="38" font-weight="900" fill="${fg}">${iso}</text><text x="31" y="108" font-family="Arial" font-size="9" fill="${fg}">COLOR / 35mm / 36 EXP</text><circle cx="157" cy="83" r="18" fill="none" stroke="${fg}" stroke-width="4"/></g>`,200,142) });
  const label = (id,name,category,bg,fg,text,ratio=2.2) => ({ id,name,category,tags:`${name} ${category} 贴纸`,ratio,
    src:wrap(`<defs><filter id="s"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity=".18"/></filter></defs><g filter="url(#s)"><rect x="8" y="12" width="204" height="72" rx="12" fill="${bg}"/><rect x="16" y="20" width="188" height="56" rx="8" fill="none" stroke="${fg}" stroke-width="2" stroke-dasharray="5 4"/><text x="110" y="56" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="20" fill="${fg}">${text}</text></g>`,220,100) });
  const icon = (id,name,category,body,ratio=1) => ({id,name,category,tags:`${name} ${category} 装饰`,ratio,src:wrap(body,120,120)});
  const builtIns = [
    canister('film-portra400','PORTRA','#e8a65f','#24180e','#f4d68a','400'), canister('film-gold200','GOLD','#f5c400','#151515','#e32828','200'),
    canister('film-ultramax400','ULTRAMAX','#f3d000','#161616','#da2d2d','400'), canister('film-fuji100','FUJICOLOR','#f5f5ef','#145b39','#159455','100'),
    canister('film-fuji400','FUJIFILM','#0a7f45','#fff','#ed1b2e','400'), canister('film-superia400','SUPERIA','#096d42','#fff','#263b93','X-TRA 400'),
    canister('film-hp5','ILFORD HP5','#efefeb','#111','#3d3d3d','400','B&W / 36 EXP'), canister('film-delta100','DELTA','#f6f6f3','#111','#b41f2b','100','PROFESSIONAL'),
    canister('film-800t','CINESTILL','#be2732','#fff','#1b2f55','800T','TUNGSTEN / C-41'), canister('film-lomo400','LOMO CN','#111','#f5db48','#e64075','400','COLOR NEGATIVE'),
    box('box-portra','PORTRA','#f1b268','#25170d','#27231d','400'), box('box-fuji','FUJICOLOR','#f2f4e9','#07552e','#078246','100'),
    box('box-hp5','ILFORD HP5 PLUS','#efefeb','#111','#242424','400'), box('box-cinestill','CINESTILL','#a51f31','#fff','#15263f','800T'),
    label('mark-shot-film','SHOT ON FILM','marks','#161616','#f2e8d2','SHOT ON FILM'), label('mark-35mm','35MM / 36 EXP','marks','#f3e2b8','#252018','35MM · 36 EXP'),
    label('mark-date','日期印章','marks','#b42a23','#fff','2026 · 11 · 02'), label('mark-contact','CONTACT SHEET','marks','#f5f2e9','#222','CONTACT SHEET'),
    label('tape-kraft','牛皮胶带','tape','#d1aa70','#5b442a','FILM NOTES',3.1), label('tape-grid','网格胶带','tape','#d9e5df','#426056','PHOTO CLUB',3.1),
    label('tape-black','黑色胶带','tape','#1e1e1e','#eee','ARCHIVE',3.1), label('tape-pink','粉色胶带','tape','#efb5bd','#6e3540','MEMORIES',3.1),
    icon('travel-pin','地点标记','travel','<path d="M60 10c-22 0-38 16-38 37 0 29 38 63 38 63s38-34 38-63c0-21-16-37-38-37Z" fill="#e84f43"/><circle cx="60" cy="47" r="14" fill="#fff"/>'),
    icon('travel-plane','旅行飞机','travel','<path d="m12 67 39-10 28-43 11 3-15 43 29 16-4 9-35-7-20 28-8-3 9-31-31 5Z" fill="#2b6f9d"/>'),
    icon('shape-heart','爱心','shapes','<path d="M60 105S13 77 13 42c0-29 35-39 47-15 12-24 47-14 47 15 0 35-47 63-47 63Z" fill="#e95768"/>'),
    icon('shape-sparkle','闪光','shapes','<path d="M60 5c6 31 16 43 50 55-34 12-44 24-50 55-6-31-16-43-50-55C44 48 54 36 60 5Z" fill="#f2c84b"/><circle cx="95" cy="25" r="8" fill="#f2c84b"/>'),
    icon('shape-star','星形','shapes','<path d="m60 7 16 33 37 5-27 26 7 37-33-18-33 18 7-37L7 45l37-5Z" fill="#5c8cc8"/>'),
    icon('shape-arrow','手绘箭头','shapes','<path d="M13 81c25-42 53-53 88-32M78 29l25 20-29 12" fill="none" stroke="#222" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'),
  ];
  const categories = [
    {id:'all',name:'全部'},{id:'film',name:'胶片暗盒'},{id:'film-box',name:'胶片包装'},
    {id:'marks',name:'摄影标记'},{id:'tape',name:'胶带'},{id:'travel',name:'旅行'},{id:'shapes',name:'图形'},{id:'custom',name:'我的贴图'},
  ];
  return { builtIns, categories };
})();
