import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CadSession } from "../session/index.js";
import {
  normalizeProjectCrs,
  normalizeProjectExtent,
  normalizeProjectOrigin,
  transformBetweenLocalAndWorld,
} from "../utils/crs.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

export const GIS_TOOL_NAMES = [
  "set_project_crs",
  "get_project_crs",
  "set_map_extent",
  "set_drawing_scale",
  "transform_coords",
] as const;

export function registerGisTools(server: McpServer, session: CadSession): void {
  server.registerTool(
    "set_project_crs",
    {
      description:
        "Set project CRS and optional origin metadata for resource/environment mapping workflows.",
      inputSchema: {
        code: z.string().optional(),
        name: z.string().optional(),
        wkt: z.string().optional(),
        units: z.string().optional(),
        origin: z
          .object({
            x: z.number(),
            y: z.number(),
            z: z.number().optional(),
          })
          .optional(),
      },
    },
    async (args) => {
      try {
        const current = session.sceneGraph.getGeoReference();
        session.sceneGraph.setGeoReference({
          ...current,
          crs: normalizeProjectCrs(args),
          origin: args.origin
            ? normalizeProjectOrigin(args.origin)
            : current.origin,
        });
        return mcpJson({
          success: true,
          data: session.sceneGraph.getGeoReference(),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "get_project_crs",
    {
      description: "Return current project georeferencing metadata.",
      inputSchema: {},
    },
    async () =>
      mcpJson({
        success: true,
        data: session.sceneGraph.getGeoReference(),
      }),
  );

  server.registerTool(
    "set_map_extent",
    {
      description:
        "Set the current map extent used for paper layout, grids, and exports.",
      inputSchema: {
        minX: z.number(),
        minY: z.number(),
        maxX: z.number(),
        maxY: z.number(),
      },
    },
    async (args) => {
      try {
        const current = session.sceneGraph.getGeoReference();
        session.sceneGraph.setGeoReference({
          ...current,
          extent: normalizeProjectExtent(args),
        });
        return mcpJson({
          success: true,
          data: session.sceneGraph.getGeoReference(),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "set_drawing_scale",
    {
      description:
        "Set a drawing scale factor between local drawing units and world coordinates.",
      inputSchema: {
        scale: z.number().positive(),
      },
    },
    async (args) => {
      try {
        const current = session.sceneGraph.getGeoReference();
        session.sceneGraph.setGeoReference({
          ...current,
          drawingScale: args.scale,
        });
        return mcpJson({
          success: true,
          data: session.sceneGraph.getGeoReference(),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "transform_coords",
    {
      description:
        "Transform coordinates between local drawing space and world space using project origin and drawing scale.",
      inputSchema: {
        point: z.object({
          x: z.number(),
          y: z.number(),
          z: z.number().optional(),
        }),
        direction: z.enum(["local_to_world", "world_to_local"]),
      },
    },
    async (args) => {
      try {
        return mcpJson({
          success: true,
          data: {
            point: transformBetweenLocalAndWorld(
              args.point,
              session.sceneGraph.getGeoReference(),
              args.direction,
            ),
            georef: session.sceneGraph.getGeoReference(),
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
