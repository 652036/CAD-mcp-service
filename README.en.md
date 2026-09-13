# CAD MCP Server

[简体中文](README.zh-CN.md) | **English** | [Bilingual project overview](README.md)

A TypeScript server for the Model Context Protocol (MCP). It exposes CAD, lightweight GIS, drawing, and resource/environment research tools through standard input/output (`stdio`).

The project is at MVP stage. The internal CAD session and a live AutoCAD document are separate state surfaces. Entities created in the internal session do not automatically appear in an AutoCAD window.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation and startup](#installation-and-startup)
- [MCP client configuration](#mcp-client-configuration)
- [Attach to an AutoCAD drawing](#attach-to-an-autocad-drawing)
- [Common workflows](#common-workflows)
- [Files and geometry backends](#files-and-geometry-backends)
- [Tests and live validation](#tests-and-live-validation)
- [Troubleshooting](#troubleshooting)
- [Project structure and development](#project-structure-and-development)
- [Limitations](#limitations)
- [License](#license)

## Features

| Area | Capabilities |
| --- | --- |
| 2D CAD | Points, lines, circles, arcs, rectangles, polygons, polylines; translation, rotation, mirroring, offsets, trimming, extension, and arrays |
| Layers and organization | Layer creation, renaming, visibility, locking, colors; constraints, annotations, assemblies, drawings, and analysis helpers |
| Sessions and projects | Transactions, undo/redo, and JSON project save/load |
| Files and previews | DXF import/export, SVG/PNG previews, and helper tools for other formats |
| AutoCAD | Windows COM connection, window/document binding, layer/entity/variable queries, and command submission |
| GIS | CRS, origin, extent, and scale metadata; CSV, GeoJSON, Shapefile, and GeoTIFF workflows |
| Research mapping | Sampling points, monitoring wells, profile lines, boundaries, area/section analysis, and simplified cut/fill and grid-volume estimates |
| Layouts | North arrows, scale bars, legends, coordinate grids, A3/A4 figure templates, and SVG/PDF output |

See the [tool reference](skills/cad-mcp/references/tools.md) for tool groups.

## Requirements

- Node.js and npm. The locked `sharp` dependency requires Node.js `^18.17.0 || ^20.3.0 || >=21.0.0`; see [package-lock.json](package-lock.json) for dependency requirements.
- The `autocad_*` tools require Windows, Windows PowerShell, and a locally running AutoCAD installation that supports COM.
- DWG conversion requires usable LibreDWG command-line programs. Check them with `dwg_tools_status`.
- 3D geometry depends on the backend actually loaded. Call `geometry_backend_status` to distinguish OpenCascade, a mock backend, and loading failures.

## Installation and startup

```bash
git clone https://github.com/652036/CAD-mcp-service.git
cd CAD-mcp-service
npm ci
npm run build
npm test
```

In Windows PowerShell, replace `npm` with `npm.cmd` if execution policy blocks `npm.ps1`.

Configure your MCP client to launch the built entry point:

```bash
node dist/index.js
```

Alternatively, run `npm start`. This is a `stdio` service, not an HTTP website. Waiting for protocol input after a direct terminal launch is expected.

## MCP client configuration

Add this server entry to a client that accepts the `mcpServers` format. Replace the example directory with the actual checkout directory. Clients with a different configuration format need equivalent command, arguments, and working-directory settings.

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

The repository's verification scripts separately read a local configuration file in the project root. If it does not exist, copy the template:

```powershell
Copy-Item -LiteralPath mcp.config.example.json -Destination mcp.config.json
```

Edit the resulting file and replace both `${workspaceFolder}` placeholders with the absolute directory containing `package.json`. The verification scripts do not expand this placeholder. Use forward slashes in JSON paths, or escape backslashes as `\\`. If a local configuration already exists, inspect and update it instead of copying over it.

After changing TypeScript source, run `npm run build` and reload the server in your MCP client. Verify that the client launches this checkout's `dist/index.js`.

## Attach to an AutoCAD drawing

Open a drawing in AutoCAD, finish startup prompts, and exit any unfinished interactive command. The MCP host and AutoCAD should run at the same Windows privilege level.

| Tool | Purpose |
| --- | --- |
| `autocad_status` | Inspect connection, window/process identity, drawing, and idle state without establishing a binding |
| `autocad_list_documents` | List COM-reachable applications and their open drawings |
| `autocad_attach` | Bind to a window and drawing; `activate` defaults to `true` |
| `autocad_detach` | Clear this server's binding while leaving AutoCAD and drawings open |
| `autocad_activate_document` | Activate an already-open drawing and update the binding |
| `autocad_list_layers` | Read layers from the target drawing |
| `autocad_list_modelspace_entities` | Read ModelSpace entities with optional layer, type, and count filters |
| `autocad_get_variables` | Read 1–50 system variables |
| `autocad_send_command` | Submit a command to the active target drawing and optionally poll for idle |

Use this sequence. These are MCP tool names and arguments, not terminal commands:

1. Call `autocad_status`, then `autocad_list_documents`.
2. Select a returned `windowHandle` and drawing name or full path, and pass them to `autocad_attach`. Use the returned decimal handle string.
3. Set `activate: false` to bind without activating the drawing. This does not establish a permanent read-only mode.
4. Query layers, entities, or variables to verify the target before issuing commands.
5. Call `autocad_detach` when the binding is no longer needed.

Example arguments for reading variables:

```json
{"names": ["CMDACTIVE", "CMDNAMES", "CLAYER", "INSUNITS"]}
```

After verifying the target, these command arguments zoom to drawing extents:

```json
{"command": "_.ZOOM _E ", "waitForIdle": true, "timeoutMs": 10000}
```

A command is submitted once. With the default `waitForIdle: false`, the result is `submitted`. Waiting can return `idle_observed` or `timeout`. A timeout is an MCP error that preserves the observed state. None of these states proves the intended drawing result; query entities or variables afterward.

`timeoutMs` accepts 1000–30000 milliseconds and bounds idle polling after the COM call returns. An independent 45-second bridge timeout bounds blocking calls. After a timeout or error, inspect the drawing and command state before deciding whether to resend.

Commands reject if the user has activated a different drawing after attachment. Use `autocad_activate_document` to switch explicitly. If the target drawing is closed or renamed, list documents and attach again. Bindings belong to the current MCP server process and must be re-established after a server reload.

## Common workflows

**Internal CAD drawing:** `new_project` → `create_layer` → geometry tools → `list_entities` → preview and export. For batches of changes, use `begin_transaction`, `commit_transaction`, and `rollback_transaction`; use session history tools for undo.

**Resource/environment research mapping:** import CSV sampling points → import GeoJSON/Shapefile boundaries, profiles, or zones → set CRS, origin, extent, and scale → analyze and draw → add legends, scale bars, and north arrows → export figures or GIS data.

JSON projects use `format: "cad-mcp-project"` and `formatVersion: 1`, with a save timestamp, session snapshot, and CRS/origin/extent/scale metadata.

## Files and geometry backends

DXF, CSV, GeoJSON, Shapefile, and previews are the main interchange paths. DWG import converts through `dwg2dxf`; export depends on `dxf2dwg` and compatible DXF contents. Check external program availability first.

Some STEP, STL, OBJ, IGES, GLTF, and PDF-underlay tools provide simplified or auxiliary workflows. Do not assume lossless conversion of arbitrary industrial drawings. Use the backend status result to identify OpenCascade loading failures or mock geometry.

## Tests and live validation

```bash
npm run build
npm test
```

After preparing the local configuration and opening an AutoCAD drawing, run the default read-only live check:

```bash
node scripts/verify-autocad-mcp.mjs
```

To validate command submission, explicitly select the following mode. It activates the drawing and sends `(princ)`:

```bash
node scripts/verify-autocad-mcp.mjs --command-smoke
```

The report is written to `tmp/mcp-autocad-live-report.json`. Exit code `0` means verification passed, `1` means verification failed, and `2` means AutoCAD or a drawing is unavailable. The code tests include simulated COM objects; passing tests does not establish a connection to the current desktop window.

## Troubleshooting

| Symptom or error | Action |
| --- | --- |
| Client cannot find the server or new tools | Check `command`, `args`, and `cwd`; rebuild and reload the server |
| `NO_RUNNING_AUTOCAD` | Start local AutoCAD and open a drawing |
| `AUTOCAD_UNAVAILABLE` | Wait for startup, resolve modal prompts, and check process privilege levels; a running process does not establish COM readiness |
| `NO_DOCUMENT` | Open a drawing and attach again |
| `TARGET_WINDOW_NOT_FOUND` / `TARGET_DOCUMENT_NOT_FOUND` | List windows/documents again and bind to the selected target |
| `TARGET_NOT_ACTIVE` | Activate the bound drawing with `autocad_activate_document` |
| `AUTOCAD_BUSY` | Finish or cancel the interactive command in AutoCAD |
| `AUTOCAD_IDLE_TIMEOUT` / `BRIDGE_TIMEOUT` | Inspect current state and drawing results before resending commands |
| DWG conversion unavailable | Inspect `dwg_tools_status`, external program discovery, and DXF compatibility |

## Project structure and development

| Path | Purpose |
| --- | --- |
| `src/core/`, `src/session/` | Geometry, scene, history, and internal sessions |
| `src/tools/` | MCP tools and grouped registration |
| `src/integrations/` | AutoCAD COM bridge and PowerShell script generation |
| `src/parsers/`, `src/project/` | Format parsing and project persistence |
| `assets/`, `src/resources/` | Templates, materials, blocks, and resource registration |
| `python/` | Optional geometry and mesh-analysis helper scripts |
| `tests/`, `scripts/` | Automated tests and verification scripts |
| `skills/cad-mcp/` | Agent-facing skill and reference documentation in English |

Read [AGENTS.md](AGENTS.md) and the [development reference](skills/cad-mcp/references/development.md) before contributing. Keep registered tool names synchronized with tool additions or removals, then build and test before pushing. Local `mcp.config.json`, `tmp/`, `BUILD_GOAL.md`, `node_modules/`, and `dist/` are excluded from version control.

## Limitations

- Live attachment targets Windows AutoCAD COM document automation. It does not provide generic mouse, keyboard, and screenshot control for every CAD product.
- COM may not expose every process when multiple instances of the same AutoCAD version are running. An unreachable requested window fails explicitly.
- Internal CAD transactions and undo history do not cover commands executed in AutoCAD.
- DWG export remains limited by compatibility between the simplified DXF emitter and LibreDWG's strict parser; lossless round trips are not guaranteed.
- Some DXF entities and polyline bulges have limited support. GeoTIFF primarily supports a single basemap; large mosaics and tiled workflows are not bundled.
- `reproject_point` / `reproject_points` use `proj4`. The legacy `transform_coords` only converts local/world coordinates and does not replace CRS reprojection.
- Terrain, cut/fill, and volume helpers provide simplified research estimates, without survey-grade engineering accuracy guarantees.

## License

The project declares the ISC license in [package.json](package.json).
