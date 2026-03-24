import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Entity, Entity3D } from "../core/types.js";
import type { CadSession } from "../session/index.js";
import { is3dEntity } from "../utils/entityKinds.js";
import { getBoundingBox3D, getCentroid, getSurfaceArea, getVolume } from "../utils/solidMetrics.js";
import { computeBBox } from "./preview/svgPreview.js";
import { getCurveLengthValue } from "./queryTools.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function getEntity(session: CadSession, id: string): Entity {
  const entity = session.sceneGraph.getEntity(id);
  if (!entity) {
    throw new Error(`Entity not found: ${id}`);
  }
  return entity;
}

function planarArea(entity: Entity): number {
  if (entity.type === "circle") {
    return Math.PI * entity.coords[2] ** 2;
  }
  if (entity.type === "rectangle") {
    return Math.abs(entity.coords[2] * entity.coords[3]);
  }
  if (entity.type === "polygon" || entity.type === "polyline") {
    let sum = 0;
    for (let i = 0; i + 3 < entity.coords.length; i += 2) {
      sum += entity.coords[i] * entity.coords[i + 3] - entity.coords[i + 2] * entity.coords[i + 1];
    }
    if (entity.coords.length >= 4) {
      const last = entity.coords.length - 2;
      sum += entity.coords[last] * entity.coords[1] - entity.coords[0] * entity.coords[last + 1];
    }
    return Math.abs(sum / 2);
  }
  const bbox = computeBBox([entity as never]);
  return bbox ? Math.abs((bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY)) : 0;
}

export const ANALYSIS_TOOL_NAMES = [
  "measure_distance",
  "measure_angle",
  "measure_area",
  "measure_perimeter",
  "measure_volume",
  "measure_surface_area",
  "measure_centroid",
  "measure_moment_of_inertia",
  "measure_bounding_box",
  "measure_minimum_distance",
  "check_interference",
  "check_clearance",
  "set_material",
  "get_mass_properties",
] as const;

export function registerAnalysisTools(
  server: McpServer,
  session: CadSession,
): void {
  server.registerTool(
    "measure_distance",
    {
      description: "Measure distance between two points.",
      inputSchema: {
        point_a: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }),
        point_b: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }),
      },
    },
    async (args) => {
      const dx = args.point_a.x - args.point_b.x;
      const dy = args.point_a.y - args.point_b.y;
      const dz = (args.point_a.z ?? 0) - (args.point_b.z ?? 0);
      return mcpJson({ success: true, data: { distance: Math.hypot(dx, dy, dz) } });
    },
  );

  server.registerTool(
    "measure_angle",
    {
      description: "Measure angle between two lines.",
      inputSchema: { line_a: z.string(), line_b: z.string() },
    },
    async (args) => {
      try {
        const a = getEntity(session, args.line_a);
        const b = getEntity(session, args.line_b);
        if (a.type !== "line" || b.type !== "line") {
          return mcpJson({ success: false, error: "measure_angle requires line entities" });
        }
        const av = [a.coords[2] - a.coords[0], a.coords[3] - a.coords[1]];
        const bv = [b.coords[2] - b.coords[0], b.coords[3] - b.coords[1]];
        const dot = av[0] * bv[0] + av[1] * bv[1];
        const mag = Math.hypot(av[0], av[1]) * Math.hypot(bv[0], bv[1]);
        return mcpJson({ success: true, data: { angle: Math.acos(Math.max(-1, Math.min(1, dot / mag))) } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "measure_area",
    {
      description: "Measure planar area from an entity.",
      inputSchema: { entity_id: z.string().optional(), points: z.array(z.object({ x: z.number(), y: z.number() })).optional() },
    },
    async (args) => {
      try {
        if (args.points?.length) {
          let sum = 0;
          for (let i = 0; i < args.points.length; i++) {
            const a = args.points[i];
            const b = args.points[(i + 1) % args.points.length];
            sum += a.x * b.y - b.x * a.y;
          }
          return mcpJson({ success: true, data: { area: Math.abs(sum / 2) } });
        }
        if (!args.entity_id) {
          return mcpJson({ success: false, error: "entity_id or points is required" });
        }
        return mcpJson({ success: true, data: { area: planarArea(getEntity(session, args.entity_id)) } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "measure_perimeter",
    {
      description: "Measure perimeter or curve length for an entity.",
      inputSchema: { entity_id: z.string().min(1) },
    },
    async (args) => {
      try {
        const entity = getEntity(session, args.entity_id);
        return mcpJson({
          success: true,
          data: { perimeter: is3dEntity(entity) ? 0 : getCurveLengthValue(entity) },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  const registerSolidMeasure = (
    name: string,
    description: string,
    getter: (entity: Entity3D) => number | [number, number, number] | Record<string, unknown>,
  ) => {
    server.registerTool(
      name,
      { description, inputSchema: { solid_id: z.string().min(1), axis: z.array(z.number()).optional() } },
      async (args) => {
        try {
          const entity = getEntity(session, args.solid_id);
          if (!is3dEntity(entity)) {
            return mcpJson({ success: false, error: `${name} requires a 3D solid` });
          }
          return mcpJson({ success: true, data: { value: getter(entity) } });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };

  registerSolidMeasure("measure_volume", "Measure solid volume.", (entity) => getVolume(entity));
  registerSolidMeasure("measure_surface_area", "Measure solid surface area.", (entity) => getSurfaceArea(entity));
  registerSolidMeasure("measure_centroid", "Measure solid centroid.", (entity) => getCentroid(entity));
  registerSolidMeasure("measure_moment_of_inertia", "Measure simplified moment of inertia from bbox.", (entity) => {
    const bbox = getBoundingBox3D(entity);
    const w = bbox.max[0] - bbox.min[0];
    const h = bbox.max[1] - bbox.min[1];
    const d = bbox.max[2] - bbox.min[2];
    const mass = getVolume(entity);
    return {
      Ix: (mass * (h * h + d * d)) / 12,
      Iy: (mass * (w * w + d * d)) / 12,
      Iz: (mass * (w * w + h * h)) / 12,
    };
  });

  server.registerTool(
    "measure_bounding_box",
    {
      description: "Measure the combined bounding box of entities.",
      inputSchema: { entity_ids: z.array(z.string()).min(1) },
    },
    async (args) => {
      try {
        const boxes = args.entity_ids.map((id) => getBoundingBox3D(getEntity(session, id)));
        const min = [
          Math.min(...boxes.map((b) => b.min[0])),
          Math.min(...boxes.map((b) => b.min[1])),
          Math.min(...boxes.map((b) => b.min[2])),
        ] as [number, number, number];
        const max = [
          Math.max(...boxes.map((b) => b.max[0])),
          Math.max(...boxes.map((b) => b.max[1])),
          Math.max(...boxes.map((b) => b.max[2])),
        ] as [number, number, number];
        return mcpJson({ success: true, data: { min, max } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "measure_minimum_distance",
    {
      description: "Approximate minimum distance between two solids via bounding boxes.",
      inputSchema: { solid_a: z.string().min(1), solid_b: z.string().min(1) },
    },
    async (args) => {
      try {
        const a = getBoundingBox3D(getEntity(session, args.solid_a));
        const b = getBoundingBox3D(getEntity(session, args.solid_b));
        const dx = Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]);
        const dy = Math.max(0, a.min[1] - b.max[1], b.min[1] - a.max[1]);
        const dz = Math.max(0, a.min[2] - b.max[2], b.min[2] - a.max[2]);
        return mcpJson({ success: true, data: { distance: Math.hypot(dx, dy, dz) } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "check_interference",
    {
      description: "Check component interference using component reference bbox overlap.",
      inputSchema: { assembly_id: z.string().min(1), tolerance: z.number().optional() },
    },
    async (args) => {
      try {
        const assembly = session.assemblyManager.getAssembly(args.assembly_id);
        if (!assembly) {
          return mcpJson({ success: false, error: `Assembly not found: ${args.assembly_id}` });
        }
        const collisions: Array<{ a: string; b: string }> = [];
        for (let i = 0; i < assembly.components.length; i++) {
          for (let j = i + 1; j < assembly.components.length; j++) {
            const a = session.sceneGraph.getEntity(assembly.components[i].ref);
            const b = session.sceneGraph.getEntity(assembly.components[j].ref);
            if (!a || !b) {
              continue;
            }
            const ab = getBoundingBox3D(a);
            const bb = getBoundingBox3D(b);
            const overlap =
              ab.min[0] <= bb.max[0] &&
              ab.max[0] >= bb.min[0] &&
              ab.min[1] <= bb.max[1] &&
              ab.max[1] >= bb.min[1] &&
              ab.min[2] <= bb.max[2] &&
              ab.max[2] >= bb.min[2];
            if (overlap) {
              collisions.push({ a: assembly.components[i].id, b: assembly.components[j].id });
            }
          }
        }
        return mcpJson({ success: true, data: { collisions, count: collisions.length } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "check_clearance",
    {
      description: "Check if minimum distance meets a clearance threshold.",
      inputSchema: {
        component_a: z.string().min(1),
        component_b: z.string().min(1),
        min_clearance: z.number().nonnegative(),
      },
    },
    async (args) => {
      try {
        const a = getBoundingBox3D(getEntity(session, args.component_a));
        const b = getBoundingBox3D(getEntity(session, args.component_b));
        const dx = Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]);
        const dy = Math.max(0, a.min[1] - b.max[1], b.min[1] - a.max[1]);
        const dz = Math.max(0, a.min[2] - b.max[2], b.min[2] - a.max[2]);
        const clearance = Math.hypot(dx, dy, dz);
        return mcpJson({ success: true, data: { clearance, ok: clearance >= args.min_clearance } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "set_material",
    {
      description: "Attach material metadata to a solid.",
      inputSchema: { solid_id: z.string().min(1), material_name: z.string().min(1) },
    },
    async (args) => {
      try {
        const entity = getEntity(session, args.solid_id);
        session.sceneGraph.replaceEntity({
          ...entity,
          properties: { ...(entity.properties ?? {}), material: args.material_name },
        });
        return mcpJson({ success: true, entity_ids: [args.solid_id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "get_mass_properties",
    {
      description: "Return mass properties based on simplified volume and material density.",
      inputSchema: { solid_id: z.string().min(1) },
    },
    async (args) => {
      try {
        const entity = getEntity(session, args.solid_id);
        if (!is3dEntity(entity)) {
          return mcpJson({ success: false, error: "get_mass_properties requires a 3D solid" });
        }
        const volume = getVolume(entity);
        const density = Number(entity.properties?.densityKgM3 ?? 1);
        const centroid = getCentroid(entity);
        return mcpJson({
          success: true,
          data: {
            mass: volume * density,
            volume,
            centroid,
            inertia: {
              centroidal: true,
              value: (volume * density) / 12,
            },
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
