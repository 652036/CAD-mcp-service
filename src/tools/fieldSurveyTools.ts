import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CadSession } from "../session/index.js";
import { mcpJson } from "./mcpJson.js";
import { normalizeLengthUnit, toMillimetres } from "./units.js";

const pointSchema = z.object({ x: z.number(), y: z.number() });
const lengthUnitSchema = z
  .enum(["mm", "cm", "m", "in", "inch", "ft"])
  .optional();

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function ensureLayer(session: CadSession, layer?: string): string {
  const name = layer && layer !== "" ? layer : "0";
  if (!session.sceneGraph.getLayers().has(name)) {
    session.sceneGraph.createLayer(name, {});
  }
  return name;
}

function domainProperties(
  kind: string,
  patch?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    kind,
    ...(patch ?? {}),
  };
}

export const FIELD_SURVEY_TOOL_NAMES = [
  "create_sampling_point",
  "create_monitoring_well",
  "create_profile_line",
  "create_boundary_polygon",
  "list_entities_by_domain_kind",
] as const;

export function registerFieldSurveyTools(
  server: McpServer,
  session: CadSession,
): void {
  server.registerTool(
    "create_sampling_point",
    {
      description:
        "Create a resource/environment sampling point with optional label, elevation, and attribute metadata.",
      inputSchema: {
        x: z.number(),
        y: z.number(),
        label: z.string().optional(),
        elevation: z.number().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
        attributes: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const layer = ensureLayer(session, args.layer);
        const id = session.sceneGraph.createPoint(
          [toMillimetres(args.x, unit), toMillimetres(args.y, unit)],
          {
            layer,
            properties: domainProperties("sampling_point", {
              label: args.label,
              elevation: args.elevation,
              ...(args.attributes ?? {}),
            }),
          },
        );
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_monitoring_well",
    {
      description:
        "Create a monitoring well point with optional depth and screened interval metadata.",
      inputSchema: {
        x: z.number(),
        y: z.number(),
        well_id: z.string().optional(),
        depth: z.number().optional(),
        screen_from: z.number().optional(),
        screen_to: z.number().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
        attributes: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const layer = ensureLayer(session, args.layer);
        const id = session.sceneGraph.createPoint(
          [toMillimetres(args.x, unit), toMillimetres(args.y, unit)],
          {
            layer,
            properties: domainProperties("monitoring_well", {
              wellId: args.well_id,
              depth: args.depth,
              screenFrom: args.screen_from,
              screenTo: args.screen_to,
              ...(args.attributes ?? {}),
            }),
          },
        );
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_profile_line",
    {
      description:
        "Create a profile line used for section sampling and resource/environment transects.",
      inputSchema: {
        points: z.array(pointSchema).min(2),
        name: z.string().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
        attributes: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const layer = ensureLayer(session, args.layer);
        const coords = args.points.flatMap((point) => [
          toMillimetres(point.x, unit),
          toMillimetres(point.y, unit),
        ]);
        const id = session.sceneGraph.createPolyline(coords, {
          layer,
          closed: false,
          properties: domainProperties("profile_line", {
            name: args.name,
            ...(args.attributes ?? {}),
          }),
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_boundary_polygon",
    {
      description:
        "Create a study boundary or management zone polygon with domain metadata.",
      inputSchema: {
        points: z.array(pointSchema).min(3),
        name: z.string().optional(),
        layer: z.string().optional(),
        unit: lengthUnitSchema,
        attributes: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const layer = ensureLayer(session, args.layer);
        const coords = args.points.flatMap((point) => [
          toMillimetres(point.x, unit),
          toMillimetres(point.y, unit),
        ]);
        const id = session.sceneGraph.createPolygon(coords, {
          layer,
          properties: domainProperties("boundary_polygon", {
            name: args.name,
            closed: true,
            ...(args.attributes ?? {}),
          }),
        });
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "list_entities_by_domain_kind",
    {
      description:
        "List entities tagged with a domain kind such as sampling_point, monitoring_well, or profile_line.",
      inputSchema: {
        kind: z.string().min(1),
      },
    },
    async (args) =>
      mcpJson({
        success: true,
        entity_ids: session.sceneGraph
          .listEntities()
          .filter((entity) => entity.properties?.kind === args.kind)
          .map((entity) => entity.id),
        data: {
          entities: session.sceneGraph
            .listEntities()
            .filter((entity) => entity.properties?.kind === args.kind),
        },
      }),
  );
}
