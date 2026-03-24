import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AutoCadComBridge } from "../integrations/AutoCadComBridge.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

export const AUTOCAD_TOOL_NAMES = [
  "autocad_status",
  "autocad_list_layers",
  "autocad_list_modelspace_entities",
  "autocad_send_command",
] as const;

export function registerAutoCadTools(server: McpServer): void {
  const bridge = new AutoCadComBridge();

  server.registerTool(
    "autocad_status",
    {
      description: "Connect to the running AutoCAD instance and return active document metadata.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await bridge.getStatus();
        return mcpJson({ success: true, data });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "autocad_list_layers",
    {
      description: "List layers from the active AutoCAD document through COM.",
      inputSchema: {
        limit: z.number().int().positive().max(500).optional(),
      },
    },
    async (args) => {
      try {
        const layers = await bridge.listLayers(args.limit);
        return mcpJson({
          success: true,
          data: {
            layers,
            count: layers.length,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "autocad_list_modelspace_entities",
    {
      description:
        "List entities from AutoCAD ModelSpace. Optional filters: layer, objectName, limit.",
      inputSchema: {
        limit: z.number().int().positive().max(1000).optional(),
        layer: z.string().optional(),
        objectName: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const entities = await bridge.listModelSpaceEntities({
          limit: args.limit,
          layer: args.layer,
          objectName: args.objectName,
        });
        return mcpJson({
          success: true,
          data: {
            entities,
            count: entities.length,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "autocad_send_command",
    {
      description:
        "Send a raw command string to the active AutoCAD document. Example: `_.ZOOM _E`.",
      inputSchema: {
        command: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const data = await bridge.sendCommand(args.command);
        return mcpJson({ success: true, data });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
