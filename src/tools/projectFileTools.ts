import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  parseProjectFileJson,
  readProjectFile,
  serializeProjectFile,
  writeProjectFile,
} from "../project/index.js";
import type { CadSession } from "../session/index.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

export function registerProjectFileTools(
  server: McpServer,
  session: CadSession,
): void {
  server.registerTool(
    "new_project",
    {
      description:
        "Start a new empty CAD project (default layer 0, no entities). Optional project name.",
      inputSchema: { name: z.string().optional() },
    },
    async (args) => {
      try {
        session.newEmptyScene(args.name);
        return mcpJson({ success: true });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "get_project_info",
    {
      description: "Return current project metadata and scene counts.",
      inputSchema: {},
    },
    async () => {
      try {
        const backend = await session.geometryEngine.getBackendStatus();
        return mcpJson({
          success: true,
          data: {
            ...session.sceneGraph.getProjectMetadata(),
            geometryBackend: backend,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "save_project",
    {
      description:
        "Save the current scene to a project JSON file on disk (cad-mcp-project v1).",
      inputSchema: { path: z.string() },
    },
    async (args) => {
      try {
        const snapshot = session.exportSnapshot();
        const file = parseProjectFileJson(serializeProjectFile(snapshot));
        await writeProjectFile(args.path, file);
        return mcpJson({ success: true });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "load_project",
    {
      description:
        "Load a project JSON file from disk and replace the current scene (undo/redo cleared).",
      inputSchema: { path: z.string() },
    },
    async (args) => {
      try {
        const file = await readProjectFile(args.path);
        session.loadSnapshot(file.snapshot);
        return mcpJson({ success: true });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "open_project",
    {
      description:
        "Alias for load_project: load a project JSON file from disk and replace the current scene.",
      inputSchema: { path: z.string() },
    },
    async (args) => {
      try {
        const file = await readProjectFile(args.path);
        session.loadSnapshot(file.snapshot);
        return mcpJson({ success: true });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
