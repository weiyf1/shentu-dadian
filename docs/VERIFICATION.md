# 验证记录与可复现失败

验证日期：2026-10-21  
环境：Windows、Node.js 22.17.0、Microsoft Edge、Playwright 1.64

## 1. 默认验证

正常测试应保持全部通过：

```powershell
cd apps\server
npm test

cd ..\web
npm run test:unit
npm run test:e2e
npm run lint
npm run build
```

当前结果：

```text
后端测试       11 passed
前端单元测试     5 passed
前端 E2E        4 passed
前端 lint       通过
前后端构建       通过
```

## 2. 可复现的已知失败

这段失败用于记录一个明确的产品限制：**浏览器被强制关闭后，未保存草稿不会恢复**。

测试文件：

```text
apps/web/e2e/known-failure/unsaved-draft-recovery.spec.ts
```

该测试不在默认 `test:e2e` 中运行。它使用独立的 Playwright 配置，并自动重建 E2E 数据库。

### 执行命令

```powershell
cd apps\web
npm run test:known-failure
```

命令预期以非零退出码结束：

```text
1 failed
```

### 复现步骤

1. 输入姓名并进入图片库。
2. 打开“秋季新品主图”。
3. 在图片空白区域新建一个标记。
4. 输入说明“尚未保存的草稿恢复测试”，但不要点击“保存修改”。
5. 使用 `page.close({ runBeforeUnload: false })` 强制关闭页面。
6. 在同一浏览器上下文重新打开该图片，并选择原操作人。
7. 预期：说明“尚未保存的草稿恢复测试”仍然可见。
8. 实际：说明不存在，未保存草稿已经丢失。

### 实际失败输出

```text
Error: expect(locator).toBeVisible() failed

Locator: getByText('尚未保存的草稿恢复测试', { exact: true })
Expected: visible
Timeout: 8000ms
Error: element(s) not found

e2e\known-failure\unsaved-draft-recovery.spec.ts:49:5
1 failed
```

失败时 Playwright 会生成：

```text
apps/web/test-results/.../test-failed-1.png
apps/web/test-results/.../trace.zip
```

可以运行以下命令查看完整浏览器轨迹：

```powershell
cd apps\web
npx playwright show-trace test-results\<失败目录>\trace.zip
```

## 3. 失败原因与边界

当前实现只在存在未保存修改时触发 `beforeunload` 提示：

- 用户通过正常页面导航离开时会被提醒。
- 浏览器被强制结束、标签页被强制关闭或进程崩溃时，提醒无法保护内存中的草稿。
- 草稿目前没有持久化到 `sessionStorage`、`localStorage` 或服务端。

因此该失败是已知限制，不是核心保存流程失败。

已验证的对照场景：

- 点击“保存修改”后，刷新页面仍能看到标记。
- 其他同事保存后，当前标签页通过 SSE 实时同步。
- 未保存草稿在新页面中不会恢复，于是该测试稳定失败。
