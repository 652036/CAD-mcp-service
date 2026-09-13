# CAD MCP Service Agent Guide

## Runtime Boundary

- Treat this repository as a source checkout until the active MCP client config proves otherwise.
- Before claiming a change is live, inspect the client `command`, `args`, and `cwd`; the ignored local `mcp.config.json` should match this checkout's built `dist/index.js`.
- MCP hosts run the built stdio entry `dist/index.js`; TypeScript source changes require `npm run build` and a client reload/restart before tools change.
- The internal CAD session and live AutoCAD COM bridge are separate state surfaces.

## Development

- Prefer existing tool grouping in `src/tools/*Tools.ts`.
- Keep `REGISTERED_TOOL_NAMES` in `src/tools/register.ts` synchronized with tool additions/removals.
- Update tests near the touched tool group and run `npm run build` plus `npm test` before pushing. In Windows PowerShell, use `npm.cmd run build` and `npm.cmd test` if `npm.ps1` is blocked by execution policy.
- For live AutoCAD work, verify Windows, local AutoCAD, matching COM process privilege level, and `autocad_status` before command execution.
- For DWG work, check `dwg_tools_status`; import/export depend on LibreDWG binaries.

## Skill

- Repo-local Codex skill: `skills/cad-mcp/SKILL.md`.
- Keep the skill and `skills/cad-mcp/references/` updated when changing MCP tool names, runtime commands, safety constraints, or major workflows.
