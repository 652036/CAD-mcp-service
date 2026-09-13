import type { Entity, Entity3D } from "../core/types.js";
import { is3dEntity } from "./entityKinds.js";

export type BoundingBox3D = {
  min: [number, number, number];
  max: [number, number, number];
};

export function getBoundingBox3D(entity: Entity): BoundingBox3D {
  if (!is3dEntity(entity)) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i + 1 < entity.coords.length; i += 2) {
      xs.push(entity.coords[i]);
      ys.push(entity.coords[i + 1]);
    }
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 0;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : 0;
    return { min: [minX, minY, 0], max: [maxX, maxY, 0] };
  }
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
      const [cx, cy, cz, r] = entity.coords;
      return { min: [cx - r, cy - r, cz - r], max: [cx + r, cy + r, cz + r] };
    }
    case "cylinder": {
      const [cx, cy, cz, r, h] = entity.coords;
      return { min: [cx - r, cy - r, cz], max: [cx + r, cy + r, cz + h] };
    }
    case "cone": {
      const [cx, cy, cz, br, tr, h] = entity.coords;
      const r = Math.max(br, tr);
      return { min: [cx - r, cy - r, cz], max: [cx + r, cy + r, cz + h] };
    }
    case "torus": {
      const [cx, cy, cz, major, minor] = entity.coords;
      const r = major + minor;
      return { min: [cx - r, cy - r, cz - minor], max: [cx + r, cy + r, cz + minor] };
    }
    case "prism": {
      const [x, y, w, h, d] = entity.coords;
      return { min: [x, y, 0], max: [x + w, y + h, d] };
    }
    case "revolution": {
      const [cx, cy, r, h] = entity.coords;
      return { min: [cx - r, cy - r, 0], max: [cx + r, cy + r, h] };
    }
  }
}

export function getVolume(entity: Entity3D): number {
  switch (entity.type) {
    case "box":
    case "boolean_result":
      return Math.abs(entity.coords[3] * entity.coords[4] * entity.coords[5]);
    case "sphere":
      return (4 / 3) * Math.PI * entity.coords[3] ** 3;
    case "cylinder":
      return Math.PI * entity.coords[3] ** 2 * entity.coords[4];
    case "cone":
      return (Math.PI * entity.coords[5] / 3) * (
        entity.coords[3] ** 2 +
        entity.coords[3] * entity.coords[4] +
        entity.coords[4] ** 2
      );
    case "torus":
      return 2 * Math.PI ** 2 * entity.coords[3] * entity.coords[4] ** 2;
    case "prism":
      return Math.abs(entity.coords[2] * entity.coords[3] * entity.coords[4]);
    case "revolution":
      return Math.PI * entity.coords[2] ** 2 * entity.coords[3];
  }
}

export function getSurfaceArea(entity: Entity3D): number {
  switch (entity.type) {
    case "box":
    case "boolean_result": {
      const [w, h, d] = [entity.coords[3], entity.coords[4], entity.coords[5]];
      return 2 * (w * h + w * d + h * d);
    }
    case "sphere":
      return 4 * Math.PI * entity.coords[3] ** 2;
    case "cylinder":
      return 2 * Math.PI * entity.coords[3] * (entity.coords[3] + entity.coords[4]);
    case "cone": {
      const l = Math.hypot(entity.coords[5], entity.coords[3] - entity.coords[4]);
      return Math.PI * (entity.coords[3] + entity.coords[4]) * l +
        Math.PI * (entity.coords[3] ** 2 + entity.coords[4] ** 2);
    }
    case "torus":
      return 4 * Math.PI ** 2 * entity.coords[3] * entity.coords[4];
    case "prism": {
      const [w, h, d] = [entity.coords[2], entity.coords[3], entity.coords[4]];
      return 2 * (w * h + w * d + h * d);
    }
    case "revolution":
      return 2 * Math.PI * entity.coords[2] * (entity.coords[2] + entity.coords[3]);
  }
}

export function getCentroid(entity: Entity): [number, number, number] {
  const bbox = getBoundingBox3D(entity);
  return [
    (bbox.min[0] + bbox.max[0]) / 2,
    (bbox.min[1] + bbox.max[1]) / 2,
    (bbox.min[2] + bbox.max[2]) / 2,
  ];
}
