/** PhotoFrame 内置贴图库：全部为可离线缩放的原创 SVG。 */
window.StickerLibrary = (() => {
  const data = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const svg = (body,w=180,h=120) => data(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`);
  const safe = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const shadow = '<defs><filter id="s"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity=".24"/></filter></defs>';
  const palettes = {
    portra:['#e7a25d','#28190e','#f2d27e'], kodak:['#f0cc18','#171717','#df3030'], red:['#bd2a34','#fff','#f0c344'],
    blue:['#24538f','#fff','#182a4a'], fuji:['#0c8049','#fff','#ed2430'], bw:['#efefeb','#111','#555'],
    cine:['#b82733','#fff','#1a2f55'], lomo:['#222','#f5db48','#e64075'], orange:['#e8662c','#fff','#422561'],
  };
  const parse = row => row.split('|');
  const canister = row => { const [id,name,iso,p='bw',sub='36 EXP'] = parse(row), [bg,fg,accent]=palettes[p]; return {
    id:`135-${id}`,name:`${name} ${iso}`,category:'film-135',tags:`${name} ${iso} 135 35mm 胶片 暗盒`,ratio:1.5,
    src:svg(`${shadow}<g filter="url(#s)"><ellipse cx="90" cy="17" rx="54" ry="12" fill="#242424"/><rect x="36" y="17" width="108" height="80" rx="11" fill="#242424"/><rect x="42" y="26" width="96" height="58" rx="5" fill="${bg}"/><path d="M42 67h96v17H42z" fill="${accent}"/><text x="90" y="47" text-anchor="middle" font-family="Arial" font-size="13" font-weight="800" fill="${fg}">${safe(name)}</text><text x="90" y="64" text-anchor="middle" font-family="Arial" font-size="19" font-weight="900" fill="${fg}">${safe(iso)}</text><text x="90" y="79" text-anchor="middle" font-family="Arial" font-size="7" font-weight="700" fill="${fg}">${safe(sub)}</text><rect x="76" y="4" width="28" height="12" rx="3" fill="#bbb"/><path d="M81 4v12m8-12v12m8-12v12" stroke="#666"/></g>`),
  }};
  const roll120 = row => { const [id,name,iso,p='bw',sub='120 ROLL FILM'] = parse(row), [bg,fg,accent]=palettes[p]; return {
    id:`120-${id}`,name:`${name} ${iso}`,category:'film-120',tags:`${name} ${iso} 120 中画幅 胶卷 贴纸`,ratio:1.55,
    src:svg(`${shadow}<g filter="url(#s)" transform="rotate(-2 110 70)"><rect x="11" y="18" width="198" height="104" rx="12" fill="#f8f4e9"/><path d="M11 32h198M11 108h198" stroke="#2b2926" stroke-width="2" stroke-dasharray="5 4"/><rect x="22" y="39" width="176" height="62" rx="4" fill="${bg}"/><path d="M22 82h176v19H22z" fill="${accent}"/><text x="34" y="59" font-family="Arial" font-size="14" font-weight="900" fill="${fg}">${safe(name)}</text><text x="34" y="80" font-family="Arial" font-size="24" font-weight="900" fill="${fg}">${safe(iso)}</text><text x="194" y="79" text-anchor="end" font-family="Arial" font-size="9" font-weight="800" fill="${fg}">120</text><text x="194" y="95" text-anchor="end" font-family="Arial" font-size="7" fill="${fg}">${safe(sub)}</text></g>`,220,142),
  }};
  const label = row => { const [id,name,category,bg,fg,text] = parse(row); return {id,name,category,tags:`${name} ${category} 摄影 贴纸`,ratio:2.2,src:svg(`${shadow}<g filter="url(#s)"><rect x="8" y="12" width="204" height="72" rx="12" fill="${bg}"/><rect x="16" y="20" width="188" height="56" rx="8" fill="none" stroke="${fg}" stroke-width="2" stroke-dasharray="5 4"/><text x="110" y="56" text-anchor="middle" font-family="Arial" font-weight="800" font-size="18" fill="${fg}">${safe(text)}</text></g>`,220,100)}};
  const icon = (id,name,category,body) => ({id,name,category,tags:`${name} ${category} 图标 贴纸`,ratio:1,src:svg(body)});

  function cameraShape(type,accent) {
    const lens='<circle cx="61" cy="66" r="25" fill="#202124"/><circle cx="61" cy="66" r="15" fill="#77808a"/><circle cx="61" cy="66" r="8" fill="#202a35"/><circle cx="55" cy="60" r="3" fill="#d9f0ff" opacity=".7"/>';
    if(type==='tlr') return `<rect x="31" y="9" width="60" height="101" rx="10" fill="#292929"/><rect x="37" y="17" width="48" height="85" rx="5" fill="${accent}" opacity=".34"/><circle cx="61" cy="42" r="18" fill="#111"/><circle cx="61" cy="42" r="10" fill="#7c858d"/><circle cx="61" cy="79" r="19" fill="#111"/><circle cx="61" cy="79" r="11" fill="#7c858d"/>`;
    if(type==='medium') return `<path d="M29 29h64l11 18v55H18V47z" fill="#292929"/><path d="m37 29 8-17h32l8 17" fill="#444"/><rect x="26" y="38" width="70" height="14" rx="3" fill="${accent}" opacity=".45"/>${lens}`;
    if(type==='folding') return `<rect x="8" y="31" width="34" height="66" rx="7" fill="#292929"/><path d="m41 39 43 8v40l-43 8z" fill="#444"/><path d="m46 44 32 8m-32 6 32 5m-32 8 32-2m-32 14 32-8" stroke="${accent}" stroke-width="3"/><circle cx="93" cy="67" r="20" fill="#222"/><circle cx="93" cy="67" r="11" fill="#78818a"/>`;
    if(type==='pano') return `<rect x="5" y="38" width="110" height="57" rx="10" fill="#292929"/><rect x="12" y="47" width="28" height="12" rx="3" fill="${accent}" opacity=".55"/><circle cx="72" cy="67" r="24" fill="#171717"/><circle cx="72" cy="67" r="14" fill="#76818b"/>`;
    if(type==='compact') return `<rect x="12" y="36" width="96" height="62" rx="17" fill="#292929"/><rect x="22" y="43" width="25" height="13" rx="4" fill="${accent}" opacity=".5"/><circle cx="70" cy="68" r="25" fill="#1c1c1c"/><circle cx="70" cy="68" r="14" fill="#7d8790"/>`;
    if(type==='instant') return `<path d="M23 15h74l12 87H11z" fill="#ece8df"/><rect x="34" y="27" width="52" height="27" rx="5" fill="#292929"/><circle cx="60" cy="68" r="22" fill="#242424"/><circle cx="60" cy="68" r="12" fill="#75808b"/><path d="M22 91h76" stroke="${accent}" stroke-width="8"/>`;
    if(type==='toy') return `<rect x="15" y="27" width="90" height="75" rx="8" fill="${accent}"/><rect x="23" y="36" width="74" height="15" rx="4" fill="#292929"/>${lens}`;
    if(type==='rangefinder') return `<rect x="9" y="35" width="102" height="65" rx="8" fill="#292929"/><path d="M14 43h92v16H14z" fill="${accent}" opacity=".48"/><rect x="20" y="25" width="26" height="14" rx="3" fill="#292929"/><rect x="78" y="43" width="19" height="12" rx="3" fill="#b9c3ca"/>${lens}`;
    return `<path d="M12 39h28l9-17h25l10 17h24v63H12z" fill="#292929"/><path d="M18 46h84v14H18z" fill="${accent}" opacity=".45"/>${lens}`;
  }
  const camera = row => { const [id,name,type='slr',accent='#c69b55']=parse(row); return {id:`camera-${id}`,name,category:'camera',tags:`${name} 胶片相机 ${type} 图标`,ratio:1,src:svg(`${shadow}<g filter="url(#s)">${cameraShape(type,accent)}</g><rect x="8" y="105" width="104" height="14" rx="7" fill="#f6f1e7"/><text x="60" y="115" text-anchor="middle" font-family="Arial" font-size="7" font-weight="800" fill="#282725">${safe(name)}</text>`)}};

  const film135 = [
    'portra160|PORTRA|160|portra','portra400|PORTRA|400|portra','portra800|PORTRA|800|portra','gold200|GOLD|200|kodak','ultramax400|ULTRAMAX|400|kodak','ektar100|EKTAR|100|red','ektachrome|EKTACHROME|E100|blue|E-6','proimage100|PRO IMAGE|100|kodak','trix400|TRI-X|400TX|kodak|B&W','tmax100|T-MAX|100|bw|B&W','tmax400|T-MAX|400|bw|B&W','fuji100|FUJICOLOR|100|fuji','fuji200|C200|200|fuji','fuji400|FUJIFILM|400|fuji','superia400|SUPERIA|X-TRA 400|fuji','acros100|ACROS II|100|bw|B&W','velvia50|VELVIA|50|red|E-6','provia100|PROVIA|100F|blue|E-6','hp5|ILFORD HP5|400|bw|B&W','fp4|ILFORD FP4|125|bw|B&W','delta100|DELTA|100|bw|B&W','delta400|DELTA|400|bw|B&W','kentmere400|KENTMERE|400|bw|B&W','cinestill800|CINESTILL|800T|cine|C-41','cinestill400|CINESTILL|400D|blue|C-41','lomo400|LOMO CN|400|lomo','phoenix200|PHOENIX|200|orange',
  ].map(canister);
  const film120 = [
    'portra160|PORTRA|160|portra','portra400|PORTRA|400|portra','portra800|PORTRA|800|portra','gold200|GOLD|200|kodak','ektar100|EKTAR|100|red','ektachrome|EKTACHROME|E100|blue|E-6','trix400|TRI-X|400TX|kodak|B&W','tmax100|T-MAX|100|bw|B&W','tmax400|T-MAX|400|bw|B&W','velvia50|VELVIA|50|red|E-6','velvia100|VELVIA|100|red|E-6','provia100|PROVIA|100F|blue|E-6','acros100|ACROS II|100|bw|B&W','hp5|ILFORD HP5|400|bw|B&W','fp4|ILFORD FP4|125|bw|B&W','delta100|DELTA|100|bw|B&W','delta400|DELTA|400|bw|B&W','delta3200|DELTA|3200|bw|B&W','panf50|PAN F PLUS|50|bw|B&W','kentmere400|KENTMERE|400|bw|B&W','cinestill800|CINESTILL|800T|cine|C-41','cinestill400|CINESTILL|400D|blue|C-41','lomo100|LOMO CN|100|lomo','lomo400|LOMO CN|400|lomo','lomo800|LOMO CN|800|lomo','fomapan100|FOMAPAN|100|bw|B&W','phoenix200|PHOENIX|200|orange',
  ].map(roll120);
  const cameras = [
    'leica-m6|Leica M6|rangefinder|#b82424','canon-p|Canon P|rangefinder|#c8c8c3','nikon-f|Nikon F|slr|#d3c66b','canon-ae1|Canon AE-1|slr|#c9c9c4','pentax-k1000|Pentax K1000|slr|#b8b8b3','olympus-om1|Olympus OM-1|slr|#c9c9c5','minolta-x700|Minolta X-700|slr|#5f77a8','contax-t2|Contax T2|compact|#c4bca7','olympus-mju|Olympus mju|compact|#7195ad','hasselblad-500|Hasselblad 500C|medium|#c9c9c4','mamiya-rb67|Mamiya RB67|medium|#7d776e','pentax-67|Pentax 67|medium|#a8a49d','bronica-sq|Bronica SQ|medium|#7f858b','rolleiflex|Rolleiflex|tlr|#c5a661','yashica-mat|Yashica Mat|tlr|#a7a7a2','fuji-gw690|Fuji GW690|rangefinder|#68a37a','xpan|Hasselblad XPan|pano|#b9b3a8','polaroid-sx70|Polaroid SX-70|instant|#e47d3c','instax-wide|Instax Wide|instant|#61a2b8','zeiss-ikon|Zeiss Ikon|folding|#b09c76','voigtlander|Bessa Folding|folding|#9d927d','holga-120|Holga 120|toy|#e6423b','diana-f|Diana F+|toy|#58a3af','disposable|Disposable 35|toy|#f0c535',
  ].map(camera);
  const marks = [
    'mark-shot|Shot on Film|marks|#171717|#f2e8d2|SHOT ON FILM','mark-35|35mm / 36 EXP|marks|#f3e2b8|#252018|35MM · 36 EXP','mark-120|120 Roll Film|marks|#ece4d2|#24211d|120 · MEDIUM FORMAT','mark-date|日期印章|marks|#b42a23|#fff|2026 · 11 · 02','mark-contact|Contact Sheet|marks|#f5f2e9|#222|CONTACT SHEET','mark-darkroom|Darkroom|marks|#1c1c1c|#e33d36|DARKROOM PRINT','mark-lab|Photo Lab|marks|#dce7df|#27563e|PHOTO LAB · C-41','mark-archive|Archive No.|marks|#eee8d8|#342e25|ARCHIVE · NO. 025','mark-proof|Proof Print|marks|#1e4e87|#fff|PROOF PRINT','mark-exposed|Exposed|marks|#edc844|#211d16|EXPOSED · DO NOT OPEN','mark-grain|Fine Grain|marks|#e8ded1|#382f27|FINE GRAIN','mark-hand|Hand Printed|marks|#7a382d|#f5e9d6|HAND PRINTED',
  ].map(label);
  const tapes = [
    'tape-kraft|牛皮胶带|tape|#d1aa70|#5b442a|FILM NOTES','tape-grid|网格胶带|tape|#d9e5df|#426056|PHOTO CLUB','tape-black|黑色胶带|tape|#1e1e1e|#eee|ARCHIVE','tape-pink|粉色胶带|tape|#efb5bd|#6e3540|MEMORIES','tape-blue|蓝色纸胶带|tape|#9fc4d9|#274e63|TRAVEL LOG','tape-yellow|黄色纸胶带|tape|#efd66d|#5c4b18|SUNNY DAY','tape-green|绿色纸胶带|tape|#9bb99e|#29442d|FIELD NOTES','tape-red|红色纸胶带|tape|#c94c43|#fff|KEEP','tape-news|报纸胶带|tape|#ded8c8|#39352f|DAILY PHOTO','tape-clear|透明标签|tape|#edf0ea|#555|FRAME 001',
  ].map(label);
  const travel = [
    icon('travel-pin','地点标记','travel','<path d="M60 10c-22 0-38 16-38 37 0 29 38 63 38 63s38-34 38-63c0-21-16-37-38-37Z" fill="#e84f43"/><circle cx="60" cy="47" r="14" fill="#fff"/>'),
    icon('travel-plane','旅行飞机','travel','<path d="m12 67 39-10 28-43 11 3-15 43 29 16-4 9-35-7-20 28-8-3 9-31-31 5Z" fill="#2b6f9d"/>'),
    icon('travel-passport','护照','travel','<rect x="24" y="10" width="72" height="100" rx="8" fill="#355b87"/><circle cx="60" cy="54" r="18" fill="none" stroke="#e8cf83" stroke-width="4"/><path d="M42 54h36M60 36c8 10 8 26 0 36M60 36c-8 10-8 26 0 36" stroke="#e8cf83"/>'),
    icon('travel-ticket','车票','travel','<path d="M8 33h104v54H8c6-8 6-14 0-22 6-8 6-15 0-32Z" fill="#e6c77d"/><text x="64" y="66" text-anchor="middle" font-family="Arial" font-size="14" font-weight="800" fill="#725c32">TICKET</text>'),
    icon('travel-compass','指南针','travel','<circle cx="60" cy="60" r="48" fill="#e9e1ce" stroke="#3c5264" stroke-width="5"/><path d="m70 49-10 31-10-20 10-31z" fill="#d24d43"/>'),
    icon('travel-mountain','山峰','travel','<path d="m6 101 35-62 17 28 17-47 39 81Z" fill="#547a75"/><path d="m30 59 11-20 8 14m15 0 11-33 13 40" fill="#f4f0df"/>'),
    icon('travel-sun','太阳','travel','<circle cx="60" cy="60" r="25" fill="#f2c94c"/><path d="M60 5v17m0 76v17M5 60h17m76 0h17" stroke="#f2c94c" stroke-width="7"/>'),
    icon('travel-coffee','旅行咖啡','travel','<path d="M24 37h65v57H24z" fill="#b97d4f"/><path d="M89 47h12c18 0 18 30 0 30H89" fill="none" stroke="#b97d4f" stroke-width="8"/>'),
  ];
  const shapes = [
    icon('shape-heart','爱心','shapes','<path d="M60 105S13 77 13 42c0-29 35-39 47-15 12-24 47-14 47 15 0 35-47 63-47 63Z" fill="#e95768"/>'),
    icon('shape-sparkle','闪光','shapes','<path d="M60 5c6 31 16 43 50 55-34 12-44 24-50 55-6-31-16-43-50-55C44 48 54 36 60 5Z" fill="#f2c84b"/>'),
    icon('shape-star','星形','shapes','<path d="m60 7 16 33 37 5-27 26 7 37-33-18-33 18 7-37L7 45l37-5Z" fill="#5c8cc8"/>'),
    icon('shape-arrow','手绘箭头','shapes','<path d="M13 81c25-42 53-53 88-32M78 29l25 20-29 12" fill="none" stroke="#222" stroke-width="9" stroke-linecap="round"/>'),
    icon('shape-circle','手绘圆圈','shapes','<path d="M99 56c7 31-18 53-48 48C15 98 7 60 26 31 43 5 88 15 99 56Z" fill="none" stroke="#e1554e" stroke-width="8"/>'),
    icon('shape-flower','小花','shapes','<g fill="#e7aeb6"><circle cx="60" cy="27" r="23"/><circle cx="91" cy="53" r="23"/><circle cx="80" cy="91" r="23"/><circle cx="40" cy="91" r="23"/><circle cx="29" cy="53" r="23"/></g><circle cx="60" cy="61" r="18" fill="#f2cb54"/>'),
    icon('shape-wave','波浪','shapes','<path d="M3 43c18-24 37-24 55 0s37 24 59 0M3 76c18-24 37-24 55 0s37 24 59 0" fill="none" stroke="#4d8bb3" stroke-width="8"/>'),
    icon('shape-smile','笑脸','shapes','<circle cx="60" cy="60" r="50" fill="#f1cc4f"/><circle cx="43" cy="49" r="6"/><circle cx="78" cy="49" r="6"/><path d="M34 70c14 22 39 22 53 0" fill="none" stroke="#27231b" stroke-width="7"/>'),
  ];
  const builtIns=[...film135,...film120,...cameras,...marks,...tapes,...travel,...shapes];
  const categories=[{id:'all',name:'全部'},{id:'film-135',name:'135 暗盒'},{id:'film-120',name:'120 贴纸'},{id:'camera',name:'胶片相机'},{id:'marks',name:'摄影标记'},{id:'tape',name:'胶带'},{id:'travel',name:'旅行'},{id:'shapes',name:'图形'},{id:'custom',name:'我的贴图'}];
  return {builtIns,categories};
})();
