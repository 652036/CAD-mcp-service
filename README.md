# CAD MCP Server

基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 的 **2D CAD 辅助服务**（TypeScript）。在 AI 客户端（如 Claude / Cursor）中通过 **stdio** 暴露 Tools / Resources / Prompts，用于创建简单几何、管理图层、导入导出 DXF、保存工程 JSON 等。

当前版本：**0.1.0**（MVP）。

## 功能概览

- **2D 图元**：点、线、圆、弧、矩形、多边形、折线；内部单位 **毫米**，创建时可指定 `mm` / `cm` / `m` / `in`（`inch` 同义）/ `ft`。
- **图层**：创建、列表、将实体指定到图层。
- **DXF**：使用 `dxf-parser` 导入（LINE、CIRCLE、ARC、POINT、LWPOLYLINE 等；部分实体类型会跳过）；导出为 R12 风格文本（可带 `dxf_base64`）。
- **预览**：`render_preview_svg` 生成线框 SVG。
- **事务与撤销**：`begin_transaction` / `commit_transaction` / `rollback_transaction`；`push_undo_checkpoint` / `undo` / `redo`。
- **工程文件**：`new_project`、`save_project`、`load_project`（JSON 格式 `cad-mcp-project`，v1）。
- **Resources**：`cad://project/current`、`cad://entities/list`、`cad://layers/list`、`cad://history/undo_stack` 等只读资源。
- **Prompts**：会话引导与设计类预置提示（如 `design_part`、`generate_drawing` 等）。

## 环境要求

- Node.js **18+**（推荐 20+）
- npm

## 安装与构建

```bash
npm install
npm run build
```

## 测试

```bash
npm test
```

## 运行（MCP stdio）

本进程由 MCP 宿主 **拉起**，通过标准输入输出通信，一般不单独当 HTTP 服务使用。

```bash
npm start
# 等价于
node dist/index.js
```

### 在编辑器中配置 MCP

可参考仓库根目录的 `mcp.config.example.json`，将 `${workspaceFolder}` 换成本地克隆路径，并确保已执行 `npm run build`：

```json
{
  "mcpServers": {
    "cad-mcp-server": {
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

具体键名因客户端而异（如 Cursor、Claude Desktop 等），请对照其 MCP 配置文档粘贴或改写。

## 工程文件格式（v1）

保存/加载的 JSON 需满足：

- `format`: `"cad-mcp-project"`
- `formatVersion`: `1`
- `savedAt`: ISO 8601 字符串
- `snapshot`: 场景快照（图层列表 + 实体列表，与内部 `SceneSnapshotV1` 一致）

## 脚本说明

| 脚本 | 说明 |
|------|------|
| `npm run build` | `tsc` 编译到 `dist/` |
| `npm run start` | 运行编译后的 MCP 服务 |
| `npm run dev` | `tsc --watch` 监听编译 |
| `npm test` | `tsx` 运行 `tests/*.test.ts` |

## 限制与后续方向

- 无完整参数化约束求解、无 3D 内核（OpenCASCADE 等）。
- DXF 导入对部分实体类型与多段线 **bulge** 支持有限；多图层 DXF 导出在图层表上仍为 MVP 级别。
- `cad://preview/current` 资源仅为文字提示，实际预览请使用 **`render_preview_svg`** 工具。

## 许可证

ISC（见 `package.json`）。
