import { randomUUID } from "node:crypto";

export type RasterLayerMetadata = {
  id: string;
  name: string;
  path: string;
  width: number;
  height: number;
  samplesPerPixel: number;
  bitsPerSample?: number;
  sampleFormat?: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  origin?: [number, number];
  resolution?: [number, number];
  crs?: { code?: string; epsg?: number; description?: string };
  visible: boolean;
  attachedAt: string;
};

export type AttachRasterInput = Omit<RasterLayerMetadata, "id" | "attachedAt" | "visible"> & {
  id?: string;
  visible?: boolean;
};

export class RasterStore {
  private readonly layers = new Map<string, RasterLayerMetadata>();

  attach(input: AttachRasterInput): RasterLayerMetadata {
    const id = input.id ?? `raster_${randomUUID()}`;
    if (this.layers.has(id)) {
      throw new Error(`Raster layer id already exists: ${id}`);
    }
    const layer: RasterLayerMetadata = {
      ...input,
      id,
      visible: input.visible !== false,
      attachedAt: new Date().toISOString(),
    };
    this.layers.set(id, layer);
    return layer;
  }

  list(): RasterLayerMetadata[] {
    return Array.from(this.layers.values());
  }

  get(id: string): RasterLayerMetadata | undefined {
    return this.layers.get(id);
  }

  remove(id: string): boolean {
    return this.layers.delete(id);
  }

  setVisible(id: string, visible: boolean): RasterLayerMetadata {
    const layer = this.layers.get(id);
    if (!layer) {
      throw new Error(`Raster layer not found: ${id}`);
    }
    layer.visible = visible;
    return layer;
  }

  rename(id: string, name: string): RasterLayerMetadata {
    const layer = this.layers.get(id);
    if (!layer) {
      throw new Error(`Raster layer not found: ${id}`);
    }
    layer.name = name;
    return layer;
  }
}
