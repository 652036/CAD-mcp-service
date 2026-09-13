# CAD MCP Tool Reference

## Core Session

- Project/session: `new_project`, `get_project_info`, `save_project`, `load_project`, `open_project`
- Transactions/history: `begin_transaction`, `commit_transaction`, `rollback_transaction`, `push_undo_checkpoint`, `undo`, `redo`
- Runtime status: `geometry_backend_status`

## 2D Geometry And Layers

- Create: `create_point`, `create_line`, `create_circle`, `create_arc`, `create_rectangle`, `create_polygon`, `create_polyline`
- Inspect/edit entities: `list_entities`, `get_entity_properties`, `delete_entity`, `set_entity_layer`
- Layers: `create_layer`, `list_layers`, `get_layer_list`, `delete_layer`, `rename_layer`, `set_layer_visible`, `set_layer_locked`, `set_layer_color`
- Preview: `render_preview_svg`, `render_preview`

## Query, Measurement, And Modification

- Query: `get_entity_type`, `find_entities_by_layer`, `find_entities_in_region`, `find_entities_by_property`, `get_bounding_box`, `get_curve_length`
- Measurement: `measure_distance`, `measure_angle`, `measure_area`, `measure_perimeter`, `measure_volume`, `measure_surface_area`, `measure_centroid`, `measure_moment_of_inertia`, `measure_bounding_box`, `measure_minimum_distance`
- Properties: `set_entity_property`, `set_entity_color`, `set_entity_linetype`, `set_entity_lineweight`
- 2D modification: `mirror_2d`, `array_rectangular`, `array_polar`, `offset`, `trim`, `extend`, `fillet_2d`, `chamfer_2d`
- Advanced 2D: `create_ellipse`, `create_spline`

## 3D, Topology, And Assemblies

- 3D create: `create_box`, `create_sphere`, `create_cylinder`, `create_cone`, `create_torus`, `create_prism`, `create_revolution`
- Boolean/surface helpers: `boolean_union`, `boolean_subtract`, `boolean_intersect`, `fillet_3d`, `chamfer_3d`, `shell`, `draft_angle`, `loft`, `sweep`
- Topology: `get_face_normal`, `get_edge_list`, `get_face_list`, `get_vertex_list`, `get_topology`
- Assemblies: `create_assembly`, `add_component`, `remove_component`, `mate_coincident`, `mate_concentric`, `mate_distance`, `mate_angle`, `mate_parallel`, `set_component_flexible`, `create_exploded_view`, `add_explode_step`, `animate_explode`
- Analysis: `check_interference`, `check_clearance`, `set_material`, `get_mass_properties`

## Constraints, Annotation, And Drawing Output

- Parameters: `set_parameter`, `get_parameter`, `list_parameters`, `update_parameter`
- Constraints: `add_constraint_coincident`, `add_constraint_parallel`, `add_constraint_perpendicular`, `add_constraint_tangent`, `add_constraint_concentric`, `add_constraint_equal`, `add_constraint_symmetric`, `add_constraint_horizontal`, `add_constraint_vertical`, `add_constraint_fixed`, `add_constraint_midpoint`
- Dimensions: `add_dimension_linear`, `add_dimension_angular`, `add_dimension_radial`, `add_dimension_diameter`, `add_linear_dimension`, `add_aligned_dimension`, `add_angular_dimension`, `add_radius_dimension`, `add_diameter_dimension`, `add_ordinate_dimension`, `add_baseline_dimension`, `add_continued_dimension`
- Annotation: `add_text`, `add_mtext`, `add_leader`, `add_multileader`, `create_table`, `set_table_cell`, `add_surface_finish_symbol`, `add_weld_symbol`, `add_gdt_frame`, `add_center_mark`, `add_center_line`
- Drawings: `create_viewport`, `set_view_standard`, `set_visual_style`, `create_drawing`, `add_view`, `add_section_view`, `add_detail_view`, `add_auxiliary_view`, `update_drawing_views`, `generate_pdf`, `generate_svg`

## Files, GIS, Raster, And Research Mapping

- CAD/interchange import/export: `import_dxf`, `export_dxf`, `import_dwg`, `export_dwg`, `dwg_tools_status`, `import_step`, `import_iges`, `import_stl`, `import_obj`, `import_svg`, `import_pdf_as_underlay`, `export_step`, `export_iges`, `export_stl`, `export_obj`, `export_svg`, `export_gltf`, `export_3mf`
- CRS/georeference: `set_project_crs`, `get_project_crs`, `set_map_extent`, `set_drawing_scale`, `transform_coords`, `reproject_point`, `reproject_points`, `register_crs_definition`, `list_known_crs`
- GIS exchange: `import_csv_points`, `import_geojson`, `export_geojson`, `import_shapefile`, `export_shapefile`
- Field/research entities: `create_sampling_point`, `create_monitoring_well`, `create_profile_line`, `create_boundary_polygon`, `list_entities_by_domain_kind`
- Map layouts: `create_map_layout`, `apply_thesis_template`, `add_north_arrow`, `add_scale_bar`, `add_legend`, `add_coordinate_grid`, `batch_generate_svg`, `batch_generate_pdf`
- Terrain helpers: `measure_polygon_area_stats`, `measure_profile_length`, `compute_section_area`, `compute_cut_fill_volume`, `compute_grid_surface_volume`
- Raster: `import_geotiff_metadata`, `attach_raster_layer`, `list_raster_layers`, `get_raster_layer`, `remove_raster_layer`, `set_raster_layer_visible`, `rename_raster_layer`, `render_raster_layer_png`

## Live AutoCAD Tools

- `autocad_status`
- `autocad_list_documents`
- `autocad_attach`
- `autocad_detach`
- `autocad_activate_document`
- `autocad_get_variables`
- `autocad_list_layers`
- `autocad_list_modelspace_entities`
- `autocad_send_command`

These tools require Windows, local AutoCAD, and COM access. They do not operate on the internal in-memory CAD session.
Run `autocad_status` first and keep the MCP host at the same Windows privilege level as AutoCAD; otherwise COM may report no running instance even when AutoCAD is open.

For deliberate window takeover, use `autocad_list_documents` first; its `data.applications` and `data.documents` enumerate COM-reachable application/document targets. Bind with `autocad_attach({windowHandle, document, activate?})`, using returned identifiers. `windowHandle` must contain 1–20 decimal digits. `activate` defaults to `true`; `false` establishes a binding without activating the document. A window handle selects an application already exposed by COM; it cannot make every same-version process reachable. Binding pins the application/window/process and document. `autocad_activate_document({document})` activates an already-open document and updates that binding. `autocad_detach` clears it without closing anything.

`autocad_get_variables({names:["CMDACTIVE","CMDNAMES","CLAYER","INSUNITS"]})` reads 1–50 system variables. Names must begin with a letter, contain only letters/digits/underscores, and be at most 64 characters. Layer/entity calls read the live document while respecting the binding; they do not query the internal session.

`autocad_send_command({command, waitForIdle?, timeoutMs?})` accepts at most 16000 characters. It rejects a busy document or a bound document that is no longer active. `waitForIdle` defaults to false; `timeoutMs` accepts 1000–30000 milliseconds and bounds idle polling after COM `SendCommand` returns. A separate 45-second bridge timeout bounds blocking COM calls. A successful tool result reports `submitted` or `idle_observed`, neither of which proves command correctness. If polling expires, `data.state` is `timeout`, with MCP `isError: true`, JSON `success: false`, and the command observations preserved under `data`. Inspect intended effects with live queries. Commands are not retried; after errors/timeouts, do not resend before checking the drawing and command state. Other bridge failures also include both error flags.
