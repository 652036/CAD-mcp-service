---
name: cad-mcp
description: Use the CAD MCP server for CAD drafting, in-memory CAD sessions, DXF/DWG/SVG/PDF/STEP/STL/OBJ/IGES/GLTF file workflows, drawing previews, 2D/3D geometry, layers, dimensions, annotations, assemblies, map/thesis layouts, lightweight GIS/georeference workflows, GeoJSON/Shapefile/CSV/GeoTIFF exchange, terrain/research helpers, and live AutoCAD COM inspection or commands. Use when a task mentions CAD, AutoCAD, DWG, DXF, drawing entities, CAD layers, geometric constraints, dimensions, previews, map layouts, CRS/georeferencing, field survey points, monitoring wells, profile lines, boundary polygons, or research/environment CAD figures.
---

# CAD MCP

## Overview

Use this skill to operate this repository's TypeScript CAD MCP server safely and consistently. The server exposes CAD, lightweight GIS, file interchange, preview, and live AutoCAD bridge tools over stdio.

Repository-local facts:

- Source root: detect the current checkout directory containing `package.json` and `src/`; do not assume a machine-specific location.
- Server/package name: `cad-mcp-server`
- Runtime entry: `dist/index.js`
- Transport: stdio
- Tool source: `src/tools/`

## Before Using Tools

1. Confirm the current agent session actually has the CAD MCP tools exposed. If it does not, inspect source/config and say live MCP execution is unavailable.
2. Verify the active MCP client config before claiming this checkout is live. The ignored local `mcp.config.json` must point to the current checkout; `mcp.config.example.json` is only a portable template.
3. Start with harmless status/list calls:
   - `get_project_info`
   - `geometry_backend_status`
   - `list_layers`
   - `list_entities`
   - `dwg_tools_status` before DWG import/export
   - `autocad_status` before live AutoCAD operations
4. Keep returned entity IDs, layer names, drawing IDs, raster IDs, and output paths. Do not guess identifiers when list/query tools can confirm them.

## Runtime Commands

Use these commands from the repository root when developing or validating the server:

```bash
npm install
npm run build
npm test
npm start
```

On Windows PowerShell, prefer `npm.cmd` if `npm.ps1` is blocked by execution policy:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
```

MCP hosts should launch the built stdio server with:

```bash
node dist/index.js
```

Before live-client validation, confirm `mcp.config.json` or the active MCP host configuration points to the current checkout's `dist/index.js` and uses the current checkout as `cwd`.

For the repository verification scripts, create local `mcp.config.json` by copying `mcp.config.example.json`, then replace both literal `${workspaceFolder}` placeholders with the absolute checkout directory containing `package.json`. The scripts read JSON directly and do not expand these placeholders. Use forward slashes or escaped backslashes in JSON paths. Keep the local configuration, `tmp/` outputs, and workstation task notes in `BUILD_GOAL.md` out of source commits; Git ignores them.

## Safety Rules

- Use read/query/status tools first, then edit tools only when the user asks for changes.
- Wrap multi-step CAD edits in transactions when practical: `begin_transaction`, edit tools, then `commit_transaction`; use `rollback_transaction` if a later step fails.
- Use `push_undo_checkpoint` before risky modifications.
- Treat `autocad_send_command` as live AutoCAD document mutation. Use it only within the user's authorized live AutoCAD task, after checking status and deliberately selecting the target. Existing authorization does not require repeated confirmation.
- Remember the in-memory CAD session and live AutoCAD COM bridge are separate workflows. Do not assume objects created in one appear in the other.
- AutoCAD COM attaches to a running AutoCAD instance. If AutoCAD is started from an elevated process, the MCP host usually needs the same Windows privilege/integrity level to see it.
- Use `autocad_list_documents` to discover COM-reachable applications and documents, then `autocad_attach` to pin the selected window/process/document. Discovery does not guarantee every process of the same AutoCAD version is reachable. Never substitute a different window after a target-unavailable error.
- A binding is local to this MCP server process and is lost when the server restarts. If the user activates another document, command submission rejects with `TARGET_NOT_ACTIVE`; deliberately activate or reattach the intended document before proceeding. `AUTOCAD_BUSY` means AutoCAD is processing a command or awaiting input.
- Command submission is not retried. The states `submitted` and `idle_observed` describe transport/idle observations, not successful geometry or settings changes. `timeout` means idle was not observed before the polling deadline and is returned as an MCP error with command observation data. `timeoutMs` bounds idle polling after COM `SendCommand` returns, while a separate 45-second bridge timeout bounds blocking COM calls. Inspect the intended results with entity/variable queries. After a timeout or uncertain failure, do not resend before checking the drawing and command state.
- For DWG, call `dwg_tools_status` first. DWG import is wired through LibreDWG `dwg2dxf`; DWG export currently depends on strict DXF compatibility and may require external conversion.
- For geospatial/research outputs, set CRS, extent, and drawing scale metadata before final layout/export.

## Validation Checklist

For repository testing:

1. Install dependencies with `npm install` or `npm.cmd install`.
2. Build with `npm run build` or `npm.cmd run build`.
3. Run the full suite with `npm test` or `npm.cmd test`.
4. If validating the stdio server, spawn `node dist/index.js` through an MCP client and smoke-test `listTools`, `new_project`, a simple geometry tool, `list_entities`, and a preview/export tool.
5. If validating live AutoCAD, call `autocad_list_documents`, bind a confirmed target with `autocad_attach`, and inspect `autocad_status`; then use read-only layer/entity/variable calls before any authorized `autocad_send_command`. Verify intended effects separately from command submission and idle observations.

## Workflow Patterns

Create a new drawing:

1. `new_project`
2. `create_layer` for meaningful layer groups
3. Create geometry with explicit units when needed
4. Add annotations/dimensions/drawing views
5. Validate with `list_entities`, query tools, measurements, and preview tools
6. Export with `export_dxf`, `export_svg`, `generate_pdf`, or save with `save_project`

Import and inspect existing data:

1. Import with `import_dxf`, `import_geojson`, `import_shapefile`, `import_csv_points`, or file-specific import tools
2. Inspect `get_project_info`, `list_layers`, `list_entities`, bounding boxes, and CRS metadata
3. Normalize layers/properties before modification
4. Preview/export only after query checks match user intent

Research map or thesis figure:

1. Set CRS/extent/scale with GIS tools
2. Import sampling points, boundaries, profile lines, rasters, and field observations
3. Use terrain/research helpers for area/profile/cut-fill summaries
4. Create a map layout, north arrow, scale bar, legend, and coordinate grid
5. Batch export SVG/PDF outputs

Live AutoCAD:

1. `autocad_list_documents` returns `data.applications` and `data.documents`, including window/process identity and document names/paths. Multiple accessible application versions may make an unbound `autocad_status` ambiguous.
2. `autocad_attach` with a listed decimal `windowHandle` and document name/full path. `activate` defaults to `true`; set `false` for binding without document activation. This flag does not impose a persistent read-only permission lock.
3. `autocad_status` to confirm the target and current binding.
4. `autocad_list_layers`, `autocad_list_modelspace_entities`, and `autocad_get_variables` (for example `CMDACTIVE`, `CMDNAMES`, `CLAYER`, `INSUNITS`) to inspect live data.
5. `autocad_activate_document` when a deliberate document switch is needed; this also updates the binding.
6. Use `autocad_send_command` within the authorized task. `waitForIdle` defaults to `false`; `true` polls for idle for up to `timeoutMs` (1000–30000 milliseconds) after COM submission returns. A separate 45-second bridge timeout handles blocking COM calls. Always query intended effects afterward; a returned `timeout` is an MCP error, not permission to retry.
7. `autocad_detach` when releasing the binding; it does not close documents or discard changes.

These tools automate AutoCAD documents through COM. They do not provide generic mouse/keyboard takeover or screenshots, and do not connect arbitrary CAD products. Internal `create_*`/`list_entities` tools do not edit the attached AutoCAD document.

## References

- Read `references/tools.md` for tool groups and common tool names.
- Read `references/development.md` before editing tool registration, AutoCAD bridge behavior, file IO, or tests.
