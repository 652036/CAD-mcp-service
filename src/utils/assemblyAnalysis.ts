import type { AssemblyComponent, AssemblyRecord, Entity } from "../core/types.js";
import type { CadSession } from "../session/index.js";
import { getBoundingBox3D, type BoundingBox3D } from "./solidMetrics.js";

export type AnalysisTarget =
  | {
      type: "entity";
      id: string;
      bbox: BoundingBox3D;
    }
  | {
      type: "assembly-component";
      id: string;
      assemblyId: string;
      entityId: string;
      bbox: BoundingBox3D;
    };

export type AssemblyCollision = {
  a: string;
  b: string;
  overlap: [number, number, number];
};

function rotatePoint(
  point: readonly [number, number, number],
  rotation: readonly [number, number, number],
): [number, number, number] {
  const [rx, ry, rz] = rotation;
  const [sx, cx] = [Math.sin(rx), Math.cos(rx)];
  const [sy, cy] = [Math.sin(ry), Math.cos(ry)];
  const [sz, cz] = [Math.sin(rz), Math.cos(rz)];

  let [x, y, z] = point;

  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];

  return [x, y, z];
}

function boundingBoxCorners(bbox: BoundingBox3D): [number, number, number][] {
  return [
    [bbox.min[0], bbox.min[1], bbox.min[2]],
    [bbox.max[0], bbox.min[1], bbox.min[2]],
    [bbox.max[0], bbox.max[1], bbox.min[2]],
    [bbox.min[0], bbox.max[1], bbox.min[2]],
    [bbox.min[0], bbox.min[1], bbox.max[2]],
    [bbox.max[0], bbox.min[1], bbox.max[2]],
    [bbox.max[0], bbox.max[1], bbox.max[2]],
    [bbox.min[0], bbox.max[1], bbox.max[2]],
  ];
}

export function transformBoundingBox3D(
  bbox: BoundingBox3D,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number],
): BoundingBox3D {
  const transformed = boundingBoxCorners(bbox).map((corner) => {
    const rotated = rotatePoint(corner, rotation);
    return [
      rotated[0] + position[0],
      rotated[1] + position[1],
      rotated[2] + position[2],
    ] as const;
  });

  return {
    min: [
      Math.min(...transformed.map((point) => point[0])),
      Math.min(...transformed.map((point) => point[1])),
      Math.min(...transformed.map((point) => point[2])),
    ],
    max: [
      Math.max(...transformed.map((point) => point[0])),
      Math.max(...transformed.map((point) => point[1])),
      Math.max(...transformed.map((point) => point[2])),
    ],
  };
}

function overlapDistances(
  left: BoundingBox3D,
  right: BoundingBox3D,
): [number, number, number] {
  return [
    Math.min(left.max[0], right.max[0]) - Math.max(left.min[0], right.min[0]),
    Math.min(left.max[1], right.max[1]) - Math.max(left.min[1], right.min[1]),
    Math.min(left.max[2], right.max[2]) - Math.max(left.min[2], right.min[2]),
  ];
}

export function measureBoundingBoxDistance(
  left: BoundingBox3D,
  right: BoundingBox3D,
): number {
  const dx = Math.max(0, left.min[0] - right.max[0], right.min[0] - left.max[0]);
  const dy = Math.max(0, left.min[1] - right.max[1], right.min[1] - left.max[1]);
  const dz = Math.max(0, left.min[2] - right.max[2], right.min[2] - left.max[2]);
  return Math.hypot(dx, dy, dz);
}

function findAssembly(
  session: CadSession,
  assemblyId: string,
): AssemblyRecord | undefined {
  return session.assemblyManager.getAssembly(assemblyId);
}

function findComponentTarget(
  session: CadSession,
  component: AssemblyComponent,
  assemblyId: string,
): AnalysisTarget | undefined {
  const entity = session.sceneGraph.getEntity(component.ref);
  if (!entity) {
    return undefined;
  }
  return {
    type: "assembly-component",
    id: component.id,
    assemblyId,
    entityId: entity.id,
    bbox: transformBoundingBox3D(
      getBoundingBox3D(entity),
      component.position,
      component.rotation,
    ),
  };
}

function findComponentInAssembly(
  session: CadSession,
  assemblyId: string,
  componentId: string,
): AnalysisTarget | undefined {
  const assembly = findAssembly(session, assemblyId);
  const component = assembly?.components.find((item) => item.id === componentId);
  return component ? findComponentTarget(session, component, assemblyId) : undefined;
}

export function resolveAnalysisTarget(
  session: CadSession,
  id: string,
  assemblyId?: string,
): AnalysisTarget | undefined {
  if (assemblyId) {
    return findComponentInAssembly(session, assemblyId, id);
  }

  const entity = session.sceneGraph.getEntity(id);
  if (entity) {
    return {
      type: "entity",
      id: entity.id,
      bbox: getBoundingBox3D(entity),
    };
  }

  for (const assembly of session.assemblyManager.listAssemblies()) {
    const component = assembly.components.find((item) => item.id === id);
    if (component) {
      return findComponentTarget(session, component, assembly.id);
    }
  }

  return undefined;
}

export function listAssemblyCollisions(
  session: CadSession,
  assemblyId: string,
  tolerance = 0,
): AssemblyCollision[] {
  const assembly = findAssembly(session, assemblyId);
  if (!assembly) {
    throw new Error(`Assembly not found: ${assemblyId}`);
  }

  const collisions: AssemblyCollision[] = [];
  for (let i = 0; i < assembly.components.length; i++) {
    for (let j = i + 1; j < assembly.components.length; j++) {
      const left = findComponentTarget(session, assembly.components[i], assemblyId);
      const right = findComponentTarget(session, assembly.components[j], assemblyId);
      if (!left || !right) {
        continue;
      }
      const overlap = overlapDistances(left.bbox, right.bbox);
      if (overlap.every((value) => value > tolerance)) {
        collisions.push({
          a: assembly.components[i].id,
          b: assembly.components[j].id,
          overlap,
        });
      }
    }
  }
  return collisions;
}

export function getEntityBoundingBox(entity: Entity): BoundingBox3D {
  return getBoundingBox3D(entity);
}
