import { z } from "zod";
import type {
  CadSessionSnapshotV1,
  SceneSnapshotV1,
} from "../core/types.js";
import type { CadProjectFileV1 } from "./format.js";

const entityTypeSchema = z.enum([
  "point",
  "line",
  "circle",
  "arc",
  "ellipse",
  "rectangle",
  "polygon",
  "polyline",
  "spline",
  "box",
  "sphere",
  "cylinder",
  "cone",
  "torus",
  "prism",
  "revolution",
  "boolean_result",
  "text",
  "mtext",
  "leader",
  "multileader",
  "table",
  "dimension",
  "symbol",
  "viewport",
]);

const layerSchema = z
  .object({
    name: z.string(),
    color: z.string().optional(),
    visible: z.boolean(),
    locked: z.boolean(),
  })
  .strict();

const entitySchema = z
  .object({
    id: z.string(),
    type: entityTypeSchema,
    layer: z.string().optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
    coords: z.array(z.number()).optional(),
    closed: z.boolean().optional(),
  })
  .passthrough();

export const sceneSnapshotV1Schema = z.object({
  version: z.literal(1),
  projectName: z.string(),
  updatedAt: z.string(),
  layers: z.array(layerSchema),
  entities: z.array(entitySchema),
});

const parametricStateSchema = z.object({
  parameters: z.array(
    z.object({
      name: z.string(),
      value: z.union([z.number(), z.string(), z.boolean()]),
      unit: z.string().optional(),
      expression: z.string().optional(),
      updatedAt: z.string(),
    }),
  ),
  constraints: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      entities: z.array(z.string()),
      data: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

const organizationStateSchema = z.object({
  blocks: z.array(
    z.object({
      name: z.string(),
      entities: z.array(z.string()),
      basePoint: z.object({
        x: z.number(),
        y: z.number(),
        z: z.number().optional(),
      }),
      attributes: z
        .array(
          z.object({
            tag: z.string(),
            prompt: z.string(),
            defaultValue: z.string(),
          }),
        )
        .optional(),
    }),
  ),
  groups: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      entityIds: z.array(z.string()),
    }),
  ),
});

const assemblyStateSchema = z.object({
  assemblies: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      components: z.array(
        z.object({
          id: z.string(),
          ref: z.string(),
          position: z.tuple([z.number(), z.number(), z.number()]),
          rotation: z.tuple([z.number(), z.number(), z.number()]),
          flexible: z.boolean().optional(),
        }),
      ),
      mates: z.array(
        z.object({
          id: z.string(),
          type: z.string(),
          a: z.string(),
          b: z.string(),
          value: z.number().optional(),
        }),
      ),
      explodedViews: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          steps: z.array(
            z.object({
              componentIds: z.array(z.string()),
              direction: z.tuple([z.number(), z.number(), z.number()]),
              distance: z.number(),
            }),
          ),
        }),
      ),
    }),
  ),
});

const drawingStateSchema = z.object({
  drawings: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      template: z.string().optional(),
      sheetSize: z.string().optional(),
      views: z.array(
        z.object({
          id: z.string(),
          sourceId: z.string(),
          viewType: z.string(),
          scale: z.number(),
          position: z.tuple([z.number(), z.number()]),
          options: z.record(z.string(), z.unknown()).optional(),
        }),
      ),
      annotations: z.array(z.string()),
    }),
  ),
});

export const cadSessionSnapshotV1Schema = z.object({
  version: z.literal(1),
  scene: sceneSnapshotV1Schema,
  parametrics: parametricStateSchema,
  organization: organizationStateSchema,
  assemblies: assemblyStateSchema,
  drawings: drawingStateSchema,
});

export const cadProjectFileV1Schema = z.object({
  format: z.literal("cad-mcp-project"),
  formatVersion: z.literal(1),
  savedAt: z.string(),
  snapshot: z.union([sceneSnapshotV1Schema, cadSessionSnapshotV1Schema]),
});

export function parseProjectFileJson(text: string): CadProjectFileV1 {
  const raw: unknown = JSON.parse(text);
  const parsed = cadProjectFileV1Schema.parse(raw);
  return {
    ...parsed,
    snapshot: parsed.snapshot as SceneSnapshotV1 | CadSessionSnapshotV1,
  };
}

export function serializeProjectFile(
  snapshot: SceneSnapshotV1 | CadSessionSnapshotV1,
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
