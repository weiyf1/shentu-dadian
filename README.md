# 审图打点

面向运营的本地图片标注工具：在图片原始像素坐标上添加标记、填写说明并持久化，重新打开图片后可以继续查看和编辑。

## 规格

产品与技术的总规格见 [`SPEC.md`](SPEC.md)。

作业说明、AI 协作记录和验证结论见 [`SUBMISSION.md`](SUBMISSION.md)。

## 本地运行

需要 Node.js 22.18+，推荐 Node 24。当前机器使用 Node 22.17 也能构建和测试，但 npm 会给出部分依赖的引擎警告。

先安装两端依赖：

```powershell
cd apps\server
npm install

cd ..\web
npm install
cd ..\..
```

启动后端：

```powershell
cd apps\server
npm run dev
```

另开终端：

```powershell
cd apps\web
npm run dev
```

打开 `http://127.0.0.1:5173`。前端会把 `/api` 代理到 `http://127.0.0.1:3001`。

数据库位于 `apps/server/data/app.db`，图片位于 `apps/server/data/uploads/`。重置演示数据的方法见 [`SUBMISSION.md`](SUBMISSION.md#10-启动与验证)。

## 项目结构

- `apps/web`：Vue 3 + TypeScript 前端
- `apps/server`：Node.js + TypeScript + SQLite 后端
- `docs/API.md`：前后端接口契约
- `docs/DATABASE.md`：SQLite 表结构、约束和并发设计
- `docs/VIEWPORT_ALGORITHM.md`：图片缩放、平移和标记定位算法
- `docs/REALTIME_CONCURRENCY.md`：细粒度并发保存与 SSE 实时同步设计
- `docs/VERIFICATION.md`：验证结果与可复现的已知失败
- `docs/TESTING.md`：测试范围、用例、命令和覆盖边界

## 接口文档

完整接口设计见 [`docs/API.md`](docs/API.md)。

数据库设计见 [`docs/DATABASE.md`](docs/DATABASE.md)。

画布坐标算法见 [`docs/VIEWPORT_ALGORITHM.md`](docs/VIEWPORT_ALGORITHM.md)。

并发与实时同步演进方案见 [`docs/REALTIME_CONCURRENCY.md`](docs/REALTIME_CONCURRENCY.md)。

验证命令、实际输出和已知失败复现步骤见 [`docs/VERIFICATION.md`](docs/VERIFICATION.md)。

完整测试文档见 [`docs/TESTING.md`](docs/TESTING.md)。
