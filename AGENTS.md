# AGENTS.md

## Project overview

CAD MCP Server — a TypeScript MCP (Model Context Protocol) server that exposes CAD operations (scene graph, layers, entities) over stdio transport. Uses `@modelcontextprotocol/sdk`.

## Cursor Cloud specific instructions

### Quick reference

- **Build:** `npm run build` (runs `tsc`)
- **Dev watch:** `npm run dev` (runs `tsc --watch`)
- **Type-check / lint:** `npx tsc --noEmit`
- **Start server:** `npm start` (runs `node dist/index.js`, requires stdio MCP client)
- No dedicated ESLint or test framework is configured yet.

### Testing the MCP server

The server uses **stdio transport** — it cannot be tested via HTTP/curl. To verify it works, pipe JSON-RPC messages into stdin:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"0.1.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"prompts/list","params":{}}\n' | node dist/index.js
```

A successful response returns JSON-RPC results for `initialize` and `prompts/list`.

### Key caveats

- Build output goes to `dist/`. The `.gitignore` excludes both `node_modules` and `dist`.
- The `npm run dev` command (`tsc --watch`) only recompiles TypeScript; it does not restart the server process. After recompilation, you must re-run `node dist/index.js` (or pipe new requests) to test changes.
- No external services (databases, Docker, etc.) are required. The scene graph is entirely in-memory.
