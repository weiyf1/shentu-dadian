# 审图打点测试文档

测试日期：2026-10-21  
测试环境：Windows、Node.js 22.17.0、Microsoft Edge、Playwright 1.64  
结论：20 项正常自动化测试通过，1 项已知限制测试按预期失败。

## 1. 测试目标

测试重点不是只验证“页面能打开”，而是覆盖四条核心链路：

1. 图片坐标在缩放、平移和刷新后保持一致。
2. 图片、标记、作者和权限正确持久化到本地 SQLite。
3. 多人操作时不同标记可以合并，同一标记不会被静默覆盖。
4. 保存和删除后，其他标签页能通过 SSE 及时同步。

## 2. 测试分层

| 层级 | 工具 | 数量 | 作用 |
|---|---|---:|---|
| 后端类型检查 | TypeScript `tsc --noEmit` | 1 | 验证后端类型契约 |
| 后端集成测试 | Node Test Runner + Fastify inject | 11 | 验证接口、SQLite、权限和事务 |
| 画布数学单元测试 | Vitest | 5 | 验证坐标和缩放公式 |
| 浏览器 E2E | Playwright + Microsoft Edge | 4 | 验证真实前后端完整流程 |
| 静态检查 | Oxlint + ESLint | 1 | 检查代码静态问题 |
| 构建检查 | Vite / tsc | 2 | 验证前后端可生成生产产物 |
| 运行时依赖审计 | npm audit | 1 | 检查前端生产依赖已知漏洞 |
| 已知失败测试 | Playwright 独立配置 | 1 | 复现未保存草稿丢失限制 |

正常套件合计：

```text
11 + 5 + 4 = 20 项通过
```

## 3. 测试隔离

### 3.1 后端测试

每个测试使用 `mkdtemp()` 创建独立临时目录，数据库路径类似：

```text
<系统临时目录>/shentu-server-xxxx/app.db
```

测试结束后：

- 关闭 Fastify 和 SQLite 连接。
- 删除临时数据库。
- 不触碰主数据库 `apps/server/data/app.db`。

上传测试使用临时 `uploads/` 目录。

### 3.2 前端 E2E

Playwright 使用独立数据：

```text
apps/server/data/e2e.db
apps/server/data/e2e-uploads/
```

每次运行前由以下脚本清理并重新 seed：

```text
apps/web/scripts/clean-e2e.mjs
```

测试服务端口：

```text
后端：3011
前端：5174
```

不会占用正常开发端口 `3001/5173`，也不会删除主数据库。

Playwright 配置：

- 单 worker 串行执行，避免同一图片数据互相干扰。
- 使用系统 Microsoft Edge。
- 失败时保留截图和 trace。
- 默认 E2E 排除 `known-failure` 目录。

## 4. 后端集成测试

测试文件：

```text
apps/server/test/app.test.ts
```

执行：

```powershell
cd apps\server
npm test
```

### BE-01 健康检查

前置：

- 创建临时 SQLite。
- 执行数据库迁移。

操作：

```http
GET /api/health
```

断言：

- HTTP `200`。
- `status = ok`。
- 数据库连接成功。
- `migrationCount = 2`。

### BE-02 未知路由

操作：

```http
GET /api/unknown
```

断言：

- HTTP `404`。
- `error.code = NOT_FOUND`。
- 响应包含 `requestId`。

### BE-03 操作人同名复用

操作：

1. 创建姓名“王芳”，姓名前后带空格。
2. 再次创建“王芳”。

断言：

- 第一次返回 `201` 且 `created = true`。
- 姓名被 trim。
- 第二次返回 `200` 且 `created = false`。
- 两次返回同一个操作人 ID。

### BE-04 写接口身份校验

场景：

- 不带 `X-Operator-Id`。
- 携带不存在的操作人 ID。

断言：

- 两种请求均返回 HTTP `400`。
- 错误码为 `OPERATOR_REQUIRED`。

### BE-05 标记 CRUD 与版本

操作：

1. 新增标记，坐标 `25.126`。
2. 重复提交同一 ID 和内容。
3. 使用错误版本修改。
4. 使用正确版本修改。
5. 使用旧版本删除。
6. 使用正确版本删除。

断言：

- 坐标保存为两位小数 `25.13`。
- 重复新增是幂等的，返回 `200`，不重复创建。
- 旧版本修改返回 `409 ANNOTATION_CONFLICT`。
- 正确修改后 `version` 从 1 变成 2。
- 旧版本删除返回 `409`。
- 正确删除后图片标记数为 0。

### BE-06 标记编辑和删除权限

操作：

1. 作者甲创建标记。
2. 作者乙尝试单条修改。
3. 作者乙尝试批量修改。
4. 作者甲修改自己的说明。
5. 作者乙尝试单条删除。
6. 作者乙尝试批量删除。
7. 作者甲删除自己的标记。

断言：

- 非作者修改返回 `403 ANNOTATION_EDIT_FORBIDDEN`。
- 非作者删除返回 `403 ANNOTATION_DELETE_FORBIDDEN`。
- 非作者批量修改和删除均返回 `403`。
- 失败的批量操作不会删除标记。
- 原说明保持不变。
- 作者本人修改和删除成功。

### BE-07 不同标记合并与同标记冲突

操作：

1. 使用旧 `observedRevision` 新增第三个标记。
2. 使用新版本修改一个标记、删除一个标记、新增一个标记。
3. 使用旧标记版本再次修改同一标记。

断言：

- 旧的图片版本不会阻止不同标记合并。
- 响应 `concurrentChanges = true`。
- 图片 `revision` 每次成功事务只递增一次。
- 删除后的编号不复用。
- 返回完整标记快照。
- 同一标记旧版本修改返回 `409 ANNOTATION_CONFLICT`。
- 冲突详情包含当前说明 `currentNote`。

### BE-08 图片上传、读取与删除权限

操作：

1. 上传 40×30 PNG。
2. 使用 `If-None-Match` 请求图片内容。
3. 上传 SVG。
4. 其他操作人尝试删除图片。
5. 上传人删除图片。
6. 删除后再次请求图片内容。

断言：

- 上传返回 `201`。
- `uploadedBy` 是上传人。
- 图片内容返回 `image/png`，ETag 命中返回 `304`。
- SVG 返回 `415 UNSUPPORTED_IMAGE_TYPE`。
- 非上传人删除返回 `403 IMAGE_DELETE_FORBIDDEN`。
- 上传人删除返回 `200`。
- 删除后图片内容返回 `404`。

### BE-09 标记数量上限

前置：

- 直接向临时数据库插入 50 个标记。

操作：

- 通过 API 添加第 51 个标记。

断言：

- 返回 `409 ANNOTATION_LIMIT_REACHED`。
- 原 50 个标记不受影响。

### BE-10 演示数据幂等

操作：

- 连续执行两次 `seedDemoData()`。

断言：

- 图片仍为 3 张。
- 标记仍为 3 个。
- 带标记的演示图排在图片列表首位。
- 演示 PNG 文件存在。
- `PRAGMA foreign_key_check` 无错误。

### BE-11 数据库触发器

场景：

- 插入 `x = image.width` 的越界标记。
- 修改已有标记的 `x`。

断言：

- 越界插入被 `annotation_out_of_bounds` 拒绝。
- 位置修改被 `annotation_position_immutable` 拒绝。

## 5. 画布数学单元测试

测试文件：

```text
apps/web/src/lib/viewportMath.spec.ts
```

执行：

```powershell
cd apps\web
npm run test:unit
```

### FE-UT-01 坐标往返

在多种缩放和平移状态中执行：

```text
图片坐标 → 视口坐标 → 图片坐标
```

断言误差小于 `1e-8`。

### FE-UT-02 初始适配

输入：

- 图片 `1920 × 1080`
- 视口 `1000 × 700`
- 边距 `24`

断言：

- `fitScale = 952 / 1920`
- `panX = 24`
- `panY = 82.25`

### FE-UT-03 鼠标锚点缩放

断言：

- 缩放前鼠标下的图片坐标为 `(960, 540)`。
- 1.5 倍缩放后该图片点仍位于视口中心。
- 误差小于 `1e-8`。

### FE-UT-04 缩放边界

断言：

- `fitScale = 0.5` 时最小缩放为 `0.25`。
- 最大缩放为 `6`。
- 超出范围的缩放被 clamp。

### FE-UT-05 平移边界

断言：

- 小于视口的图片自动居中。
- 大于视口的图片保留至少 `64px` 可见区域。

## 6. 浏览器 E2E

测试文件：

```text
apps/web/e2e/annotation-flow.spec.ts
```

执行：

```powershell
cd apps\web
npm run test:e2e
```

### E2E-01 完整标注与清晰图钉

步骤：

1. 首次输入姓名登录。
2. 打开“秋季新品主图”。
3. 选中王芳的标记，确认说明框只读。
4. 缩放到约 96%。
5. 检查图钉祖先层不存在非 1 缩放矩阵。
6. 拖动图片，确认不新增标记。
7. 点击图片内部安全位置，新建自己的标记。
8. 确认自己的标记出现删除按钮。
9. 填写说明并保存。
10. 刷新页面。

断言：

- 放大后图钉文字和边框保持清晰。
- 拖动只平移图片。
- 新标记保存成功。
- 刷新后标记说明仍然存在。
- 其他人的标记不能编辑或删除。

### E2E-02 图片上传与上传人删除

步骤：

1. 登录为“上传验收员”。
2. 上传一张 PNG 并填写标题。
3. 自动进入图片工作台。
4. 确认上传人显示为当前用户。
5. 点击“删除图片”并确认。

断言：

- 上传后自动打开图片。
- 只有上传人看到删除图片按钮。
- 删除后返回图片库。
- 图片卡片从图片库消失。

### E2E-03 同浏览器多用户

步骤：

1. 标签页 A 登录“甲操作员”。
2. 标签页 B 登录“乙操作员”。
3. 分别在两个标签页切换操作人。
4. 故意清空共享操作人目录。
5. 同时刷新两个标签页。

断言：

- 两个标签页可以同时使用不同身份。
- 切换一个标签页不会改变另一个。
- 共享目录被清空后，两页仍从各自 `sessionStorage` 恢复身份。

### E2E-04 实时同步、草稿保留与删除

步骤：

1. 标签页 A 使用“实时甲”打开图片。
2. 标签页 B 使用“实时乙”打开同一图片。
3. B 创建自己的标记并填写说明，但不保存。
4. A 创建另一个标记并保存。
5. B 不刷新页面，检查远端新增标记。
6. A 选中王芳的标记，确认说明框只读。
7. B 保存自己的草稿。
8. A 不刷新页面，检查 B 的说明。
9. A 删除自己刚创建的标记。

断言：

- 远端新增在 2 秒验收窗口内出现。
- B 的未保存本地草稿未丢失。
- 非创建人的说明框只读。
- B 保存后 A 在 2 秒内看到结果。
- A 删除自己的标记后，B 在 2 秒内看到图钉和列表消失。

## 7. 静态检查、构建与审计

### 后端类型检查

```powershell
cd apps\server
npm run typecheck
```

检查 Fastify、Zod、SQLite 类型和路由参数。

### 后端生产构建

```powershell
cd apps\server
npm run build
```

输出到 `apps/server/dist/`。

### 前端 lint

```powershell
cd apps\web
npm run lint
```

执行 Oxlint 和 ESLint，包括 Vue、TypeScript、Playwright 配置检查。

### 前端生产构建

```powershell
cd apps\web
npm run build
```

执行：

- `vue-tsc --build`
- `vite build`

输出到 `apps/web/dist/`。

### 前端运行时依赖审计

```powershell
cd apps\web
npm audit --omit=dev
```

结果：

```text
0 vulnerabilities
```

只检查生产依赖，不检查开发工具依赖。

## 8. 当前测试结果

| 检查 | 结果 |
|---|---|
| 后端 TypeScript | 通过 |
| 后端测试 | 11 passed |
| 后端构建 | 通过 |
| 画布数学单元测试 | 5 passed |
| 浏览器 E2E | 4 passed |
| 前端 lint | 通过 |
| 前端构建 | 通过 |
| 前端运行时依赖 audit | 0 vulnerabilities |

## 9. 已知失败测试

执行：

```powershell
cd apps\web
npm run test:known-failure
```

预期：

```text
1 failed
```

场景：

- 新建标记并填写说明。
- 不保存。
- 强制关闭页面。
- 重新打开。
- 草稿无法恢复。

该测试独立于正常 E2E，故正常套件仍保持 4/4 通过。

详细输出见 [VERIFICATION.md](VERIFICATION.md)。

## 10. 未覆盖范围

当前自动化测试不覆盖：

- Chrome、Firefox、Safari 的跨浏览器矩阵。
- 手机和平板上的真实双指硬件手势。
- 长时间运行的 SSE 连接稳定性。
- 网络断开、代理超时和数据包延迟。
- 多 Node 实例下的 SSE 广播。
- 超过 10 MB 图片和超大尺寸图片的持续压力测试。
- 浏览器进程崩溃后的未保存草稿恢复。
- 视觉像素级回归对比。
- 完整安全渗透测试。

## 11. 测试维护规则

- 新功能必须同时补接口或浏览器测试。
- 修改数据库结构必须增加迁移测试。
- 修改坐标算法必须补纯函数断言。
- 修复线上问题先增加失败回归用例，再修代码。
- 已知限制可以使用独立 expected-failure 测试，但必须在文档中解释原因。
- 默认测试必须保持全绿；已知失败不能混入默认 CI。
- E2E 必须继续使用独立数据库，禁止直接操作主数据库。
