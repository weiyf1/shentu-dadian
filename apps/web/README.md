# 审图打点前端

Vue 3 + TypeScript + Vite 实现的图片标注工作台。

需要 Node.js 22.18+，推荐 Node 24。

## 启动

先启动后端：

```powershell
cd ..\server
npm run dev
```

再启动前端：

```powershell
cd ..\web
npm run dev
```

默认地址：

```text
前端：http://127.0.0.1:5173
后端：http://127.0.0.1:3001
```

开发服务器会把 `/api` 代理到 `http://127.0.0.1:3001`。如需修改：

```powershell
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:3001'
npm run dev
```

## 功能

- 浏览器保存多个操作人档案，不同标签页可使用不同身份
- 图片库、标题搜索和图片上传
- 图片上传人展示，只有上传人可删除图片
- 原始像素坐标标注
- 鼠标锚点缩放、拖动平移、双指缩放
- 标记列表、选中定位、说明编辑和删除
- 只有创建人可以修改说明和删除标记，其他人的说明框为只读
- 批量保存、未保存离开保护
- 标记版本冲突提示和草稿保留
- SSE 实时同步、图片库即时刷新和同标记双版本冲突

## 脚本

```powershell
npm run dev        # 开发服务器
npm run type-check # Vue TypeScript 检查
npm run test:unit  # 画布数学单元测试
npm run test:e2e   # 使用系统 Edge 的端到端测试
npm run build      # 生产构建
npm run preview    # 预览生产构建
```

端到端测试使用独立的 `apps/server/data/e2e.db` 和 `e2e-uploads/`，不会修改主数据库。

## 环境变量

复制 `.env.example` 为 `.env`：

```dotenv
VITE_API_BASE_URL=/api/v1
```

开发时保持相对路径即可，由 Vite 代理到后端。若前端独立部署，可改成后端的完整地址。
