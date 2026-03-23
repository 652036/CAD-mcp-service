import { v4 as uuidv4 } from "uuid";
import type {
  Entity2D,
  EntityId,
  Layer,
  NewEntity2D,
  PolylineEntity,
  ProjectMetadata,
} from "./types.js";

export type { ProjectMetadata };

const DEFAULT_LAYER = "0";

function cloneEntity(entity: Entity2D): Entity2D {
  return JSON.parse(JSON.stringify(entity)) as Entity2D;
}

export class SceneGraph {
  private readonly entities = new Map<EntityId, Entity2D>();
  private readonly layers = new Map<string, Layer>();
  private projectName = "Untitled";
  private updatedAt = new Date();

  constructor() {
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

  addEntity(input: NewEntity2D): EntityId {
    const layerName = this.resolveLayerName(input.layer);
    if (layerName !== undefined) {
      this.assertLayerUnlocked(layerName);
    }
    const id = input.id ?? uuidv4();
    if (this.entities.has(id)) {
      throw new Error(`Entity "${id}" already exists`);
    }
    const entity = { ...input, id } as Entity2D;
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
    return this.addEntity(poly as NewEntity2D);
  }

  listEntities(): readonly Entity2D[] {
    return Array.from(this.entities.values()).map(cloneEntity);
  }

  getEntity(id: EntityId): Entity2D | undefined {
    const e = this.entities.get(id);
    return e === undefined ? undefined : cloneEntity(e);
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
    };
  }
}
