import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Entity3D } from "../core/types.js";
import type { CadSession } from "../session/index.js";
import { is3dEntity } from "../utils/entityKinds.js";
import { getBoundingBox3D } from "../utils/solidMetrics.js";
import { mcpJson } from "./mcpJson.js";

function getSolid(session: CadSession, id: string): Entity3D {
  const entity = session.sceneGraph.getEntity(id);
  if (!entity || !is3dEntity(entity)) {
    throw new Error(`3D solid not found: ${id}`);
  }
  return entity;
}

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

export const TOPOLOGY_TOOL_NAMES = [
  "get_face_normal",
  "get_edge_list",
  "get_face_list",
  "get_vertex_list",
  "get_topology",
] as const;

export function registerTopologyTools(
  server: McpServer,
  session: CadSession,
): void {
  server.registerTool(
    "get_face_normal",
    {
      description: "Return a simplified face normal for an axis-aligned face id.",
      inputSchema: { solid_id: z.string(), face_id: z.string() },
    },
    async (args) => {
      try {
        const solid = getSolid(session, args.solid_id);
        const normals: Record<string, [number, number, number]> = {
          left: [-1, 0, 0],
          right: [1, 0, 0],
          front: [0, -1, 0],
          back: [0, 1, 0],
          bottom: [0, 0, -1],
          top: [0, 0, 1],
        };
        return mcpJson({
          success: true,
          data: { solid_id: solid.id, face_id: args.face_id, normal: normals[args.face_id] ?? [0, 0, 1] },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "get_edge_list",
    {
      description: "Return simplified edge ids for a solid.",
      inputSchema: { solid_id: z.string() },
    },
    async (args) => {
      try {
        getSolid(session, args.solid_id);
        return mcpJson({
          success: true,
          data: { edges: Array.from({ length: 12 }, (_, index) => `edge_${index + 1}`) },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "get_face_list",
    {
      description: "Return simplified face ids for a solid.",
      inputSchema: { solid_id: z.string() },
    },
    async (args) => {
      try {
        getSolid(session, args.solid_id);
        return mcpJson({
          success: true,
          data: { faces: ["left", "right", "front", "back", "bottom", "top"] },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "get_vertex_list",
    {
      description: "Return solid bbox corner vertices.",
      inputSchema: { solid_id: z.string() },
    },
    async (args) => {
      try {
        const bbox = getBoundingBox3D(getSolid(session, args.solid_id));
        const vertices = [
          [bbox.min[0], bbox.min[1], bbox.min[2]],
          [bbox.max[0], bbox.min[1], bbox.min[2]],
          [bbox.max[0], bbox.max[1], bbox.min[2]],
          [bbox.min[0], bbox.max[1], bbox.min[2]],
          [bbox.min[0], bbox.min[1], bbox.max[2]],
          [bbox.max[0], bbox.min[1], bbox.max[2]],
          [bbox.max[0], bbox.max[1], bbox.max[2]],
          [bbox.min[0], bbox.max[1], bbox.max[2]],
        ];
        return mcpJson({ success: true, data: { vertices } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "get_topology",
    {
      description: "Return simplified brep-like topology for a solid.",
      inputSchema: { solid_id: z.string() },
    },
    async (args) => {
      try {
        const bbox = getBoundingBox3D(getSolid(session, args.solid_id));
        return mcpJson({
          success: true,
          data: {
            bbox,
            faces: ["left", "right", "front", "back", "bottom", "top"],
            edges: Array.from({ length: 12 }, (_, index) => `edge_${index + 1}`),
            vertex_count: 8,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
