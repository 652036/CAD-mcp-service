import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SceneGraph } from "../core/SceneGraph.js";
import type { Entity2D, EntityType } from "../core/types.js";
import { entitiesToSvg } from "./preview/svgPreview.js";
import { toMillimetres, type LengthUnit } from "./units.js";
import { mcpJson } from "./mcpJson.js";

const lengthUnitSchema = z.enum(["mm", "cm", "m", "in"]).optional();

const pointSchema = z.object({ x: z.number(), y: z.number() });

export interface EntityListFilter {
  kind?: EntityType | EntityType[];
  type?: EntityType | EntityType[];
  layer?: string;
  ids?: string[];
}

function parseEntityFilter(raw: unknown): EntityListFilter | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const filter: EntityListFilter = {};
  const applyKindOrType = (key: "kind" | "type", val: unknown) => {
    if (typeof val === "string") {
      filter[key] = val as EntityType;
    } else if (Array.isArray(val)) {
      filter[key] = val as EntityType[];
    }
  };
  if (o.kind !== undefined) {
    applyKindOrType("kind", o.kind);
  }
  if (o.type !== undefined) {
    applyKindOrType("type", o.type);
  }
  if (typeof o.layer === "string") {
    filter.layer = o.layer;
  }
  if (Array.isArray(o.ids)) {
    filter.ids = o.ids.filter((x): x is string => typeof x === "string");
  }
  return filter;
}

function applyEntityFilter(
  entities: readonly Entity2D[],
  filter: EntityListFilter | undefined,
): Entity2D[] {
  if (!filter) {
    return [...entities];
  }
  let list = [...entities];
  if (filter.ids?.length) {
    const set = new Set(filter.ids);
    list = list.filter((e) => set.has(e.id));
  }
  const kindOrType = filter.type ?? filter.kind;
  if (kindOrType !== undefined) {
    const kinds = Array.isArray(kindOrType) ? kindOrType : [kindOrType];
    const kset = new Set(kinds);
    list = list.filter((e) => kset.has(e.type));
  }
  if (filter.layer !== undefined && filter.layer !== "") {
    list = list.filter((e) => e.layer === filter.layer);
  }
  return list;
}

export const REGISTERED_TOOL_NAMES = [
  "create_point",
  "create_line",
  "create_circle",
  "create_arc",
  "create_rectangle",
  "create_polygon",
  "create_polyline",
  "create_layer",
  "set_entity_layer",
  "list_entities",
  "list_layers",
  "get_entity_properties",
  "delete_entity",
  "render_preview_svg",
] as const;

export function registerTools(server: McpServer, sceneGraph: SceneGraph): void {
  server.registerTool(
    "create_point",
    {
      description:
        "Create a point at (x, y). Coordinates are converted from `unit` (default mm) to internal mm. Optional `layer` is a layer name.",
      inputSchema: {
        x: z.number(),
        y: z.number(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      const unit = (args.unit ?? "mm") as LengthUnit;
      const x = toMillimetres(args.x, unit);
      const y = toMillimetres(args.y, unit);
      const id = sceneGraph.createPoint([x, y], { layer: args.layer });
      return mcpJson({ success: true, entity_ids: [id] });
    },
  );

  server.registerTool(
    "create_line",
    {
      description: "Create a line from (x1,y1) to (x2,y2). Coordinates in millimetres.",
      inputSchema: {
        x1: z.number(),
        y1: z.number(),
        x2: z.number(),
        y2: z.number(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      const unit = (args.unit ?? "mm") as LengthUnit;
      const x1 = toMillimetres(args.x1, unit);
      const y1 = toMillimetres(args.y1, unit);
      const x2 = toMillimetres(args.x2, unit);
      const y2 = toMillimetres(args.y2, unit);
      const id = sceneGraph.createLine([x1, y1, x2, y2], {
        layer: args.layer,
      });
      return mcpJson({ success: true, entity_ids: [id] });
    },
  );

  server.registerTool(
    "create_circle",
    {
      description:
        "Create a circle with centre (cx,cy) and radius. Values use `unit` (default mm) for lengths.",
      inputSchema: {
        cx: z.number(),
        cy: z.number(),
        radius: z.number().positive(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      const unit = (args.unit ?? "mm") as LengthUnit;
      const cx = toMillimetres(args.cx, unit);
      const cy = toMillimetres(args.cy, unit);
      const radius = toMillimetres(args.radius, unit);
      const id = sceneGraph.createCircle([cx, cy, radius], {
        layer: args.layer,
      });
      return mcpJson({ success: true, entity_ids: [id] });
    },
  );

  server.registerTool(
    "create_arc",
    {
      description:
        "Create a circular arc: centre (cx,cy), radius, startAngle and endAngle in **radians** (counterclockwise from +X; mathematical Y-up). Lengths use `unit` (default mm).",
      inputSchema: {
        cx: z.number(),
        cy: z.number(),
        radius: z.number().positive(),
        startAngle: z.number(),
        endAngle: z.number(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      const unit = (args.unit ?? "mm") as LengthUnit;
      const cx = toMillimetres(args.cx, unit);
      const cy = toMillimetres(args.cy, unit);
      const radius = toMillimetres(args.radius, unit);
      const id = sceneGraph.createArc(
        [cx, cy, radius, args.startAngle, args.endAngle],
        { layer: args.layer },
      );
      return mcpJson({ success: true, entity_ids: [id] });
    },
  );

  server.registerTool(
    "create_rectangle",
    {
      description:
        "Axis-aligned rectangle: corner (x,y), width, height, optional cornerRadius. Lengths use `unit` (default mm). Y increases upward; (x,y) is the lower-left corner.",
      inputSchema: {
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
        cornerRadius: z.number().nonnegative().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      const unit = (args.unit ?? "mm") as LengthUnit;
      const x = toMillimetres(args.x, unit);
      const y = toMillimetres(args.y, unit);
      const width = toMillimetres(args.width, unit);
      const height = toMillimetres(args.height, unit);
      const cornerRadius =
        args.cornerRadius !== undefined
          ? toMillimetres(args.cornerRadius, unit)
          : undefined;
      const properties =
        cornerRadius !== undefined ? { cornerRadius } : undefined;
      const id = sceneGraph.createRectangle([x, y, width, height], {
        layer: args.layer,
        properties,
      });
      return mcpJson({ success: true, entity_ids: [id] });
    },
  );

  server.registerTool(
    "create_polygon",
    {
      description:
        "Create a polygon or open path from vertices. `closed` controls whether the path is closed. Points use `unit` (default mm).",
      inputSchema: {
        points: z.array(pointSchema).min(1),
        closed: z.boolean(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      const unit = (args.unit ?? "mm") as LengthUnit;
      const coords: number[] = [];
      for (const p of args.points) {
        coords.push(toMillimetres(p.x, unit), toMillimetres(p.y, unit));
      }
      const id = args.closed
        ? sceneGraph.createPolygon(coords, { layer: args.layer })
        : sceneGraph.createPolyline(coords, {
            closed: false,
            layer: args.layer,
          });
      return mcpJson({ success: true, entity_ids: [id] });
    },
  );

  server.registerTool(
    "create_polyline",
    {
      description:
        "Create a polyline. If `closed` is true, the first and last vertices are joined. Points use `unit` (default mm).",
      inputSchema: {
        points: z.array(pointSchema).min(1),
        closed: z.boolean(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      const unit = (args.unit ?? "mm") as LengthUnit;
      const coords: number[] = [];
      for (const p of args.points) {
        coords.push(toMillimetres(p.x, unit), toMillimetres(p.y, unit));
      }
      const id = sceneGraph.createPolyline(coords, {
        closed: args.closed,
        layer: args.layer,
      });
      return mcpJson({ success: true, entity_ids: [id] });
    },
  );

  server.registerTool(
    "create_layer",
    {
      description:
        "Create a named layer with optional stroke color (e.g. #ff0000). If the name already exists, optionally updates color and returns a warning.",
      inputSchema: {
        name: z.string().min(1),
        color: z.string().optional(),
      },
    },
    async (args) => {
      if (sceneGraph.getLayers().has(args.name)) {
        if (args.color !== undefined) {
          sceneGraph.setLayerColor(args.name, args.color);
        }
        return mcpJson({
          success: true,
          data: { name: args.name },
          warnings: ["Layer already existed."],
        });
      }
      sceneGraph.createLayer(args.name, { color: args.color });
      return mcpJson({
        success: true,
        data: { name: args.name },
      });
    },
  );

  server.registerTool(
    "set_entity_layer",
    {
      description: "Assign entities to a layer by name.",
      inputSchema: {
        entity_ids: z.array(z.string()).min(1),
        layer_name: z.string().min(1),
      },
    },
    async (args) => {
      const r = sceneGraph.setEntityLayer(args.entity_ids, args.layer_name);
      if (r.missingLayer) {
        return mcpJson({
          success: false,
          error: `Layer not found: ${args.layer_name}`,
          data: { not_found: r.notFound },
        });
      }
      const warnings: string[] = [];
      if (r.notFound.length) {
        warnings.push(`Unknown entity ids: ${r.notFound.join(", ")}`);
      }
      return mcpJson({
        success: true,
        entity_ids: r.updated,
        data: { updated: r.updated, not_found: r.notFound },
        warnings: warnings.length ? warnings : undefined,
      });
    },
  );

  server.registerTool(
    "list_entities",
    {
      description:
        "List entities. Optional `filter` object: { kind?, type?, layer?, ids? } where kind/type is a string or string[] (entity type: point, line, …).",
      inputSchema: {
        filter: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      const filter = parseEntityFilter(args.filter);
      const list = applyEntityFilter(sceneGraph.listEntities(), filter);
      return mcpJson({
        success: true,
        data: { entities: list, count: list.length },
      });
    },
  );

  server.registerTool(
    "list_layers",
    {
      description: "List all layers (name, color, visible, locked).",
      inputSchema: {},
    },
    async () => {
      const layers = sceneGraph.listLayers();
      return mcpJson({
        success: true,
        data: { layers, count: layers.length },
      });
    },
  );

  server.registerTool(
    "get_entity_properties",
    {
      description: "Return one entity record by id.",
      inputSchema: { entity_id: z.string().min(1) },
    },
    async (args) => {
      const e = sceneGraph.getEntity(args.entity_id);
      if (!e) {
        return mcpJson({
          success: false,
          error: `Entity not found: ${args.entity_id}`,
        });
      }
      return mcpJson({ success: true, data: { entity: e } });
    },
  );

  server.registerTool(
    "delete_entity",
    {
      description: "Remove an entity by id.",
      inputSchema: { entity_id: z.string().min(1) },
    },
    async (args) => {
      const ok = sceneGraph.deleteEntity(args.entity_id);
      if (!ok) {
        return mcpJson({
          success: false,
          error: `Entity not found: ${args.entity_id}`,
        });
      }
      return mcpJson({ success: true, data: { deleted: args.entity_id } });
    },
  );

  server.registerTool(
    "render_preview_svg",
    {
      description:
        "Wireframe SVG preview of entities (mm). Optional entity_ids limits which shapes are drawn.",
      inputSchema: {
        entity_ids: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      let list = sceneGraph.listEntities();
      if (args.entity_ids?.length) {
        const set = new Set(args.entity_ids);
        list = list.filter((e) => set.has(e.id));
      }
      const svg = entitiesToSvg(list);
      return mcpJson({
        success: true,
        data: { svg, entity_count: list.length },
      });
    },
  );
}
