import type {
  GeoReferenceMetadata,
  ProjectCrs,
  ProjectExtent,
  ProjectOrigin,
} from "../core/types.js";

export function normalizeProjectCrs(crs: {
  code?: string;
  name?: string;
  wkt?: string;
  units?: string;
}): ProjectCrs {
  return {
    code: crs.code?.trim() || undefined,
    name: crs.name?.trim() || undefined,
    wkt: crs.wkt?.trim() || undefined,
    units: crs.units?.trim() || undefined,
  };
}

export function normalizeProjectOrigin(origin: {
  x: number;
  y: number;
  z?: number;
}): ProjectOrigin {
  return {
    x: origin.x,
    y: origin.y,
    z: origin.z,
  };
}

export function normalizeProjectExtent(extent: {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}): ProjectExtent {
  return {
    minX: Math.min(extent.minX, extent.maxX),
    minY: Math.min(extent.minY, extent.maxY),
    maxX: Math.max(extent.minX, extent.maxX),
    maxY: Math.max(extent.minY, extent.maxY),
  };
}

export function transformBetweenLocalAndWorld(
  point: { x: number; y: number; z?: number },
  meta: GeoReferenceMetadata,
  direction: "local_to_world" | "world_to_local",
): { x: number; y: number; z?: number } {
  const scale = meta.drawingScale ?? 1;
  const origin = meta.origin ?? { x: 0, y: 0, z: 0 };

  if (direction === "local_to_world") {
    return {
      x: point.x * scale + origin.x,
      y: point.y * scale + origin.y,
      z:
        point.z === undefined
          ? undefined
          : point.z * scale + (origin.z ?? 0),
    };
  }

  return {
    x: (point.x - origin.x) / scale,
    y: (point.y - origin.y) / scale,
    z:
      point.z === undefined
        ? undefined
        : (point.z - (origin.z ?? 0)) / scale,
  };
}
