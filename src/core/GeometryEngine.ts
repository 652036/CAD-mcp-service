import { randomUUID } from "node:crypto";
import type { Entity, Entity3D, NewEntity3D } from "./types.js";
import { SceneGraph } from "./SceneGraph.js";
import { is3dEntity } from "../utils/entityKinds.js";
import { OpenCascadeAdapter, type OpenCascadeStatus } from "./OpenCascadeAdapter.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class GeometryEngine {
  private readonly occtAdapter = new OpenCascadeAdapter();

  constructor(private readonly sceneGraph: SceneGraph) {}

  async getBackendStatus(): Promise<OpenCascadeStatus> {
    return this.occtAdapter.getStatus();
  }

  createSolid(entity: NewEntity3D): string {
    return this.sceneGraph.addEntity(entity);
  }

  getSolid(id: string): Entity3D | undefined {
    const entity = this.sceneGraph.getEntity(id);
    if (!entity) {
      return undefined;
    }
    if (is3dEntity(entity)) {
      return clone(entity);
    }
    return undefined;
  }

  listSolids(): Entity3D[] {
    return this.sceneGraph.listEntities().filter(is3dEntity);
  }

  createBooleanResult(
    operation: "union" | "subtract" | "intersect",
    a: string,
    b: string,
  ): string {
    const entityA = this.getSolid(a);
    const entityB = this.getSolid(b);
    if (!entityA || !entityB) {
      throw new Error("Boolean operands must both be 3D solids");
    }
    const bboxA = this.measureBoundingBox(entityA);
    const bboxB = this.measureBoundingBox(entityB);
    const result =
      operation === "union"
        ? {
            min: [
              Math.min(bboxA.min[0], bboxB.min[0]),
              Math.min(bboxA.min[1], bboxB.min[1]),
              Math.min(bboxA.min[2], bboxB.min[2]),
            ] as [number, number, number],
            max: [
              Math.max(bboxA.max[0], bboxB.max[0]),
              Math.max(bboxA.max[1], bboxB.max[1]),
              Math.max(bboxA.max[2], bboxB.max[2]),
            ] as [number, number, number],
          }
        : operation === "intersect"
          ? {
              min: [
                Math.max(bboxA.min[0], bboxB.min[0]),
                Math.max(bboxA.min[1], bboxB.min[1]),
                Math.max(bboxA.min[2], bboxB.min[2]),
              ] as [number, number, number],
              max: [
                Math.min(bboxA.max[0], bboxB.max[0]),
                Math.min(bboxA.max[1], bboxB.max[1]),
                Math.min(bboxA.max[2], bboxB.max[2]),
              ] as [number, number, number],
            }
          : this.approximateSubtractBoundingBox(bboxA, bboxB);

    if (
      result.max[0] <= result.min[0] ||
      result.max[1] <= result.min[1] ||
      result.max[2] <= result.min[2]
    ) {
      throw new Error("Boolean operation result is empty");
    }
    return this.createSolid({
      type: "boolean_result",
      coords: [
        result.min[0],
        result.min[1],
        result.min[2],
        result.max[0] - result.min[0],
        result.max[1] - result.min[1],
        result.max[2] - result.min[2],
      ],
      layer: entityA.layer,
      properties: {
        operation,
        operands: [a, b],
        id: randomUUID(),
      },
    });
  }

  private approximateSubtractBoundingBox(
    left: { min: [number, number, number]; max: [number, number, number] },
    right: { min: [number, number, number]; max: [number, number, number] },
  ): { min: [number, number, number]; max: [number, number, number] } {
    const overlapMin: [number, number, number] = [
      Math.max(left.min[0], right.min[0]),
      Math.max(left.min[1], right.min[1]),
      Math.max(left.min[2], right.min[2]),
    ];
    const overlapMax: [number, number, number] = [
      Math.min(left.max[0], right.max[0]),
      Math.min(left.max[1], right.max[1]),
      Math.min(left.max[2], right.max[2]),
    ];

    if (
      overlapMax[0] <= overlapMin[0] ||
      overlapMax[1] <= overlapMin[1] ||
      overlapMax[2] <= overlapMin[2]
    ) {
      return { min: [...left.min], max: [...left.max] };
    }

    const next = {
      min: [...left.min] as [number, number, number],
      max: [...left.max] as [number, number, number],
    };

    const axisCandidates = [0, 1, 2]
      .map((index) => ({
        index,
        overlap: overlapMax[index] - overlapMin[index],
        span: left.max[index] - left.min[index],
      }))
      .filter((item) => item.overlap < item.span);

    if (axisCandidates.length === 0) {
      return {
        min: [...left.min],
        max: [...left.min],
      };
    }

    const axis = axisCandidates
      .sort((a, b) => b.overlap / b.span - a.overlap / a.span)[0].index;

    const touchesMin = overlapMin[axis] <= left.min[axis];
    const touchesMax = overlapMax[axis] >= left.max[axis];

    if (touchesMin && !touchesMax) {
      next.min[axis] = overlapMax[axis];
    } else if (touchesMax && !touchesMin) {
      next.max[axis] = overlapMin[axis];
    } else {
      const keepLower = overlapMin[axis] - left.min[axis];
      const keepUpper = left.max[axis] - overlapMax[axis];
      if (keepLower >= keepUpper) {
        next.max[axis] = overlapMin[axis];
      } else {
        next.min[axis] = overlapMax[axis];
      }
    }

    return next;
  }

  measureBoundingBox(entity: Entity3D | Entity): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    switch (entity.type) {
      case "box":
      case "boolean_result":
        return {
          min: [entity.coords[0], entity.coords[1], entity.coords[2] ?? 0],
          max: [
            entity.coords[0] + entity.coords[3],
            entity.coords[1] + entity.coords[4],
            (entity.coords[2] ?? 0) + entity.coords[5],
          ],
        };
      case "sphere": {
        const [cx, cy, cz, radius] = entity.coords;
        return {
          min: [cx - radius, cy - radius, cz - radius],
          max: [cx + radius, cy + radius, cz + radius],
        };
      }
      case "cylinder": {
        const [cx, cy, cz, radius, height] = entity.coords;
        return {
          min: [cx - radius, cy - radius, cz],
          max: [cx + radius, cy + radius, cz + height],
        };
      }
      case "cone": {
        const [cx, cy, cz, bottomRadius, topRadius, height] = entity.coords;
        const radius = Math.max(bottomRadius, topRadius);
        return {
          min: [cx - radius, cy - radius, cz],
          max: [cx + radius, cy + radius, cz + height],
        };
      }
      case "torus": {
        const [cx, cy, cz, majorRadius, minorRadius] = entity.coords;
        const radius = majorRadius + minorRadius;
        return {
          min: [cx - radius, cy - radius, cz - minorRadius],
          max: [cx + radius, cy + radius, cz + minorRadius],
        };
      }
      case "prism": {
        const [minX, minY, width, height, depth] = entity.coords;
        return {
          min: [minX, minY, 0],
          max: [minX + width, minY + height, depth],
        };
      }
      case "revolution": {
        const [cx, cy, radius, height] = entity.coords;
        return {
          min: [cx - radius, cy - radius, 0],
          max: [cx + radius, cy + radius, height],
        };
      }
      default:
        return { min: [0, 0, 0], max: [0, 0, 0] };
    }
  }
}
