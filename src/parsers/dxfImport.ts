import DxfParser from "dxf-parser";
import type {
  IDxf,
  IArcEntity,
  ICircleEntity,
  IEntity,
  ILwpolylineEntity,
  ILineEntity,
  IPointEntity,
} from "dxf-parser";
import type { NewEntity2D } from "../core/types.js";

export type ImportDxfResult = {
  success: boolean;
  error?: string;
  newEntities: NewEntity2D[];
  layerNames: string[];
  skippedTypes: string[];
  warnings: string[];
  /** Counts by entity type for tooling (e.g. import_dxf). */
  imported: Partial<Record<NewEntity2D["type"], number>>;
};

function countByType(
  entities: NewEntity2D[],
): Partial<Record<NewEntity2D["type"], number>> {
  const out: Partial<Record<NewEntity2D["type"], number>> = {};
  for (const e of entities) {
    out[e.type] = (out[e.type] ?? 0) + 1;
  }
  return out;
}

const SKIP_TYPES = new Set<string>([
  "POLYLINE",
  "SPLINE",
  "ELLIPSE",
  "3DFACE",
  "ATTDEF",
  "DIMENSION",
  "INSERT",
  "MTEXT",
  "TEXT",
  "SOLID",
  "VERTEX",
  "SEQEND",
]);

function layerName(entity: IEntity): string {
  const raw = entity.layer;
  return typeof raw === "string" && raw.length > 0 ? raw : "0";
}

function pushUniqueLayer(order: string[], seen: Set<string>, name: string): void {
  if (!seen.has(name)) {
    seen.add(name);
    order.push(name);
  }
}

function isLine(e: IEntity): e is ILineEntity {
  return e.type === "LINE";
}

function isCircle(e: IEntity): e is ICircleEntity {
  return e.type === "CIRCLE";
}

function isArc(e: IEntity): e is IArcEntity {
  return e.type === "ARC";
}

function isPoint(e: IEntity): e is IPointEntity {
  return e.type === "POINT";
}

function isLwPolyline(e: IEntity): e is ILwpolylineEntity {
  return e.type === "LWPOLYLINE";
}

function mapEntity(
  entity: IEntity,
  layer: string,
  newEntities: NewEntity2D[],
  skippedTypes: string[],
  warnings: string[],
): void {
  if (SKIP_TYPES.has(entity.type)) {
    skippedTypes.push(entity.type);
    return;
  }

  if (isLine(entity)) {
    const v = entity.vertices;
    if (!v || v.length < 2) {
      warnings.push("LINE skipped: expected two vertices");
      return;
    }
    const a = v[0];
    const b = v[1];
    newEntities.push({
      type: "line",
      layer,
      coords: [a.x, a.y, b.x, b.y],
    });
    return;
  }

  if (isCircle(entity)) {
    const c = entity.center;
    const r = entity.radius;
    if (!c || typeof r !== "number" || !Number.isFinite(r)) {
      warnings.push("CIRCLE skipped: missing center or radius");
      return;
    }
    newEntities.push({
      type: "circle",
      layer,
      coords: [c.x, c.y, r],
    });
    return;
  }

  if (isArc(entity)) {
    const c = entity.center;
    const r = entity.radius;
    if (
      !c ||
      typeof r !== "number" ||
      !Number.isFinite(r) ||
      typeof entity.startAngle !== "number" ||
      typeof entity.endAngle !== "number"
    ) {
      warnings.push("ARC skipped: incomplete geometry");
      return;
    }
    newEntities.push({
      type: "arc",
      layer,
      coords: [c.x, c.y, r, entity.startAngle, entity.endAngle],
    });
    return;
  }

  if (isPoint(entity)) {
    const p = entity.position;
    if (!p) {
      warnings.push("POINT skipped: missing position");
      return;
    }
    newEntities.push({
      type: "point",
      layer,
      coords: [p.x, p.y],
    });
    return;
  }

  if (isLwPolyline(entity)) {
    const verts = entity.vertices;
    if (!verts?.length) {
      warnings.push("LWPOLYLINE skipped: no vertices");
      return;
    }
    const hasBulge = verts.some(
      (v) => v.bulge != null && v.bulge !== 0 && Number.isFinite(v.bulge),
    );
    if (hasBulge) {
      warnings.push(
        "LWPOLYLINE: bulge values ignored; polyline uses straight segments only",
      );
    }
    const coords: number[] = [];
    for (const v of verts) {
      coords.push(v.x, v.y);
    }
    const closed = Boolean(entity.shape);
    newEntities.push({
      type: "polyline",
      layer,
      coords,
      closed,
    } as NewEntity2D);
    return;
  }

  skippedTypes.push(entity.type);
}

type DxfParserCtor = new () => {
  parse(source: string): IDxf | null;
};

/**
 * Parse DXF text into 2D scene entities (LINE, CIRCLE, ARC, POINT, LWPOLYLINE).
 * Each skipped entity appends one entry to `skippedTypes` (same type may repeat).
 */
export function importDxfToSceneData(dxfText: string): ImportDxfResult {
  const empty = (): ImportDxfResult => ({
    success: false,
    error: undefined,
    newEntities: [],
    layerNames: [],
    skippedTypes: [],
    warnings: [],
    imported: {},
  });

  if (typeof dxfText !== "string" || dxfText.length === 0) {
    return { ...empty(), error: "DXF input is empty" };
  }

  let parsed: IDxf | null;
  try {
    const Parser = DxfParser as unknown as DxfParserCtor;
    parsed = new Parser().parse(dxfText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...empty(), error: message || "DXF parse failed" };
  }

  if (parsed == null) {
    return { ...empty(), error: "DXF parse returned no data" };
  }

  const entities = parsed.entities ?? [];
  const layerOrder: string[] = [];
  const layerSeen = new Set<string>();
  const newEntities: NewEntity2D[] = [];
  const skippedTypes: string[] = [];
  const warnings: string[] = [];

  for (const entity of entities) {
    const layer = layerName(entity);
    pushUniqueLayer(layerOrder, layerSeen, layer);
    mapEntity(entity, layer, newEntities, skippedTypes, warnings);
  }

  return {
    success: true,
    newEntities,
    layerNames: layerOrder,
    skippedTypes,
    warnings,
    imported: countByType(newEntities),
  };
}
