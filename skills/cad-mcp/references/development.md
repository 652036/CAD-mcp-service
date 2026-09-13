# CAD MCP Development Notes

## Registration

- Tool registration starts in `src/tools/register.ts`.
- Grouped tools live in `src/tools/*Tools.ts` and export `*_TOOL_NAMES`.
- Keep `REGISTERED_TOOL_NAMES` complete when adding, renaming, or removing tools.
- Resource registration lives in `src/resources/register.ts`.
- Prompt registration lives in `src/prompts/register.ts`.

## File And Runtime Boundaries

- This repository is source. A live MCP client may run a different checkout, a Windows path, or a built `dist/` copy.
- Before claiming changes are live, inspect the active MCP client config and verify the actual `command`, `args`, and `cwd`.
- Before running the repository verification scripts in a new checkout, copy `mcp.config.example.json` to the ignored local `mcp.config.json`. Replace both literal `${workspaceFolder}` placeholders with the checkout's absolute directory; the scripts do not expand them. Use forward slashes or escaped backslashes in JSON paths.
- Commit the portable configuration example. Keep the local `mcp.config.json`, generated `tmp/` output, and workstation task notes in `BUILD_GOAL.md` excluded from source commits.
- Rebuild with `npm run build` after TypeScript changes. MCP clients usually need reload/restart to see new tools.

## Testing

Use focused tests when editing a narrow feature, and the full suite before publishing:

```bash
npm run build
npm test
```

On Windows PowerShell, use these equivalents if `npm.ps1` is blocked:

```powershell
npm.cmd run build
npm.cmd test
```

For end-to-end MCP validation, build first, then launch `node dist/index.js` through an MCP stdio client and smoke-test tool listing plus a minimal in-memory drawing flow. For live AutoCAD validation, keep AutoCAD and the MCP host at the same Windows privilege level; COM `GetActiveObject` may not see an instance started elevated from a non-elevated host.

Relevant existing test files include:

- `tests/autoCadComBridge.test.ts`
- `tests/dxfImport.smoke.test.ts`
- `tests/gisStage1.test.ts`
- `tests/sceneGraph.layers.test.ts`
- `tests/terrainAnalysis.test.ts`
- `tests/stage3.integration.test.ts`

## Implementation Caveats

- Internal CAD session state and AutoCAD COM state are separate.
- AutoCAD bridge tools attach to a running AutoCAD COM instance; they do not create or save DWG files unless a command explicitly does so.
- `autocad_list_documents` exposes reachable applications/documents, including HWND/process identity. COM discovery cannot guarantee every same-version process is reachable; a requested unreachable target must fail instead of falling back to another application.
- `autocad_attach` pins window/process/document identity in the server process. Its `activate` option defaults to true; false binds without activating the document. `windowHandle` must match `/^[0-9]{1,20}$/`. `autocad_activate_document` deliberately switches and updates the binding, and `autocad_detach` only clears the binding. The binding does not persist across server restarts. Serialize bridge operations, including detach, to avoid lifecycle races.
- Command submission must reject busy targets and bound documents that are no longer active. Never retry a mutation. `waitForIdle` defaults to false; `submitted` and `idle_observed` are observational states, not semantic command-success claims. Idle polling expiration returns `timeout`; the MCP wrapper must mark it `isError: true` and `success: false`, preserve the command observation data, and instruct clients to inspect before resending. A timeout after submission does not establish that nothing happened.
- `timeoutMs` bounds only idle polling after the COM `SendCommand` call returns, not total call duration. The PowerShell runner's separate 45-second timeout bounds blocking COM calls and may end the helper while AutoCAD continues executing the submitted command.
- `registerAutoCadTools(server, bridge)` accepts an injectable public bridge interface for tool-level tests. Keep MCP error responses marked `isError: true` as well as JSON `success: false`, and validate bounded identifiers, raw commands, variable names, and timeout values before bridge calls.
- Most geometry is represented in internal units of millimetres unless a tool converts an explicit input unit.
- `create_arc` uses radians, counterclockwise from +X.
- `reproject_point` and `reproject_points` use `proj4`; `transform_coords` remains metadata-driven local/world conversion.
- DWG import depends on LibreDWG `dwg2dxf`. DWG export depends on `dxf2dwg` and the internal DXF writer's compatibility.
