import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Entity2D, NewEntity2D } from "../core/types.js";
import type { CadSession } from "../session/index.js";
import { is2dEntity } from "../utils/entityKinds.js";
import { normalizeLengthUnit, toMillimetres } from "./units.js";
import { mcpJson } from "./mcpJson.js";
import {
  coordsFromPoints,
  mirrorPointAcrossLine,
  normalizeAngle,
  offsetPolylinePoints,
  offsetSegment,
  point,
  pointsFromCoords,
  rotatePointAround,
  signedPolygonArea,
} from "../utils/math2d.js";

const lengthUnitSchema = z
  .enum(["mm", "cm", "m", "in", "inch", "ft"])
  .optional();

const pointSchema = z.object({ x: z.number(), y: z.number() });

const offsetSideSchema = z.enum([
  "left",
  "right",
  "inside",
  "outside",
  "inward",
  "outward",
]);

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function rectangleToPoints(entity: Entity2D): ReturnType<typeof pointsFromCoords> {
  const [x, y, width, height] = entity.coords;
  return [
    point(x, y),
    point(x + width, y),
    point(x + width, y + height),
    point(x, y + height),
  ];
}

function asPolygonFromPoints(
  source: Entity2D,
  points: ReturnType<typeof pointsFromCoords>,
  closed = true,
): NewEntity2D {
  return {
    type: "polygon",
    coords: coordsFromPoints(points),
    layer: source.layer,
    properties: {
      ...(source.properties ?? {}),
      closed,
      sourceType: source.type,
    },
  };
}

export function translateEntity2D(
  entity: Entity2D,
  dx: number,
  dy: number,
): NewEntity2D {
  switch (entity.type) {
    case "point":
    case "line":
    case "polygon":
    case "polyline":
      return {
        ...entity,
        id: undefined,
        coords: entity.coords.map((value, index) =>
          index % 2 === 0 ? value + dx : value + dy,
        ),
      };
    case "circle":
      return {
        ...entity,
        id: undefined,
        coords: [entity.coords[0] + dx, entity.coords[1] + dy, entity.coords[2]],
      };
    case "arc":
      return {
        ...entity,
        id: undefined,
        coords: [
          entity.coords[0] + dx,
          entity.coords[1] + dy,
          entity.coords[2],
          entity.coords[3],
          entity.coords[4],
        ],
      };
    case "rectangle":
      return {
        ...entity,
        id: undefined,
        coords: [entity.coords[0] + dx, entity.coords[1] + dy, entity.coords[2], entity.coords[3]],
      };
    default:
      throw new Error(`Unsupported 2D entity type for translation: ${entity.type}`);
  }
}

export function rotateEntity2D(
  entity: Entity2D,
  center: { x: number; y: number },
  angle: number,
): NewEntity2D {
  switch (entity.type) {
    case "point": {
      const p = rotatePointAround(
        point(entity.coords[0], entity.coords[1]),
        center,
        angle,
      );
      return { ...entity, id: undefined, coords: [p.x, p.y] };
    }
    case "line":
    case "polygon":
    case "polyline": {
      const pts = pointsFromCoords(entity.coords).map((p) =>
        rotatePointAround(p, center, angle),
      );
      return { ...entity, id: undefined, coords: coordsFromPoints(pts) };
    }
    case "circle": {
      const c = rotatePointAround(
        point(entity.coords[0], entity.coords[1]),
        center,
        angle,
      );
      return { ...entity, id: undefined, coords: [c.x, c.y, entity.coords[2]] };
    }
    case "arc": {
      const c = rotatePointAround(
        point(entity.coords[0], entity.coords[1]),
        center,
        angle,
      );
      return {
        ...entity,
        id: undefined,
        coords: [
          c.x,
          c.y,
          entity.coords[2],
          normalizeAngle(entity.coords[3] + angle),
          normalizeAngle(entity.coords[4] + angle),
        ],
      };
    }
    case "rectangle": {
      const pts = rectangleToPoints(entity).map((p) =>
        rotatePointAround(p, center, angle),
      );
      return asPolygonFromPoints(entity, pts, true);
    }
    default:
      throw new Error(`Unsupported 2D entity type for rotation: ${entity.type}`);
  }
}

export function mirrorEntity2D(
  entity: Entity2D,
  axisStart: { x: number; y: number },
  axisEnd: { x: number; y: number },
): NewEntity2D {
  switch (entity.type) {
    case "point": {
      const p = mirrorPointAcrossLine(
        point(entity.coords[0], entity.coords[1]),
        axisStart,
        axisEnd,
      );
      return { ...entity, id: undefined, coords: [p.x, p.y] };
    }
    case "line":
    case "polygon":
    case "polyline": {
      const pts = pointsFromCoords(entity.coords).map((p) =>
        mirrorPointAcrossLine(p, axisStart, axisEnd),
      );
      return { ...entity, id: undefined, coords: coordsFromPoints(pts) };
    }
    case "circle": {
      const center = mirrorPointAcrossLine(
        point(entity.coords[0], entity.coords[1]),
        axisStart,
        axisEnd,
      );
      return {
        ...entity,
        id: undefined,
        coords: [center.x, center.y, entity.coords[2]],
      };
    }
    case "arc": {
      const center = mirrorPointAcrossLine(
        point(entity.coords[0], entity.coords[1]),
        axisStart,
        axisEnd,
      );
      const start = point(
        entity.coords[0] + entity.coords[2] * Math.cos(entity.coords[3]),
        entity.coords[1] + entity.coords[2] * Math.sin(entity.coords[3]),
      );
      const end = point(
        entity.coords[0] + entity.coords[2] * Math.cos(entity.coords[4]),
        entity.coords[1] + entity.coords[2] * Math.sin(entity.coords[4]),
      );
      const mirroredStart = mirrorPointAcrossLine(start, axisStart, axisEnd);
      const mirroredEnd = mirrorPointAcrossLine(end, axisStart, axisEnd);
      return {
        ...entity,
        id: undefined,
        coords: [
          center.x,
          center.y,
          entity.coords[2],
          normalizeAngle(
            Math.atan2(mirroredEnd.y - center.y, mirroredEnd.x - center.x),
          ),
          normalizeAngle(
            Math.atan2(mirroredStart.y - center.y, mirroredStart.x - center.x),
          ),
        ],
      };
    }
    case "rectangle": {
      const pts = rectangleToPoints(entity).map((p) =>
        mirrorPointAcrossLine(p, axisStart, axisEnd),
      );
      return asPolygonFromPoints(entity, pts, true);
    }
    default:
      throw new Error(`Unsupported 2D entity type for mirroring: ${entity.type}`);
  }
}

function signedOffsetForClosedShape(
  points: ReturnType<typeof pointsFromCoords>,
  distanceMm: number,
  side: z.infer<typeof offsetSideSchema>,
): number {
  const area = signedPolygonArea(points);
  const ccw = area >= 0;
  switch (side) {
    case "left":
      return distanceMm;
    case "right":
      return -distanceMm;
    case "outward":
    case "outside":
      return ccw ? -distanceMm : distanceMm;
    case "inward":
    case "inside":
      return ccw ? distanceMm : -distanceMm;
  }
}

export function offsetEntity2D(
  entity: Entity2D,
  distanceMm: number,
  side: z.infer<typeof offsetSideSchema>,
): NewEntity2D {
  switch (entity.type) {
    case "line": {
      if (side !== "left" && side !== "right") {
        throw new Error("Line offset requires side left or right");
      }
      const segment = offsetSegment(
        point(entity.coords[0], entity.coords[1]),
        point(entity.coords[2], entity.coords[3]),
        side === "left" ? distanceMm : -distanceMm,
      );
      return {
        ...entity,
        id: undefined,
        coords: [segment.a.x, segment.a.y, segment.b.x, segment.b.y],
      };
    }
    case "circle": {
      if (
        side !== "inside" &&
        side !== "outside" &&
        side !== "inward" &&
        side !== "outward"
      ) {
        throw new Error("Circle offset requires inside/outside or inward/outward");
      }
      const delta =
        side === "inside" || side === "inward" ? -distanceMm : distanceMm;
      const radius = entity.coords[2] + delta;
      if (radius <= 0) {
        throw new Error("Offset would make circle radius non-positive");
      }
      return {
        ...entity,
        id: undefined,
        coords: [entity.coords[0], entity.coords[1], radius],
      };
    }
    case "arc": {
      if (
        side !== "inside" &&
        side !== "outside" &&
        side !== "inward" &&
        side !== "outward"
      ) {
        throw new Error("Arc offset requires inside/outside or inward/outward");
      }
      const delta =
        side === "inside" || side === "inward" ? -distanceMm : distanceMm;
      const radius = entity.coords[2] + delta;
      if (radius <= 0) {
        throw new Error("Offset would make arc radius non-positive");
      }
      return {
        ...entity,
        id: undefined,
        coords: [
          entity.coords[0],
          entity.coords[1],
          radius,
          entity.coords[3],
          entity.coords[4],
        ],
      };
    }
    case "rectangle": {
      if (
        side !== "inside" &&
        side !== "outside" &&
        side !== "inward" &&
        side !== "outward"
      ) {
        throw new Error("Rectangle offset requires inside/outside or inward/outward");
      }
      const delta =
        side === "inside" || side === "inward" ? -distanceMm : distanceMm;
      const x = entity.coords[0] - delta;
      const y = entity.coords[1] - delta;
      const width = entity.coords[2] + delta * 2;
      const height = entity.coords[3] + delta * 2;
      if (width <= 0 || height <= 0) {
        throw new Error("Offset would make rectangle width or height non-positive");
      }
      return {
        ...entity,
        id: undefined,
        coords: [x, y, width, height],
      };
    }
    case "polygon":
    case "polyline": {
      const points = pointsFromCoords(entity.coords);
      const closed =
        entity.type === "polygon"
          ? entity.properties?.closed !== false
          : entity.closed === true;
      const signedDistance = closed
        ? signedOffsetForClosedShape(points, distanceMm, side)
        : side === "left"
          ? distanceMm
          : side === "right"
            ? -distanceMm
            : (() => {
                throw new Error(
                  "Open polyline offset requires side left or right",
                );
              })();
      const offsetPoints = offsetPolylinePoints(points, signedDistance, closed);
      return {
        ...entity,
        id: undefined,
        coords: coordsFromPoints(offsetPoints),
      };
    }
    default:
      throw new Error(`Offset is not supported for entity type: ${entity.type}`);
  }
}

export const MODIFY_2D_TOOL_NAMES = [
  "mirror_2d",
  "array_rectangular",
  "array_polar",
  "offset",
] as const;

export function registerModify2dTools(
  server: McpServer,
  session: CadSession,
): void {
  const sceneGraph = session.sceneGraph;

  server.registerTool(
    "mirror_2d",
    {
      description:
        "Create mirrored copies of one or more entities across an axis line.",
      inputSchema: {
        entity_ids: z.array(z.string()).min(1),
        axis_start: pointSchema,
        axis_end: pointSchema,
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const axisStart = {
          x: toMillimetres(args.axis_start.x, unit),
          y: toMillimetres(args.axis_start.y, unit),
        };
        const axisEnd = {
          x: toMillimetres(args.axis_end.x, unit),
          y: toMillimetres(args.axis_end.y, unit),
        };
        const created: string[] = [];
        const missing: string[] = [];
        for (const id of args.entity_ids) {
          const entity = sceneGraph.getEntity(id);
          if (!entity) {
            missing.push(id);
            continue;
          }
          if (!is2dEntity(entity)) {
            missing.push(id);
            continue;
          }
          created.push(sceneGraph.addEntity(mirrorEntity2D(entity, axisStart, axisEnd)));
        }
        return mcpJson({
          success: true,
          entity_ids: created,
          data: {
            created_count: created.length,
            not_found: missing,
          },
          warnings:
            missing.length > 0
              ? [`Unknown entity ids: ${missing.join(", ")}`]
              : undefined,
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "array_rectangular",
    {
      description:
        "Create rectangular array copies using row and column spacing in the current units.",
      inputSchema: {
        entity_ids: z.array(z.string()).min(1),
        rows: z.number().int().positive(),
        cols: z.number().int().positive(),
        dx: z.number(),
        dy: z.number(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const dx = toMillimetres(args.dx, unit);
        const dy = toMillimetres(args.dy, unit);
        const created: string[] = [];
        const missing: string[] = [];
        for (let row = 0; row < args.rows; row++) {
          for (let col = 0; col < args.cols; col++) {
            if (row === 0 && col === 0) {
              continue;
            }
            for (const id of args.entity_ids) {
              const entity = sceneGraph.getEntity(id);
              if (!entity) {
                if (!missing.includes(id)) {
                  missing.push(id);
                }
                continue;
              }
              if (!is2dEntity(entity)) {
                if (!missing.includes(id)) {
                  missing.push(id);
                }
                continue;
              }
              created.push(
                sceneGraph.addEntity(
                  translateEntity2D(entity, dx * col, dy * row),
                ),
              );
            }
          }
        }
        return mcpJson({
          success: true,
          entity_ids: created,
          data: {
            created_count: created.length,
            rows: args.rows,
            cols: args.cols,
            not_found: missing,
          },
          warnings:
            missing.length > 0
              ? [`Unknown entity ids: ${missing.join(", ")}`]
              : undefined,
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "array_polar",
    {
      description:
        "Create polar array copies around a center. Angle is in radians and includes the source entity.",
      inputSchema: {
        entity_ids: z.array(z.string()).min(1),
        center: pointSchema,
        count: z.number().int().positive(),
        angle: z.number().optional(),
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const unit = normalizeLengthUnit(args.unit);
        const center = {
          x: toMillimetres(args.center.x, unit),
          y: toMillimetres(args.center.y, unit),
        };
        const totalAngle = args.angle ?? Math.PI * 2;
        const fullCircle = Math.abs(Math.abs(totalAngle) - Math.PI * 2) < 1e-9;
        const step =
          args.count <= 1
            ? 0
            : fullCircle
              ? totalAngle / args.count
              : totalAngle / (args.count - 1);
        const created: string[] = [];
        const missing: string[] = [];
        for (let index = 1; index < args.count; index++) {
          const angle = step * index;
          for (const id of args.entity_ids) {
            const entity = sceneGraph.getEntity(id);
            if (!entity) {
              if (!missing.includes(id)) {
                missing.push(id);
              }
              continue;
            }
            if (!is2dEntity(entity)) {
              if (!missing.includes(id)) {
                missing.push(id);
              }
              continue;
            }
            created.push(
              sceneGraph.addEntity(rotateEntity2D(entity, center, angle)),
            );
          }
        }
        return mcpJson({
          success: true,
          entity_ids: created,
          data: {
            created_count: created.length,
            count: args.count,
            angle: totalAngle,
            not_found: missing,
          },
          warnings:
            missing.length > 0
              ? [`Unknown entity ids: ${missing.join(", ")}`]
              : undefined,
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "offset",
    {
      description:
        "Create an offset copy of a supported 2D entity. Use left/right for open curves and inside/outside or inward/outward for closed curves.",
      inputSchema: {
        entity_id: z.string().min(1),
        distance: z.number().positive(),
        side: offsetSideSchema,
        unit: lengthUnitSchema,
      },
    },
    async (args) => {
      try {
        const entity = sceneGraph.getEntity(args.entity_id);
        if (!entity) {
          return mcpJson({
            success: false,
            error: `Entity not found: ${args.entity_id}`,
          });
        }
        if (!is2dEntity(entity)) {
          return mcpJson({
            success: false,
            error: `Offset only supports 2D entities: ${args.entity_id}`,
          });
        }
        const unit = normalizeLengthUnit(args.unit);
        const distanceMm = toMillimetres(args.distance, unit);
        const created = sceneGraph.addEntity(
          offsetEntity2D(entity, distanceMm, args.side),
        );
        return mcpJson({
          success: true,
          entity_ids: [created],
          data: {
            source_entity_id: args.entity_id,
            side: args.side,
            distance_mm: distanceMm,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
