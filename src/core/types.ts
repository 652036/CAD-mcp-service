export type EntityId = string;

export interface Layer {
  name: string;
  color?: string;
  visible: boolean;
  locked: boolean;
}

export interface ProjectCrs {
  code?: string;
  name?: string;
  wkt?: string;
  units?: string;
}

export interface ProjectOrigin {
  x: number;
  y: number;
  z?: number;
}

export interface ProjectExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GeoReferenceMetadata {
  crs?: ProjectCrs;
  origin?: ProjectOrigin;
  extent?: ProjectExtent;
  drawingScale?: number;
}

export type EntityType =
  | "point"
  | "line"
  | "circle"
  | "arc"
  | "ellipse"
  | "rectangle"
  | "polygon"
  | "polyline"
  | "spline"
  | "box"
  | "sphere"
  | "cylinder"
  | "cone"
  | "torus"
  | "prism"
  | "revolution"
  | "boolean_result"
  | "text"
  | "mtext"
  | "leader"
  | "multileader"
  | "table"
  | "dimension"
  | "symbol"
  | "viewport";

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

export interface EllipseEntity extends EntityBase {
  type: "ellipse";
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

export interface SplineEntity extends EntityBase {
  type: "spline";
  coords: number[];
}

export interface BoxEntity extends EntityBase {
  type: "box";
  coords: number[];
}

export interface SphereEntity extends EntityBase {
  type: "sphere";
  coords: number[];
}

export interface CylinderEntity extends EntityBase {
  type: "cylinder";
  coords: number[];
}

export interface ConeEntity extends EntityBase {
  type: "cone";
  coords: number[];
}

export interface TorusEntity extends EntityBase {
  type: "torus";
  coords: number[];
}

export interface PrismEntity extends EntityBase {
  type: "prism";
  coords: number[];
}

export interface RevolutionEntity extends EntityBase {
  type: "revolution";
  coords: number[];
}

export interface BooleanResultEntity extends EntityBase {
  type: "boolean_result";
  coords: number[];
}

export interface TextEntity extends EntityBase {
  type: "text";
  coords: number[];
}

export interface MTextEntity extends EntityBase {
  type: "mtext";
  coords: number[];
}

export interface LeaderEntity extends EntityBase {
  type: "leader";
  coords: number[];
}

export interface MultiLeaderEntity extends EntityBase {
  type: "multileader";
  coords: number[];
}

export interface TableEntity extends EntityBase {
  type: "table";
  coords: number[];
}

export interface DimensionEntity extends EntityBase {
  type: "dimension";
  coords: number[];
}

export interface SymbolEntity extends EntityBase {
  type: "symbol";
  coords: number[];
}

export interface ViewportEntity extends EntityBase {
  type: "viewport";
  coords: number[];
}

export type Entity2D =
  | PointEntity
  | LineEntity
  | CircleEntity
  | ArcEntity
  | EllipseEntity
  | RectangleEntity
  | PolygonEntity
  | PolylineEntity
  | SplineEntity
  | TextEntity
  | MTextEntity
  | LeaderEntity
  | MultiLeaderEntity
  | TableEntity
  | DimensionEntity
  | SymbolEntity
  | ViewportEntity;

export type Entity3D =
  | BoxEntity
  | SphereEntity
  | CylinderEntity
  | ConeEntity
  | TorusEntity
  | PrismEntity
  | RevolutionEntity
  | BooleanResultEntity;

export type Entity = Entity2D | Entity3D;

export type NewEntity2D = Omit<Entity2D, "id"> & { id?: EntityId };
export type NewEntity3D = Omit<Entity3D, "id"> & { id?: EntityId };
export type NewEntity = Omit<Entity, "id"> & { id?: EntityId };

export interface ParameterRecord {
  name: string;
  value: number | string | boolean;
  unit?: string;
  expression?: string;
  updatedAt: string;
}

export interface ConstraintRecord {
  id: string;
  type: string;
  entities: string[];
  data?: Record<string, unknown>;
}

export interface BlockDefinition {
  name: string;
  entities: string[];
  basePoint: { x: number; y: number; z?: number };
  attributes?: Array<{
    tag: string;
    prompt: string;
    defaultValue: string;
  }>;
}

export interface GroupRecord {
  id: string;
  name?: string;
  entityIds: string[];
}

export interface AssemblyComponent {
  id: string;
  ref: string;
  position: [number, number, number];
  rotation: [number, number, number];
  flexible?: boolean;
}

export interface AssemblyMate {
  id: string;
  type: string;
  a: string;
  b: string;
  value?: number;
}

export interface ExplodeStep {
  componentIds: string[];
  direction: [number, number, number];
  distance: number;
}

export interface ExplodedViewRecord {
  id: string;
  name: string;
  steps: ExplodeStep[];
}

export interface AssemblyRecord {
  id: string;
  name: string;
  components: AssemblyComponent[];
  mates: AssemblyMate[];
  explodedViews: ExplodedViewRecord[];
}

export interface DrawingViewRecord {
  id: string;
  sourceId: string;
  viewType: string;
  scale: number;
  position: [number, number];
  options?: Record<string, unknown>;
}

export interface DrawingRecord {
  id: string;
  name: string;
  template?: string;
  sheetSize?: string;
  views: DrawingViewRecord[];
  annotations: string[];
  layoutOptions?: Record<string, unknown>;
  exportOptions?: Record<string, unknown>;
}

export interface ParametricState {
  parameters: ParameterRecord[];
  constraints: ConstraintRecord[];
}

export interface OrganizationState {
  blocks: BlockDefinition[];
  groups: GroupRecord[];
}

export interface AssemblyState {
  assemblies: AssemblyRecord[];
}

export interface DrawingState {
  drawings: DrawingRecord[];
}

export interface ProjectMetadata extends GeoReferenceMetadata {
  name: string;
  units: "mm";
  entityCount: number;
  layerCount: number;
  updatedAt: string;
}

export interface SceneSnapshotV1 extends GeoReferenceMetadata {
  version: 1;
  projectName: string;
  updatedAt: string;
  layers: Layer[];
  entities: Entity[];
}

export interface CadSessionSnapshotV1 {
  version: 1;
  scene: SceneSnapshotV1;
  parametrics: ParametricState;
  organization: OrganizationState;
  assemblies: AssemblyState;
  drawings: DrawingState;
}
