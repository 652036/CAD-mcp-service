import type { Entity, Entity2D, Entity3D } from "../core/types.js";

const threeDTypes = new Set<Entity["type"]>([
  "box",
  "sphere",
  "cylinder",
  "cone",
  "torus",
  "prism",
  "revolution",
  "boolean_result",
]);

export function is3dEntity(entity: Entity): entity is Entity3D {
  return threeDTypes.has(entity.type);
}

export function is2dEntity(entity: Entity): entity is Entity2D {
  return !is3dEntity(entity);
}
