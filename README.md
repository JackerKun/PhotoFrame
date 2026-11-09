<p align="center"><img src="favicon.svg" width="72" height="72" alt="PhotoFrame 标志"></p>
<h1 align="center">PhotoFrame</h1>
<p align="center">胶片画幅、留白边框、相机贴图与拼图排版。</p>
<p align="center">简体中文 · <a href="README.en.md">English</a> · <a href="#界面导览">界面导览</a> · <a href="#快速开始">快速开始</a> · <a href="TECHNICAL_SPEC.md">技术说明</a></p>

PhotoFrame 是运行在浏览器中的本地照片排版工具。导入照片、选择胶片画幅、调整边框和文字、加入贴图或制作拼图，最后导出 JPEG / PNG 或批量 ZIP。照片在本机解码与渲染，使用时不需要上传原片或注册账号。

![PhotoFrame 编辑工作区：左侧预设、底部胶片条与带拍摄信息的成品预览](docs/screenshots/workspace.webp)

_真实界面截图。示例山水图在本地生成，不含个人照片；相机、胶卷和地点为手动填写的演示信息。_

## 可以做什么

| 模块           | 主要能力                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **画幅与预设** | 30 个单图预设，覆盖 135、120（645 / 66 / 67 / 69）、XPan、612 / 617、社交平台与冲印用途；支持搜索、收藏、最近使用和画幅推荐 |
| **胶片边框**   | 133 款胶卷，含 85 款有 120 规格的胶卷。支持胶卷名与别名搜索、135 / 120 和片种筛选、自定义边字与 EXIF 变量 |
| **调整构图**   | 裁切、左右各旋转 90°、水平翻转与垂直翻转，已有裁切随照片变换 |
| **边框与背景** | 四边独立边距、圆角、纯色 / 渐变 / 纸张 / 亚麻 / 颗粒 / 网点，搭配描边、双线边框与阴影；可直接拖拽内外框                     |
| **照片信息**   | 读取可用 EXIF，手动补充地点与胶卷；主副标题模板、额外文字、字体与字号、对齐、拖动定位及自由变换                             |
| **贴图库**     | 320 个内置条目、9 个分类入口，包含胶卷、相机矢量 / 透明抠图、胶带和装饰；支持个人贴图、缩放、旋转、透明度、描边与阴影       |
| **拼图工作台** | 18 套布局，配图槽、版面比例、留白、格子间距、圆角、材质、对齐和标题；可调整照片顺序                                         |
| **多图流程**   | 最多 72 张。底部胶片条可左右切换和多选、以当前照片为样板同步风格、撤销 / 重做、原图对比和 ZIP 批量导出                                      |
| **原分辨率导出** | 编辑时使用缩略图和轻量预览，单张和批量 ZIP 默认用原图渲染，边框向外扩展画布 |
| **使用体验**   | 影棚白、暗房黑、暖调纸张、深夜蓝四套界面主题；手机底部工具面板；本机会话恢复与预设 JSON 备份                                |

上述数量对应当前 `1.0.0` 的内置数据。EXIF 能读到哪些信息取决于原文件；胶卷型号与拍摄地点通常需要手动填写。

## 快速开始

仓库已包含运行所需的 `vendor/` 依赖，日常使用不需要构建：

```bash
git clone https://github.com/JackerKun/PhotoFrame.git
cd PhotoFrame
python3 -m http.server 8080 --bind 127.0.0.1
```

打开 **http://127.0.0.1:8080**。Windows 若没有 `python3` 命令，可改用 `py -m http.server 8080 --bind 127.0.0.1`。建议通过本地 HTTP 服务打开，便于贴图资源和离线缓存正常工作。

1. 拖入自己的照片，或先下载这张 [演示原图](docs/screenshots/demo-photo.jpg) 试用。
2. 导入时会逐张匹配最接近的画幅预设，自动保留完整画面。可在「预设」更换画幅或选胶片边框。
3. 在底部胶片条切换照片，用「调整构图」裁切或旋转翻转，也可在「信息」补充地点和胶卷。
4. 在「导出」选择 JPEG 或 PNG。默认使用原分辨率，点击右上角保存单张或打包 ZIP。

支持 JPEG / PNG / TIFF / HEIC / HEIF 导入，解码在本机进行；具体文件兼容性与浏览器内存有关。演示原图不含真实拍摄 EXIF。

## 界面导览

以下截图使用 4 张本地生成的示例图，展示桌面和 390 像素宽的手机视口。可点击 WebP 截图查看大图。

### 胶片边框

打开「预设 → 胶片边框」，可按 135 / 120、彩色或黑白负片、反转片、电影负片筛选。在「全部」的主搜索框输入 `Fuji`、`富士`、`Fuji Provia` 或 `Portra 400`，也会显示匹配的胶卷。135 模拟齿孔，120 使用无齿孔的连续边缘，两种规格都支持深色片基、浅色扫描和电影扫描。

横图的两条边字在上下两侧，竖图在左右两侧。可混用自由文字和变量，例如 `{stock} · 第 {frame} 帧 · {camera} · {shutter} · {iso}`。可用的 EXIF 信息会排印到成品边框。目录之外的胶卷可用「自定义边字」制作，再用「将当前参数保存为预设」保存样式。

![深色 135 胶片边框，显示模拟齿孔、Portra 400 和自定义边字](docs/screenshots/film-frame.webp)

目录包含现售和历史规格，参考各厂商的胶卷目录。边缘图样为风格模拟。[Kodak Professional](https://www.kodakprofessional.com/photographers/resources)、[Kodak Still Film](https://www.kodak.com/en/still-film/products/)、[Fujifilm](https://wps-jp.fujifilm.com/filmlineup/)、[ILFORD](https://www.ilfordphoto.com/)、[Foma](https://www.foma.cz/en/catalogue-bw-film-324)、[Rollei](https://www.rolleianalog.com/produkte/)、[Lomography](https://www.lomography.com/magazine/327296-a-guide-to-lomography-films-and-formats)。

### 调整构图

在画布下方打开「调整构图」。拖动调整裁切位置，滚轮或双指捏合缩放，也可以用方向键微调。左转或右转 90°、水平翻转或垂直翻转时，已有裁切会随照片变换。点击「完成构图」后应用到预览和导出。

![XPan 构图编辑器与旋转、翻转工具](docs/screenshots/crop-editor.webp)

### 边框与文字：在画布上直接调整

**入口：** 导入照片 → “边框&字体”。调整四边比例和背景材质，再点击预览区底部“调整边框”，拖动四角或单边句柄。切换“文字工具”可拖动文字块并微调位置。

![暖调纸张主题下的边框编辑：材质、边距与内外框拖动句柄](docs/screenshots/border-editor.webp)

### 贴图库：胶卷、相机与个人装饰

**入口：** “贴图”→ 选择分类或搜索 → 点击素材添加。拖动贴图调整位置，拖角缩放、拖旋转柄旋转；左侧还可设置透明度、描边、阴影和层级。也支持上传自己的 PNG / JPG / WebP / SVG 素材。

![暗房黑主题下的相机贴图库：相机矢量分类、选中的 Nikon F 素材及变换控件](docs/screenshots/sticker-library.webp)

相机矢量插画与相机透明抠图是不同分类；照片及其衍生素材保留独立来源和许可入口，详见下方[素材与许可](#素材与许可)。

### 拼图：配图、排版和风格在一个工作台完成

**入口：** “预设”→“拼图”→ 选择布局。左侧配置图槽，中间预览成品，右侧调整比例、留白、间距、圆角、描边、阴影和材质。上方可填写主副标题，完成后“导出拼图”。

![四宫格拼图工作台：图槽、中间成品、标题及右侧布局和样式设置](docs/screenshots/collage.webp)

<details>
<summary>批量同步：统一风格，同时保留每张照片自己的内容</summary>

**入口：** 先完成一张样板 → 点击顶部双向箭头“同步当前修改”。选择后续、已选或全部其他照片；默认同步画幅、边框、文字样式和贴图，保留每张的文字内容与裁切。确实需要一致时，再开启“文字内容”或“构图裁切”。整次同步可以一次撤销。

![引导式批量同步窗口：目标范围与边框、文字、裁切、贴图同步选项](docs/screenshots/batch-sync.webp)

</details>

<details>
<summary>导出：JPEG / PNG、质量、分辨率与文件名模板</summary>

**入口：** “导出”。可选 JPEG / PNG，JPEG 质量为 70–100%；默认按原始分辨率导出，也可手动指定照片长边为 1500 / 2400 / 3000 / 4500 / 6000 px。支持 `{name}`、`{index}` 等文件名变量，单张保存或批量 ZIP。尺寸语义见[导出与离线说明](#导出与离线说明)。

![导出面板：格式、JPEG 质量、长边选项、文件名模板与保存入口](docs/screenshots/export.webp)

</details>

### 手机：预览画布与底部工具面板

底部导航切换“预设 / 信息 / 边框&字体 / 贴图 / 导出”；工具以底部面板展开，点击遮罩可回到预览。预览工具栏使用紧凑图标，支持画布缩放和抓手查看。

<p align="center">
  <img src="docs/screenshots/mobile-editor.webp" width="260" alt="手机预览：边框成品、紧凑预览工具栏和底部工具导航">
  <img src="docs/screenshots/mobile-tools.webp" width="260" alt="手机编辑：从底部展开的边框与字体工具面板">
</p>

<details>
<summary>实际导出成品示例</summary>

下图由程序真实导出的 JPEG 转为 WebP，便于文档展示。可下载 [JPEG 原文件](docs/screenshots/result.jpg) 查看实际成品；示例设置照片长边 2400 px，加入边框后的文件为 **2560 × 2032 px**。

![实际导出示例：合成山水图、留白边框、地点标题和相机胶卷信息](docs/screenshots/result.webp)

</details>

## 推荐工作流

**单张：** 导入 → 选画幅 → 填信息 → 调边框 / 文字 / 贴图 → 检查构图 → 保存。

**多张统一风格：**

1. 一次导入这一组照片，先完成第一张样板。
2. 点击“同步当前修改”，选择“后续照片”或其他目标；保持推荐选项即可保留各图自己的信息与构图。
3. 底部胶片条可横向滚动，也可用两侧按钮切换。焦点在胶片条时支持 ← / →。用 `Ctrl / ⌘` 增减同步目标，或用 `Shift` 连续选择。
4. 单独补全每张的文字和构图，再点“批量导出 ZIP”。

**保存自己的风格：** 在“预设”中点击“将当前参数保存为预设”。更换设备或清理浏览器数据前，使用“导出预设”保存 JSON；之后可用“导入预设”恢复。

主副标题支持 `{location}`、`{camera}`、`{film}`、`{date}`、`{iso}`、`{aperture}`、`{shutter}`、`{lens}` 等变量。它们引用每张照片已有的 EXIF 或手动信息，不能从像素内容推断胶卷型号。

## 导出与离线说明

| 问题                                    | 实际行为                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **选了 2400 px，为什么文件更大？**      | 单图分辨率按照片区域的长边计算，边框会增加成品尺寸。                                 |
| **原始尺寸是否包含边框？**              | 默认的原分辨率模式用原图渲染，未裁切时保留照片像素尺寸，边框在外侧扩展画布。手动裁切后按保留区域的像素计算。                                                                                 |
| **会保留原片信息吗？**                  | 成品由 Canvas 重新编码，不拷贝原片 EXIF / GPS；画面上可见的拍摄信息文字仍会保留。原文件不会被覆盖。                                                    |
| **能离线使用吗？**                      | 本地 HTTP 服务运行时，仓库内资源不依赖外网。远程网站需先成功加载并刷新，让 Service Worker 接管；之后可用已缓存资源。按需加载的素材要先访问过才有缓存。 |
| **为什么另一浏览器没有上次会话？**      | 会话文件在当前浏览器、当前站点的 IndexedDB；自定义预设与偏好使用 localStorage。切换端口、浏览器、无痕模式或清理站点数据，会影响恢复。                  |
| **为什么照片导入 / 高分辨率导出失败？** | HEIC / TIFF 文件的编码与浏览器内存会影响解码；可先转为 JPEG / PNG，或降低输出尺寸、减少同时处理的照片。                                                |

预设 JSON 备份不包含导入的原照片，不等同于会话或原片备份。打印前请另外核对文件像素、目标纸张尺寸和输出方要求。

## 开发与检查

运行界面本身不需要 Node.js。更新依赖、运行自动化检查或重新生成截图时，使用 Node.js 20+（建议当前 LTS）：

```bash
npm ci
npm run vendor              # 仅在更新本地 vendor 副本时需要
npm run check
npx playwright install chromium
npm test
```

Playwright 覆盖桌面与手机视口。实现采用原生 JavaScript、HTML5 Canvas、exifr、heic2any、UTIF、JSZip 与 FileSaver.js；无前端构建步骤。技术设计见 [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md)。

维护者可用 `node scripts/screenshots.cjs` 复现本文界面，生成示例素材与成品。截图使用独立浏览器上下文，不打开个人浏览器会话；默认需要已安装 Google Chrome。详细方法见 [截图说明](docs/screenshots/README.md)。

## 目录结构

```text
PhotoFrame/
├── index.html / css/          # 入口与响应式界面
├── js/
│   ├── app.js                # 编辑状态、交互与工作流
│   ├── presets.js            # 单图画幅与样式预设
│   ├── canvas-renderer.js    # 照片、边框、文字与贴图渲染
│   ├── film-stocks.js / film-frame.js  # 胶卷目录与胶片边框
│   ├── crop-editor.js / photo-orientation.js  # 裁切、旋转与翻转
│   ├── collage-layouts.js    # 拼图布局与渲染
│   ├── sticker-library.js    # 贴图与素材分类
│   ├── image-decoder.js      # 本地格式解码
│   ├── exif-reader.js        # 拍摄信息读取
│   ├── batch-processor.js    # 批量导出
│   └── storage.js / session-store.js
├── assets/                   # 相机素材与来源许可
├── vendor/                   # 随仓库分发的浏览器依赖
├── docs/screenshots/         # 实拍界面、演示原图和导出示例
├── scripts/                  # 依赖同步、素材处理和截图工具
├── tests/                    # Playwright 自动化检查
└── sw.js / manifest.webmanifest
```

## 素材与许可

`package.json` 声明项目代码使用 MIT。第三方依赖及素材保留各自许可，相机照片与衍生透明抠图的来源分别记录在 [相机照片归属](assets/cameras/ATTRIBUTION.json) 和 [透明抠图归属](assets/camera-cutouts/ATTRIBUTION.json)；它们不统一按项目代码许可授权。界面也提供素材来源入口。

README 中的示例山水图由截图脚本本地生成，不使用个人照片。问题反馈请附浏览器、文件格式与复现步骤，提交到 [Issues](https://github.com/JackerKun/PhotoFrame/issues)。
