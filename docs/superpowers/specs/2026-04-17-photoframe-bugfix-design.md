# PhotoFrame 轻量修复设计文档

**日期**: 2026-04-17
**方案**: 方案 A（轻量修复）

---

## 问题描述

### 问题 1：保存预设不完整
- 当前 `buildMergedPreset` 只合并 `border` 和 `infoBar` 基础字段
- `titleFontSize`、`subtitleFontSize`、`fontColor`、`textAlign`、`extraLines` 等字段丢失
- 导致应用预设时，多张照片的信息字段无法完全同步

### 问题 2：边框拖拽松手后画布跳变
- `pointerup` 事件处理中调用 `setZoom(savedZoom)` → `applyZoom` → 重新计算 layout
- 导致画布尺寸突变，用户体验断裂

---

## 解决方案

### 修复 1：预设保存补全 + 类型选择

#### 1.1 补全 `buildMergedPreset` 合并逻辑

文件：`js/app.js`

将 `buildMergedPreset` 中对 `infoBar` 的合并从简单的 `Object.assign` 改为逐字段完整合并，确保以下字段全部被覆盖：

```
titleFontSize, subtitleFontSize, fontColor, textAlign,
titleFont, subtitleFont, titleGap, textOffsetX, textOffsetY, extraLines
```

#### 1.2 保存预设弹窗增加类型选择

文件：`index.html` + `js/app.js`

在保存预设弹窗（`#modal-save-preset`）中增加单选按钮：

```html
<!-- 预设类型 -->
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

- 选择「完整预设」时：保存 `border` + `infoBar` 全部字段
- 选择「仅样式预设」时：仅保存 `border`（颜色、四边宽度、圆角）

#### 1.3 `saveCustomPreset` 增加 presetType

文件：`js/storage.js`

在保存的预设对象中增加 `presetType: 'full' | 'style'` 字段。

#### 1.4 应用预设时按 presetType 判断覆盖范围

文件：`js/app.js` — 在 `applyPresetToJob` 或 preset 选择逻辑中：

```
if (preset.presetType === 'style') {
  // 仅覆盖 border，保留 job 现有的 infoOverrides
  job.borderOverrides = { ...preset.border };
  // 不触碰 infoOverrides
} else {
  // 完整预设：覆盖 border + infoBar
  job.borderOverrides = { ...preset.border };
  job.infoOverrides = { ...preset.infoBar };
}
```

---

### 修复 2：边框拖拽松手行为

文件：`js/app.js` — `setupBorderResizeMode` 中的 `pointerup` 处理

**当前行为**:
```
pointerup → 解锁 canvas CSS → setZoom(savedZoom) → applyZoom → 画布跳变
```

**修改后**:
```
pointerup → 解锁 canvas CSS → 清除拖拽状态 → requestAnimationFrame(schedulePreview)
            ↓ 不调用 setZoom，canvas CSS 尺寸不变，仅重绘 Canvas 内容
```

具体改动：
1. 移除 `pointerup` 中的 `setZoom(savedZoom)` 调用
2. 改用 `requestAnimationFrame` 触发一次预览重绘
3. 由于 `_borderDragState` 已清除，`applyZoom` 不会在重绘中被调用
4. Canvas 屏幕尺寸保持不变，仅内容重绘

---

## 涉及文件

| 文件 | 变更类型 | 影响范围 |
|------|----------|----------|
| `js/app.js` | 逻辑修改 | `buildMergedPreset`、`setupPresetSave`、`setupBorderResizeMode`（松手处理） |
| `js/storage.js` | 数据模型扩展 | `saveCustomPreset` 增加 `presetType` 字段 |
| `index.html` | UI 变更 | 保存预设弹窗增加类型选择 |

## 兼容性

- 旧版自定义预设没有 `presetType` 字段 → 默认为 `'full'`（向后兼容）
- 不影响内置预设（`isCustom: false` 不走此逻辑）

---

## 问题 3：裁切模式仅支持缩放，不支持自由裁切

### 现状
- `CropEditor` 的 `_clamp()` 方法限制了照片不能移出帧框外
- 用户只能"放大后平移"，不能自由调整裁切区域（如：把裁切框上移裁掉底部、下移裁掉顶部）
- 帧框四角的装饰把手不可交互

### 修改后行为
- 帧框四角把手可拖拽，自由调整裁切框大小（上下左右自由裁切）
- 拖拽帧框内部区域仍可平移整个裁切框
- 滚轮仍可缩放照片
- 裁切框不能缩小到小于照片的可视区域（仍需覆盖照片）

### 实现方式

文件：`js/crop-editor.js`

在 `_setupEvents` 中增加帧框把手拖拽逻辑：

1. **把手检测**：在 `pointerdown` 中检测点击位置是否在四角把手区域（已有视觉渲染，需加事件绑定）
2. **把手拖拽**：`pointermove` 中调整 `frameW/frameH/frameX/frameY`
3. **帧框移动**：拖拽帧框内部区域时，移动整个 frame（photo 不动）
4. **约束**：裁切框始终至少覆盖照片的可视区域，不能裁掉整张照片

具体改动：
- `_setupFrame()` 增加把手 hit test 半径计算
- `_setupEvents()` 增加把手拖拽事件（pointerdown/move/up）
- `_clamp()` 增加裁切框边界约束：frame 不能小于照片的最小可视区域
- `_draw()` 已有把手渲染，无需改动

---

## 问题 4：文字拖放难居中对齐

### 现状
- 文字拖放定位是自由的，但很难精确做到水平居中、垂直居中、或左右对齐
- 没有视觉参考线提示当前文字是否居中

### 修改后行为
- 文字拖拽时显示对齐参考线（水平中线、垂直中线）
- 当文字位置接近居中时自动吸附（容差 5px）
- 在文字位置控制区域增加快捷按钮：水平居中、垂直居中、左对齐、右对齐、底对齐

### 实现方式

文件：`js/app.js`（文字拖拽逻辑）+ `index.html`（快捷按钮 UI）

- 在 `updateTextPosHandle` 中，当文字块靠近画布中线时绘制参考线
- 增加 `snapToCenter` 函数：距离 < 5px 时自动吸附
- 在信息面板增加快捷对齐按钮

---

## 问题 5：边框调整难判断是否对称

### 现状
- 外边框是画布（白色背景），内边框是照片
- 拖拽调整边框时难以判断左右/上下是否对称
- 没有数值参考或视觉提示来帮助判断

### 修改后行为
- 边框拖拽时，实时显示四边百分比数值标签
- 当左右边框差值 < 1% 时，显示"对称"提示并自动吸附
- 当上下边框差值 < 1% 时，显示"对称"提示并自动吸附
- 在边框控制面板增加快捷按钮：左右对称、上下对称

### 实现方式

文件：`js/app.js`（边框拖拽逻辑）+ `index.html`（快捷按钮 + 对称提示 UI）

- 在 `updateBorderResizeHandlesDrag` 中增加参考线：当左右/上下差值 < 1% 时绘制中线
- 在边框控制面板增加"左右对称"、"上下对称"按钮，点击后取平均值

---

## 更新后涉及文件

| 文件 | 变更类型 | 影响范围 |
|------|----------|----------|
| `js/app.js` | 逻辑修改 | `buildMergedPreset`、`setupPresetSave`、`setupBorderResizeMode`（松手处理）、文字拖拽参考线、边框对称吸附 |
| `js/storage.js` | 数据模型扩展 | `saveCustomPreset` 增加 `presetType` 字段 |
| `js/crop-editor.js` | 交互增强 | 增加帧框把手拖拽、自由裁切 |
| `index.html` | UI 变更 | 保存预设弹窗增加类型选择 + 边框快捷按钮 + 文字对齐快捷按钮 |
