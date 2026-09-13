# Changelog / 更新日志

## Unreleased / 未发布

### Added (Stage 4 / 阶段 4)

- Repo-local Codex skill and AI-agent guidance / 仓库内 Codex skill 与 AI 协作说明：
  - `skills/cad-mcp/SKILL.md` plus references for safe CAD MCP operation, tool groups, development notes, AutoCAD caveats, and file/runtime boundaries. / 新增 `skills/cad-mcp/SKILL.md` 及参考文档，覆盖 CAD MCP 安全使用、工具分组、开发说明、AutoCAD 注意事项与运行路径边界。
  - `AGENTS.md` and `CLAUDE.md` for repository-specific agent instructions. / 新增 `AGENTS.md` 与 `CLAUDE.md`，提供项目级 Agent 协作规则。
- `geometry_backend_status` tool: report whether the 3D backend is OpenCascade (occt), occt-error, or the lightweight mock fallback so callers can tell whether STEP/STL/IGES/GLTF tools are running on real OCCT or stubbed geometry. / 暴露 3D 后端真实状态（occt / occt-error / mock），方便确认 STEP/STL/IGES/GLTF 是否跑在真 OpenCascade 上。
- `proj4`-backed real projection engine / 真实投影引擎 (proj4)：
  - `reproject_point` / `reproject_points` for EPSG-to-EPSG transforms, including CGCS2000 3°/6° gauss-kruger zones (EPSG:4513–4533), WGS84, web-mercator, and user-registered CRSes. / 支持 EPSG 互转，预置 WGS84、Web Mercator、CGCS2000 3 度带等。
  - `register_crs_definition` / `list_known_crs` for runtime CRS management. / 运行期可注册自定义 CRS 并查询当前已注册列表。
- DWG support via LibreDWG / 通过 LibreDWG 接入的 DWG 支持：
  - `import_dwg` is fully wired and verified end-to-end: it spawns `dwg2dxf`, parses the resulting DXF, and re-creates LINE / CIRCLE / LWPOLYLINE / ARC inside the session (validated against `sample_r14.dwg`-class inputs). / `import_dwg` 已经走通端到端：调用 `dwg2dxf`，解析中间 DXF，并把 LINE / CIRCLE / LWPOLYLINE / ARC 还原到会话。
  - `export_dwg` calls `dxf2dwg` on the session's DXF output, but LibreDWG's strict DXF parser currently rejects the internal minimal DXF (missing BLOCK_RECORD table, BLOCKS section, OBJECTS dictionary). The subprocess plumbing is in place; producing a full R14-compliant DXF skeleton is the remaining work. / `export_dwg` 现在会调用 `dxf2dwg`，但 LibreDWG 严格解析器拒收当前最简 DXF（缺 BLOCK_RECORD 表、BLOCKS section 和 OBJECTS 字典）。子进程链路已就位，下一步需要一个完整 R14 DXF 骨架。
  - `dwg_tools_status` reports whether `dwg2dxf` / `dxf2dwg` are on PATH and gives an install hint otherwise. / `dwg_tools_status` 报告 `dwg2dxf` / `dxf2dwg` 是否在 PATH 上，否则给出安装提示。
- GeoTIFF / raster basemap support / GeoTIFF 与栅格底图支持：
  - new `RasterStore` on every session for managing raster basemaps. / 每个会话内置 `RasterStore`。
  - `import_geotiff_metadata`, `attach_raster_layer`, `list_raster_layers`, `get_raster_layer`, `remove_raster_layer`, `set_raster_layer_visible`, `rename_raster_layer`, `render_raster_layer_png` MCP tools. / 一组 raster MCP 工具，覆盖 metadata、挂载、可见性、PNG 预览。
  - PNG rendering uses `sharp` and auto-stretches single-band rasters (DEM/index) to grayscale. / 单波段栅格自动拉伸为灰度。
- Domain workflow prompts / 领域工作流 prompts：
  - `research_sampling_workflow`, `profile_section_workflow`, `cut_fill_report`, `georeferenced_basemap_setup`, `dwg_dxf_round_trip`. / 资源环境研究端到端工作流模板。

### Added / 新增
- Stage 1 resource/environment research workflow foundations / 资源环境研究工作流阶段 1 基础能力：
  - project georeference metadata with CRS, origin, extent, and drawing scale / 项目地理参考元数据，支持 CRS、原点、范围和绘图比例
  - GIS MCP tools for setting/querying project georeference and local/world coordinate transforms / 用于设置和查询项目地理参考、进行局部坐标与世界坐标转换的 GIS MCP 工具
  - CSV sampling-point import support / CSV 采样点导入支持
  - GeoJSON point/line/polygon import and GeoJSON export / GeoJSON 点、线、面导入与 GeoJSON 导出
  - domain tools for sampling points, monitoring wells, profile lines, and boundary polygons / 面向采样点、监测井、剖面线和边界面的领域工具
  - map layout tools for map drawings, north arrows, scale bars, legends, and coordinate grids / 地图版式工具，支持地图图纸、指北针、比例尺、图例和坐标格网
  - resources for project georeference, project extent, sampling points, and profile lines / 项目地理参考、项目范围、采样点和剖面线资源
- Stage 2 research analysis foundations / 资源环境研究分析阶段 2 基础能力：
  - polygon area statistics / 面域统计
  - profile-line length and section sampling helpers / 剖面线长度与断面采样辅助能力
  - simplified cut/fill estimation inside a boundary / 边界范围内的简化挖填方估算
  - simplified grid-surface volume estimation from elevated sample points / 基于高程采样点的简化格网表面体积估算
- Stage 3 map/thesis delivery foundations / 地图与论文交付阶段 3 基础能力：
  - drawing template resources for thesis A3 map and A4 figure layouts / 论文 A3 地图版式和 A4 图版式模板资源
  - drawing layout/export metadata persisted in drawing state / 图纸版式与导出元数据持久化到 drawing 状态
  - thesis template application / 论文模板应用能力
  - batch SVG and PDF generation for drawings / 图纸批量生成 SVG 和 PDF
  - Shapefile import/export support / Shapefile 导入导出支持
- New tests covering / 新增测试覆盖：
  - georeference snapshot persistence / 地理参考快照持久化
  - CSV and GeoJSON parsing/export / CSV 与 GeoJSON 解析和导出
  - local/world coordinate transforms / 局部与世界坐标转换
  - boolean subtract behavior / 布尔减法行为
  - assembly placement-aware collision analysis / 考虑装配位姿的碰撞分析
  - material density and mass-property unit conversion / 材料密度与质量属性单位换算

### Changed / 变更
- `boolean_subtract` now returns a distinct approximate subtraction result instead of mirroring union behavior. / `boolean_subtract` 现在会返回独立的近似减法结果，不再与并集行为相同。
- Assembly interference and clearance analysis now account for component placement transforms. / 装配干涉与间隙分析现在会考虑组件位姿变换。
- `set_material` and `get_mass_properties` now use consistent density metadata and SI mass conversion. / `set_material` 和 `get_mass_properties` 现在使用一致的密度元数据和 SI 质量单位换算。

### Notes / 说明
- The new GIS transform flow is metadata-driven and currently supports local/world transforms based on project origin and drawing scale; it is not yet a full projection engine. / 新的 GIS 转换流程由元数据驱动，目前支持基于项目原点和绘图比例的局部与世界坐标转换，但还不是完整的投影引擎。
- Shapefile support is now included for import/export, while more advanced GIS formats and projection workflows can be expanded later. / 当前已经包含 Shapefile 导入导出支持，后续还可以继续扩展更高级的 GIS 格式和投影工作流。
