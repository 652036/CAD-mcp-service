import { randomUUID } from "node:crypto";
import type { Entity, Entity3D, NewEntity3D } from "./types.js";
import { SceneGraph } from "./SceneGraph.js";
import { is3dEntity } from "../utils/entityKinds.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class GeometryEngine {
  constructor(private readonly sceneGraph: SceneGraph) {}

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
    const minX =
      operation === "intersect"
        ? Math.max(bboxA.min[0], bboxB.min[0])
        : Math.min(bboxA.min[0], bboxB.min[0]);
    const minY =
      operation === "intersect"
        ? Math.max(bboxA.min[1], bboxB.min[1])
        : Math.min(bboxA.min[1], bboxB.min[1]);
    const minZ =
      operation === "intersect"
        ? Math.max(bboxA.min[2], bboxB.min[2])
        : Math.min(bboxA.min[2], bboxB.min[2]);
    const maxX =
      operation === "intersect"
        ? Math.min(bboxA.max[0], bboxB.max[0])
        : Math.max(bboxA.max[0], bboxB.max[0]);
    const maxY =
      operation === "intersect"
        ? Math.min(bboxA.max[1], bboxB.max[1])
        : Math.max(bboxA.max[1], bboxB.max[1]);
    const maxZ =
      operation === "intersect"
        ? Math.min(bboxA.max[2], bboxB.max[2])
        : Math.max(bboxA.max[2], bboxB.max[2]);
    if (maxX <= minX || maxY <= minY || maxZ <= minZ) {
      throw new Error("Boolean operation result is empty");
    }
    return this.createSolid({
      type: "boolean_result",
      coords: [minX, minY, minZ, maxX - minX, maxY - minY, maxZ - minZ],
      layer: entityA.layer,
      properties: {
        operation,
        operands: [a, b],
        id: randomUUID(),
      },
    });
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
