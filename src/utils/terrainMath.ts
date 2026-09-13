import type { Entity, Entity2D } from "../core/types.js";
import { distance, pointsFromCoords } from "./math2d.js";
import { is2dEntity } from "./entityKinds.js";

export type SampledProfilePoint = {
  entityId: string;
  station: number;
  offset: number;
  elevation: number;
  x: number;
  y: number;
};

type SegmentProjection = {
  station: number;
  offset: number;
};

function planarArea(points: Array<{ x: number; y: number }>): number {
  if (points.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

export function getEntityPlanarArea(entity: Entity): number {
  if (entity.type === "circle") {
    return Math.PI * entity.coords[2] ** 2;
  }
  if (entity.type === "rectangle") {
    return Math.abs(entity.coords[2] * entity.coords[3]);
  }
  if (entity.type === "polygon") {
    return planarArea(pointsFromCoords(entity.coords));
  }
  if (entity.type === "polyline" && entity.closed) {
    return planarArea(pointsFromCoords(entity.coords));
  }
  return 0;
}

export function getEntityLineworkPoints(entity: Entity2D): Array<{ x: number; y: number }> {
  switch (entity.type) {
    case "line":
      return [
        { x: entity.coords[0], y: entity.coords[1] },
        { x: entity.coords[2], y: entity.coords[3] },
      ];
    case "polyline":
    case "polygon":
      return pointsFromCoords(entity.coords);
    default:
      throw new Error(`Entity does not define linework points: ${entity.type}`);
  }
}

export function getEntityElevation(entity: Entity): number | null {
  const value = entity.properties?.elevation;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function getProfileLength(entity: Entity2D): number {
  const points = getEntityLineworkPoints(entity);
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += distance(points[i - 1], points[i]);
  }
  return sum;
}

function projectPointToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
  stationOffset: number,
): SegmentProjection {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return {
      station: stationOffset,
      offset: distance(point, start),
    };
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  const projected = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };
  return {
    station: stationOffset + distance(start, projected),
    offset: distance(point, projected),
  };
}

export function sampleProfileFromPoints(
  profile: Entity2D,
  entities: readonly Entity[],
  maxOffset = Infinity,
): SampledProfilePoint[] {
  const profilePoints = getEntityLineworkPoints(profile);
  const samples: SampledProfilePoint[] = [];

  for (const entity of entities) {
    if (!is2dEntity(entity) || entity.type !== "point") {
      continue;
    }
    const elevation = getEntityElevation(entity);
    if (elevation === null) {
      continue;
    }
    const point = { x: entity.coords[0], y: entity.coords[1] };
    let best: SegmentProjection | null = null;
    let traversed = 0;
    for (let i = 1; i < profilePoints.length; i++) {
      const start = profilePoints[i - 1];
      const end = profilePoints[i];
      const projection = projectPointToSegment(point, start, end, traversed);
      if (!best || projection.offset < best.offset) {
        best = projection;
      }
      traversed += distance(start, end);
    }
    if (!best || best.offset > maxOffset) {
      continue;
    }
    samples.push({
      entityId: entity.id,
      station: best.station,
      offset: best.offset,
      elevation,
      x: point.x,
      y: point.y,
    });
  }

  return samples.sort((a, b) => a.station - b.station);
}

export function computeSectionArea(
  samples: readonly SampledProfilePoint[],
  baselineElevation: number,
): { area: number; signedArea: number } {
  if (samples.length < 2) {
    return { area: 0, signedArea: 0 };
  }
  let signedArea = 0;
  for (let i = 1; i < samples.length; i++) {
    const left = samples[i - 1];
    const right = samples[i];
    const h1 = left.elevation - baselineElevation;
    const h2 = right.elevation - baselineElevation;
    signedArea += ((h1 + h2) / 2) * (right.station - left.station);
  }
  return { area: Math.abs(signedArea), signedArea };
}

function pointOnSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): boolean {
  const cross =
    (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > 1e-9) {
    return false;
  }
  const dot =
    (point.x - start.x) * (end.x - start.x) +
    (point.y - start.y) * (end.y - start.y);
  if (dot < 0) {
    return false;
  }
  const lengthSquared =
    (end.x - start.x) * (end.x - start.x) +
    (end.y - start.y) * (end.y - start.y);
  return dot <= lengthSquared;
}

export function pointInPolygon(
  point: { x: number; y: number },
  polygon: Entity2D,
): boolean {
  const vertices = getEntityLineworkPoints(polygon);
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    if (pointOnSegment(point, a, b)) {
      return true;
    }
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function computeAverageElevation(
  entities: readonly Entity[],
): { average: number; count: number } {
  const elevations = entities
    .map((entity) => getEntityElevation(entity))
    .filter((value): value is number => value !== null);
  if (elevations.length === 0) {
    return { average: 0, count: 0 };
  }
  const sum = elevations.reduce((total, value) => total + value, 0);
  return { average: sum / elevations.length, count: elevations.length };
}

export function selectEntitiesInsidePolygon(
  polygon: Entity2D,
  entities: readonly Entity[],
): Entity[] {
  return entities.filter((entity) => {
    if (!is2dEntity(entity) || entity.type !== "point") {
      return false;
    }
    return pointInPolygon({ x: entity.coords[0], y: entity.coords[1] }, polygon);
  });
}

export function computeCutFillVolumeFromArea(
  area: number,
  averageElevation: number,
  baseElevation: number,
): {
  volume: number;
  cutVolume: number;
  fillVolume: number;
  deltaElevation: number;
} {
  const deltaElevation = averageElevation - baseElevation;
  const volume = area * deltaElevation;
  return {
    volume,
    cutVolume: deltaElevation > 0 ? volume : 0,
    fillVolume: deltaElevation < 0 ? Math.abs(volume) : 0,
    deltaElevation,
  };
}

export function computeGridSurfaceVolume(
  entities: readonly Entity[],
  cellArea: number,
  baseElevation: number,
): {
  sampleCount: number;
  averageElevation: number;
  volume: number;
  cutVolume: number;
  fillVolume: number;
} {
  const { average, count } = computeAverageElevation(entities);
  const totalArea = count * cellArea;
  const cutFill = computeCutFillVolumeFromArea(totalArea, average, baseElevation);
  return {
    sampleCount: count,
    averageElevation: average,
    volume: cutFill.volume,
    cutVolume: cutFill.cutVolume,
    fillVolume: cutFill.fillVolume,
  };
}
