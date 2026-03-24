import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EntityType } from "../core/types.js";
import type { CadSession } from "../session/index.js";
import { mcpJson } from "./mcpJson.js";

const pointSchema = z.object({ x: z.number(), y: z.number() });

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function flatPoints(points: Array<{ x: number; y: number }>): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

function createAnnotationEntity(
  session: CadSession,
  type: EntityType,
  coords: number[],
  properties: Record<string, unknown>,
): string {
  return session.sceneGraph.addEntity({
    type,
    coords,
    properties,
  } as never);
}

export const ANNOTATION_TOOL_NAMES = [
  "add_linear_dimension",
  "add_aligned_dimension",
  "add_angular_dimension",
  "add_radius_dimension",
  "add_diameter_dimension",
  "add_ordinate_dimension",
  "add_baseline_dimension",
  "add_continued_dimension",
  "add_text",
  "add_mtext",
  "add_leader",
  "add_multileader",
  "create_table",
  "set_table_cell",
  "add_surface_finish_symbol",
  "add_weld_symbol",
  "add_gdt_frame",
  "add_center_mark",
  "add_center_line",
] as const;

export function registerAnnotationTools(
  server: McpServer,
  session: CadSession,
): void {
  const registerDimension = (
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    coords: (args: Record<string, unknown>) => number[],
  ) => {
    server.registerTool(
      name,
      { description, inputSchema: schema },
      async (args) => {
        try {
          const id = createAnnotationEntity(session, "dimension", coords(args), {
            subtype: name,
            ...args,
          });
          return mcpJson({ success: true, entity_ids: [id] });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };

  registerDimension("add_linear_dimension", "Add a linear dimension annotation.", { p1: pointSchema, p2: pointSchema, offset: z.number(), style: z.string().optional() }, (args) => flatPoints([args.p1 as {x:number;y:number}, args.p2 as {x:number;y:number}]));
  registerDimension("add_aligned_dimension", "Add an aligned dimension annotation.", { p1: pointSchema, p2: pointSchema, offset: z.number() }, (args) => flatPoints([args.p1 as {x:number;y:number}, args.p2 as {x:number;y:number}]));
  registerDimension("add_angular_dimension", "Add an angular dimension annotation.", { vertex: pointSchema, p1: pointSchema, p2: pointSchema }, (args) => flatPoints([args.vertex as {x:number;y:number}, args.p1 as {x:number;y:number}, args.p2 as {x:number;y:number}]));
  registerDimension("add_radius_dimension", "Add a radius dimension.", { arc_id: z.string(), leader_point: pointSchema }, (args) => flatPoints([args.leader_point as {x:number;y:number}]));
  registerDimension("add_diameter_dimension", "Add a diameter dimension.", { circle_id: z.string(), leader_point: pointSchema }, (args) => flatPoints([args.leader_point as {x:number;y:number}]));
  registerDimension("add_ordinate_dimension", "Add an ordinate dimension.", { point: pointSchema, datum_point: pointSchema, axis: z.enum(["x", "y"]) }, (args) => flatPoints([args.point as {x:number;y:number}, args.datum_point as {x:number;y:number}]));
  registerDimension("add_baseline_dimension", "Add baseline dimensions.", { points: z.array(pointSchema).min(1), baseline: z.number() }, (args) => flatPoints(args.points as Array<{x:number;y:number}>));
  registerDimension("add_continued_dimension", "Add continued dimensions.", { points: z.array(pointSchema).min(2) }, (args) => flatPoints(args.points as Array<{x:number;y:number}>));

  server.registerTool(
    "add_text",
    {
      description: "Add a single-line text annotation.",
      inputSchema: { content: z.string(), position: pointSchema, height: z.number().positive(), rotation: z.number().optional(), style: z.string().optional() },
    },
    async (args) => {
      try {
        const id = createAnnotationEntity(session, "text", [args.position.x, args.position.y], args);
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "add_mtext",
    {
      description: "Add a multi-line text annotation.",
      inputSchema: { content: z.string(), position: pointSchema, width: z.number().positive(), height: z.number().positive(), style: z.string().optional() },
    },
    async (args) => {
      try {
        const id = createAnnotationEntity(session, "mtext", [args.position.x, args.position.y], args);
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  const registerLeader = (name: "add_leader" | "add_multileader", type: "leader" | "multileader") => {
    server.registerTool(
      name,
      {
        description: `Add a ${type} annotation.`,
        inputSchema: {
          points: z.array(pointSchema).min(2),
          annotation: z.string().optional(),
          content: z.string().optional(),
          style: z.string().optional(),
        },
      },
      async (args) => {
        try {
          const id = createAnnotationEntity(session, type, flatPoints(args.points), args);
          return mcpJson({ success: true, entity_ids: [id] });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };
  registerLeader("add_leader", "leader");
  registerLeader("add_multileader", "multileader");

  server.registerTool(
    "create_table",
    {
      description: "Create a table annotation.",
      inputSchema: { rows: z.number().int().positive(), cols: z.number().int().positive(), position: pointSchema, style: z.string().optional() },
    },
    async (args) => {
      try {
        const id = createAnnotationEntity(session, "table", [args.position.x, args.position.y], {
          ...args,
          cells: Array.from({ length: args.rows }, () => Array.from({ length: args.cols }, () => "")),
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "set_table_cell",
    {
      description: "Set a table cell value.",
      inputSchema: { table_id: z.string(), row: z.number().int().nonnegative(), col: z.number().int().nonnegative(), content: z.string() },
    },
    async (args) => {
      try {
        const table = session.sceneGraph.getEntity(args.table_id);
        if (!table || table.type !== "table") {
          return mcpJson({ success: false, error: `Table not found: ${args.table_id}` });
        }
        const cells = Array.isArray(table.properties?.cells) ? structuredClone(table.properties?.cells) : [];
        if (!Array.isArray(cells[args.row])) {
          cells[args.row] = [];
        }
        cells[args.row][args.col] = args.content;
        session.sceneGraph.replaceEntity({
          ...table,
          properties: { ...(table.properties ?? {}), cells },
        });
        return mcpJson({ success: true, entity_ids: [args.table_id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  const registerSymbol = (name: string) => {
    server.registerTool(
      name,
      {
        description: `Add symbol annotation ${name}.`,
        inputSchema: {
          position: pointSchema.optional(),
          circle_id: z.string().optional(),
          entities: z.array(z.string()).optional(),
          roughness: z.string().optional(),
          options: z.record(z.string(), z.unknown()).optional(),
          symbol: z.string().optional(),
          tolerance: z.string().optional(),
          datum: z.string().optional(),
        },
      },
      async (args) => {
        try {
          const pos = args.position ?? { x: 0, y: 0 };
          const id = createAnnotationEntity(session, "symbol", [pos.x, pos.y], {
            subtype: name,
            ...args,
          });
          return mcpJson({ success: true, entity_ids: [id] });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };

  registerSymbol("add_surface_finish_symbol");
  registerSymbol("add_weld_symbol");
  registerSymbol("add_gdt_frame");
  registerSymbol("add_center_mark");
  registerSymbol("add_center_line");
}
