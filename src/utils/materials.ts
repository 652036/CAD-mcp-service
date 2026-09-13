import type { Entity } from "../core/types.js";
import { materialsLibraryPlaceholder } from "../resources/libraries.js";

export type MaterialDefinition =
  (typeof materialsLibraryPlaceholder.materials)[number];

const CUBIC_MILLIMETRES_PER_CUBIC_METRE = 1_000_000_000;

function normalizeMaterialToken(value: string): string {
  return value.trim().toLowerCase();
}

export function cubicMillimetresToCubicMetres(volumeMm3: number): number {
  return volumeMm3 / CUBIC_MILLIMETRES_PER_CUBIC_METRE;
}

export function findMaterialDefinition(
  value: string | undefined,
): MaterialDefinition | undefined {
  if (!value) {
    return undefined;
  }
  const token = normalizeMaterialToken(value);
  return materialsLibraryPlaceholder.materials.find((material) =>
    normalizeMaterialToken(material.id) === token ||
    normalizeMaterialToken(material.name) === token
  );
}

export function buildMaterialPropertiesPatch(
  value: string,
): Record<string, unknown> {
  const material = findMaterialDefinition(value);
  if (!material) {
    return { material: value };
  }
  return {
    material: material.name,
    materialId: material.id,
    densityKgM3: material.densityKgM3,
  };
}

export function resolveMaterialDensityKgM3(entity: Entity): number {
  const explicitDensity = entity.properties?.densityKgM3;
  if (typeof explicitDensity === "number" && Number.isFinite(explicitDensity)) {
    return explicitDensity;
  }
  if (typeof explicitDensity === "string") {
    const parsed = Number(explicitDensity);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const materialToken =
    typeof entity.properties?.materialId === "string"
      ? entity.properties.materialId
      : typeof entity.properties?.material === "string"
        ? entity.properties.material
        : undefined;
  return findMaterialDefinition(materialToken)?.densityKgM3 ?? 1;
}
