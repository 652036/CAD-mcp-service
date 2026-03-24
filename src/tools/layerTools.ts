import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CadSession } from "../session/index.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

export const LAYER_TOOL_NAMES = [
  "delete_layer",
  "rename_layer",
  "set_layer_visible",
  "set_layer_locked",
  "set_layer_color",
  "get_layer_list",
] as const;

export function registerLayerTools(
  server: McpServer,
  session: CadSession,
): void {
  const sceneGraph = session.sceneGraph;

  server.registerTool(
    "delete_layer",
    {
      description:
        "Delete a layer by name. Entities on that layer are reassigned to the default layer 0.",
      inputSchema: {
        name: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const moved = sceneGraph
          .listEntities()
          .filter((entity) => entity.layer === args.name)
          .map((entity) => entity.id);
        sceneGraph.deleteLayer(args.name);
        return mcpJson({
          success: true,
          entity_ids: moved,
          data: {
            deleted: args.name,
            moved_to_layer: "0",
            moved_entity_count: moved.length,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "rename_layer",
    {
      description:
        "Rename an existing layer. Any entities on the old layer are updated to the new layer name.",
      inputSchema: {
        old_name: z.string().min(1),
        new_name: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const moved = sceneGraph
          .listEntities()
          .filter((entity) => entity.layer === args.old_name)
          .map((entity) => entity.id);
        sceneGraph.renameLayer(args.old_name, args.new_name);
        return mcpJson({
          success: true,
          entity_ids: moved,
          data: {
            old_name: args.old_name,
            new_name: args.new_name,
            updated_entity_count: moved.length,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "set_layer_visible",
    {
      description: "Set whether a layer is visible in previews and listings.",
      inputSchema: {
        name: z.string().min(1),
        visible: z.boolean(),
      },
    },
    async (args) => {
      try {
        sceneGraph.setLayerVisible(args.name, args.visible);
        return mcpJson({
          success: true,
          data: {
            name: args.name,
            visible: args.visible,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "set_layer_locked",
    {
      description: "Set whether a layer is locked against editing.",
      inputSchema: {
        name: z.string().min(1),
        locked: z.boolean(),
      },
    },
    async (args) => {
      try {
        sceneGraph.setLayerLocked(args.name, args.locked);
        return mcpJson({
          success: true,
          data: {
            name: args.name,
            locked: args.locked,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "set_layer_color",
    {
      description:
        "Set or clear a layer display color. Pass an empty string to clear the stored color.",
      inputSchema: {
        name: z.string().min(1),
        color: z.string(),
      },
    },
    async (args) => {
      try {
        const nextColor = args.color.trim() === "" ? undefined : args.color;
        sceneGraph.setLayerColor(args.name, nextColor);
        return mcpJson({
          success: true,
          data: {
            name: args.name,
            color: nextColor ?? null,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "get_layer_list",
    {
      description: "Alias for listing all layers.",
      inputSchema: {},
    },
    async () =>
      mcpJson({
        success: true,
        data: {
          layers: sceneGraph.listLayers(),
          count: sceneGraph.listLayers().length,
        },
      }),
  );
}
