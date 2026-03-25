# Changelog / 更新日志

## Unreleased / 未发布

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
