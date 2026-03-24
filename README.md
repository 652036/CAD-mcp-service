# CAD MCP Server

TypeScript-based CAD server for the Model Context Protocol (MCP).

It exposes tools, resources, and prompts over `stdio` so an MCP client can:

- create and inspect 2D geometry
- work with layers, assemblies, drawings, and project files
- import and export DXF plus several lightweight interchange formats
- render previews
- connect to a running AutoCAD instance on Windows through COM

## Status

This repository is still an MVP-style CAD service, but it now includes:

- broad 2D and lightweight 3D tool coverage
- PNG preview rendering through `sharp`, with SVG fallback
- OpenCascade runtime status reporting
- a Node-compatible OpenCascade fallback loader for `opencascade.js`
- direct AutoCAD 2024 integration tools on Windows

## Features

### Internal CAD session

- 2D entities: point, line, circle, arc, rectangle, polygon, polyline
- layers: create, rename, delete, visibility, lock, color
- modify tools: translate, rotate, mirror, offset, trim, extend, array
- constraints, annotations, assemblies, drawings, and analysis helpers
- transactions and undo/redo
- JSON project save/load

### File and preview support

- DXF import and export
- SVG, PDF-underlay, STEP-like, STL-like, OBJ-like, IGES-like, and GLTF-like workflows
- preview generation as SVG or PNG

### OpenCascade integration

- reports whether the runtime backend is using mock geometry or OpenCascade
- includes a compatibility fallback for environments where `opencascade.js` package-root loading fails under modern Node ESM runtimes

### AutoCAD integration

On Windows, the server can connect to a running AutoCAD instance through COM and expose live-document tools such as:

- `autocad_status`
- `autocad_list_layers`
- `autocad_list_modelspace_entities`
- `autocad_send_command`

This is separate from the internal in-memory CAD session. The AutoCAD tools act on the real AutoCAD document that is currently open.

## Requirements

- Node.js 18+
- npm
- Windows for AutoCAD COM integration
- AutoCAD running locally if you want to use the `autocad_*` tools

Node 20+ is recommended.

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Run

The MCP host should launch this server over `stdio`.

```bash
npm start
```

Equivalent:

```bash
node dist/index.js
```

## MCP Configuration

Example configuration:

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

## Main Tool Groups

- geometry creation and editing
- layer management
- query and measurement tools
- assembly and drawing tools
- topology and boolean tools
- project file tools
- AutoCAD bridge tools

## Project File Format

Saved project files use:

- `format`: `cad-mcp-project`
- `formatVersion`: `1`
- `savedAt`: ISO 8601 string
- `snapshot`: serialized session snapshot

## Repository Additions

- `src/core/OpenCascadeAdapter.ts`: OpenCascade runtime loader and compatibility fallback
- `src/integrations/AutoCadComBridge.ts`: Windows COM bridge for live AutoCAD access
- `src/tools/autocadTools.ts`: MCP tool registration for AutoCAD operations
- `python/occt_bridge.py`: placeholder bridge entrypoint for future Python-based OCCT work
- `python/mesh_analysis.py`: placeholder heavy-analysis process entrypoint
- `assets/blocks/`: starter block library folder
- `assets/materials/materials.json`: starter material metadata
- `assets/templates/a3-landscape.json`: starter drawing template metadata

## Limitations

- DWG import/export still requires an external ODA-compatible converter and is not bundled
- direct AutoCAD integration currently targets running local AutoCAD through COM on Windows
- some DXF entity types and advanced polyline bulge cases still have limited support
- the internal CAD session and the live AutoCAD bridge are related but distinct workflows

## License

ISC
