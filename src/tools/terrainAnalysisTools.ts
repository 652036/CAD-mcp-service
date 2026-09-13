import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Entity2D } from "../core/types.js";
import type { CadSession } from "../session/index.js";
import { is2dEntity } from "../utils/entityKinds.js";
import {
  computeAverageElevation,
  computeCutFillVolumeFromArea,
  computeGridSurfaceVolume,
  computeSectionArea,
  getEntityPlanarArea,
  getProfileLength,
  sampleProfileFromPoints,
  selectEntitiesInsidePolygon,
} from "../utils/terrainMath.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function getEntity2D(session: CadSession, id: string): Entity2D {
  const entity = session.sceneGraph.getEntity(id);
  if (!entity || !is2dEntity(entity)) {
    throw new Error(`2D entity not found: ${id}`);
  }
  return entity;
}

function getPointEntitiesByIds(session: CadSession, ids?: string[]) {
  const selected = ids?.length ? new Set(ids) : null;
  return session.sceneGraph.listEntities().filter((entity) => {
    if (selected && !selected.has(entity.id)) {
      return false;
    }
    return is2dEntity(entity) && entity.type === "point";
  });
}

export const TERRAIN_ANALYSIS_TOOL_NAMES = [
  "measure_polygon_area_stats",
  "measure_profile_length",
  "compute_section_area",
  "compute_cut_fill_volume",
  "compute_grid_surface_volume",
] as const;

export function registerTerrainAnalysisTools(
  server: McpServer,
  session: CadSession,
): void {
  server.registerTool(
    "measure_polygon_area_stats",
    {
      description:
        "Summarize polygonal area by entity, optionally grouped by a property field for study zones.",
      inputSchema: {
        entity_ids: z.array(z.string()).min(1),
        group_by: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const polygons = args.entity_ids.map((id) => getEntity2D(session, id));
        const rows = polygons.map((entity) => ({
          entity_id: entity.id,
          type: entity.type,
          area: getEntityPlanarArea(entity),
          group:
            args.group_by &&
            entity.properties &&
            args.group_by in entity.properties
              ? entity.properties[args.group_by]
              : undefined,
        }));

        const grouped: Record<string, number> = {};
        rows.forEach((row) => {
          const key = String(row.group ?? "ungrouped");
          grouped[key] = (grouped[key] ?? 0) + row.area;
        });

        return mcpJson({
          success: true,
          data: {
            rows,
            grouped,
            total_area: rows.reduce((sum, row) => sum + row.area, 0),
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "measure_profile_length",
    {
      description: "Measure the length of a profile line or transect.",
      inputSchema: {
        profile_line_id: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const entity = getEntity2D(session, args.profile_line_id);
        return mcpJson({
          success: true,
          data: {
            profile_line_id: entity.id,
            length: getProfileLength(entity),
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "compute_section_area",
    {
      description:
        "Sample elevated points along a profile line and compute the section area against a baseline elevation.",
      inputSchema: {
        profile_line_id: z.string().min(1),
        sample_point_ids: z.array(z.string()).optional(),
        baseline_elevation: z.number(),
        max_offset: z.number().nonnegative().optional(),
      },
    },
    async (args) => {
      try {
        const profile = getEntity2D(session, args.profile_line_id);
        const samples = sampleProfileFromPoints(
          profile,
          getPointEntitiesByIds(session, args.sample_point_ids),
          args.max_offset ?? Infinity,
        );
        const section = computeSectionArea(samples, args.baseline_elevation);
        return mcpJson({
          success: true,
          data: {
            profile_line_id: profile.id,
            baseline_elevation: args.baseline_elevation,
            sample_count: samples.length,
            samples,
            ...section,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "compute_cut_fill_volume",
    {
      description:
        "Estimate cut/fill volume inside a polygon from enclosed elevated sample points and a base elevation.",
      inputSchema: {
        boundary_id: z.string().min(1),
        sample_point_ids: z.array(z.string()).optional(),
        base_elevation: z.number(),
      },
    },
    async (args) => {
      try {
        const boundary = getEntity2D(session, args.boundary_id);
        const area = getEntityPlanarArea(boundary);
        const points = selectEntitiesInsidePolygon(
          boundary,
          getPointEntitiesByIds(session, args.sample_point_ids),
        );
        const { average, count } = computeAverageElevation(points);
        const volume = computeCutFillVolumeFromArea(
          area,
          average,
          args.base_elevation,
        );
        return mcpJson({
          success: true,
          data: {
            boundary_id: boundary.id,
            area,
            sample_count: count,
            average_elevation: average,
            base_elevation: args.base_elevation,
            ...volume,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "compute_grid_surface_volume",
    {
      description:
        "Estimate surface volume from elevated point samples and a representative cell area.",
      inputSchema: {
        sample_point_ids: z.array(z.string()).optional(),
        cell_area: z.number().positive(),
        base_elevation: z.number(),
      },
    },
    async (args) => {
      try {
        return mcpJson({
          success: true,
          data: computeGridSurfaceVolume(
            getPointEntitiesByIds(session, args.sample_point_ids),
            args.cell_area,
            args.base_elevation,
          ),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
