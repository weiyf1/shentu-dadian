# 图片缩放与标记定位算法

目标：无论图片如何缩放、平移、切换窗口或重新打开，标记图钉的锚点都始终落在同一个图片像素上。

## 1. 最终不变量

系统必须始终满足以下不变量：

1. 数据库只保存图片原始像素坐标 `(x, y)`。
2. 标记锚点不保存屏幕坐标、百分比或缩放后的坐标。
3. 图片和标记共用同一个平移、缩放状态。
4. 图钉的视觉尺寸保持屏幕大小，但锚点仍精确落在图片像素上。
5. 缩放以用户鼠标或双指中心为锚点，锚点下的图片内容不移动。

## 2. 坐标系

### 2.1 图片坐标 Image Space

坐标单位为图片原始像素：

```text
(0, 0) ──────────────> x
  │
  │      图片内容
  ▼
  y
```

标记数据库记录：

```json
{
  "x": 842.5,
  "y": 310.25
}
```

约束：

```text
0 <= x < image.naturalWidth
0 <= y < image.naturalHeight
```

### 2.2 视口坐标 Viewport Space

视口是承载图片的固定区域，不随图片缩放改变大小。

```text
viewportRect = viewportElement.getBoundingClientRect()
viewportX = clientX - viewportRect.left
viewportY = clientY - viewportRect.top
```

所有指针坐标统一换算到视口坐标后再参与计算。

### 2.3 屏幕坐标 Screen Space

浏览器窗口坐标，只用于 Popover、Tooltip 和右键菜单定位，不用于标记持久化。

## 3. DOM 结构

推荐结构：

```html
<div class="viewport" ref="viewportEl">
  <div
    class="content"
    :style="{
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      transform: `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`,
    }"
  >
    <img class="image" :src="imageUrl" draggable="false" />

    <button
      v-for="annotation in annotations"
      :key="annotation.id"
      class="marker-anchor"
      :style="{
        left: `${annotation.x}px`,
        top: `${annotation.y}px`,
      }"
      @pointerdown.stop
      @click.stop="selectAnnotation(annotation)"
    >
      <span
        class="marker-visual"
        :style="{ transform: `scale(${1 / scale})` }"
      >
        {{ annotation.number }}
      </span>
    </button>
  </div>

  <!-- Popover 放在非缩放层 -->
  <div class="screen-overlay"></div>
</div>
```

核心 CSS：

```css
.viewport {
  position: relative;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

.content {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.image {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.marker-anchor {
  position: absolute;
  width: 0;
  height: 0;
  overflow: visible;
  border: 0;
  padding: 0;
  background: transparent;
}

.marker-visual {
  position: absolute;
  left: -17px; /* 宽度 34px 的一半 */
  top: -42px; /* 高度 42px */
  width: 34px;
  height: 42px;
  transform-origin: 50% 100%;
}
```

重点：

- `.content` 的尺寸始终等于图片原始像素尺寸。
- 图片不使用响应式 `width: 100%` 去改变布局尺寸，缩放只通过 `transform` 完成。
- `.content` 的 `transform-origin` 必须是 `0 0`。
- 标记锚点定位在图片自然坐标中，随父容器一起变换。

## 4. 变换模型

设：

- `s`：缩放比例 `scale`
- `tx`：水平平移 `panX`
- `ty`：垂直平移 `panY`
- `(ix, iy)`：图片原始像素坐标
- `(vx, vy)`：视口坐标

CSS：

```css
transform: translate(tx, ty) scale(s);
transform-origin: 0 0;
```

对应数学映射：

```text
vx = tx + ix * s
vy = ty + iy * s
```

反向映射：

```text
ix = (vx - tx) / s
iy = (vy - ty) / s
```

### 4.1 图片坐标 → 视口坐标

```ts
interface ViewportState {
  scale: number
  panX: number
  panY: number
}

function imageToViewport(x: number, y: number, state: ViewportState) {
  return {
    x: state.panX + x * state.scale,
    y: state.panY + y * state.scale,
  }
}
```

### 4.2 视口坐标 → 图片坐标

```ts
function viewportToImage(x: number, y: number, state: ViewportState) {
  return {
    x: (x - state.panX) / state.scale,
    y: (y - state.panY) / state.scale,
  }
}
```

### 4.3 保存坐标

点击时只保存反向映射结果：

```ts
const point = viewportToImage(
  event.clientX - viewportRect.left,
  event.clientY - viewportRect.top,
  viewportState,
)

const annotation = {
  x: Math.round(point.x * 100) / 100,
  y: Math.round(point.y * 100) / 100,
}
```

## 5. 初始适配与居中

### 5.1 适配比例

设视口尺寸为 `vw × vh`，图片尺寸为 `iw × ih`，边距为 `padding`：

```ts
const fitScale = Math.min(
  (vw - padding * 2) / iw,
  (vh - padding * 2) / ih,
  1,
)
```

最大限制为 `1`，避免小图被强制放大而模糊。用户可以主动放大。

### 5.2 居中

```ts
const panX = (vw - iw * fitScale) / 2
const panY = (vh - ih * fitScale) / 2
```

初始状态：

```ts
viewportState = {
  scale: fitScale,
  panX,
  panY,
}
```

### 5.3 数值示例

图片：`1920 × 1080`  
视口：`1000 × 700`  
边距：`24`

```text
fitScale = min((1000 - 48) / 1920, (700 - 48) / 1080, 1)
         = min(952 / 1920, 652 / 1080, 1)
         = 952 / 1920
         ≈ 0.495833

panX = (1000 - 952) / 2 = 24
panY = (700 - 535.5) / 2 = 82.25
```

标记 `(842.5, 310.25)` 的屏幕位置：

```text
vx = 24 + 842.5 × (952 / 1920) ≈ 441.71
vy = 82.25 + 310.25 × (952 / 1920) ≈ 236.08
```

## 6. 以鼠标为中心缩放

这是标记不漂移的核心算法。

### 6.1 输入

- 当前状态：`s、tx、ty`
- 鼠标锚点：`(ax, ay)`，使用视口坐标
- 新缩放：`s2`

### 6.2 公式

鼠标下对应的图片点：

```text
ix = (ax - tx) / s
iy = (ay - ty) / s
```

缩放后要让该图片点仍然位于鼠标下：

```text
ax = tx2 + ix * s2
ay = ty2 + iy * s2
```

因此：

```text
tx2 = ax - ix * s2
ty2 = ay - iy * s2
```

代入 `ix`、`iy` 后得到实现形式：

```ts
function zoomAt(
  state: ViewportState,
  anchorX: number,
  anchorY: number,
  nextScale: number,
): ViewportState {
  const ratio = nextScale / state.scale

  return {
    scale: nextScale,
    panX: anchorX - (anchorX - state.panX) * ratio,
    panY: anchorY - (anchorY - state.panY) * ratio,
  }
}
```

### 6.3 滚轮缩放

```ts
function handleWheel(event: WheelEvent) {
  event.preventDefault()

  const rect = viewportElement.getBoundingClientRect()
  const anchorX = event.clientX - rect.left
  const anchorY = event.clientY - rect.top

  let delta = event.deltaY
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    delta *= 16
  } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    delta *= rect.height
  }

  const factor = Math.exp(-delta * 0.0015)
  const nextScale = clamp(
    viewportState.scale * factor,
    minScale,
    maxScale,
  )

  viewportState = zoomAt(
    viewportState,
    anchorX,
    anchorY,
    nextScale,
  )
}
```

缩放按钮以视口中心为锚点：

```ts
const anchorX = viewportWidth / 2
const anchorY = viewportHeight / 2
```

### 6.4 缩放范围

```ts
const minScale = Math.max(0.0001, fitScale * 0.5)
const maxScale = Math.min(8, Math.max(1, fitScale * 12))
```

用户始终可以缩小到适配视图，也可以放大到检查细节。

## 7. 平移

### 7.1 鼠标拖动

```ts
interface DragStart {
  pointerX: number
  pointerY: number
  panX: number
  panY: number
}

function beginDrag(event: PointerEvent) {
  dragStart = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    panX: viewportState.panX,
    panY: viewportState.panY,
  }
  viewportElement.setPointerCapture(event.pointerId)
}

function moveDrag(event: PointerEvent) {
  if (!dragStart) return

  viewportState = {
    ...viewportState,
    panX: dragStart.panX + event.clientX - dragStart.pointerX,
    panY: dragStart.panY + event.clientY - dragStart.pointerY,
  }
}
```

平移只修改 `panX`、`panY`，不修改标记坐标。

### 7.2 拖动与点击的区分

记录指针按下到抬起的总移动距离：

```ts
const dragDistance = Math.hypot(
  event.clientX - pointerDownX,
  event.clientY - pointerDownY,
)

const isClick = dragDistance < 4
```

只有 `isClick` 为真且目标不是已有图钉时，才新增标记。

### 7.3 边界限制

保留至少 `margin = 64px` 的图片内容在视口内：

```ts
function clampPan(
  state: ViewportState,
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
): ViewportState {
  const scaledWidth = imageWidth * state.scale
  const scaledHeight = imageHeight * state.scale
  const margin = 64

  const panX =
    scaledWidth <= viewportWidth
      ? (viewportWidth - scaledWidth) / 2
      : clamp(
          state.panX,
          viewportWidth - scaledWidth - margin,
          margin,
        )

  const panY =
    scaledHeight <= viewportHeight
      ? (viewportHeight - scaledHeight) / 2
      : clamp(
          state.panY,
          viewportHeight - scaledHeight - margin,
          margin,
        )

  return { ...state, panX, panY }
}
```

边界限制在缩放或拖动结束后执行。极少数情况下，放大靠近边缘时锚点会有轻微位移，这是为了保证图片不会完全移出视口。

## 8. 双指缩放

使用 Pointer Events 同时维护最多两个指针。

```text
startDistance：双指初始距离
startMidpoint：双指初始中点
currentDistance：当前距离
currentMidpoint：当前中点
```

计算初始中点下的图片坐标：

```ts
const anchorImage = viewportToImage(
  startMidpoint.x,
  startMidpoint.y,
  startState,
)
```

计算新缩放：

```ts
const nextScale = clamp(
  startState.scale * (currentDistance / startDistance),
  minScale,
  maxScale,
)
```

让该图片点跟随当前双指中点：

```ts
const nextState = {
  scale: nextScale,
  panX: currentMidpoint.x - anchorImage.x * nextScale,
  panY: currentMidpoint.y - anchorImage.y * nextScale,
}
```

这个公式同时处理“双指缩放”和“双指移动”，不需要分别实现。

## 9. 图钉视觉尺寸保持不变

父容器缩放 `s` 后，图钉也会被一起放大。为了让图钉在屏幕上始终是 `34 × 42` CSS 像素，图钉内部做反向缩放：

```css
.marker-visual {
  transform: scale(1 / s);
  transform-origin: 50% 100%;
}
```

推导：

- 图钉的布局尺寸是 `W × H`。
- 父容器把图钉放大为 `W*s × H*s`。
- 图钉自身缩小 `1/s`，视觉尺寸恢复为 `W × H`。
- 反向缩放原点是图钉底部中心，即锚点所在位置。
- 所以视觉尺寸变化时，锚点不会移动。

标记锚点：

```css
.marker-anchor {
  left: x px;
  top: y px;
}
```

图钉底部中心：

```css
.marker-visual {
  left: -17px;
  top: -42px;
  width: 34px;
  height: 42px;
  transform-origin: 50% 100%;
}
```

这样图钉尖端恰好落在 `(x, y)`。

选择态可额外绘制一个直径 12px 的高亮圆点，同样使用反向缩放，圆心必须与锚点重合。

## 10. 就地编辑 Popover（可选）

产品的主编辑入口是右侧标记面板。若额外实现画布内的快速编辑 Popover，它不能放进缩放容器，否则文字和输入框也会被缩放。

使用图片坐标计算屏幕位置：

```ts
const viewportPoint = imageToViewport(annotation.x, annotation.y, state)
const rect = viewportElement.getBoundingClientRect()

const screenX = rect.left + viewportPoint.x
const screenY = rect.top + viewportPoint.y
```

Popover 使用 `position: fixed`：

```ts
popoverStyle = {
  left: `${screenX}px`,
  top: `${screenY}px`,
  transform: 'translate(-50%, calc(-100% - 48px))',
}
```

靠近视口顶部时翻转到标记下方，靠近左右边缘时向内收。

## 11. 图片加载与窗口变化

### 11.1 图片加载

```ts
await imageElement.decode()

imageWidth = imageElement.naturalWidth
imageHeight = imageElement.naturalHeight

applyFitView()
```

只有拿到 `naturalWidth` 和 `naturalHeight` 后才能初始化视图和渲染标记。

服务端已经根据 EXIF 方向归一化图片，因此浏览器看到的自然宽高应与数据库一致。如果不一致：

- 以浏览器实际解码尺寸为准。
- 记录告警并阻止保存新标记，直到元数据被修复，避免坐标空间不一致。

### 11.2 视口尺寸变化

使用 `ResizeObserver` 监听视口：

```ts
const observer = new ResizeObserver(() => {
  recalculateFitScale()
  viewportState = clampPan(
    viewportState,
    viewportWidth,
    viewportHeight,
    imageWidth,
    imageHeight,
  )
})
```

用户已经操作过画布时，窗口变化只重新计算边界，不强制重置其位置。

## 12. 设备像素比与浏览器缩放

Pointer Events 和 `getBoundingClientRect()` 都使用 CSS 像素。

算法中不需要乘 `window.devicePixelRatio`：

- 使用 DOM 渲染时，浏览器自动处理高分屏。
- 若未来改成 Canvas，才需要在绘制时乘 DPR。
- 浏览器页面缩放后，`clientX` 和 `rect` 仍然使用同一套 CSS 像素，因此公式不变。

## 13. 推荐代码结构

把数学逻辑拆成纯函数，避免和 Vue 响应式、DOM 事件耦合：

```text
src/
  lib/
    viewportMath.ts
      clamp
      fitViewport
      imageToViewport
      viewportToImage
      zoomAt
      clampPan
  composables/
    useImageViewport.ts
      维护 scale / panX / panY
      处理 wheel / pointer / pinch / resize
```

纯函数可以直接用单元测试验证，不需要浏览器环境。

## 14. 性能

单张图最多 50 个标记：

- 坐标转换是常数时间 `O(1)`。
- 渲染全部标记是 `O(n)`，`n <= 50`。
- 缩放和平移只修改一个容器 transform，避免逐像素重绘图片。
- 图钉使用 `transform` 定位，不使用会触发布局重排的 `left/top` 动画。
- 指针移动可使用 `requestAnimationFrame` 合并更新，每个动画帧只应用最后一次状态。

## 15. 常见错误

以下做法会导致标记漂移，禁止使用：

1. 把 `event.clientX` 直接保存为标注坐标。
2. 使用 `event.offsetX`，因为目标可能是图钉或图片节点。
3. 缩放时修改 `<img>` 的 `width`、`height`，导致布局尺寸与自然尺寸不一致。
4. 只缩放图片，不同时更新标记所在的同一个容器。
5. 使用 `transform-origin: center`。
6. 保存百分比坐标却按像素渲染，或反过来。
7. 在缩放容器里放 Popover、输入框或大段文字。
8. 拖动结束时没有判断移动距离，误把平移当成新增标记。
9. 使用 `devicePixelRatio` 二次换算 CSS 像素。
10. 重新打开图片时按当前屏幕大小重新计算标记坐标。

## 16. 验收测试

### 16.1 纯函数测试

1. 任意 `scale`、`pan` 下执行“图片坐标 → 视口坐标 → 图片坐标”，误差小于 `0.001px`。
2. 在任意锚点执行 `zoomAt`，锚点对应的图片坐标在缩放前后误差小于 `0.001px`。
3. 初始适配后图片完整位于视口内并居中。
4. 平移边界限制后，图片不会被完全移出视口。
5. 双指中点移动时，中点下的图片内容保持跟随。

### 16.2 浏览器测试

1. 在图片 `(800, 450)` 添加标记。
2. 放大到 4 倍，再平移到任意位置。
3. 图钉尖端与重新计算的屏幕位置误差不超过 `1px`。
4. 刷新页面后重新打开图片，标记仍位于 `(800, 450)`。
5. 缩放后在新的位置添加标记，数据库中的坐标必须与当前变换对应。
6. 拖动图片不能新增标记。
7. 图钉在 25%、100%、400% 缩放下保持相同屏幕尺寸。
8. 编辑 Popover 在不同缩放比例下保持正常字号，并跟随锚点。

### 16.3 数值复现

图片 `1920 × 1080`，视口 `1000 × 700`，初始状态：

```text
scale = 952 / 1920 = 0.495833...
panX = 24
panY = 82.25
```

以视口中心 `(500, 350)` 放大 1.5 倍：

```text
newScale = 0.74375
panX = 500 - (500 - 24) × 1.5 = -214
panY = 350 - (350 - 82.25) × 1.5 = -51.625
```

视口中心在缩放前对应的图片点：

```text
ix = (500 - 24) / (952 / 1920) = 960
iy = (350 - 82.25) / (952 / 1920) = 540
```

缩放后该点仍在中心：

```text
vx = -214 + 960 × 0.74375 = 500
vy = -51.625 + 540 × 0.74375 = 350
```

该数值用例应作为 `zoomAt` 的第一条单元测试。
