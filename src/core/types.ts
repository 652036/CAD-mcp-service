export type EntityId = string;

export interface Layer {
  name: string;
  color?: string;
  visible: boolean;
  locked: boolean;
}

export type EntityType =
  | "point"
  | "line"
  | "circle"
  | "arc"
  | "rectangle"
  | "polygon"
  | "polyline";

export interface EntityBase {
  id: EntityId;
  type: EntityType;
  layer?: string;
  properties?: Record<string, unknown>;
}

export interface PointEntity extends EntityBase {
  type: "point";
  coords: number[];
}

export interface LineEntity extends EntityBase {
  type: "line";
  coords: number[];
}

export interface CircleEntity extends EntityBase {
  type: "circle";
  coords: number[];
}

export interface ArcEntity extends EntityBase {
  type: "arc";
  coords: number[];
}

export interface RectangleEntity extends EntityBase {
  type: "rectangle";
  coords: number[];
}

export interface PolygonEntity extends EntityBase {
  type: "polygon";
  coords: number[];
}

export interface PolylineEntity extends EntityBase {
  type: "polyline";
  coords: number[];
  closed?: boolean;
}

export type Entity2D =
  | PointEntity
  | LineEntity
  | CircleEntity
  | ArcEntity
  | RectangleEntity
  | PolygonEntity
  | PolylineEntity;

export type NewEntity2D = Omit<Entity2D, "id"> & { id?: EntityId };

export interface ProjectMetadata {
  name: string;
  units: "mm";
  entityCount: number;
  layerCount: number;
  updatedAt: string;
}

/** Serializable scene state for export/restore and undo/redo. */
export interface SceneSnapshotV1 {
  version: 1;
  projectName: string;
  updatedAt: string;
  layers: Layer[];
  entities: Entity2D[];
}
