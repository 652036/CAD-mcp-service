import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CadSession } from "../session/index.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

export const BOOLEAN_TOOL_NAMES = [
  "boolean_union",
  "boolean_subtract",
  "boolean_intersect",
  "fillet_3d",
  "chamfer_3d",
  "shell",
  "draft_angle",
  "loft",
  "sweep",
] as const;

export function registerBooleanTools(
  server: McpServer,
  session: CadSession,
): void {
  const geometry = session.geometryEngine;

  const registerBoolean = (
    name: "boolean_union" | "boolean_subtract" | "boolean_intersect",
    operation: "union" | "subtract" | "intersect",
  ) => {
    server.registerTool(
      name,
      {
        description: `${operation} two 3D solids and return a simplified composite result.`,
        inputSchema: {
          solid_id_a: z.string().min(1),
          solid_id_b: z.string().min(1),
        },
      },
      async (args) => {
        try {
          const id = geometry.createBooleanResult(
            operation,
            args.solid_id_a,
            args.solid_id_b,
          );
          return mcpJson({ success: true, entity_ids: [id] });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };

  registerBoolean("boolean_union", "union");
  registerBoolean("boolean_subtract", "subtract");
  registerBoolean("boolean_intersect", "intersect");

  const registerSolidModifier = (
    name: string,
    description: string,
    buildProperties: (args: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    server.registerTool(
      name,
      {
        description,
        inputSchema: {
          solid_id: z.string().min(1).optional(),
          edge_ids: z.array(z.string()).optional(),
          face_ids: z.array(z.string()).optional(),
          open_faces: z.array(z.string()).optional(),
          radius: z.number().optional(),
          distance: z.number().optional(),
          thickness: z.number().optional(),
          angle: z.number().optional(),
          direction: z.array(z.number()).optional(),
          profiles: z.array(z.string()).optional(),
          guides: z.array(z.string()).optional(),
          profile_id: z.string().optional(),
          path_id: z.string().optional(),
        },
      },
      async (args) => {
        try {
          const baseId =
            args.solid_id ??
            args.profile_id ??
            args.profiles?.[0];
          if (!baseId) {
            return mcpJson({ success: false, error: "A source solid or profile is required" });
          }
          const source =
            session.sceneGraph.getEntity(baseId) ??
            session.geometryEngine.getSolid(baseId);
          if (!source) {
            return mcpJson({ success: false, error: `Source not found: ${baseId}` });
          }
          const nextId = session.sceneGraph.addEntity({
            type: "boolean_result",
            coords: [...(source.coords ?? [0, 0, 0, 1, 1, 1])],
            layer: source.layer,
            properties: {
              sourceId: baseId,
              operation: name,
              ...buildProperties(args as Record<string, unknown>),
            },
          });
          return mcpJson({ success: true, entity_ids: [nextId] });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };

  registerSolidModifier(
    "fillet_3d",
    "Create a simplified filleted copy of a solid.",
    (args) => ({ edgeIds: args.edge_ids, radius: args.radius }),
  );
  registerSolidModifier(
    "chamfer_3d",
    "Create a simplified chamfered copy of a solid.",
    (args) => ({ edgeIds: args.edge_ids, distance: args.distance }),
  );
  registerSolidModifier(
    "shell",
    "Create a simplified shelled copy of a solid.",
    (args) => ({ thickness: args.thickness, openFaces: args.open_faces }),
  );
  registerSolidModifier(
    "draft_angle",
    "Create a simplified drafted copy of a solid.",
    (args) => ({ faceIds: args.face_ids, angle: args.angle, direction: args.direction }),
  );
  registerSolidModifier(
    "loft",
    "Create a simplified lofted solid from one or more profiles.",
    (args) => ({ profiles: args.profiles, guides: args.guides }),
  );
  registerSolidModifier(
    "sweep",
    "Create a simplified swept solid from a profile and path.",
    (args) => ({ profileId: args.profile_id, pathId: args.path_id }),
  );
}
