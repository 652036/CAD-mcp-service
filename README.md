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

On Windows, the server can connect to a running AutoCAD instance through COM and expose live-document tools such as:  
在 Windows 平台上，服务可以通过 COM 连接到运行中的 AutoCAD，并暴露如下实时文档工具：

- `autocad_status`
- `autocad_list_layers`
- `autocad_list_modelspace_entities`
- `autocad_send_command`

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

## Test / 测试

```bash
npm test
```

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

- DWG import/export still requires an external ODA-compatible converter and is not bundled  
  DWG 导入 / 导出仍然需要外部 ODA 兼容转换器，当前未内置
- direct AutoCAD integration currently targets running local AutoCAD through COM on Windows  
  直接 AutoCAD 集成当前仍然面向 Windows 本地 COM
- some DXF entity types and advanced polyline bulge cases still have limited support  
  某些 DXF 实体类型和高级 polyline bulge 场景支持仍有限
- the internal CAD session and the live AutoCAD bridge are related but distinct workflows  
  内部 CAD 会话与实时 AutoCAD 桥接是相关但独立的两套工作流
- georeference transform support is currently metadata-driven and not a full projection engine  
  当前地理参考转换仍是元数据驱动，不是完整投影引擎
- terrain and cut/fill calculations are simplified research helpers rather than survey-grade engineering calculations  
  当前地形和挖填方计算属于简化研究辅助能力，不是测量级工程计算

## License / 许可证

ISC
