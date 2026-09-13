import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CadSession } from "../session/index.js";
import { is2dEntity } from "../utils/entityKinds.js";
import { mcpJson } from "./mcpJson.js";
import { normalizeLengthUnit, toMillimetres } from "./units.js";

const lengthUnitSchema = z.enum(["mm", "cm", "m", "in", "inch", "ft"]).optional();
const pointSchema = z.object({ x: z.number(), y: z.number() });

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function getLine(session: CadSession, id: string) {
  const entity = session.sceneGraph.getEntity(id);
  if (!entity || entity.type !== "line") {
    throw new Error(`Line not found: ${id}`);
  }
  return entity;
}

export const ADVANCED_2D_TOOL_NAMES = [
  "create_ellipse",
  "create_spline",
  "trim",
  "extend",
  "fillet_2d",
  "chamfer_2d",
] as const;

export function registerAdvanced2dTools(
  server: McpServer,
  session: CadSession,
): void {
  server.registerTool(
    "create_ellipse",
    {
      description: "Create an ellipse with radii and rotation.",
      inputSchema: {
        cx: z.number(),
        cy: z.number(),
        rx: z.number().positive(),
        ry: z.number().positive(),
        rotation: z.number().default(0),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const id = session.sceneGraph.addEntity({
          type: "ellipse",
          coords: [
            toMillimetres(args.cx, unit),
            toMillimetres(args.cy, unit),
            toMillimetres(args.rx, unit),
            toMillimetres(args.ry, unit),
            args.rotation,
          ],
          layer: args.layer,
        } as never);
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_spline",
    {
      description: "Create a control-point spline entity.",
      inputSchema: {
        controlPoints: z.array(pointSchema).min(2),
        degree: z.number().int().positive().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const coords = args.controlPoints.flatMap((point) => [
          toMillimetres(point.x, unit),
          toMillimetres(point.y, unit),
        ]);
        const id = session.sceneGraph.addEntity({
          type: "spline",
          coords,
          layer: args.layer,
          properties: { degree: args.degree ?? 3 },
        } as never);
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "trim",
    {
      description: "Trim a line-like entity by shortening it toward its midpoint.",
      inputSchema: { entity_id: z.string(), cutting_entities: z.array(z.string()).optional() },
    },
    async (args) => {
      try {
        const entity = session.sceneGraph.getEntity(args.entity_id);
        if (!entity || !is2dEntity(entity) || entity.type !== "line") {
          return mcpJson({ success: false, error: "trim currently supports line entities only" });
        }
        const midX = (entity.coords[0] + entity.coords[2]) / 2;
        const midY = (entity.coords[1] + entity.coords[3]) / 2;
        session.sceneGraph.replaceEntity({
          ...entity,
          coords: [entity.coords[0], entity.coords[1], midX, midY],
          properties: { ...(entity.properties ?? {}), trimmedBy: args.cutting_entities ?? [] },
        });
        return mcpJson({ success: true, entity_ids: [args.entity_id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "extend",
    {
      description: "Extend a line-like entity by 20 percent.",
      inputSchema: { entity_id: z.string(), boundary_entities: z.array(z.string()).optional() },
    },
    async (args) => {
      try {
        const entity = session.sceneGraph.getEntity(args.entity_id);
        if (!entity || !is2dEntity(entity) || entity.type !== "line") {
          return mcpJson({ success: false, error: "extend currently supports line entities only" });
        }
        const dx = entity.coords[2] - entity.coords[0];
        const dy = entity.coords[3] - entity.coords[1];
        session.sceneGraph.replaceEntity({
          ...entity,
          coords: [
            entity.coords[0],
            entity.coords[1],
            entity.coords[2] + dx * 0.2,
            entity.coords[3] + dy * 0.2,
          ],
          properties: { ...(entity.properties ?? {}), extendedTo: args.boundary_entities ?? [] },
        });
        return mcpJson({ success: true, entity_ids: [args.entity_id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "fillet_2d",
    {
      description: "Create a simple arc fillet between two lines using their intersection midpoint.",
      inputSchema: { line_id_a: z.string(), line_id_b: z.string(), radius: z.number().positive(), unit: lengthUnitSchema },
    },
    async (args) => {
      try {
        const a = getLine(session, args.line_id_a);
        const b = getLine(session, args.line_id_b);
        const unit = normalizeLengthUnit(args.unit);
        const id = session.sceneGraph.addEntity({
          type: "arc",
          coords: [
            (a.coords[2] + b.coords[0]) / 2,
            (a.coords[3] + b.coords[1]) / 2,
            toMillimetres(args.radius, unit),
            0,
            Math.PI / 2,
          ],
          layer: a.layer,
          properties: { filletOf: [args.line_id_a, args.line_id_b] },
        } as never);
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "chamfer_2d",
    {
      description: "Create a simple chamfer line between two lines.",
      inputSchema: { line_id_a: z.string(), line_id_b: z.string(), dist1: z.number().positive(), dist2: z.number().positive(), unit: lengthUnitSchema },
    },
    async (args) => {
      try {
        const a = getLine(session, args.line_id_a);
        const b = getLine(session, args.line_id_b);
        const unit = normalizeLengthUnit(args.unit);
        const dist1 = toMillimetres(args.dist1, unit);
        const dist2 = toMillimetres(args.dist2, unit);
        const id = session.sceneGraph.addEntity({
          type: "line",
          coords: [
            a.coords[2] - dist1,
            a.coords[3],
            b.coords[0],
            b.coords[1] + dist2,
          ],
          layer: a.layer,
          properties: { chamferOf: [args.line_id_a, args.line_id_b] },
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
