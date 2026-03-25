import { readFile, writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseCsvPointsToEntities } from "../parsers/CsvParser.js";
import {
  exportEntitiesToGeoJson,
  parseGeoJsonToEntities,
} from "../parsers/GeoJsonParser.js";
import {
  exportEntitiesToShapefileZip,
  parseShapefileToEntities,
} from "../parsers/ShapefileParser.js";
import type { CadSession } from "../session/index.js";
import { is2dEntity } from "../utils/entityKinds.js";
import { normalizeLengthUnit, toMillimetres } from "./units.js";
import { mcpJson } from "./mcpJson.js";

async function loadInput(args: {
  content?: string;
  path?: string;
  encoding?: "utf8" | "base64";
}): Promise<string> {
  if (args.path) {
    return readFile(args.path, "utf8");
  }
  if (!args.content) {
    throw new Error("Either path or content is required");
  }
  if (args.encoding === "base64") {
    return Buffer.from(args.content, "base64").toString("utf8");
  }
  return args.content;
}

function encodeOutput(
  text: string,
  path?: string,
): Promise<{ content: string; base64: string; path?: string }> {
  const base64 = Buffer.from(text, "utf8").toString("base64");
  if (!path) {
    return Promise.resolve({ content: text, base64 });
  }
  return writeFile(path, text, "utf8").then(() => ({ content: text, base64, path }));
}

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function ensureLayer(session: CadSession, layer?: string): string | undefined {
  if (!layer || layer === "") {
    return undefined;
  }
  if (!session.sceneGraph.getLayers().has(layer)) {
    session.sceneGraph.createLayer(layer, {});
  }
  return layer;
}

export const GIS_IO_TOOL_NAMES = [
  "import_csv_points",
  "import_geojson",
  "export_geojson",
  "import_shapefile",
  "export_shapefile",
] as const;

export function registerGisIoTools(
  server: McpServer,
  session: CadSession,
): void {
  const inputSchema = {
    content: z.string().optional(),
    path: z.string().optional(),
    encoding: z.enum(["utf8", "base64"]).optional(),
  };

  server.registerTool(
    "import_csv_points",
    {
      description:
        "Import CSV rows into point entities for sampling points or monitoring wells while preserving tabular attributes.",
      inputSchema: {
        ...inputSchema,
        x_column: z.string().optional(),
        y_column: z.string().optional(),
        z_column: z.string().optional(),
        id_column: z.string().optional(),
        kind: z.string().optional(),
        layer: z.string().optional(),
        unit: z.enum(["mm", "cm", "m", "in", "inch", "ft"]).optional(),
      },
    },
    async (args) => {
      try {
        const text = await loadInput(args);
        const layer = ensureLayer(session, args.layer);
        const unit = normalizeLengthUnit(args.unit);
        const entities = parseCsvPointsToEntities(text, {
          xColumn: args.x_column,
          yColumn: args.y_column,
          zColumn: args.z_column,
          idColumn: args.id_column,
          kind: args.kind,
          layer,
        }).map((entity) => ({
          ...entity,
          coords: [
            toMillimetres(entity.coords[0], unit),
            toMillimetres(entity.coords[1], unit),
          ],
        }));
        const ids = entities.map((entity) => session.sceneGraph.addEntity(entity));
        return mcpJson({
          success: true,
          entity_ids: ids,
          data: { imported: ids.length, kind: args.kind ?? "sampling_point" },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "import_geojson",
    {
      description:
        "Import GeoJSON FeatureCollection data into point, line, polyline, and polygon entities.",
      inputSchema: {
        ...inputSchema,
        layer: z.string().optional(),
        unit: z.enum(["mm", "cm", "m", "in", "inch", "ft"]).optional(),
      },
    },
    async (args) => {
      try {
        const text = await loadInput(args);
        const unit = normalizeLengthUnit(args.unit);
        const layer = ensureLayer(session, args.layer);
        const ids = parseGeoJsonToEntities(text)
          .map((entity) => ({
            ...entity,
            layer: layer ?? entity.layer,
            coords: entity.coords.map((value, index) =>
              index % 2 === 0 || index % 2 === 1
                ? toMillimetres(value, unit)
                : value,
            ),
          }))
          .map((entity) => session.sceneGraph.addEntity(entity));
        return mcpJson({ success: true, entity_ids: ids, data: { imported: ids.length } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "import_shapefile",
    {
      description:
        "Import ESRI Shapefile geometry and DBF attributes into point, line, polyline, and polygon entities.",
      inputSchema: {
        shp_path: z.string().min(1),
        dbf_path: z.string().optional(),
        layer: z.string().optional(),
        unit: z.enum(["mm", "cm", "m", "in", "inch", "ft"]).optional(),
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const layer = ensureLayer(session, args.layer);
        const ids = (await parseShapefileToEntities({
          shpPath: args.shp_path,
          dbfPath: args.dbf_path,
        }))
          .map((entity) => ({
            ...entity,
            layer: layer ?? entity.layer,
            coords: entity.coords.map((value) => toMillimetres(value, unit)),
          }))
          .map((entity) => session.sceneGraph.addEntity(entity));
        return mcpJson({ success: true, entity_ids: ids, data: { imported: ids.length } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "export_geojson",
    {
      description:
        "Export 2D entities to a GeoJSON FeatureCollection while preserving layer and properties metadata.",
      inputSchema: {
        entity_ids: z.array(z.string()).optional(),
        path: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const selected = args.entity_ids?.length ? new Set(args.entity_ids) : null;
        const entities = session.sceneGraph
          .listEntities()
          .filter((entity) => (selected ? selected.has(entity.id) : true))
          .filter(is2dEntity);
        const text = JSON.stringify(exportEntitiesToGeoJson(entities), null, 2);
        const out = await encodeOutput(text, args.path);
        return mcpJson({
          success: true,
          entity_ids: entities.map((entity) => entity.id),
          data: out,
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "export_shapefile",
    {
      description:
        "Export 2D entities as a zipped ESRI Shapefile package and optionally write it to disk.",
      inputSchema: {
        entity_ids: z.array(z.string()).optional(),
        path: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const selected = args.entity_ids?.length ? new Set(args.entity_ids) : null;
        const entities = session.sceneGraph
          .listEntities()
          .filter((entity) => (selected ? selected.has(entity.id) : true))
          .filter(is2dEntity);
        const zipped = await exportEntitiesToShapefileZip(entities);
        if (args.path) {
          await writeFile(args.path, Buffer.from(zipped));
        }
        return mcpJson({
          success: true,
          entity_ids: entities.map((entity) => entity.id),
          data: {
            path: args.path,
            zip_base64: Buffer.from(zipped).toString("base64"),
            bytes: zipped.byteLength,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
