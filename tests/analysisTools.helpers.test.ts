import test from "node:test";
import assert from "node:assert/strict";
import { CadSession } from "../src/session/CadSession.js";
import { getMassPropertiesData } from "../src/tools/analysisTools.js";
import { listAssemblyCollisions, resolveAnalysisTarget, transformBoundingBox3D } from "../src/utils/assemblyAnalysis.js";
import { buildMaterialPropertiesPatch, cubicMillimetresToCubicMetres } from "../src/utils/materials.js";

test("transformBoundingBox3D applies component rotation and translation", () => {
  const transformed = transformBoundingBox3D(
    {
      min: [0, 0, 0],
      max: [10, 20, 5],
    },
    [30, 0, 0],
    [0, 0, Math.PI / 2],
  );

  assert.deepEqual(transformed, {
    min: [10, 0, 0],
    max: [30, 10.000000000000002, 5],
  });
});

test("assembly collision analysis respects component placement", () => {
  const session = new CadSession();
  const boxId = session.geometryEngine.createSolid({
    type: "box",
    coords: [0, 0, 0, 10, 10, 10],
  });
  const assembly = session.assemblyManager.createAssembly("Main");
  const left = session.assemblyManager.addComponent(
    assembly.id,
    boxId,
    [0, 0, 0],
    [0, 0, 0],
  );
  const right = session.assemblyManager.addComponent(
    assembly.id,
    boxId,
    [5, 0, 0],
    [0, 0, 0],
  );

  const collisions = listAssemblyCollisions(session, assembly.id);
  const target = resolveAnalysisTarget(session, right.id, assembly.id);

  assert.deepEqual(collisions, [
    {
      a: left.id,
      b: right.id,
      overlap: [5, 10, 10],
    },
  ]);
  assert.deepEqual(target, {
    type: "assembly-component",
    id: right.id,
    assemblyId: assembly.id,
    entityId: boxId,
    bbox: {
      min: [5, 0, 0],
      max: [15, 10, 10],
    },
  });
});

test("material helpers populate density and mass properties use SI mass units", () => {
  const materialPatch = buildMaterialPropertiesPatch("steel_mild");
  const massProperties = getMassPropertiesData({
    id: "box-1",
    type: "box",
    coords: [0, 0, 0, 1000, 1000, 1000],
    properties: materialPatch,
  });

  assert.deepEqual(materialPatch, {
    material: "Mild Steel",
    materialId: "steel_mild",
    densityKgM3: 7850,
  });
  assert.equal(cubicMillimetresToCubicMetres(1_000_000_000), 1);
  assert.equal(massProperties.volume, 1_000_000_000);
  assert.equal(massProperties.volume_m3, 1);
  assert.equal(massProperties.mass, 7850);
});
