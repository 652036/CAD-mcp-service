import { z } from "zod";
import type { SceneSnapshotV1 } from "../core/types.js";
import type { CadProjectFileV1 } from "./format.js";

const entityTypeSchema = z.enum([
  "point",
  "line",
  "circle",
  "arc",
  "rectangle",
  "polygon",
  "polyline",
]);

/** Validates {@link SceneSnapshotV1}: version 1, layers, entities (minimal per-entity shape). */
export const sceneSnapshotV1Schema = z.object({
  version: z.literal(1),
  projectName: z.string(),
  updatedAt: z.string(),
  layers: z.array(
    z
      .object({
        name: z.string(),
        color: z.string().optional(),
        visible: z.boolean(),
        locked: z.boolean(),
      })
      .strict(),
  ),
  entities: z.array(
    z
      .object({
        id: z.string(),
        type: entityTypeSchema,
        layer: z.string().optional(),
        properties: z.record(z.string(), z.unknown()).optional(),
        coords: z.array(z.number()).optional(),
        closed: z.boolean().optional(),
      })
      .passthrough(),
  ),
});

export const cadProjectFileV1Schema = z.object({
  format: z.literal("cad-mcp-project"),
  formatVersion: z.literal(1),
  savedAt: z.string(),
  snapshot: sceneSnapshotV1Schema,
});

export function parseProjectFileJson(text: string): CadProjectFileV1 {
  const raw: unknown = JSON.parse(text);
  const parsed = cadProjectFileV1Schema.parse(raw);
  return {
    ...parsed,
    snapshot: parsed.snapshot as SceneSnapshotV1,
  };
}

export function serializeProjectFile(
  snapshot: SceneSnapshotV1,
  savedAt?: Date,
): string {
  const file: CadProjectFileV1 = {
    format: "cad-mcp-project",
    formatVersion: 1,
    savedAt: (savedAt ?? new Date()).toISOString(),
    snapshot,
  };
  return JSON.stringify(file);
}
