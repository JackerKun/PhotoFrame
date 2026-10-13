# PhotoFrame 五项改进实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复预设保存、边框拖拽、自由裁切、文字对齐、边框对称五个问题

**Architecture:** 纯前端原生 JS 项目，无构建工具。五个独立修改互不依赖，每个修改都可独立验证。

**Tech Stack:** Vanilla JS, HTML5 Canvas API, localStorage

---

## 文件责任

| 文件 | 责任 | 改动量 |
|------|------|--------|
| `js/app.js` | 主控制器：预设合并/保存逻辑、边框拖拽释放行为 | 约 4 处改动 |
| `js/storage.js` | localStorage 封装：增加 presetType 字段 | 约 1 处改动 |
| `js/crop-editor.js` | 裁切编辑器：增加帧框把手拖拽交互 | 约 3 处改动 |
| `index.html` | 保存预设弹窗 UI | 增加单选按钮组 |

每个文件独立修改，互不影响。

---

### Task 1: 预设保存补全 + 类型选择

**Files:**
- Modify: `js/app.js:1124` (`buildMergedPreset`)
- Modify: `js/app.js:1278` (`setupPresetSave`)
- Modify: `js/app.js:650` (`selectPreset`)
- Modify: `js/storage.js:15` (`saveCustomPreset`)
- Modify: `index.html:492` (modal-save-preset)

- [ ] **Step 1: 修改 index.html 保存预设弹窗，增加类型选择**

在 `index.html` 的 `#modal-save-preset` 弹窗中，分类 `<select>` 下方增加预设类型单选按钮：

```html
<div class="form-group">
  <label>预设类型</label>
  <div class="radio-group">
    <label>
      <input type="radio" name="preset-type" value="full" checked>
      完整预设（边框 + 信息字段 + 文字配置）
    </label>
    <label>
      <input type="radio" name="preset-type" value="style">
      仅样式预设（仅边框 + 背景 + 圆角）
    </label>
  </div>
</div>
```

放在 `<div class="form-group">` 分类 select 和 `<div class="modal-actions">` 之间。

- [ ] **Step 2: 补全 `buildMergedPreset` 函数，合并所有 infoBar 字段**

修改 `js/app.js` 中 `buildMergedPreset` 函数（约 line 1124），当前实现：

```javascript
function buildMergedPreset(preset, job) {
    if (!preset) return preset;
    const mergedInfo = Object.assign({}, preset.infoBar, job?.infoOverrides || {});
    if (!Array.isArray(mergedInfo.extraLines)) mergedInfo.extraLines = [];
    return {
      ...preset,
      border:  Object.assign({}, preset.border,  job?.borderOverrides || {}),
      infoBar: mergedInfo,
      output: {
        format:   state.exportFormat   || preset.output?.format   || 'jpeg',
        quality:  state.exportQuality  || preset.output?.quality  || 95,
        longEdge: state.exportLongEdge || preset.output?.longEdge || 3000,
      },
    };
  }
```

改为：

```javascript
function buildMergedPreset(preset, job) {
    if (!preset) return preset;
    // 完整合并：预设的所有 infoBar 字段 + job 的覆盖值
    const mergedInfo = Object.assign({}, preset.infoBar, job?.infoOverrides || {});
    // 确保 extraLines 是数组
    if (!Array.isArray(mergedInfo.extraLines)) {
      mergedInfo.extraLines = (job?.infoOverrides?.extraLines && Array.isArray(job.infoOverrides.extraLines))
        ? job.infoOverrides.extraLines
        : [];
    }
    return {
      ...preset,
      border:  Object.assign({}, preset.border,  job?.borderOverrides || {}),
      infoBar: mergedInfo,
      output: {
        format:   state.exportFormat   || preset.output?.format   || 'jpeg',
        quality:  state.exportQuality  || preset.output?.quality  || 95,
        longEdge: state.exportLongEdge || preset.output?.longEdge || 3000,
      },
    };
  }
```

注意：`Object.assign` 已经能覆盖所有字段（包括 `titleFontSize`、`subtitleFontSize`、`fontColor`、`textAlign` 等），关键是 `job.infoOverrides` 中已有这些值——它们由 `bindInfoControl` 和表单交互写入。现有逻辑实际上已经包含了这些字段，但 `Object.assign` 的第二个参数 `job?.infoOverrides` 如果是空对象 `{}`，会覆盖 `preset.infoBar` 中的值。所以实际上只需要确保 `job.infoOverrides` 不包含 `undefined` 值。

更安全的做法是：只合并 `job.infoOverrides` 中有定义的值：

```javascript
function buildMergedPreset(preset, job) {
    if (!preset) return preset;
    // 从预设 infoBar 开始
    const mergedInfo = { ...preset.infoBar };
    // 只覆盖 job 中显式设置的值
    const overrides = job?.infoOverrides || {};
    for (const key of Object.keys(overrides)) {
      if (overrides[key] !== undefined) {
        mergedInfo[key] = overrides[key];
      }
    }
    // 确保 extraLines 是数组
    if (!Array.isArray(mergedInfo.extraLines)) mergedInfo.extraLines = [];
    return {
      ...preset,
      border:  Object.assign({}, preset.border,  job?.borderOverrides || {}),
      infoBar: mergedInfo,
      output: {
        format:   state.exportFormat   || preset.output?.format   || 'jpeg',
        quality:  state.exportQuality  || preset.output?.quality  || 95,
        longEdge: state.exportLongEdge || preset.output?.longEdge || 3000,
      },
    };
  }
```

- [ ] **Step 3: 修改 `setupPresetSave`，读取类型选择并按类型保存**

修改 `js/app.js` 中 `setupPresetSave` 的保存逻辑（约 line 1292），当前保存按钮的 click 回调：

```javascript
      btnOk.addEventListener('click', () => {
        const nameInput = document.getElementById('preset-name-input');
        const catInput  = document.getElementById('preset-cat-input');
        const preset    = activePreset();
        const job       = activeJob();
        if (!preset) return;

        const newPreset = {
          ...buildMergedPreset(preset, job),
          id: 'custom-' + uid(),
          name: nameInput?.value.trim() || '我的预设',
          category: catInput?.value || 'custom',
          isCustom: true,
        };
        Storage.saveCustomPreset(newPreset);
        state.presets = Storage.allPresets();
        renderPresetGrid();
        if (modal) modal.hidden = true;
        showToast('预设已保存');
      });
```

改为：

```javascript
      btnOk.addEventListener('click', () => {
        const nameInput = document.getElementById('preset-name-input');
        const catInput  = document.getElementById('preset-cat-input');
        const preset    = activePreset();
        const job       = activeJob();
        if (!preset) return;

        // 读取预设类型选择
        const presetTypeEl = document.querySelector('input[name="preset-type"]:checked');
        const presetType = presetTypeEl?.value || 'full';

        const merged = buildMergedPreset(preset, job);
        const newPreset = {
          ...merged,
          id: 'custom-' + uid(),
          name: nameInput?.value.trim() || '我的预设',
          category: catInput?.value || 'custom',
          isCustom: true,
          presetType: presetType,
        };

        // 仅样式预设：清除 infoBar 中的字段，只保留 border
        if (presetType === 'style') {
          newPreset.infoBar = { ...preset.infoBar };
        }

        Storage.saveCustomPreset(newPreset);
        state.presets = Storage.allPresets();
        renderPresetGrid();
        if (modal) modal.hidden = true;
        showToast('预设已保存');
      });
```

- [ ] **Step 4: 修改 `storage.js` 的 `saveCustomPreset`，确保 presetType 被保存**

当前 `saveCustomPreset` 已经用 `{ ...preset, isCustom: true }` 保存整个对象，所以 `presetType` 字段会自然被包含。只需确认代码不变即可——`Object.assign` / spread 会保留所有字段。

**无需修改代码**，因为 `saveCustomPreset` 的实现是：
```javascript
function saveCustomPreset(preset) {
    const list = getCustomPresets().filter(p => p.id !== preset.id);
    list.push({ ...preset, isCustom: true });
    localStorage.setItem(KEY_PRESETS, JSON.stringify(list));
  }
```
spread 操作会保留 `presetType` 字段。

- [ ] **Step 5: 修改 `selectPreset`，按 presetType 判断覆盖范围**

修改 `js/app.js` 中 `selectPreset` 函数（约 line 650），在应用预设到当前 job 时：

当前 line 678-679：
```javascript
    const preset = activePreset();
    const job = activeJob();
    if (job) { job.presetId = id; fillBorderForm(preset, job); }
```

改为：

```javascript
    const preset = activePreset();
    const job = activeJob();
    if (job) {
      job.presetId = id;
      // 按 presetType 决定覆盖范围
      if (preset.presetType === 'style') {
        // 仅样式预设：只覆盖 border，保留现有 infoOverrides
        job.borderOverrides = { ...preset.border };
      } else {
        // 完整预设：覆盖 border + infoBar
        job.borderOverrides = { ...preset.border };
        job.infoOverrides = { ...preset.infoBar };
      }
      fillBorderForm(preset, job);
    }
```

同样修改多选批量应用逻辑（line 682-692），当前：
```javascript
      for (const jid of state.selectedJobIds) {
        if (jid === state.activeJobId) continue;
        const j = state.jobs.find(x => x.id === jid);
        if (j) {
          j.presetId = id;
          j.borderOverrides = {};
          j.infoOverrides = {};
          j.cropRect = null;
        }
      }
```

改为：

```javascript
      for (const jid of state.selectedJobIds) {
        if (jid === state.activeJobId) continue;
        const j = state.jobs.find(x => x.id === jid);
        if (j) {
          j.presetId = id;
          if (preset.presetType === 'style') {
            j.borderOverrides = { ...preset.border };
            // 不触碰 infoOverrides
          } else {
            j.borderOverrides = { ...preset.border };
            j.infoOverrides = { ...preset.infoBar };
          }
          j.cropRect = null;
        }
      }
```

- [ ] **Step 6: 验证预设功能**

启动 `python3 -m http.server 8080`，打开浏览器：
1. 上传一张照片
2. 修改边框、字号、字色、对齐方式
3. 点击"保存预设"，选择"完整预设"，保存
4. 上传第二张照片，选择刚保存的自定义预设
5. 验证：边框、字号、字色、对齐方式全部与应用一致
6. 再上传第三张照片，选择"仅样式预设"保存
7. 上传第四张照片，选择刚保存的样式预设
8. 验证：边框一致，但信息文字保持第四张照片各自的设置

- [ ] **Step 7: 提交**

```bash
git add index.html js/app.js js/storage.js
git commit -m "feat: 预设保存补全 infoBar 字段 + 增加样式/完整预设类型选择"
```

---

### Task 2: 边框拖拽松手行为修复

**Files:**
- Modify: `js/app.js:2085` (pointerup handler in setupBorderResizeMode)

- [ ] **Step 1: 修改松手行为**

修改 `js/app.js` 中 `handle.addEventListener('pointerup', ...)` 回调（约 line 2085-2105），当前实现：

```javascript
      handle.addEventListener('pointerup', () => {
        if (!_borderDragState) return;
        const { savedZoom } = _borderDragState;

        // 解锁 canvas CSS 尺寸
        const cvs = document.getElementById('canvas-preview');
        if (cvs) {
          cvs.style.width     = '';
          cvs.style.height    = '';
          cvs.style.maxWidth  = '';
          cvs.style.maxHeight = '';
        }

        // 取消任何挂起的拖拽渲染
        if (_rafPreview) { cancelAnimationFrame(_rafPreview); _rafPreview = null; }
        _borderDragState = null;
        _lastBorderRenderTime = 0;

        setZoom(savedZoom);   // 恢复缩放（调用 applyZoom 重新布局）
        renderPreview();      // 松手后做一次精确渲染
      });
```

改为：

```javascript
      handle.addEventListener('pointerup', () => {
        if (!_borderDragState) return;

        // 取消任何挂起的拖拽渲染
        if (_rafPreview) { cancelAnimationFrame(_rafPreview); _rafPreview = null; }
        _borderDragState = null;
        _lastBorderRenderTime = 0;

        // 仅重绘，不重新布局——canvas CSS 尺寸保持不变
        renderPreview();
      });
```

关键变化：
- 移除 `savedZoom` 解构和 `setZoom(savedZoom)` 调用
- 移除 canvas CSS 解锁（保持拖拽期间锁定的尺寸）
- 只调用 `renderPreview()` 重绘内容

但需要注意：解锁 canvas CSS 后，下次用户操作缩放时应该恢复正常行为。所以解锁时机改为：仅在用户主动操作缩放（点击 +/- 或滚轮）时解锁。

不过，当前代码中 `applyZoom` 在 `state.zoom === 'fit'` 时会清空 CSS 尺寸，所以 fit 模式会自动恢复。非 fit 模式下，canvas 尺寸会保持用户拖拽后的值，这是期望行为。

- [ ] **Step 2: 验证边框拖拽**

启动 `python3 -m http.server 8080`，打开浏览器：
1. 上传一张照片，点击"调整边框"按钮
2. 拖拽四角句柄调整边框
3. 松手后画布尺寸不应跳变
4. 拖拽四边句柄独立调整单边
5. 松手后画布尺寸不应跳变
6. 点击缩放 +/- 按钮，验证缩放正常工作

- [ ] **Step 3: 提交**

```bash
git add js/app.js
git commit -m "fix: 边框拖拽松手后不再重新缩放画布"
```

---

### Task 3: 裁切模式支持自由裁切

**Files:**
- Modify: `js/crop-editor.js` (整个类)

- [ ] **Step 1: 增加把手 hit test**

在 `js/crop-editor.js` 的 `CropEditor` 类中，`_setupFrame()` 方法末尾增加把手区域计算：

在 `this._centerPhoto();` 之后增加：

```javascript
    // 把手 hit test 半径（canvas 坐标系）
    this.handleRadius = 14;
    this._cornerHandles = [
      { x: this.frameX, y: this.frameY, cursor: 'nw-resize' },
      { x: this.frameX + this.frameW, y: this.frameY, cursor: 'ne-resize' },
      { x: this.frameX, y: this.frameY + this.frameH, cursor: 'sw-resize' },
      { x: this.frameX + this.frameW, y: this.frameY + this.frameH, cursor: 'se-resize' },
    ];
    // 四边中点把手
    this._edgeHandles = [
      { x: this.frameX + this.frameW / 2, y: this.frameY, cursor: 'n-resize', edge: 'top' },
      { x: this.frameX + this.frameW / 2, y: this.frameY + this.frameH, cursor: 's-resize', edge: 'bottom' },
      { x: this.frameX, y: this.frameY + this.frameH / 2, cursor: 'w-resize', edge: 'left' },
      { x: this.frameX + this.frameW, y: this.frameY + this.frameH / 2, cursor: 'e-resize', edge: 'right' },
    ];
```

- [ ] **Step 2: 实现 _hitTestHandle 方法**

在类中新增方法：

```javascript
  _hitTestHandle(px, py) {
    const r = this.handleRadius;
    // 先检查角把手
    for (const h of this._cornerHandles) {
      if (Math.abs(px - h.x) < r && Math.abs(py - h.y) < r) return h;
    }
    // 再检查边把手
    for (const h of this._edgeHandles) {
      if (Math.abs(px - h.x) < r && Math.abs(py - h.y) < r) return h;
    }
    // 检查是否在帧框内
    if (px >= this.frameX && px <= this.frameX + this.frameW &&
        py >= this.frameY && py <= this.frameY + this.frameH) {
      return 'inside';
    }
    return null;
  }
```

- [ ] **Step 3: 修改 _setupEvents，增加把手拖拽逻辑**

在 `_setupEvents` 方法中，替换原有的 `mousedown`/`mousemove`/`mouseup` 事件处理。

在 `const c = this.canvas;` 之后，原有：
```javascript
    const onDown = e => {
      this._dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      c.style.cursor = 'grabbing';
    };
```

改为：

```javascript
    const onDown = e => {
      const rect = c.getBoundingClientRect();
      const dprScale = c.width / rect.width / this.dpr;
      const px = (e.clientX - rect.left) * dprScale;
      const py = (e.clientY - rect.top) * dprScale;

      const hit = this._hitTestHandle(px, py);
      if (!hit) return; // 点在帧框外，忽略

      this._lastX = e.clientX;
      this._lastY = e.clientY;

      if (hit === 'inside') {
        // 拖动帧框
        this._draggingFrame = true;
        c.style.cursor = 'move';
      } else {
        // 拖拽把手调整裁切框大小
        this._draggingHandle = hit;
        // 保存拖拽起始状态
        this._dragStartFrame = { x: this.frameX, y: this.frameY, w: this.frameW, h: this.frameH };
        this._dragStartPhoto = { x: this.photoX, y: this.photoY, scale: this.photoScale };
        c.style.cursor = hit.cursor;
      }
    };

    const onMove = e => {
      // 更新鼠标指针
      if (!this._draggingFrame && !this._draggingHandle) {
        const rect = c.getBoundingClientRect();
        const dprScale = c.width / rect.width / this.dpr;
        const px = (e.clientX - rect.left) * dprScale;
        const py = e.clientY - rect.top) * dprScale;
        const hit = this._hitTestHandle(px, py);
        c.style.cursor = hit === 'inside' ? 'move' : (hit ? hit.cursor : 'default');
        return;
      }

      const dx = (e.clientX - this._lastX);
      const dy = (e.clientY - this._lastY);
      this._lastX = e.clientX;
      this._lastY = e.clientY;

      if (this._draggingFrame) {
        // 拖动帧框：移动 frame，photo 不动
        this.frameX += dx;
        this.frameY += dy;
        this._clamp();
        this._schedDraw();
      } else if (this._draggingHandle) {
        this._resizeFrame(dx, dy);
      }
    };

    const onUp = () => {
      this._draggingFrame = false;
      this._draggingHandle = null;
      c.style.cursor = 'grab';
    };
```

注意：上面 `onMove` 中有个语法错误（`py = e.clientY - rect.top) * dprScale` 多了右括号），实现时应修正为 `py = (e.clientY - rect.top) * dprScale`。

- [ ] **Step 4: 实现 _resizeFrame 方法**

在类中新增方法：

```javascript
  _resizeFrame(dx, dy) {
    const handle = this._draggingHandle;
    if (!handle) return;

    const minFrameW = 50; // 最小帧框宽度
    const minFrameH = 50; // 最小帧框高度
    const canvasW = this.canvas.width / this.dpr;
    const canvasH = this.canvas.height / this.dpr;
    const margin = Math.round(Math.min(canvasW, canvasH) * 0.02);

    let { x: fx, y: fy, w: fw, h: fh } = this._dragStartFrame;

    if ('edge' in handle) {
      // 边把手：只调整对应边
      switch (handle.edge) {
        case 'top':    fy = Math.min(canvasH - margin - minFrameH, fy + dy); break;
        case 'bottom': fh = Math.max(minFrameH, fh + dy); break;
        case 'left':   fx = Math.min(canvasW - margin - minFrameW, fx + dx); break;
        case 'right':  fw = Math.max(minFrameW, fw + dx); break;
      }
    } else {
      // 角把手：调整对角方向的两条边
      if (handle.cursor === 'nw-resize' || handle.cursor === 'ne-resize') fy = Math.min(canvasH - margin - minFrameH, fy + dy);
      if (handle.cursor === 'sw-resize' || handle.cursor === 'se-resize') fh = Math.max(minFrameH, fh + dy);
      if (handle.cursor === 'nw-resize' || handle.cursor === 'sw-resize') fx = Math.min(canvasW - margin - minFrameW, fx + dx);
      if (handle.cursor === 'ne-resize' || handle.cursor === 'se-resize') fw = Math.max(minFrameW, fw + dx);
    }

    // 约束：裁切框不能超出画布边界
    fx = Math.max(margin, Math.min(canvasW - margin - minFrameW, fx));
    fy = Math.max(margin, Math.min(canvasH - margin - minFrameH, fy));
    fw = Math.max(minFrameW, Math.min(canvasW - fx - margin, fw));
    fh = Math.max(minFrameH, Math.min(canvasH - fy - margin, fh));

    this.frameX = fx;
    this.frameY = fy;
    this.frameW = fw;
    this.frameH = fh;

    // 重新计算 minScale 并约束 photo
    const scaleByW = this.frameW / this.img.naturalWidth;
    const scaleByH = this.frameH / this.img.naturalHeight;
    this.minScale = Math.max(scaleByW, scaleByH);

    if (this.photoScale < this.minScale) {
      this.photoScale = this.minScale;
    }
    this._clamp();
    this._schedDraw();
  }
```

- [ ] **Step 5: 修改状态变量和 _clamp**

在类构造函数中，将原有的 `this._dragging = false` 替换为：

```javascript
    this._draggingFrame = false;   // 拖拽帧框内部
    this._draggingHandle = null;   // 拖拽裁切框把手
    this._dragStartFrame = null;   // 把手拖拽起始帧框状态
    this._dragStartPhoto = null;   // 把手拖拽起始照片状态
```

在 `_setupFrame()` 末尾添加把手数据（Step 1 已包含）。

修改 `_clamp()` 方法，增加裁切框约束。当前：
```javascript
  _clamp() {
    const pW = this.img.naturalWidth  * this.photoScale;
    const pH = this.img.naturalHeight * this.photoScale;
    const minX = this.frameX + this.frameW - pW;
    const minY = this.frameY + this.frameH - pH;
    const maxX = this.frameX;
    const maxY = this.frameY;
    this.photoX = Math.max(minX, Math.min(maxX, this.photoX));
    this.photoY = Math.max(minY, Math.min(maxY, this.photoY));
  }
```

保持不变——因为 `_clamp` 本身已经正确约束了照片不能移出帧框。

- [ ] **Step 6: 修改 _setupEvents 中的光标悬停检测**

在 `onDown` 中已包含 hit test，但还需要鼠标悬停时光标变化。在 `onMove` 中已处理。

同时在 `_setupFrame()` 之后初始化把手数据，确保 `this._cornerHandles` 和 `this._edgeHandles` 被创建。

- [ ] **Step 7: 修改键盘操作，增加裁切框调整**

当前键盘操作只支持平移和缩放照片。保持不变——裁切框调整主要通过鼠标/触摸拖拽把手完成。键盘操作保持原有行为（平移照片 + 缩放）。

- [ ] **Step 8: 修改 getCropData 的注释**

`getCropData()` 方法（line 127）已经基于 `frameX/Y/W/H` 和 `photoX/Y/Scale` 计算裁切矩形，无需修改——裁切框改变后会自动反映在新的裁切数据中。

- [ ] **Step 9: 验证裁切功能**

启动 `python3 -m http.server 8080`，打开浏览器：
1. 上传一张照片，点击"调整裁切"按钮
2. 拖拽四角把手调整裁切框大小
3. 拖拽四边把手独立调整对应边
4. 拖拽帧框内部移动整个裁切框
5. 滚轮缩放照片
6. 点击"完成"，验证裁切效果正确导出

- [ ] **Step 10: 提交**

```bash
git add js/crop-editor.js
git commit -m "feat: 裁切模式支持自由裁切，增加帧框把手拖拽交互"
```

---

### Task 4: 文字拖放对齐辅助 + 快捷对齐按钮

**Files:**
- Modify: `js/app.js` (文字拖拽逻辑 + setupBorderForm)
- Modify: `index.html` (文字对齐快捷按钮)

- [ ] **Step 1: 在 index.html 信息面板增加文字对齐快捷按钮**

在信息面板的"文字位置"按钮下方，增加快捷对齐按钮组：

```html
<div class="form-group" id="text-align-quick-actions">
  <label>文字快捷对齐</label>
  <div class="align-quick-group">
    <button id="btn-text-h-center" class="btn btn-sm" title="水平居中">⬌ 居中</button>
    <button id="btn-text-v-center" class="btn btn-sm" title="垂直居中">⬍ 垂直居中</button>
    <button id="btn-text-left" class="btn btn-sm" title="左对齐">◧ 左</button>
    <button id="btn-text-right" class="btn btn-sm" title="右对齐">◨ 右</button>
  </div>
</div>
```

- [ ] **Step 2: 实现文字对齐快捷按钮逻辑**

在 `js/app.js` 的 `setupBorderForm` 中增加按钮事件绑定：

```javascript
  // 文字快捷对齐按钮
  const btnHCenter = document.getElementById('btn-text-h-center');
  const btnVCenter = document.getElementById('btn-text-v-center');
  const btnLeft = document.getElementById('btn-text-left');
  const btnRight = document.getElementById('btn-text-right');

  btnHCenter?.addEventListener('click', () => {
    const job = activeJob();
    if (!job) return;
    job.infoOverrides.textOffsetX = 0;
    const oxR = document.getElementById('text-offset-x');
    const oxL = document.getElementById('text-offset-x-label');
    if (oxR) oxR.value = 0;
    if (oxL) oxL.textContent = '0.00';
    schedulePreview();
    updateTextPosHandle();
  });

  btnVCenter?.addEventListener('click', () => {
    const job = activeJob();
    if (!job) return;
    job.infoOverrides.textOffsetY = 0;
    const oyR = document.getElementById('text-offset-y');
    const oyL = document.getElementById('text-offset-y-label');
    if (oyR) oyR.value = 0;
    if (oyL) oyL.textContent = '0.00';
    schedulePreview();
    updateTextPosHandle();
  });

  btnLeft?.addEventListener('click', () => {
    const job = activeJob();
    if (!job) return;
    const layout = CanvasRenderer.getLastLayout();
    if (!layout) return;
    // 左对齐 = textOffsetX = -0.5 + 0.08 = -0.42（使文字对齐到左侧 8% 位置）
    job.infoOverrides.textOffsetX = -0.42;
    const oxR = document.getElementById('text-offset-x');
    if (oxR) oxR.value = -0.42;
    schedulePreview();
    updateTextPosHandle();
  });

  btnRight?.addEventListener('click', () => {
    const job = activeJob();
    if (!job) return;
    const layout = CanvasRenderer.getLastLayout();
    if (!layout) return;
    // 右对齐 = textOffsetX = 0.5 - 0.08 = 0.42（使文字对齐到右侧 92% 位置）
    job.infoOverrides.textOffsetX = 0.42;
    const oxR = document.getElementById('text-offset-x');
    if (oxR) oxR.value = 0.42;
    schedulePreview();
    updateTextPosHandle();
  });
```

- [ ] **Step 3: 文字拖拽时显示对齐参考线**

修改 `updateTextPosHandle` 函数（约 line 1620），在文字位置覆盖层中增加参考线绘制逻辑。

当 `|textOffsetX| < 0.02`（接近水平居中）时，显示一条垂直中线。
当 `|textOffsetY| < 0.02`（接近垂直居中）时，显示一条水平中线。

具体实现：在文字位置覆盖的 `#text-pos-overlay` 中增加参考线元素：

```javascript
  // 在 updateTextPosHandle 中，显示文字位置覆盖后：
  const overlay = document.getElementById('text-pos-overlay');
  // ... existing logic ...

  // 参考线：水平居中
  if (Math.abs(info.textOffsetX || 0) < 0.02) {
    // 显示垂直中线（在 canvas 预览层绘制）
    drawGuideline('vertical', canvasEl);
  }
  // 参考线：垂直居中
  if (Math.abs(info.textOffsetY || 0) < 0.02) {
    drawGuideline('horizontal', canvasEl);
  }
```

由于参考线应该绘制在 Canvas 上而非 HTML overlay 上，更合理的做法是在 `CanvasRenderer.render` 后，在预览 canvas 上叠加一个 reference line canvas 层。

**简化方案**：不修改 Canvas 渲染，仅在 HTML 层使用 CSS 绘制参考线。在 `#preview-wrapper` 中增加一个半透明的参考线 overlay：

```html
<!-- 在 index.html 的 preview-wrapper 中增加 -->
<div id="alignment-guides" style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:5;">
  <div id="guide-v" style="position:absolute;left:50%;top:0;width:1px;height:100%;background:rgba(255,0,0,0.3);display:none;"></div>
  <div id="guide-h" style="position:absolute;top:50%;left:0;height:1px;width:100%;background:rgba(255,0,0,0.3);display:none;"></div>
</div>
```

在文字拖拽过程中（`updateTextPosHandle`），根据偏移量控制参考线的显示/隐藏。

- [ ] **Step 4: 验证文字对齐功能**

1. 上传图片，进入"信息"面板
2. 拖拽文字位置
3. 当文字接近水平居中时，垂直中线出现并吸附
4. 点击"⬌ 居中"按钮，文字立即水平居中
5. 点击"⬍ 垂直居中"按钮，文字立即垂直居中
6. 点击"◧ 左"、"◨ 右"按钮验证左右对齐

- [ ] **Step 5: 提交**

```bash
git add index.html js/app.js
git commit -m "feat: 文字拖放对齐辅助线 + 快捷对齐按钮"
```

---

### Task 5: 边框对称辅助 + 快捷对称按钮

**Files:**
- Modify: `js/app.js` (边框拖拽逻辑 + setupBorderForm)
- Modify: `index.html` (边框对称快捷按钮)

- [ ] **Step 1: 在 index.html 边框面板增加对称快捷按钮**

在边框控制面板的"圆角"控件下方，增加对称按钮：

```html
<div class="form-group" id="border-symmetry-actions">
  <label>边框对称</label>
  <div class="align-quick-group">
    <button id="btn-border-h-symmetry" class="btn btn-sm" title="左右对称">⬌ 左右对称</button>
    <button id="btn-border-v-symmetry" class="btn btn-sm" title="上下对称">⬍ 上下对称</button>
  </div>
</div>
```

- [ ] **Step 2: 实现边框对称按钮逻辑**

在 `js/app.js` 的 `setupBorderForm` 中增加：

```javascript
  // 边框对称按钮
  const btnHSym = document.getElementById('btn-border-h-symmetry');
  const btnVSym = document.getElementById('btn-border-v-symmetry');

  btnHSym?.addEventListener('click', () => {
    const job = activeJob();
    const preset = activePreset();
    if (!job || !preset) return;
    const b = Object.assign({}, preset.border, job.borderOverrides || {});
    const avg = (b.left + b.right) / 2;
    job.borderOverrides.left = avg;
    job.borderOverrides.right = avg;
    // 更新 UI
    const lSlider = document.getElementById('border-left');
    const rSlider = document.getElementById('border-right');
    const lNum = document.getElementById('border-left-num');
    const rNum = document.getElementById('border-right-num');
    if (lSlider) lSlider.value = avg;
    if (rSlider) rSlider.value = avg;
    if (lNum) lNum.value = (avg * 100).toFixed(1);
    if (rNum) rNum.value = (avg * 100).toFixed(1);
    schedulePreview();
    requestAnimationFrame(updateBorderResizeHandles);
  });

  btnVSym?.addEventListener('click', () => {
    const job = activeJob();
    const preset = activePreset();
    if (!job || !preset) return;
    const b = Object.assign({}, preset.border, job.borderOverrides || {});
    const avg = (b.top + b.bottom) / 2;
    job.borderOverrides.top = avg;
    job.borderOverrides.bottom = avg;
    const tSlider = document.getElementById('border-top');
    const bSlider = document.getElementById('border-bottom');
    const tNum = document.getElementById('border-top-num');
    const bNum = document.getElementById('border-bottom-num');
    if (tSlider) tSlider.value = avg;
    if (bSlider) bSlider.value = avg;
    if (tNum) tNum.value = (avg * 100).toFixed(1);
    if (bNum) bNum.value = (avg * 100).toFixed(1);
    schedulePreview();
    requestAnimationFrame(updateBorderResizeHandles);
  });
```

- [ ] **Step 3: 边框拖拽时对称参考线**

修改 `updateBorderResizeHandlesDrag` 函数，当左右边框差值 < 1% 时显示垂直中线参考线，当上下边框差值 < 1% 时显示水平中线参考线。

使用与 Task 4 相同的 `#alignment-guides` overlay：

```javascript
  // 在 updateBorderResizeHandlesDrag 中：
  const job = activeJob();
  const preset = activePreset();
  const b = Object.assign({}, preset.border, job.borderOverrides || {});

  // 左右对称检测
  const hDiff = Math.abs(b.left - b.right);
  const guideV = document.getElementById('guide-v');
  if (guideV) guideV.style.display = hDiff < 0.01 ? 'block' : 'none';

  // 上下对称检测
  const vDiff = Math.abs(b.top - b.bottom);
  const guideH = document.getElementById('guide-h');
  if (guideH) guideH.style.display = vDiff < 0.01 ? 'block' : 'none';
```

- [ ] **Step 4: 在 border-resize overlay 中显示边框数值标签**

在 `#border-resize-overlay` 上，实时显示四边的百分比数值：

```
    ┌──────── top: 5.0% ────────┐
 left: 5.0%                right: 5.0%
    ──────── bottom: 22.0% ────────
```

修改 `updateBorderResizeHandlesDrag` 函数，在 overlay 中增加数值标签元素：

```javascript
  // 更新边框数值显示
  const labels = document.querySelectorAll('.br-value');
  if (labels.length >= 4) {
    labels[0].textContent = `上 ${(b.top * 100).toFixed(1)}%`;
    labels[1].textContent = `下 ${(b.bottom * 100).toFixed(1)}%`;
    labels[2].textContent = `左 ${(b.left * 100).toFixed(1)}%`;
    labels[3].textContent = `右 ${(b.right * 100).toFixed(1)}%`;
  }
```

需要在 `index.html` 的 `#border-resize-overlay` 中增加四个数值标签元素：

```html
<div id="border-resize-overlay" hidden>
  <span class="br-value br-top" style="position:absolute;top:4px;left:50%;transform:translateX(-50%);"></span>
  <span class="br-value br-bottom" style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);"></span>
  <span class="br-value br-left" style="position:absolute;left:4px;top:50%;transform:translateY(-50%);"></span>
  <span class="br-value br-right" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);"></span>
  <!-- 现有把手元素保持不变 -->
  ...
</div>
```

- [ ] **Step 5: 验证边框对称功能**

1. 上传图片，进入"边框"面板
2. 拖拽边框调整句柄
3. 观察四边数值标签实时更新
4. 当左右边框接近对称时，垂直中线出现
5. 点击"⬌ 左右对称"按钮，左右边框立即相等
6. 点击"⬍ 上下对称"按钮，上下边框立即相等

- [ ] **Step 6: 提交**

```bash
git add index.html js/app.js
git commit -m "feat: 边框对称辅助线 + 快捷对称按钮 + 数值标签"
```

---

### Task 6: 回归测试

- [ ] **Step 1: 完整流程测试**

1. 上传 3 张照片
2. 选择不同预设 → 验证预览正确
3. 调整边框 → 验证拖拽松手不跳变 + 四边数值标签实时更新
4. 拖拽边框至接近对称 → 验证对称参考线出现
5. 点击"左右对称"/"上下对称"按钮 → 验证边框立即相等
6. 保存完整预设 → 应用新照片 → 验证边框+信息字段完全同步
7. 保存样式预设 → 应用新照片 → 验证边框一致但信息独立
8. 进入裁切模式 → 拖拽四角/四边把手调整裁切框 → 验证导出正确
9. 拖拽文字位置 → 验证接近居中时参考线出现并吸附
10. 点击文字快捷对齐按钮 → 验证立即对齐
11. 批量导出 ZIP → 验证所有照片使用正确预设

- [ ] **Step 2: 最终提交**

```bash
git status
git log --oneline -5
```

确认所有 5 个功能独立工作，无回归。
