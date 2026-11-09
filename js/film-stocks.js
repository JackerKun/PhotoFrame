/**
 * Reference catalog of still and cinema stocks. Formats describe known
 * editions, including archival ones, rather than live retail availability.
 */
window.FilmStocks = (() => {
  const both = ['135', '120'];
  const mm35 = ['135'];
  const medium = ['120'];
  const types = {
    color: '彩色负片',
    bw: '黑白负片',
    slide: '彩色反转片',
    'bw-slide': '黑白反转片',
    cinema: '电影负片',
  };
  const stocks = [];

  function add(brand, aliases, type, entries) {
    for (const [model, formats, keywords = ''] of entries) {
      const name = `${brand} ${model}`;
      stocks.push({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, ''),
        name, type, formats, aliases: `${aliases} ${keywords}`,
      });
    }
  }

  // Kodak Professional film catalogue and Kodak Motion Picture film stocks.
  add('Kodak', '柯达', 'color', [
    ['Portra 400', both, '炮塔400'], ['Portra 160', both], ['Portra 800', both],
    ['Ektar 100', both, '艾克塔'], ['Gold 200', both, '金胶卷'], ['UltraMax 400', mm35],
    ['ColorPlus 200', mm35], ['Pro Image 100', mm35], ['Gold 100', mm35, '经典 停产'],
    ['Kodacolor 100', mm35], ['Kodacolor 200', mm35],
    ['Ektacolor Pro 160', both], ['Ektacolor Pro 400', both], ['Ektacolor Pro 800', both],
  ]);
  add('Kodak', '柯达', 'bw', [
    ['Tri-X 400', both, 'TX 400TX'], ['T-Max 100', both, 'TMX'],
    ['T-Max 400', both, 'TMY'], ['T-Max P3200', mm35, 'TMZ 3200'],
    ['Ektapan 100', both], ['Ektapan 400', both], ['Ektapan P3200', mm35],
    ['BW400CN', mm35, 'C41 C-41 经典 停产'],
  ]);
  add('Kodak', '柯达', 'slide', [
    ['Ektachrome E100', both, 'E6 E-6 伊士曼'], ['Ektachrome E100VS', both, '经典 停产'],
    ['Kodachrome 64', both, 'K-14 经典 停产'],
    ['Ektachrome 100D 5294', mm35, '电影卷 E6 E-6'],
  ]);
  add('Kodak', '柯达 电影卷 ECN-2', 'cinema', [
    ['Vision3 50D 5203', mm35], ['Vision3 200T 5213', mm35],
    ['Vision3 250D 5207', mm35], ['Vision3 500T 5219', mm35], ['Verita 200D 5206', mm35],
  ]);
  add('Kodak', '柯达 电影卷 伊士曼', 'bw', [['Eastman Double-X 5222', mm35, 'XX Double X']]);

  // Fujifilm's photographic film and professional data guides.
  add('Fujifilm', '富士 Fuji Fujicolor', 'color', [
    ['Fujicolor 100', mm35], ['Fujicolor 200', mm35, 'C200'], ['400', mm35],
    ['Superia X-TRA 400', mm35, 'Superia 经典'], ['Superia Premium 400', mm35],
    ['Pro 400H', both, 'NPH 经典 停产'], ['Pro 160NS', medium, '经典 停产'],
    ['Natura 1600', mm35, '纳秋拉 经典 停产'], ['Superia Reala 100', both, '瑞拉 经典 停产'],
    ['Pro 160S', both, '经典 停产'], ['Pro 160C', both, '经典 停产'], ['Pro 800Z', both, '经典 停产'],
  ]);
  add('Fujifilm', '富士 Fuji Fujichrome E6 E-6', 'slide', [
    ['Provia 100F', both, 'RDP III 普罗维亚'], ['Velvia 50', both, 'RVP 维尔维亚'],
    ['Velvia 100', both, 'RVP100'], ['Velvia 100F', both, 'RVP100F 经典 停产'],
    ['Astia 100F', both, 'RAP 经典 停产'], ['Provia 400X', both, 'RXP 经典 停产'],
  ]);
  add('Fujifilm', '富士 Fuji Neopan', 'bw', [['Acros II 100', both, 'Acros 100 II']]);

  // ILFORD PHOTO / HARMAN availability list and product catalogues.
  add('Ilford', '伊尔福 伊尔福德', 'bw', [
    ['HP5 Plus 400', both, 'HP5+ HP5PLUS'], ['FP4 Plus 125', both, 'FP4+ FP4PLUS'],
    ['Pan F Plus 50', both, 'PANF+'], ['Delta 100', both], ['Delta 400', both],
    ['Delta 3200', both], ['XP2 Super 400', both, 'C41 C-41'],
    ['SFX 200', both], ['Ortho Plus 80', both], ['Pan 100', mm35], ['Pan 400', mm35],
  ]);
  add('Kentmere', '肯特米尔 Harman', 'bw', [
    ['Pan 100', both], ['Pan 200', both], ['Pan 400', both],
  ]);
  add('Harman', '哈曼', 'color', [
    ['Phoenix 200', both, '凤凰'], ['Phoenix II 200', both, '凤凰二代 Phoenix 2'],
    ['Red 125', both, '红调 Redscale'], ['Switch Azure 125', both],
  ]);
  add('CineStill', '电影卷 C41 C-41', 'color', [
    ['50D', both, '50Daylight'], ['400D', both, '400Dynamic'], ['800T', both, '800Tungsten'],
  ]);
  add('CineStill', '', 'bw', [['BwXX', both, 'Double X Double-X']]);

  // Foma, Rollei and ADOX product sheets.
  add('Foma', '福马', 'bw', [
    ['Fomapan 100 Classic', both, 'ULTRA 100'], ['Fomapan 200 Creative', both],
    ['Fomapan 400 Action', both], ['Retropan 320 Soft', both], ['Ortho 400', both],
  ]);
  add('Foma', '福马', 'bw-slide', [['Fomapan R100', mm35, 'R 100']]);
  add('Rollei', '禄来', 'bw', [
    ['RPX 25', both], ['RPX 100', both], ['RPX 400', both], ['Retro 80S', both],
    ['Retro 400S', both], ['Superpan 200', both], ['Ortho 25 Plus', both],
    ['Infrared 400', both, '红外'], ['Blackbird', mm35],
  ]);
  add('Adox', '阿多克斯', 'bw', [
    ['CHS 100 II', both], ['HR-50', both], ['CMS 20 II', both], ['CHM 400', both],
  ]);
  add('Adox', '阿多克斯', 'bw-slide', [['Scala 50', mm35], ['Scala 160', mm35]]);
  add('Adox', '阿多克斯', 'color', [['Color Mission 200', mm35]]);
  add('AgfaPhoto', '爱克发 Agfa', 'color', [['Vista Plus 200', mm35, '经典 停产'], ['Vista Plus 400', mm35, '经典 停产']]);
  add('AgfaPhoto', '爱克发 Agfa', 'bw', [['APX 100', mm35], ['APX 400', mm35]]);
  add('Agfa', '爱克发', 'bw-slide', [['Scala 200x', both, '黑白反转 经典 停产']]);

  // Lomography film catalogue, Shanghai Jiancheng and specialist lines.
  add('Lomography', '乐魔 Lomo', 'color', [
    ['Color Negative 100', both], ['Color Negative 400', both], ['Color Negative 800', both],
    ['LomoChrome Purple', both, '紫调'], ['LomoChrome Turquoise', both, '绿松石'],
    ['LomoChrome Metropolis', both, '大都会'], ["LomoChrome Color '92", both, 'Color 92'],
    ["LomoChrome Color '92 Sun-kissed", both, 'Color 92'], ['LomoChrome Classicolor 200', both], ['Redscale XR', both, '红调'],
  ]);
  add('Lomography', '乐魔 Lomo', 'bw', [
    ['Earl Grey 100', both], ['Lady Grey 400', both], ['Potsdam Kino 100', both],
    ['Berlin Kino 400', both], ['Fantôme Kino 8', mm35], ['Babylon Kino 13', mm35],
  ]);
  add('Lomography', '乐魔 Lomo E6 E-6', 'slide', [['X-Pro Slide 200', mm35, '经典']]);
  add('Shanghai', '上海 申贝', 'bw', [['GP3 100', both], ['GP3 400', mm35]]);
  add('Shanghai', '上海 申贝', 'color', [['GP3 Color 400', mm35]]);
  add('Lucky', '乐凯', 'bw', [['SHD 100', both], ['SHD 400', mm35]]);
  add('Lucky', '乐凯', 'color', [['Color 200', both]]);
  add('Ferrania', '费拉尼亚 FILM Ferrania', 'bw', [
    ['P30', both], ['P33', mm35], ['Orto 50', mm35],
  ]);
  add('ORWO', '沃尔芬 Original Wolfen', 'color', [['NC400', mm35], ['NC500', mm35]]);
  add('ORWO', '沃尔芬 Original Wolfen', 'bw', [['UN54', mm35], ['N74 Plus', mm35], ['NP100', mm35], ['P400', mm35], ['PF2', mm35]]);

  const byId = new Map(stocks.map(stock => [stock.id, stock]));
  const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[\s+'’.–-]/g, '');
  const searchIndex = new Map(stocks.map(stock => {
    const formats = stock.formats.join(' / ') + (stock.formats.includes('135') ? ' 35mm' : '');
    return [stock.id, normalize(`${stock.name} ${stock.aliases} ${types[stock.type]} ${formats}`)];
  }));

  function search(query, format = '', type = '') {
    const terms = query.normalize('NFKC').split(/\s+/).map(normalize).filter(Boolean);
    return stocks.filter(stock => (!format || stock.formats.includes(format))
      && (!type || stock.type === type)
      && terms.every(term => searchIndex.get(stock.id).includes(term)));
  }

  return { stocks, types, search, get: id => byId.get(id) };
})();
