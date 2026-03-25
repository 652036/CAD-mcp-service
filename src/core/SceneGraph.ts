import { v4 as uuidv4 } from "uuid";
import type {
  Entity,
  EntityId,
  GeoReferenceMetadata,
  Layer,
  NewEntity,
  PolylineEntity,
  ProjectMetadata,
  ProjectCrs,
  ProjectExtent,
  ProjectOrigin,
  SceneSnapshotV1,
} from "./types.js";

export type { ProjectMetadata };

const DEFAULT_LAYER = "0";

function cloneEntity(entity: Entity): Entity {
  return JSON.parse(JSON.stringify(entity)) as Entity;
}

function cloneLayer(layer: Layer): Layer {
  return JSON.parse(JSON.stringify(layer)) as Layer;
}

export class SceneGraph {
  private readonly entities = new Map<EntityId, Entity>();
  private readonly layers = new Map<string, Layer>();
  private projectName = "Untitled";
  private updatedAt = new Date();
  private projectCrs: ProjectCrs | undefined;
  private projectOrigin: ProjectOrigin | undefined;
  private projectExtent: ProjectExtent | undefined;
  private drawingScale: number | undefined;

  constructor() {
    this.ensureDefaultLayer();
  }

  setProjectName(name: string): void {
    this.projectName = name;
    this.touch();
  }

  setGeoReference(meta: GeoReferenceMetadata): void {
    this.projectCrs = meta.crs ? JSON.parse(JSON.stringify(meta.crs)) as ProjectCrs : undefined;
    this.projectOrigin = meta.origin
      ? JSON.parse(JSON.stringify(meta.origin)) as ProjectOrigin
      : undefined;
    this.projectExtent = meta.extent
      ? JSON.parse(JSON.stringify(meta.extent)) as ProjectExtent
      : undefined;
    this.drawingScale = meta.drawingScale;
    this.touch();
  }

  getGeoReference(): GeoReferenceMetadata {
    return {
      crs: this.projectCrs
        ? JSON.parse(JSON.stringify(this.projectCrs)) as ProjectCrs
        : undefined,
      origin: this.projectOrigin
        ? JSON.parse(JSON.stringify(this.projectOrigin)) as ProjectOrigin
        : undefined,
      extent: this.projectExtent
        ? JSON.parse(JSON.stringify(this.projectExtent)) as ProjectExtent
        : undefined,
      drawingScale: this.drawingScale,
    };
  }

  exportSnapshot(): SceneSnapshotV1 {
    return {
      version: 1,
      projectName: this.projectName,
      updatedAt: this.updatedAt.toISOString(),
      crs: this.projectCrs
        ? JSON.parse(JSON.stringify(this.projectCrs)) as ProjectCrs
        : undefined,
      origin: this.projectOrigin
        ? JSON.parse(JSON.stringify(this.projectOrigin)) as ProjectOrigin
        : undefined,
      extent: this.projectExtent
        ? JSON.parse(JSON.stringify(this.projectExtent)) as ProjectExtent
        : undefined,
      drawingScale: this.drawingScale,
      layers: Array.from(this.layers.values()).map(cloneLayer),
      entities: Array.from(this.entities.values()).map(cloneEntity),
    };
  }

  restoreSnapshot(snapshot: SceneSnapshotV1): void {
    if (snapshot.version !== 1) {
      throw new Error(
        `Unsupported scene snapshot version: ${String(snapshot.version)}`,
      );
    }
    this.entities.clear();
    this.layers.clear();
    this.projectName = snapshot.projectName;
    this.updatedAt = new Date(snapshot.updatedAt);
    this.projectCrs = snapshot.crs
      ? JSON.parse(JSON.stringify(snapshot.crs)) as ProjectCrs
      : undefined;
    this.projectOrigin = snapshot.origin
      ? JSON.parse(JSON.stringify(snapshot.origin)) as ProjectOrigin
      : undefined;
    this.projectExtent = snapshot.extent
      ? JSON.parse(JSON.stringify(snapshot.extent)) as ProjectExtent
      : undefined;
    this.drawingScale = snapshot.drawingScale;
    for (const layer of snapshot.layers) {
      this.layers.set(layer.name, cloneLayer(layer));
    }
    for (const entity of snapshot.entities) {
      this.entities.set(entity.id, cloneEntity(entity));
    }
    this.ensureDefaultLayer();
  }

  private touch(): void {
    this.updatedAt = new Date();
  }

  private ensureDefaultLayer(): void {
    if (!this.layers.has(DEFAULT_LAYER)) {
      this.layers.set(DEFAULT_LAYER, {
        name: DEFAULT_LAYER,
        visible: true,
        locked: false,
      });
    }
  }

  private assertLayerUnlocked(layerName: string): void {
    const layer = this.layers.get(layerName);
    if (layer?.locked) {
      throw new Error(`Layer "${layerName}" is locked`);
    }
  }

  private resolveLayerName(layerName: string | undefined): string | undefined {
    if (layerName === undefined) {
      return undefined;
    }
    if (!this.layers.has(layerName)) {
      throw new Error(`Unknown layer "${layerName}"`);
    }
    return layerName;
  }

  createLayer(
    name: string,
    opts?: Partial<Pick<Layer, "color" | "visible" | "locked">>,
  ): void {
    if (this.layers.has(name)) {
      throw new Error(`Layer "${name}" already exists`);
    }
    this.layers.set(name, {
      name,
      color: opts?.color,
      visible: opts?.visible ?? true,
      locked: opts?.locked ?? false,
    });
    this.touch();
  }

  deleteLayer(name: string): void {
    if (name === DEFAULT_LAYER) {
      throw new Error(`Cannot delete default layer "${DEFAULT_LAYER}"`);
    }
    const layer = this.layers.get(name);
    if (!layer) {
      throw new Error(`Unknown layer "${name}"`);
    }
    this.assertLayerUnlocked(name);
    for (const entity of this.entities.values()) {
      if (entity.layer === name) {
        entity.layer = DEFAULT_LAYER;
      }
    }
    this.layers.delete(name);
    this.touch();
  }

  renameLayer(oldName: string, newName: string): void {
    if (oldName === newName) {
      return;
    }
    if (oldName === DEFAULT_LAYER) {
      throw new Error(`Cannot rename default layer "${DEFAULT_LAYER}"`);
    }
    const layer = this.layers.get(oldName);
    if (!layer) {
      throw new Error(`Unknown layer "${oldName}"`);
    }
    this.assertLayerUnlocked(oldName);
    if (this.layers.has(newName)) {
      throw new Error(`Layer "${newName}" already exists`);
    }
    this.layers.delete(oldName);
    this.layers.set(newName, { ...layer, name: newName });
    for (const entity of this.entities.values()) {
      if (entity.layer === oldName) {
        entity.layer = newName;
      }
    }
    this.touch();
  }

  setLayerVisible(name: string, visible: boolean): void {
    const layer = this.layers.get(name);
    if (!layer) {
      throw new Error(`Unknown layer "${name}"`);
    }
    layer.visible = visible;
    this.touch();
  }

  setLayerLocked(name: string, locked: boolean): void {
    const layer = this.layers.get(name);
    if (!layer) {
      throw new Error(`Unknown layer "${name}"`);
    }
    layer.locked = locked;
    this.touch();
  }

  setLayerColor(name: string, color: string | undefined): void {
    const layer = this.layers.get(name);
    if (!layer) {
      throw new Error(`Unknown layer "${name}"`);
    }
    layer.color = color;
    this.touch();
  }

  getLayers(): ReadonlyMap<string, Layer> {
    return this.layers;
  }

  listLayers(): Layer[] {
    return Array.from(this.layers.values());
  }

  addEntity(input: NewEntity): EntityId {
    const layerName = this.resolveLayerName(input.layer);
    if (layerName !== undefined) {
      this.assertLayerUnlocked(layerName);
    }
    const id = input.id ?? uuidv4();
    if (this.entities.has(id)) {
      throw new Error(`Entity "${id}" already exists`);
    }
    const entity = { ...input, id } as Entity;
    this.entities.set(id, cloneEntity(entity));
    this.touch();
    return id;
  }

  createPoint(
    coords: number[],
    opts?: { layer?: string; properties?: Record<string, unknown> },
  ): EntityId {
    const layer = opts?.layer ?? DEFAULT_LAYER;
    this.resolveLayerName(layer);
    this.assertLayerUnlocked(layer);
    return this.addEntity({
      type: "point",
      coords: [...coords],
      layer,
      properties: opts?.properties,
    });
  }

  createLine(
    coords: number[],
    opts?: { layer?: string; properties?: Record<string, unknown> },
  ): EntityId {
    const layer = opts?.layer ?? DEFAULT_LAYER;
    this.resolveLayerName(layer);
    this.assertLayerUnlocked(layer);
    return this.addEntity({
      type: "line",
      coords: [...coords],
      layer,
      properties: opts?.properties,
    });
  }

  createCircle(
    coords: number[],
    opts?: { layer?: string; properties?: Record<string, unknown> },
  ): EntityId {
    const layer = opts?.layer ?? DEFAULT_LAYER;
    this.resolveLayerName(layer);
    this.assertLayerUnlocked(layer);
    return this.addEntity({
      type: "circle",
      coords: [...coords],
      layer,
      properties: opts?.properties,
    });
  }

  createArc(
    coords: number[],
    opts?: { layer?: string; properties?: Record<string, unknown> },
  ): EntityId {
    const layer = opts?.layer ?? DEFAULT_LAYER;
    this.resolveLayerName(layer);
    this.assertLayerUnlocked(layer);
    return this.addEntity({
      type: "arc",
      coords: [...coords],
      layer,
      properties: opts?.properties,
    });
  }

  createRectangle(
    coords: number[],
    opts?: { layer?: string; properties?: Record<string, unknown> },
  ): EntityId {
    const layer = opts?.layer ?? DEFAULT_LAYER;
    this.resolveLayerName(layer);
    this.assertLayerUnlocked(layer);
    return this.addEntity({
      type: "rectangle",
      coords: [...coords],
      layer,
      properties: opts?.properties,
    });
  }

  createPolygon(
    coords: number[],
    opts?: { layer?: string; properties?: Record<string, unknown> },
  ): EntityId {
    const layer = opts?.layer ?? DEFAULT_LAYER;
    this.resolveLayerName(layer);
    this.assertLayerUnlocked(layer);
    return this.addEntity({
      type: "polygon",
      coords: [...coords],
      layer,
      properties: opts?.properties,
    });
  }

  createPolyline(
    coords: number[],
    opts?: {
      closed?: boolean;
      layer?: string;
      properties?: Record<string, unknown>;
    },
  ): EntityId {
    const layer = opts?.layer ?? DEFAULT_LAYER;
    this.resolveLayerName(layer);
    this.assertLayerUnlocked(layer);
    const poly: Omit<PolylineEntity, "id"> = {
      type: "polyline",
      coords: [...coords],
      closed: opts?.closed,
      layer,
      properties: opts?.properties,
    };
    return this.addEntity(poly as NewEntity);
  }

  listEntities(): readonly Entity[] {
    return Array.from(this.entities.values()).map(cloneEntity);
  }

  getEntity(id: EntityId): Entity | undefined {
    const e = this.entities.get(id);
    return e === undefined ? undefined : cloneEntity(e);
  }

  replaceEntity(entity: Entity): void {
    const existing = this.entities.get(entity.id);
    if (!existing) {
      throw new Error(`Entity "${entity.id}" not found`);
    }
    if (existing.layer !== undefined) {
      this.assertLayerUnlocked(existing.layer);
    }
    const layerName = entity.layer ?? DEFAULT_LAYER;
    this.resolveLayerName(layerName);
    this.assertLayerUnlocked(layerName);
    this.entities.set(entity.id, cloneEntity({ ...entity, layer: layerName }));
    this.touch();
  }

  replaceEntities(entities: readonly Entity[]): void {
    for (const entity of entities) {
      const existing = this.entities.get(entity.id);
      if (!existing) {
        throw new Error(`Entity "${entity.id}" not found`);
      }
      if (existing.layer !== undefined) {
        this.assertLayerUnlocked(existing.layer);
      }
      const layerName = entity.layer ?? DEFAULT_LAYER;
      this.resolveLayerName(layerName);
      this.assertLayerUnlocked(layerName);
    }
    for (const entity of entities) {
      const layerName = entity.layer ?? DEFAULT_LAYER;
      this.entities.set(entity.id, cloneEntity({ ...entity, layer: layerName }));
    }
    this.touch();
  }

  deleteEntity(id: EntityId): boolean {
    const entity = this.entities.get(id);
    if (!entity) {
      return false;
    }
    if (entity.layer !== undefined) {
      this.assertLayerUnlocked(entity.layer);
    }
    this.entities.delete(id);
    this.touch();
    return true;
  }

  /**
   * Assign entities to a layer by name (MCP tools). Respects layer lock on source and target.
   */
  setEntityLayer(
    entityIds: string[],
    layerName: string,
  ): { updated: string[]; notFound: string[]; missingLayer: boolean } {
    if (!this.layers.has(layerName)) {
      return { updated: [], notFound: entityIds, missingLayer: true };
    }
    this.assertLayerUnlocked(layerName);
    const updated: string[] = [];
    const notFound: string[] = [];
    for (const id of entityIds) {
      const e = this.entities.get(id);
      if (!e) {
        notFound.push(id);
        continue;
      }
      if (e.layer !== undefined) {
        this.assertLayerUnlocked(e.layer);
      }
      const next = cloneEntity(e);
      next.layer = layerName;
      this.entities.set(id, next);
      updated.push(id);
    }
    this.touch();
    return { updated, notFound, missingLayer: false };
  }

  getProjectMetadata(): ProjectMetadata {
    return {
      name: this.projectName,
      units: "mm",
      entityCount: this.entities.size,
      layerCount: this.layers.size,
      updatedAt: this.updatedAt.toISOString(),
      crs: this.projectCrs
        ? JSON.parse(JSON.stringify(this.projectCrs)) as ProjectCrs
        : undefined,
      origin: this.projectOrigin
        ? JSON.parse(JSON.stringify(this.projectOrigin)) as ProjectOrigin
        : undefined,
      extent: this.projectExtent
        ? JSON.parse(JSON.stringify(this.projectExtent)) as ProjectExtent
        : undefined,
      drawingScale: this.drawingScale,
    };
  }
}
