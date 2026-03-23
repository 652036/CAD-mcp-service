import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SceneGraph } from "../core/SceneGraph.js";
import type { Entity2D, EntityType } from "../core/types.js";
import { importDxfToSceneData } from "../parsers/dxfImport.js";
import { exportDxfFromEntities } from "../parsers/DxfParser.js";
import type { CadSession } from "../session/index.js";
import { entitiesToSvg } from "./preview/svgPreview.js";
import { normalizeLengthUnit, toMillimetres } from "./units.js";
import { mcpJson } from "./mcpJson.js";

const DEFAULT_LAYER = "0";

const lengthUnitSchema = z
  .enum(["mm", "cm", "m", "in", "inch", "ft"])
  .optional();

const pointSchema = z.object({ x: z.number(), y: z.number() });

function flatCoords(points: ReadonlyArray<{ x: number; y: number }>): number[] {
  const out: number[] = [];
  for (const p of points) {
    out.push(p.x, p.y);
  }
  return out;
}

/** Ensure a layer name exists before creating geometry (default layer "0"). */
function ensureLayerForCreate(sceneGraph: SceneGraph, layer?: string): string {
  const name = layer === undefined || layer === "" ? DEFAULT_LAYER : layer;
  if (!sceneGraph.getLayers().has(name)) {
    try {
      sceneGraph.createLayer(name, {});
    } catch {
      /* duplicate name */
    }
  }
  return name;
}

type EntityListFilter = {
  kind?: EntityType | EntityType[];
  layer?: string;
  ids?: string[];
};

function parseEntityFilter(raw: unknown): EntityListFilter | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const filter: EntityListFilter = {};
  const k = o.kind ?? o.type;
  if (k !== undefined) {
    if (typeof k === "string") {
      filter.kind = k as EntityType;
    } else if (Array.isArray(k)) {
      filter.kind = k as EntityType[];
    }
  }
  if (typeof o.layer === "string") {
    filter.layer = o.layer;
  }
  if (Array.isArray(o.ids)) {
    filter.ids = o.ids.filter((x): x is string => typeof x === "string");
  }
  return filter;
}

function filterEntities(
  list: readonly Entity2D[],
  filter?: EntityListFilter,
): Entity2D[] {
  let out = [...list];
  if (!filter) {
    return out;
  }
  if (filter.ids?.length) {
    const set = new Set(filter.ids);
    out = out.filter((e) => set.has(e.id));
  }
  if (filter.kind !== undefined) {
    const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
    const kset = new Set(kinds);
    out = out.filter((e) => kset.has(e.type));
  }
  if (filter.layer !== undefined && filter.layer !== "") {
    out = out.filter((e) => e.layer === filter.layer);
  }
  return out;
}

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
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
  "import_dxf",
  "export_dxf",
  "begin_transaction",
  "commit_transaction",
  "rollback_transaction",
  "push_undo_checkpoint",
  "undo",
  "redo",
] as const;

export function registerTools(server: McpServer, session: CadSession): void {
  const sceneGraph = session.sceneGraph;
  server.registerTool(
    "create_point",
    {
      description:
        "Create a point at (x, y). Coordinates are converted from `unit` (default mm) to internal mm. Optional `layer` is a layer name (created if missing).",
      inputSchema: {
        x: z.number(),
        y: z.number(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const x = toMillimetres(args.x, unit);
        const y = toMillimetres(args.y, unit);
        const layer = ensureLayerForCreate(sceneGraph, args.layer);
        const id = sceneGraph.createPoint([x, y], { layer });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_line",
    {
      description:
        "Create a line from (x1,y1) to (x2,y2). Lengths use `unit` (default mm).",
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
      try {
        const unit = normalizeLengthUnit(args.unit);
        const x1 = toMillimetres(args.x1, unit);
        const y1 = toMillimetres(args.y1, unit);
        const x2 = toMillimetres(args.x2, unit);
        const y2 = toMillimetres(args.y2, unit);
        const layer = ensureLayerForCreate(sceneGraph, args.layer);
        const id = sceneGraph.createLine([x1, y1, x2, y2], { layer });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_circle",
    {
      description:
        "Create a circle with centre (cx,cy) and radius. Lengths use `unit` (default mm).",
      inputSchema: {
        cx: z.number(),
        cy: z.number(),
        radius: z.number().positive(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const cx = toMillimetres(args.cx, unit);
        const cy = toMillimetres(args.cy, unit);
        const radius = toMillimetres(args.radius, unit);
        const layer = ensureLayerForCreate(sceneGraph, args.layer);
        const id = sceneGraph.createCircle([cx, cy, radius], { layer });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_arc",
    {
      description:
        "Create a circular arc: centre (cx,cy), radius, startAngle and endAngle in **radians** (counterclockwise from +X; mathematical Y-up). Radius uses `unit` (default mm). Stored as coords [cx,cy,r,startAngle,endAngle] in mm.",
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
      try {
        const unit = normalizeLengthUnit(args.unit);
        const cx = toMillimetres(args.cx, unit);
        const cy = toMillimetres(args.cy, unit);
        const radius = toMillimetres(args.radius, unit);
        const layer = ensureLayerForCreate(sceneGraph, args.layer);
        const id = sceneGraph.createArc(
          [cx, cy, radius, args.startAngle, args.endAngle],
          { layer },
        );
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_rectangle",
    {
      description:
        "Axis-aligned rectangle: corner (x,y), width, height, optional cornerRadius. Lengths use `unit` (default mm). Y increases upward; (x,y) is the lower-left corner. Stored as coords [x,y,width,height] in mm; cornerRadius in properties.",
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
      try {
        const unit = normalizeLengthUnit(args.unit);
        const x = toMillimetres(args.x, unit);
        const y = toMillimetres(args.y, unit);
        const width = toMillimetres(args.width, unit);
        const height = toMillimetres(args.height, unit);
        const cornerRadius =
          args.cornerRadius !== undefined
            ? toMillimetres(args.cornerRadius, unit)
            : undefined;
        const layer = ensureLayerForCreate(sceneGraph, args.layer);
        const id = sceneGraph.createRectangle([x, y, width, height], {
          layer,
          properties:
            cornerRadius !== undefined ? { cornerRadius } : undefined,
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_polygon",
    {
      description:
        "Create a polygon path from vertices. `closed` selects closed vs open stroke in preview (stored on entity properties). Points use `unit` (default mm).",
      inputSchema: {
        points: z.array(pointSchema).min(1),
        closed: z.boolean(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const pts = args.points.map((p) => ({
          x: toMillimetres(p.x, unit),
          y: toMillimetres(p.y, unit),
        }));
        const layer = ensureLayerForCreate(sceneGraph, args.layer);
        const id = sceneGraph.createPolygon(flatCoords(pts), {
          layer,
          properties: { closed: args.closed },
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_polyline",
    {
      description:
        "Create a polyline. If `closed` is true, stroke is closed in SVG preview. Points use `unit` (default mm).",
      inputSchema: {
        points: z.array(pointSchema).min(1),
        closed: z.boolean(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const pts = args.points.map((p) => ({
          x: toMillimetres(p.x, unit),
          y: toMillimetres(p.y, unit),
        }));
        const layer = ensureLayerForCreate(sceneGraph, args.layer);
        const id = sceneGraph.createPolyline(flatCoords(pts), {
          closed: args.closed,
          layer,
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_layer",
    {
      description:
        "Create a named layer with optional color (e.g. #ff0000). Layers are keyed by name; default geometry layer is \"0\".",
      inputSchema: {
        name: z.string().min(1),
        color: z.string().optional(),
      },
    },
    async (args) => {
      try {
        sceneGraph.createLayer(args.name, { color: args.color });
        return mcpJson({
          success: true,
          data: { name: args.name, layer: sceneGraph.getLayers().get(args.name) },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists")) {
          return mcpJson({
            success: true,
            data: {
              name: args.name,
              layer: sceneGraph.getLayers().get(args.name),
            },
            warnings: ["Layer already existed."],
          });
        }
        return mcpJson({ success: false, error: msg });
      }
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
      try {
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
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "list_entities",
    {
      description:
        "List entities. Optional `filter`: { kind or type?, layer?, ids? } — kind/type is an EntityType string or array (point, line, circle, arc, rectangle, polygon, polyline).",
      inputSchema: {
        filter: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      try {
        const filter = parseEntityFilter(args.filter);
        const list = filterEntities(sceneGraph.listEntities(), filter);
        return mcpJson({
          success: true,
          data: { entities: list, count: list.length },
        });
      } catch (err) {
        return toolError(err);
      }
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
      try {
        const ok = sceneGraph.deleteEntity(args.entity_id);
        if (!ok) {
          return mcpJson({
            success: false,
            error: `Entity not found: ${args.entity_id}`,
          });
        }
        return mcpJson({ success: true, data: { deleted: args.entity_id } });
      } catch (err) {
        return toolError(err);
      }
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
      let list = [...sceneGraph.listEntities()];
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

  server.registerTool(
    "import_dxf",
    {
      description:
        "Import DXF content (UTF-8 text or base64) into the scene: ensures layers exist and adds LINE, CIRCLE, ARC, POINT, LWPOLYLINE, and 2D POLYLINE entities (mm; arcs as radians internally).",
      inputSchema: {
        content: z.string().min(1),
        encoding: z.enum(["utf8", "base64"]).optional(),
      },
    },
    async (args) => {
      try {
        let text = args.content;
        if (args.encoding === "base64") {
          text = Buffer.from(args.content, "base64").toString("utf8");
        }
        const result = importDxfToSceneData(text);
        if (!result.success) {
          return mcpJson({
            success: false,
            error: result.error ?? "DXF parse failed",
            data: { skippedTypes: result.skippedTypes },
          });
        }
        const {
          layerNames,
          newEntities,
          warnings: parseWarnings,
          imported,
          skippedTypes,
        } = result;
        for (const name of layerNames) {
          try {
            sceneGraph.createLayer(name, {});
          } catch {
            /* duplicate layer */
          }
        }
        const entity_ids: string[] = [];
        for (const ent of newEntities) {
          entity_ids.push(sceneGraph.addEntity(ent));
        }
        return mcpJson({
          success: true,
          entity_ids,
          warnings: parseWarnings.length ? parseWarnings : undefined,
          data: { imported, skippedTypes },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "export_dxf",
    {
      description:
        "Export 2D entities to DXF (internal mm). Optional entity_ids limits which entities are written.",
      inputSchema: {
        entity_ids: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      let list = [...sceneGraph.listEntities()];
      if (args.entity_ids?.length) {
        const set = new Set(args.entity_ids);
        list = list.filter((e) => set.has(e.id));
      }
      const dxf = exportDxfFromEntities(list);
      const dxf_base64 = Buffer.from(dxf, "utf8").toString("base64");
      return mcpJson({
        success: true,
        data: {
          dxf,
          dxf_base64,
          byte_length: Buffer.byteLength(dxf, "utf8"),
          entity_count: list.length,
        },
      });
    },
  );

  server.registerTool(
    "begin_transaction",
    {
      description:
        "Start a nested editing transaction; pair with commit_transaction or rollback_transaction.",
      inputSchema: {},
    },
    async () => {
      try {
        session.beginTransaction();
        return mcpJson({ success: true });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "commit_transaction",
    {
      description: "Commit the innermost active transaction.",
      inputSchema: {},
    },
    async () => {
      try {
        session.commitTransaction();
        return mcpJson({ success: true });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "rollback_transaction",
    {
      description: "Discard changes since the matching begin_transaction and restore scene state.",
      inputSchema: {},
    },
    async () => {
      try {
        session.rollbackTransaction();
        return mcpJson({ success: true });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "push_undo_checkpoint",
    {
      description:
        "Record the current scene state on the undo stack (clears redo). Call before a batch of edits you want to revert in one step.",
      inputSchema: {},
    },
    async () => {
      try {
        session.pushUndoCheckpoint();
        return mcpJson({ success: true });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "undo",
    {
      description: "Restore the scene to the previous undo checkpoint.",
      inputSchema: {},
    },
    async () => {
      try {
        session.undo();
        return mcpJson({ success: true });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "redo",
    {
      description: "Re-apply the last undone scene state.",
      inputSchema: {},
    },
    async () => {
      try {
        session.redo();
        return mcpJson({ success: true });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
