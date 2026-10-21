# 审图打点作业说明

仓库地址：[weiyf1/shentu-dadian](https://github.com/weiyf1/shentu-dadian)

## 1. 项目概览

这是一个面向运营同事的本地图片审图工具。

用户打开海报或商品详情图，在图片原始像素位置落下标记，填写问题说明并保存。其他同事重新打开图片时，能看到完整标记、作者和说明。多人同时操作时，不同标记可以合并，同一标记不会被静默覆盖。

项目包含：

- Vue 3 + TypeScript 前端
- Node.js + TypeScript + Fastify 后端
- 本地 SQLite 数据库
- 本地图片上传与读取
- 轻量操作人身份
- 细粒度乐观锁
- SSE 实时同步
- 自动化测试和可复现失败

完整设计入口：

- [SPEC.md](SPEC.md)
- [docs/API.md](docs/API.md)
- [docs/DATABASE.md](docs/DATABASE.md)
- [docs/VIEWPORT_ALGORITHM.md](docs/VIEWPORT_ALGORITHM.md)
- [docs/REALTIME_CONCURRENCY.md](docs/REALTIME_CONCURRENCY.md)
- [docs/VERIFICATION.md](docs/VERIFICATION.md)

## 2. 解题思路

我把需求拆成三条主线。

### 2.1 坐标必须可信

标记不能保存屏幕坐标。数据库只保存图片原始像素坐标，图片缩放和平移使用统一状态：

```text
viewportX = panX + imageX * scale
viewportY = panY + imageY * scale
```

图钉放在独立的屏幕坐标层，不参与图片 `scale`。缩放时只重新计算图钉屏幕位置，因此图钉大小稳定、文字清晰，锚点也不会漂移。

### 2.2 数据必须闭环

图片、标记、作者和版本都持久化到本地 SQLite。保存成功后刷新页面、重启前后端，数据仍然存在。

图片文件保存在本地 `data/uploads/`，SQLite 只保存元数据和文件路径，不把图片 BLOB 放进数据库。

### 2.3 协作必须可控

保存冲突以单个标记为颗粒度：

- 两人修改不同标记：都成功，自动合并。
- 两人修改同一标记：后提交者收到 `409`。
- 一人修改、一人删除同一标记：后提交者冲突。
- 保存成功后通过 SSE 通知其他标签页。
- 其他标签页收到事件后拉取最新快照，并保留未冲突的本地草稿。

没有采用“最后写入覆盖”，因为审图说明被静默覆盖比明确提示冲突更危险。

## 3. 功能范围

已实现：

- 姓名身份和浏览器多操作人档案
- 同一浏览器不同标签页使用不同操作人
- 3 张自制演示图片和演示标记
- JPG、PNG、WebP 上传，最大 10 MB
- EXIF 方向纠正、真实格式校验和 UUID 文件名
- 图片库和标题搜索
- 图片上传人展示
- 图片缩放、鼠标锚点缩放、拖动和双指缩放
- 点击图片添加标记
- 标记编号、作者、说明和时间展示
- 说明编辑、标记删除
- 标记位置不可变
- 显式批量保存和 `Ctrl/Cmd + S`
- 未保存离开提醒
- 同一标记双版本冲突处理
- SSE 实时同步和断线快照恢复
- 图片删除和本地文件清理
- 删除图片实时通知
- 数据库迁移、约束、索引和触发器

本期未做：

- 完整账号、密码和角色权限
- 商品矩形框选、自由绘制和箭头
- 标记位置拖动
- 实时逐字编辑和多人光标
- 评论线程
- PDF/图片/标注导出
- 图片替换、裁剪和滤镜
- 远程数据库和对象存储

## 4. 技术架构

```text
shentu-dadian/
  apps/
    web/                  Vue 3 + TypeScript + Vite
      src/
        components/
        composables/
        lib/
        router/
        services/
        stores/
        views/
      e2e/
    server/               Node.js + TypeScript + Fastify
      src/
        db/
        http/
        realtime/
        routes/
        services/
      test/
      data/
  docs/
  SPEC.md
  SUBMISSION.md
```

技术选择：

| 层 | 技术 |
|---|---|
| 前端 | Vue 3、TypeScript、Vue Router、Vite |
| 后端 | Node.js、TypeScript、Fastify |
| 校验 | Zod |
| 数据库 | Node `node:sqlite` |
| 图片处理 | Sharp |
| 实时同步 | Server-Sent Events |
| 单元测试 | Vitest、Node Test Runner |
| 端到端测试 | Playwright + 系统 Edge |

前端不直接访问 SQLite。链路始终是：

```text
Vue → HTTP API → Node → SQLite / 本地图片文件
```

## 5. 数据库设计

数据库文件：

```text
apps/server/data/app.db
```

核心表：

- `operators`：操作人姓名、颜色
- `images`：标题、图片尺寸、MIME、文件大小、校验和、上传人、版本和编号计数器
- `annotations`：图片坐标、说明、创建人、最后修改人、稳定编号和单条版本
- `schema_migrations`：迁移历史

关键约束：

- 外键开启。
- WAL 模式。
- 标记坐标由数据库触发器检查图片范围。
- 已有标记位置不可更新。
- 同一图片中的标记编号唯一。
- 删除图片时级联删除标记。
- 图片只有上传人可以删除。
- 标记说明和标记删除只有创建人可以执行。

## 6. 权限与身份方案

本项目不实现账号密码，只做轻量操作人识别：浏览器按标签页保存操作人身份，写请求通过 `X-Operator-Id` 携带；所有同事可查看，标记说明和删除仅创建人允许，图片仅上传人可删除。该身份仅用于区分操作者，不构成安全认证。

实现方式：

- 姓名首次使用时调用 `POST /api/v1/session`。
- 服务端生成 UUID 和颜色。
- 已知操作人档案保存在浏览器 `localStorage`，方便切换。
- 当前标签页的完整操作人对象保存在 `sessionStorage`，不依赖共享目录恢复身份。
- 同浏览器不同标签页可以登录不同操作人。
- 写接口校验操作人是否存在。
- 标记接口额外校验 `author_id`。
- 图片删除接口额外校验 `created_by_id`。

边界：

- 没有密码。
- 没有 Token 防伪造。
- 知道 ID 的人可以冒用。
- 该方案适合本机或可信内网，不适合直接暴露到公网。

如果未来部署到公网，需要增加真正的认证、授权和图片访问控制。

## 7. 接口设计

主要接口：

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/api/v1/session` | 获取或创建操作人 |
| GET | `/api/v1/images` | 图片列表和搜索 |
| POST | `/api/v1/images` | 上传图片 |
| DELETE | `/api/v1/images/:imageId` | 删除自己上传的图片 |
| GET | `/api/v1/images/:imageId` | 图片和标记快照 |
| GET | `/api/v1/images/:imageId/content` | 图片内容 |
| POST | `/api/v1/images/:imageId/annotations` | 新增单个标记 |
| PATCH | `/api/v1/annotations/:annotationId` | 修改自己的说明 |
| DELETE | `/api/v1/annotations/:annotationId` | 删除自己的标记 |
| POST | `/api/v1/images/:imageId/annotations/batch` | 批量保存新增和修改 |
| GET | `/api/v1/events` | SSE 实时事件 |

所有错误响应包含：

```json
{
  "error": {
    "code": "ANNOTATION_CONFLICT",
    "message": "该标记已被其他同事修改",
    "requestId": "request-id",
    "details": {}
  }
}
```

详细字段和示例见 [docs/API.md](docs/API.md)。

## 8. 关键技术取舍

### 8.1 原始像素坐标而不是屏幕坐标

屏幕坐标会随窗口、缩放和滚动变化。原始像素坐标在重新打开、修改窗口大小和多人设备上保持一致。

### 8.2 图钉独立屏幕层

最初把图钉放在缩放容器内，再用 `scale(1 / scale)` 反向缩放。尺寸虽然不变，但浏览器会先栅格化图钉再重采样，约 90% 开始发虚。

最终改为：

```text
图钉屏幕位置 = pan + 图片坐标 × scale
```

图钉层不参与图片缩放，因此锚点准确、文字清晰。

### 8.3 标记级乐观锁

图片 `revision` 是变化游标，标记 `version` 才是写冲突依据。

这样可以同时满足：

- 不同标记并发修改自动合并。
- 同一标记不静默覆盖。
- 所有标记在同一个 SQLite 事务中提交。

### 8.4 SSE 而不是 WebSocket

当前需求是服务端通知浏览器“某个图片发生变化”，只有单向推送。

SSE 的优点：

- 原生 EventSource。
- 自动重连。
- 实现和代理更简单。
- 不需要 Redis 或额外实时服务。

未来如果要做实时逐字编辑、在线光标和在线状态，再考虑 WebSocket。

### 8.5 删除标记立即提交

用户确认删除已有标记后，立即调用单条 DELETE，而不是等待全局保存。

删除提交成功后发送 SSE 事件，其他正在查看图片的标签页会在验收窗口内移除图钉和列表项。

## 9. AI 协作过程

AI 参与了脚手架、接口设计、数据库设计、画布算法、前后端实现、测试和文档整理。但所有结果都经过代码检查、类型检查、自动化测试和浏览器验证。

实际过程不是一次生成完成，而是根据反馈不断修正：

1. 最初用整图 `revision` 拦截所有保存。测试和实际使用暴露出不同标记也会冲突，随后改为标记级锁。
2. 最初使用图钉反向缩放。用户反馈 90% 左右开始模糊，随后改为独立屏幕坐标层。
3. 最初一个浏览器只有一个身份。用户反馈第二个标签页加载失败，随后改为每个标签页保存完整操作人对象。
4. 最初所有用户都能改删别人的标记。根据权限要求，增加服务端作者校验和前端只读状态。
5. 最初删除标记只进入本地草稿，其他标签页要等保存后才看到；后来改为确认后立即提交。
6. 最初图片没有上传人和删除权限；后来使用 `created_by_id` 记录上传人，并将删除限制为上传人。

被拒绝的方案：

- 不使用最后写入覆盖，因为会静默丢失审图说明。
- 不使用图钉反向缩放，因为文字和边框会重采样发虚。
- 不使用单一共享用户，因为同浏览器多人会互相覆盖。
- 当前不引入 WebSocket、Redis 或远程数据库，避免超出本地工具需求。

## 10. 启动与验证

环境建议：

- Node.js 24，或满足前端引擎要求的 Node 22.18+
- 最新版 Chrome 或 Edge
- 无需单独安装 SQLite 服务

当前验证机器为 Windows、Node 22.17.0、Microsoft Edge。Node 22.17 会提示部分新版依赖的引擎警告，但项目可以构建和运行。推荐升级到 Node 24。

### 启动后端

```powershell
cd apps\server
npm install
npm run dev
```

默认地址：

```text
http://127.0.0.1:3001
```

### 启动前端

另开终端：

```powershell
cd apps\web
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:5173
```

### 重置演示数据

先停止后端并备份需要保留的数据，然后删除：

```text
apps/server/data/app.db
apps/server/data/app.db-wal
apps/server/data/app.db-shm
apps/server/data/uploads/
```

重新启动后端会执行迁移并生成 3 张演示图片和 3 个演示标记。

### 验证命令

后端：

```powershell
cd apps\server
npm run typecheck
npm test
npm run build
```

前端：

```powershell
cd apps\web
npm run test:unit
npm run test:e2e
npm run lint
npm run build
```

### 实际验证结果

```text
后端 TypeScript 检查       通过
后端测试                   11 passed
后端生产构建               通过
前端画布数学单元测试        5 passed
前端浏览器 E2E             4 passed
前端 lint                  通过
前端生产构建               通过
前端运行时依赖 audit         0 vulnerabilities
```

E2E 使用独立 `e2e.db` 和 `e2e-uploads/`，不会修改主数据库。

覆盖场景包括：

- 首次姓名登录
- 同浏览器两个标签页分别使用不同用户
- 上传图片和删除自己上传的图片
- 打开图片、缩放、拖动
- 拖动不会误新增标记
- 添加标记、保存和刷新恢复
- 非创建人说明框只读
- SSE 实时同步新增标记
- 其他标签页保留未冲突草稿
- 删除标记后其他标签页立即移除

## 11. 可复现失败

题目要求留下至少一段可复现失败。项目使用独立测试命令：

```powershell
cd apps\web
npm run test:known-failure
```

测试内容：

1. 登录并打开图片。
2. 新建标记并填写说明。
3. 不保存。
4. 强制关闭页面。
5. 重新打开图片。
6. 预期草稿恢复。
7. 实际草稿丢失。

实际结果：

```text
Error: expect(locator).toBeVisible() failed
Locator: getByText('尚未保存的草稿恢复测试', { exact: true })
Expected: visible
Error: element(s) not found

1 failed
```

这是预期失败，不是普通测试套件失败。默认 `npm run test:e2e` 已排除该用例。

完整命令、截图、trace 路径和失败原因见 [docs/VERIFICATION.md](docs/VERIFICATION.md)。

## 12. 已知限制

- 浏览器被强制结束后，未保存草稿不会恢复。
- SSE 事件中心是单 Node 进程内存实现，多实例部署不在当前范围。
- 身份没有密码和防伪造 Token，ID 可被冒用。
- 单张图片最大 10 MB，仅支持 JPG、PNG、WebP。
- 图片超过原始像素分辨率继续放大时，图片本身会因插值变软；图钉仍保持清晰。
- 标记位置不可拖动，需要删除后重新添加。
- 不支持图片替换、区域框选、评论线程和导出。
- Node 22.17 使用 SQLite 时会出现实验特性提示，推荐 Node 24。

## 13. 交付清单

- [x] 可运行前端
- [x] 可运行后端
- [x] 本地 SQLite 和迁移
- [x] 内置演示数据
- [x] 图片上传与上传人权限
- [x] 标记创建、编辑、删除和保存
- [x] 细粒度并发和 SSE
- [x] 前后端接口文档
- [x] 数据库设计文档
- [x] 画布算法文档
- [x] 总规格文档
- [x] 自动化测试
- [x] 已知失败测试
- [x] 验证记录
- [x] `SUBMISSION.md`
