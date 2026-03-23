import type { Entity2D, NewEntity2D } from "../core/types.js";
import { importDxfToSceneData } from "./dxfImport.js";

export type DxfMinimalParseResult = {
  layers: string[];
  entities: NewEntity2D[];
  error?: string;
  warnings?: string[];
  skippedTypes?: string[];
};

/**
 * Minimal DXF parse (no file I/O): geometry via `dxf-parser` and `importDxfToSceneData`.
 */
export function parseDxfMinimal(content: string): DxfMinimalParseResult {
  const result = importDxfToSceneData(content);
  if (!result.success) {
    return {
      layers: ["0"],
      entities: [],
      error: result.error ?? "DXF parse failed",
      warnings: result.warnings,
      skippedTypes: result.skippedTypes,
    };
  }
  const layers =
    result.layerNames.length > 0 ? result.layerNames : ["0"];
  return {
    layers,
    entities: result.newEntities,
    warnings: result.warnings,
    skippedTypes: result.skippedTypes,
  };
}

export type SceneSummary = Record<string, unknown>;

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function pushPair(out: string[], xs: readonly string[]): void {
  for (const x of xs) {
    out.push(x);
  }
}

/** DXF entity records for one `Entity2D` (R12-style; mm coordinates). */
export function entityToDxfRecords(e: Entity2D): string[] {
  const layer = e.layer ?? "0";
  const out: string[] = [];
  switch (e.type) {
    case "point": {
      const [x, y] = e.coords;
      pushPair(out, [
        "0",
        "POINT",
        "8",
        layer,
        "10",
        String(x),
        "20",
        String(y),
      ]);
      return out;
    }
    case "line": {
      const [x1, y1, x2, y2] = e.coords;
      pushPair(out, [
        "0",
        "LINE",
        "8",
        layer,
        "10",
        String(x1),
        "20",
        String(y1),
        "11",
        String(x2),
        "21",
        String(y2),
      ]);
      return out;
    }
    case "circle": {
      const [cx, cy, r] = e.coords;
      pushPair(out, [
        "0",
        "CIRCLE",
        "8",
        layer,
        "10",
        String(cx),
        "20",
        String(cy),
        "40",
        String(r),
      ]);
      return out;
    }
    case "arc": {
      const [cx, cy, r, a0, a1] = e.coords;
      pushPair(out, [
        "0",
        "ARC",
        "8",
        layer,
        "10",
        String(cx),
        "20",
        String(cy),
        "40",
        String(r),
        "50",
        String(radToDeg(a0)),
        "51",
        String(radToDeg(a1)),
      ]);
      return out;
    }
    case "rectangle": {
      const [x, y, w, h] = e.coords;
      const x2 = x + w;
      const y2 = y + h;
      pushPair(out, [
        "0",
        "LWPOLYLINE",
        "8",
        layer,
        "90",
        "4",
        "70",
        "1",
        "10",
        String(x),
        "20",
        String(y),
        "10",
        String(x2),
        "20",
        String(y),
        "10",
        String(x2),
        "20",
        String(y2),
        "10",
        String(x),
        "20",
        String(y2),
      ]);
      return out;
    }
    case "polygon":
    case "polyline": {
      const coords = e.coords;
      const n = Math.floor(coords.length / 2);
      const closed =
        e.type === "polyline"
          ? (e.closed ?? false)
          : Boolean(e.properties?.closed);
      pushPair(out, [
        "0",
        "LWPOLYLINE",
        "8",
        layer,
        "90",
        String(n),
        "70",
        closed ? "1" : "0",
      ]);
      for (let i = 0; i + 1 < coords.length; i += 2) {
        pushPair(out, ["10", String(coords[i]), "20", String(coords[i + 1])]);
      }
      return out;
    }
    default:
      return [];
  }
}

/**
 * DXF with HEADER, minimal LAYER table, ENTITIES from the scene (internal units mm).
 */
export function exportDxfFromEntities(
  entities: readonly Entity2D[],
): string {
  const lines: string[] = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1024",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "TABLES",
    "0",
    "TABLE",
    "2",
    "LAYER",
    "70",
    "1",
    "0",
    "LAYER",
    "2",
    "0",
    "70",
    "0",
    "62",
    "7",
    "6",
    "CONTINUOUS",
    "0",
    "ENDTAB",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
  ];
  for (const e of entities) {
    lines.push(...entityToDxfRecords(e));
  }
  if (entities.length === 0) {
    lines.push("999", "cad-mcp-server: empty scene");
  }
  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\r\n");
}

/**
 * Writes a tiny valid DXF with HEADER + ENTITIES and zero geometric entities (comment line only). MVP export.
 */
export function exportDxfMinimal(_sceneSummary: SceneSummary): string {
  return exportDxfFromEntities([]);
}
