# 审图打点后端

Node.js + TypeScript + SQLite 的本地后端。

## 启动

```powershell
npm install
npm run dev
```

默认监听 `http://127.0.0.1:3001`，SQLite 文件位于 `data/app.db`。

首次启动会自动创建 3 张演示图片和 3 个演示标记，演示图片保存在 `data/uploads/`。

## 脚本

```powershell
npm run dev        # 开发模式
npm run typecheck  # TypeScript 类型检查
npm test           # 接口测试
npm run build      # 编译到 dist
npm start          # 运行编译后的服务
```

## 接口

- `GET /api/health`：服务和数据库健康检查
- `POST /api/v1/session`：获取或创建操作人
- `GET /api/v1/images`：图片列表和搜索
- `POST /api/v1/images`：上传图片
- `GET /api/v1/images/:imageId`：图片详情和标记
- `GET /api/v1/images/:imageId/content`：读取图片内容
- `POST /api/v1/images/:imageId/annotations`：新增标记
- `PATCH /api/v1/annotations/:annotationId`：修改说明
- `DELETE /api/v1/annotations/:annotationId`：删除标记
- `POST /api/v1/images/:imageId/annotations/batch`：批量保存

配置项见 `.env.example`。开发时复制为 `.env` 即可覆盖默认值。

完整的前后端接口契约见 [`docs/API.md`](../../docs/API.md)，数据库设计见 [`docs/DATABASE.md`](../../docs/DATABASE.md)。
