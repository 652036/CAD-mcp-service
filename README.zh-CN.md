# CAD MCP 服务

**简体中文** | [English](README.en.md) | [双语项目首页](README.md)

基于 TypeScript 的 Model Context Protocol（MCP）服务，通过标准输入输出（`stdio`）向 MCP 客户端提供 CAD、轻量 GIS、制图及资源环境研究辅助工具。

项目仍处于 MVP 阶段。内部 CAD 会话与真实 AutoCAD 文档是两套独立状态；内部创建的实体不会自动出现在 AutoCAD 窗口中。

## 目录

- [功能概览](#功能概览)
- [环境要求](#环境要求)
- [安装与启动](#安装与启动)
- [MCP 客户端配置](#mcp-客户端配置)
- [接管 AutoCAD 图纸](#接管-autocad-图纸)
- [常用工作流](#常用工作流)
- [文件与几何后端](#文件与几何后端)
- [测试与实机验证](#测试与实机验证)
- [故障排查](#故障排查)
- [项目结构与开发](#项目结构与开发)
- [当前限制](#当前限制)
- [许可证](#许可证)

## 功能概览

| 类别 | 主要能力 |
| --- | --- |
| 二维 CAD | 点、直线、圆、圆弧、矩形、多边形、折线；平移、旋转、镜像、偏移、修剪、延伸和阵列 |
| 图层与组织 | 图层创建、重命名、显隐、锁定、颜色；约束、标注、装配、图纸和分析辅助 |
| 会话与项目 | 事务、撤销与重做、JSON 项目保存和加载 |
| 文件与预览 | DXF 导入导出，SVG/PNG 预览，其他文件格式的辅助工具 |
| AutoCAD | Windows COM 连接、窗口及图纸绑定、读取图层/实体/变量、提交命令 |
| GIS | CRS、原点、范围、比例元数据；CSV、GeoJSON、Shapefile 和 GeoTIFF 工作流 |
| 研究制图 | 采样点、监测井、剖面线、边界面；面积、断面、简化挖填方和格网体积估算 |
| 版式 | 指北针、比例尺、图例、坐标格网、A3/A4 论文图模板及 SVG/PDF 输出 |

工具分组详见 [工具参考（英文）](skills/cad-mcp/references/tools.md)。

## 环境要求

- Node.js 与 npm。锁定依赖中的 `sharp` 要求 Node.js `^18.17.0 || ^20.3.0 || >=21.0.0`；具体依赖要求见 [package-lock.json](package-lock.json)。
- 使用 `autocad_*` 工具时，需要 Windows、Windows PowerShell 和本机已运行且支持 COM 的 AutoCAD。
- DWG 转换需要可用的 LibreDWG 命令行程序；调用 `dwg_tools_status` 检查。
- 三维几何结果依赖实际加载的后端；调用 `geometry_backend_status` 区分 OpenCascade、模拟后端或加载失败。

## 安装与启动

```bash
git clone https://github.com/652036/CAD-mcp-service.git
cd CAD-mcp-service
npm ci
npm run build
npm test
```

在 Windows PowerShell 中，如果 `npm.ps1` 被执行策略拦截，将上述 `npm` 替换为 `npm.cmd`。

通过 MCP 客户端启动构建产物：

```bash
node dist/index.js
```

也可运行 `npm start`。该服务使用 `stdio`，不是 HTTP 网页服务；直接在终端启动后等待协议输入属于正常行为。

## MCP 客户端配置

将以下服务条目加入支持 `mcpServers` 格式的客户端配置。将示例目录替换为实际克隆目录；其他配置格式的客户端需填写等价的启动命令、参数和工作目录。

```json
{
  "mcpServers": {
    "cad-mcp-server": {
      "command": "node",
      "args": ["C:/path/to/CAD-mcp-service/dist/index.js"],
      "cwd": "C:/path/to/CAD-mcp-service"
    }
  }
}
```

仓库验证脚本另外读取项目根目录下的本机配置。首次使用时，在尚无该文件的情况下复制模板：

```powershell
Copy-Item -LiteralPath mcp.config.example.json -Destination mcp.config.json
```

编辑生成的文件，将两处 `${workspaceFolder}` 替换为包含 `package.json` 的绝对目录。验证脚本不会展开这个占位符。JSON 路径使用正斜杠，或将反斜杠写为 `\\`。已有本机配置时直接检查并修改，不必重新复制。

修改 TypeScript 源码后，需要重新执行 `npm run build`，再重载 MCP 客户端中的服务。确认客户端实际启动的是当前目录的 `dist/index.js`。

## 接管 AutoCAD 图纸

先在 AutoCAD 中打开图纸，完成启动提示并退出尚未结束的交互命令。MCP Host 与 AutoCAD 应使用相同的 Windows 权限级别。

| 工具 | 作用 |
| --- | --- |
| `autocad_status` | 读取连接、窗口/进程身份、图纸和忙闲状态；不会自动建立绑定 |
| `autocad_list_documents` | 列出 COM 可访问的应用窗口及已打开图纸 |
| `autocad_attach` | 绑定指定窗口和图纸；`activate` 默认 `true` |
| `autocad_detach` | 解除本 MCP 服务的绑定，保留 AutoCAD 和图纸 |
| `autocad_activate_document` | 激活已打开的指定图纸，并更新绑定 |
| `autocad_list_layers` | 读取目标图纸的图层 |
| `autocad_list_modelspace_entities` | 读取模型空间实体，支持图层、类型和数量筛选 |
| `autocad_get_variables` | 读取 1–50 个系统变量 |
| `autocad_send_command` | 向活动目标图纸提交命令，并可轮询空闲状态 |

建议按以下顺序调用；这些是 MCP 工具名和参数，不是终端命令：

1. `autocad_status`，再调用 `autocad_list_documents`。
2. 从返回值中选择 `windowHandle` 与图纸名称或完整路径，传给 `autocad_attach`。句柄必须是返回的十进制字符串。
3. 若只想建立绑定而不激活图纸，传入 `activate: false`。这不是永久只读模式。
4. 调用图层、实体或变量读取工具，确认目标后再执行命令。
5. 操作结束后，可调用 `autocad_detach`。

读取变量的参数示例：

```json
{"names": ["CMDACTIVE", "CMDNAMES", "CLAYER", "INSUNITS"]}
```

在确认目标后，执行缩放至全部图形的命令参数示例：

```json
{"command": "_.ZOOM _E ", "waitForIdle": true, "timeoutMs": 10000}
```

命令默认只提交一次。`waitForIdle: false` 返回 `submitted`；启用等待后可能返回 `idle_observed` 或 `timeout`。`timeout` 会被标记为 MCP 错误，并保留观察到的状态。这些结果不能证明绘图效果正确，仍需查询实体或变量核验。

`timeoutMs` 为 1000–30000 毫秒，限制 COM 调用返回后的空闲轮询；独立的 45 秒桥接超时限制阻塞调用。发生超时或错误后，先检查图纸和当前命令状态，再决定是否重发。

绑定后若用户切换了活动图纸，发送命令会被拒绝；使用 `autocad_activate_document` 明确切换。关闭或重命名目标图纸后，需要重新枚举并绑定。绑定属于当前 MCP 服务进程，重载服务后需重新建立。

## 常用工作流

**内部 CAD 绘图：** `new_project` → `create_layer` → 几何创建工具 → `list_entities` → 预览与导出。批量修改可使用 `begin_transaction`、`commit_transaction` 和 `rollback_transaction`，需要撤销时使用会话历史工具。

**资源环境研究制图：** 导入 CSV 采样点 → 导入 GeoJSON/Shapefile 边界、剖面或分区 → 设置 CRS、原点、范围与比例 → 分析和制图 → 添加图例、比例尺和指北针 → 导出图件或 GIS 数据。

JSON 项目使用 `format: "cad-mcp-project"`、`formatVersion: 1`，并包含保存时间、会话快照和 CRS/原点/范围/比例元数据。

## 文件与几何后端

DXF、CSV、GeoJSON、Shapefile 及预览是主要交换路径。DWG 导入通过 `dwg2dxf` 转换，导出依赖 `dxf2dwg` 和 DXF 内容兼容性。先检查外部程序是否可用。

部分 STEP、STL、OBJ、IGES、GLTF 与 PDF 底图工具属于简化或辅助工作流，不应假定能无损转换任意工业图纸。OpenCascade 加载失败或使用模拟后端时，应以状态工具的结果为准。

## 测试与实机验证

```bash
npm run build
npm test
```

完成本机配置并打开 AutoCAD 图纸后，运行默认只读的实机检查：

```bash
node scripts/verify-autocad-mcp.mjs
```

需要验证命令提交时，显式选择以下模式；它会激活图纸并发送 `(princ)`：

```bash
node scripts/verify-autocad-mcp.mjs --command-smoke
```

报告写入 `tmp/mcp-autocad-live-report.json`。退出码 `0` 表示检查通过，`1` 表示验证失败，`2` 表示 AutoCAD 或图纸不可用。代码测试中包含模拟 COM 对象的测试；测试通过不等于已成功接管当前桌面窗口。

## 故障排查

| 现象或错误 | 处理方式 |
| --- | --- |
| 客户端找不到服务或新增工具 | 检查 `command`、`args`、`cwd`，重新构建并重载服务 |
| `NO_RUNNING_AUTOCAD` | 启动本机 AutoCAD 并打开图纸 |
| `AUTOCAD_UNAVAILABLE` | 等待启动完成，处理模态提示，检查进程权限级别；进程存在不代表 COM 已就绪 |
| `NO_DOCUMENT` | 打开图纸后重新绑定 |
| `TARGET_WINDOW_NOT_FOUND` / `TARGET_DOCUMENT_NOT_FOUND` | 重新列出窗口及图纸，再选择目标绑定 |
| `TARGET_NOT_ACTIVE` | 使用 `autocad_activate_document` 激活绑定的目标 |
| `AUTOCAD_BUSY` | 在 AutoCAD 中完成或取消当前交互命令 |
| `AUTOCAD_IDLE_TIMEOUT` / `BRIDGE_TIMEOUT` | 查询当前状态和图纸结果，避免直接重发命令 |
| DWG 转换不可用 | 检查 `dwg_tools_status`、外部程序发现结果和 DXF 兼容性 |

## 项目结构与开发

| 路径 | 用途 |
| --- | --- |
| `src/core/`、`src/session/` | 几何、场景、历史与内部会话 |
| `src/tools/` | MCP 工具与分组注册 |
| `src/integrations/` | AutoCAD COM 桥接及 PowerShell 脚本生成 |
| `src/parsers/`、`src/project/` | 数据格式解析与项目读写 |
| `assets/`、`src/resources/` | 模板、材质、块和资源注册 |
| `python/` | 可选的几何与网格分析辅助脚本 |
| `tests/`、`scripts/` | 自动化测试与验证脚本 |
| `skills/cad-mcp/` | 面向代理的使用技能与参考文档（英文） |

开发前阅读 [AGENTS.md](AGENTS.md) 与 [开发参考（英文）](skills/cad-mcp/references/development.md)。新增或删除工具时同步注册名称；推送前构建并运行测试。本机 `mcp.config.json`、`tmp/`、`BUILD_GOAL.md`、`node_modules/` 和 `dist/` 不纳入版本控制。

## 当前限制

- 真实窗口桥接面向 Windows AutoCAD COM，提供文档自动化，不提供所有 CAD 产品的通用鼠标、键盘和截图控制。
- 同版本多个 AutoCAD 进程不一定都能通过 COM 被发现；不可达的指定窗口会明确报错。
- 内部 CAD 会话的事务和撤销历史不覆盖 AutoCAD 中执行的命令。
- DWG 导出仍受简化 DXF 输出与 LibreDWG 严格解析的兼容性限制，暂不能保证往返无损转换。
- 部分 DXF 实体和折线凸度支持有限；GeoTIFF 主要用于单幅底图，未内置大范围镶嵌或瓦片工作流。
- `reproject_point` / `reproject_points` 使用 `proj4`；旧的 `transform_coords` 仅做局部与世界坐标变换，不能代替投影转换。
- 地形、挖填方与体积工具属于简化研究辅助，不保证测量级工程精度。

## 许可证

项目在 [package.json](package.json) 中声明使用 ISC 许可证。
