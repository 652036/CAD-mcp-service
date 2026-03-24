import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CadSession } from "../session/index.js";
import { normalizeLengthUnit, toMillimetres } from "./units.js";
import { mcpJson } from "./mcpJson.js";

const lengthUnitSchema = z
  .enum(["mm", "cm", "m", "in", "inch", "ft"])
  .optional();

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

export const GEOMETRY_3D_TOOL_NAMES = [
  "create_box",
  "create_sphere",
  "create_cylinder",
  "create_cone",
  "create_torus",
  "create_prism",
  "create_revolution",
] as const;

export function registerGeometry3dTools(
  server: McpServer,
  session: CadSession,
): void {
  const geometry = session.geometryEngine;

  server.registerTool(
    "create_box",
    {
      description: "Create a box solid at origin with width, height, and depth.",
      inputSchema: {
        width: z.number().positive(),
        height: z.number().positive(),
        depth: z.number().positive(),
        x: z.number().optional(),
        y: z.number().optional(),
        z: z.number().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const id = geometry.createSolid({
          type: "box",
          coords: [
            toMillimetres(args.x ?? 0, unit),
            toMillimetres(args.y ?? 0, unit),
            toMillimetres(args.z ?? 0, unit),
            toMillimetres(args.width, unit),
            toMillimetres(args.height, unit),
            toMillimetres(args.depth, unit),
          ],
          layer: args.layer,
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_sphere",
    {
      description: "Create a sphere solid.",
      inputSchema: {
        radius: z.number().positive(),
        cx: z.number().optional(),
        cy: z.number().optional(),
        cz: z.number().optional(),
        segments: z.number().int().positive().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const id = geometry.createSolid({
          type: "sphere",
          coords: [
            toMillimetres(args.cx ?? 0, unit),
            toMillimetres(args.cy ?? 0, unit),
            toMillimetres(args.cz ?? 0, unit),
            toMillimetres(args.radius, unit),
          ],
          layer: args.layer,
          properties: { segments: args.segments ?? 24 },
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_cylinder",
    {
      description: "Create a vertical cylinder solid.",
      inputSchema: {
        radius: z.number().positive(),
        height: z.number().positive(),
        cx: z.number().optional(),
        cy: z.number().optional(),
        cz: z.number().optional(),
        segments: z.number().int().positive().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const id = geometry.createSolid({
          type: "cylinder",
          coords: [
            toMillimetres(args.cx ?? 0, unit),
            toMillimetres(args.cy ?? 0, unit),
            toMillimetres(args.cz ?? 0, unit),
            toMillimetres(args.radius, unit),
            toMillimetres(args.height, unit),
          ],
          layer: args.layer,
          properties: { segments: args.segments ?? 24 },
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_cone",
    {
      description: "Create a frustum or cone solid.",
      inputSchema: {
        bottomRadius: z.number().nonnegative(),
        topRadius: z.number().nonnegative(),
        height: z.number().positive(),
        cx: z.number().optional(),
        cy: z.number().optional(),
        cz: z.number().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        if (args.bottomRadius === 0 && args.topRadius === 0) {
          return mcpJson({ success: false, error: "At least one cone radius must be positive" });
        }
        const unit = normalizeLengthUnit(args.unit);
        const id = geometry.createSolid({
          type: "cone",
          coords: [
            toMillimetres(args.cx ?? 0, unit),
            toMillimetres(args.cy ?? 0, unit),
            toMillimetres(args.cz ?? 0, unit),
            toMillimetres(args.bottomRadius, unit),
            toMillimetres(args.topRadius, unit),
            toMillimetres(args.height, unit),
          ],
          layer: args.layer,
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_torus",
    {
      description: "Create a torus solid.",
      inputSchema: {
        majorRadius: z.number().positive(),
        minorRadius: z.number().positive(),
        cx: z.number().optional(),
        cy: z.number().optional(),
        cz: z.number().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const id = geometry.createSolid({
          type: "torus",
          coords: [
            toMillimetres(args.cx ?? 0, unit),
            toMillimetres(args.cy ?? 0, unit),
            toMillimetres(args.cz ?? 0, unit),
            toMillimetres(args.majorRadius, unit),
            toMillimetres(args.minorRadius, unit),
          ],
          layer: args.layer,
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_prism",
    {
      description: "Create a prism from a 2D profile entity and height.",
      inputSchema: {
        profile_id: z.string().min(1),
        height: z.number().positive(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const profile = session.sceneGraph.getEntity(args.profile_id);
        if (!profile) {
          return mcpJson({ success: false, error: `Profile not found: ${args.profile_id}` });
        }
        const bbox = session.geometryEngine.measureBoundingBox(profile);
        const unit = normalizeLengthUnit(args.unit);
        const id = geometry.createSolid({
          type: "prism",
          coords: [
            bbox.min[0],
            bbox.min[1],
            bbox.max[0] - bbox.min[0],
            bbox.max[1] - bbox.min[1],
            toMillimetres(args.height, unit),
          ],
          layer: args.layer ?? profile.layer,
          properties: { profileId: args.profile_id },
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_revolution",
    {
      description: "Create a simplified revolved solid from a 2D profile around an axis.",
      inputSchema: {
        profile_id: z.string().min(1),
        axis: z.object({
          x1: z.number(),
          y1: z.number(),
          x2: z.number(),
          y2: z.number(),
        }),
        angle: z.number().positive().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const profile = session.sceneGraph.getEntity(args.profile_id);
        if (!profile) {
          return mcpJson({ success: false, error: `Profile not found: ${args.profile_id}` });
        }
        const bbox = session.geometryEngine.measureBoundingBox(profile);
        const radius = Math.max(
          Math.abs(bbox.max[0] - args.axis.x1),
          Math.abs(bbox.min[0] - args.axis.x1),
          Math.abs(bbox.max[1] - args.axis.y1),
          Math.abs(bbox.min[1] - args.axis.y1),
        );
        const id = geometry.createSolid({
          type: "revolution",
          coords: [
            args.axis.x1,
            args.axis.y1,
            radius,
            bbox.max[1] - bbox.min[1],
            args.angle ?? Math.PI * 2,
          ],
          layer: args.layer ?? profile.layer,
          properties: { profileId: args.profile_id, axis: args.axis },
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
