# CAD MCP Server / CAD MCP 服务

TypeScript-based CAD server for the Model Context Protocol (MCP).  
基于 TypeScript 的 Model Context Protocol (MCP) CAD 服务。

It exposes tools, resources, and prompts over `stdio` so an MCP client can work with CAD, lightweight GIS, and resource/environment research workflows.  
它通过 `stdio` 暴露 tools、resources 和 prompts，使 MCP 客户端可以处理 CAD、轻量 GIS 以及资源环境研究工作流。

## Status / 当前状态

This repository is still an MVP-style CAD service, but it now includes:  
这个仓库仍然属于 MVP 风格的 CAD 服务，但目前已经包含：

- broad 2D and lightweight 3D tool coverage  
  较广的 2D 与轻量 3D 工具覆盖
- PNG preview rendering through `sharp`, with SVG fallback  
  通过 `sharp` 生成 PNG 预览，并提供 SVG 回退
- OpenCascade runtime status reporting  
  OpenCascade 运行时状态报告
- a Node-compatible OpenCascade fallback loader for `opencascade.js`  
  兼容 Node 的 `opencascade.js` 回退加载器
- direct AutoCAD integration tools on Windows  
  Windows 平台下的 AutoCAD 直接集成工具
- GIS/georeference helpers for research mapping workflows  
  面向研究制图工作流的 GIS / 地理参考辅助能力
- CSV / GeoJSON / Shapefile interchange support  
  CSV / GeoJSON / Shapefile 互操作支持
- resource/environment domain tools for sampling points, monitoring wells, profile lines, and boundary polygons  
  面向资源环境场景的采样点、监测井、剖面线、边界面领域工具
- thesis/map layout helpers and drawing templates  
  论文 / 地图版式辅助工具与模板

## Features / 功能

### Internal CAD Session / 内部 CAD 会话

- 2D entities: point, line, circle, arc, rectangle, polygon, polyline  
  2D 实体：点、线、圆、圆弧、矩形、多边形、折线
- layers: create, rename, delete, visibility, lock, color  
  图层：创建、重命名、删除、显隐、锁定、颜色
- modify tools: translate, rotate, mirror, offset, trim, extend, array  
  修改工具：平移、旋转、镜像、偏移、修剪、延伸、阵列
- constraints, annotations, assemblies, drawings, and analysis helpers  
  约束、标注、装配、图纸与分析辅助
- transactions and undo/redo  
  事务与撤销 / 重做
- JSON project save/load  
  JSON 项目保存 / 加载

### GIS And Research Workflow / GIS 与研究工作流

- project CRS, origin, extent, and drawing scale metadata  
  项目 CRS、原点、范围与绘图比例元数据
- CSV import for sampling points and field observations  
  面向采样点和外业观测的 CSV 导入
- GeoJSON import/export for point, line, and polygon data  
  点、线、面 GeoJSON 导入 / 导出
- Shapefile import/export for 2D GIS exchange  
  用于二维 GIS 交换的 Shapefile 导入 / 导出
- domain tools for:
  - sampling points  
    采样点
  - monitoring wells  
    监测井
  - profile lines  
    剖面线
  - boundary polygons  
    边界面
- terrain/research helpers for:
  - polygon area statistics  
    面域统计
  - profile length and section sampling  
    剖面长度与断面采样
  - simplified cut/fill estimates  
    简化挖填方估算
  - simplified grid surface volume estimates  
    简化格网表面体积估算

### File And Preview Support / 文件与预览支持

- DXF import and export  
  DXF 导入 / 导出
- SVG, PDF-underlay, STEP-like, STL-like, OBJ-like, IGES-like, and GLTF-like workflows  
  SVG、PDF-underlay、STEP-like、STL-like、OBJ-like、IGES-like 与 GLTF-like 工作流
- preview generation as SVG or PNG  
  生成 SVG 或 PNG 预览

### OpenCascade Integration / OpenCascade 集成

- reports whether the runtime backend is using mock geometry or OpenCascade  
  报告当前运行时后端使用 mock geometry 还是 OpenCascade
- includes a compatibility fallback for environments where `opencascade.js` package-root loading fails under modern Node ESM runtimes  
  在现代 Node ESM 环境中 `opencascade.js` 包根加载失败时提供兼容回退

### AutoCAD Integration / AutoCAD 集成

On Windows, the server can inspect and bind to a running AutoCAD application through COM, then read or submit commands to its live document:  
在 Windows 平台上，服务可以通过 COM 检查并绑定正在运行的 AutoCAD 窗口，然后读取真实文档或向文档提交命令：

- `autocad_status`
- `autocad_list_documents`
- `autocad_attach`
- `autocad_detach`
- `autocad_activate_document`
- `autocad_get_variables`
- `autocad_list_layers`
- `autocad_list_modelspace_entities`
- `autocad_send_command`

Start with `autocad_list_documents` to obtain the COM-reachable application window handles and open document names/paths, then call `autocad_attach` with the target decimal `windowHandle` and `document`. `activate` defaults to `true`, activating the selected document; `false` establishes the binding without activating it. `autocad_status` reports the live target and binding. Subsequent commands reject if the bound document is no longer active; use `autocad_activate_document` to switch deliberately. `autocad_detach` clears the binding without closing AutoCAD or its documents.  
先调用 `autocad_list_documents` 获取 COM 可访问的窗口句柄与已打开文档，再用 `autocad_attach` 的十进制 `windowHandle` 和 `document` 绑定目标。`activate` 默认 `true`，会激活选中文档；设为 `false` 时只建立绑定，不激活文档。`autocad_status` 返回实时目标与绑定状态。若用户切换了活动文档，后续命令会拒绝发送；需要切换时调用 `autocad_activate_document`。`autocad_detach` 只解除绑定，不关闭 AutoCAD 或文档。

`autocad_send_command` submits a command once. Its default `waitForIdle: false` reports `submitted`; `waitForIdle: true` can report `idle_observed` after observing AutoCAD idle, or `timeout` when that observation deadline expires. A `timeout` result is an MCP error that preserves the command observations. These states do not prove the intended effect. `timeoutMs` (1000–30000 ms) bounds idle polling after the COM `SendCommand` call returns; a separate 45-second bridge timeout bounds blocking COM calls. Verify geometry or system variables afterward. After an error or timeout, do not resend before inspecting the drawing and command state. Busy documents reject command submission.  
`autocad_send_command` 只提交一次命令。默认 `waitForIdle: false` 返回 `submitted`；设为 `true` 后，观察到空闲时返回 `idle_observed`，轮询到期仍未观察到空闲则返回 `timeout`。`timeout` 会标记为 MCP 错误并保留命令状态数据。这些状态都不代表绘图结果正确。`timeoutMs`（1000–30000 毫秒）只限制 COM `SendCommand` 返回后的空闲轮询；阻塞中的 COM 调用由独立的 45 秒桥接超时限制。应继续查询实体或系统变量核验。发生错误或超时后，必须先检查图纸与命令状态，再决定是否重发。文档忙碌时会拒绝提交命令。

COM discovery cannot guarantee access to every process when several instances of the same AutoCAD version are running. A requested window that is unreachable fails explicitly instead of silently using another window. This is document automation, not general mouse/keyboard or screenshot control of every CAD product.  
同时运行同版本的多个 AutoCAD 进程时，COM 不保证能访问所有窗口。指定窗口不可达时会明确失败，不会自动改用其他窗口。这是 AutoCAD 文档自动化，不是对所有 CAD 软件的通用鼠标、键盘或截图接管。

This workflow is separate from the internal in-memory CAD session.  
这套工作流与内部内存中的 CAD 会话相互独立。

### Drawing And Thesis Layout / 出图与论文版式

- map layout creation  
  地图版式创建
- north arrow, scale bar, legend, coordinate grid  
  指北针、比例尺、图例、坐标格网
- thesis templates such as A3 map and A4 figure layouts  
  论文模板，例如 A3 地图版式和 A4 图版式
- batch SVG/PDF generation for drawings  
  图纸批量生成 SVG / PDF

## Requirements / 环境要求

- Node.js 18+  
- npm  
- Windows for AutoCAD COM integration  
  AutoCAD COM 集成需要 Windows
- AutoCAD running locally if you want to use the `autocad_*` tools  
  如果要使用 `autocad_*` 工具，需要本地运行中的 AutoCAD

Node 20+ is recommended.  
推荐使用 Node 20+。

## Install / 安装

```bash
npm install
```

## Build / 构建

```bash
npm run build
```

Windows PowerShell note: if `npm.ps1` is blocked by execution policy, use `npm.cmd run build`.

## Test / 测试

```bash
npm test
```

Windows PowerShell note: if `npm.ps1` is blocked by execution policy, use `npm.cmd test`.

## Run / 运行

The MCP host should launch this server over `stdio`.  
MCP Host 应通过 `stdio` 启动此服务。

```bash
npm start
```

Equivalent / 等价命令：

```bash
node dist/index.js
```

## MCP Configuration / MCP 配置

Example configuration / 配置示例：

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

After rebuilding the server, restart or reload your MCP host so new tools are picked up.  
重新构建服务后，请重启或重新加载 MCP Host，以便识别新增工具。

Use `mcp.config.example.json` as the portable template. For a new checkout, copy it to `mcp.config.json` before running the repository's verification scripts:  
`mcp.config.example.json` 是可移植模板。在新 checkout 中运行仓库验证脚本前，先复制为本机配置 `mcp.config.json`：

```powershell
Copy-Item -LiteralPath mcp.config.example.json -Destination mcp.config.json
```

Replace both literal `${workspaceFolder}` placeholders in the copied file with the absolute checkout directory containing `package.json`. Use forward slashes in JSON paths, or escape backslashes. The verification scripts read this JSON directly and do not expand `${workspaceFolder}`. `args` must point to this checkout's built `dist/index.js`, and `cwd` must point to the checkout directory.  
将复制文件中的两处字面量 `${workspaceFolder}` 替换为包含 `package.json` 的 checkout 绝对目录。JSON 路径可使用正斜杠，或对反斜杠进行转义。验证脚本直接读取 JSON，不会展开 `${workspaceFolder}`。`args` 应指向当前 checkout 构建后的 `dist/index.js`，`cwd` 应指向该 checkout 目录。

The local `mcp.config.json`, generated verification output under `tmp/`, and workstation task notes in `BUILD_GOAL.md` are ignored by Git. Keep the portable example in source control.  
本机 `mcp.config.json`、`tmp/` 下的验证产物和 `BUILD_GOAL.md` 中的工作站任务说明均由 Git 忽略；源码中保留可移植配置示例。

## Codex Skill / Codex Skill

This repository includes a repo-local Codex skill at `skills/cad-mcp/SKILL.md`.
本仓库包含一个项目内 Codex skill：`skills/cad-mcp/SKILL.md`。

The skill summarizes safe operating patterns for this MCP server, including startup checks, internal CAD session workflows, AutoCAD COM caveats, DWG/DXF handling, GIS/research mapping workflows, and grouped tool references under `skills/cad-mcp/references/`.
该 skill 汇总了本 MCP 服务的安全使用方式，包括启动检查、内部 CAD 会话流程、AutoCAD COM 注意事项、DWG/DXF 处理、GIS/研究制图流程，以及 `skills/cad-mcp/references/` 下的工具分组参考。

## Main Tool Groups / 主要工具分组

- geometry creation and editing / 几何创建与编辑
- layer management / 图层管理
- query and measurement tools / 查询与测量工具
- assembly and drawing tools / 装配与图纸工具
- topology and boolean tools / 拓扑与布尔工具
- project file tools / 项目文件工具
- GIS and georeference tools / GIS 与地理参考工具
- field survey / resource-environment tools / 外业调查与资源环境领域工具
- terrain / section / cut-fill analysis tools / 地形、断面与挖填方分析工具
- AutoCAD bridge tools / AutoCAD 桥接工具

## Project File Format / 项目文件格式

Saved project files use / 保存的项目文件包含：

- `format`: `cad-mcp-project`
- `formatVersion`: `1`
- `savedAt`: ISO 8601 string
- `snapshot`: serialized session snapshot
- `scene.crs`: project CRS metadata
- `scene.origin`: local/world origin metadata
- `scene.extent`: working extent metadata
- `scene.drawingScale`: drawing-to-world scale metadata

## Available Research-Focused Capabilities / 面向资源环境研究的现有能力

The current implementation already supports a usable lightweight workflow for resource/environment graduate students:  
当前实现已经支持一条可用的轻量级资源环境研究工作流：

1. import sampling points from `CSV`  
   从 `CSV` 导入采样点
2. import boundaries / profile lines / regions from `GeoJSON` or `Shapefile`  
   从 `GeoJSON` 或 `Shapefile` 导入边界、剖面线和分区
3. assign georeference metadata  
   设置地理参考元数据
4. create map layouts and thesis-style figures  
   创建地图版式和论文风格图件
5. compute area / profile / cut-fill style simplified analyses  
   进行面积、剖面、简化挖填方等分析
6. export figures and GIS data  
   导出图件和 GIS 数据

## Repository Additions / 仓库新增内容

- `src/core/OpenCascadeAdapter.ts`: OpenCascade runtime loader and compatibility fallback  
  OpenCascade 运行时加载器与兼容回退
- `src/integrations/AutoCadComBridge.ts`: Windows COM bridge for live AutoCAD access  
  Windows COM AutoCAD 实时桥接
- `src/tools/autocadTools.ts`: MCP tool registration for AutoCAD operations  
  AutoCAD MCP 工具注册
- `src/tools/gisTools.ts`: project georeference tools  
  项目地理参考工具
- `src/tools/gisIoTools.ts`: CSV / GeoJSON / Shapefile IO tools  
  CSV / GeoJSON / Shapefile IO 工具
- `src/tools/fieldSurveyTools.ts`: domain tools for resource/environment workflows  
  资源环境工作流领域工具
- `src/tools/terrainAnalysisTools.ts`: terrain / profile / cut-fill style analysis tools  
  地形 / 剖面 / 挖填方分析工具
- `src/tools/mapDrawingTools.ts`: map/thesis layout and batch export tools  
  地图 / 论文版式与批量导出工具
- `src/resources/templates.ts`: drawing template resource loader  
  图纸模板资源加载器
- `src/parsers/CsvParser.ts`: CSV point import parser  
  CSV 点导入解析器
- `src/parsers/GeoJsonParser.ts`: GeoJSON parser / exporter  
  GeoJSON 解析与导出器
- `src/parsers/ShapefileParser.ts`: Shapefile parser / exporter bridge  
  Shapefile 解析与导出桥接
- `assets/templates/thesis-a3-map.json`: thesis map layout template  
  论文地图版式模板
- `assets/templates/thesis-a4-figure.json`: thesis figure layout template  
  论文图模板

## Limitations / 当前限制

- DWG import is fully wired through LibreDWG's `dwg2dxf` (verified end-to-end on real R14 fixtures: LINE / CIRCLE / LWPOLYLINE / ARC are imported into the session)  
  DWG 导入已经通过 LibreDWG 的 `dwg2dxf` 完整接通，已用真实 R14 文件端到端验证（LINE / CIRCLE / LWPOLYLINE / ARC 可以导入到会话）
- DWG export wires `dxf2dwg` and writes a DWG to disk, but the internal minimal DXF emitter is currently rejected by LibreDWG's strict DXF parser; the binary path is in place and `dwg_tools_status` reports availability, but a full R14-compliant DXF skeleton (HEADER + 9 tables + BLOCKS + OBJECTS) is still required for round-trip-safe export. Until then, prefer `export_dxf` and convert externally  
  DWG 导出已接 `dxf2dwg` 并落盘 DWG，但当前内置 DXF 输出过于精简，会被 LibreDWG 严格解析器拒收；二进制链路已就位且 `dwg_tools_status` 可用，但要真正可 round-trip，还需要一个完整 R14 DXF 骨架（HEADER + 9 张表 + BLOCKS + OBJECTS）。在此之前建议使用 `export_dxf` 并在外部转换
- direct AutoCAD integration currently targets running local AutoCAD through COM on Windows  
  直接 AutoCAD 集成当前仍然面向 Windows 本地 COM
- AutoCAD COM automation can be sensitive to Windows privilege/integrity level. Run the MCP host at the same privilege level as the AutoCAD process, and call `autocad_status` before list or command tools  
  AutoCAD COM 自动化可能受 Windows 权限/完整性级别影响。请让 MCP Host 与 AutoCAD 进程使用相同权限级别，并在列表或命令工具前先调用 `autocad_status`
- some DXF entity types and advanced polyline bulge cases still have limited support  
  某些 DXF 实体类型和高级 polyline bulge 场景支持仍有限
- the internal CAD session and the live AutoCAD bridge are related but distinct workflows  
  内部 CAD 会话与实时 AutoCAD 桥接是相关但独立的两套工作流
- georeference now includes a real `proj4`-backed reprojection engine (`reproject_point`, `reproject_points`); the legacy `transform_coords` flow remains metadata-driven for local/world conversion only  
  地理参考现在包含基于 proj4 的真实投影引擎（`reproject_point` / `reproject_points`），旧的 `transform_coords` 仍仅用于元数据驱动的局部/世界坐标转换
- raster (GeoTIFF) support is currently single-image basemap oriented; large mosaic / tile workflows are not yet bundled  
  栅格 / GeoTIFF 支持当前面向单幅底图，尚未内置大范围镶嵌或瓦片工作流
- terrain and cut/fill calculations are simplified research helpers rather than survey-grade engineering calculations  
  当前地形和挖填方计算属于简化研究辅助能力，不是测量级工程计算

## License / 许可证

ISC
