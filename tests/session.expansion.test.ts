import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { CadSession } from "../src/session/CadSession.js";
import { parseStepLikeContent } from "../src/parsers/StepParser.js";
import { parseStlLikeContent } from "../src/parsers/StlParser.js";
import { getSurfaceArea, getVolume } from "../src/utils/solidMetrics.js";

test("CadSession snapshot preserves parameters and drawings", () => {
  const session = new CadSession();
  session.parametricEngine.setParameter("width", 42, "mm");
  const drawing = session.drawingManager.createDrawing("Sheet A");

  const snapshot = session.exportSnapshot();
  const restored = new CadSession();
  restored.restoreSnapshot(snapshot);

  assert.equal(restored.parametricEngine.getParameter("width")?.value, 42);
  assert.equal(restored.drawingManager.getDrawing(drawing.id)?.name, "Sheet A");
});

test("Geometry engine creates solids with measurable volume and area", () => {
  const session = new CadSession();
  const solidId = session.geometryEngine.createSolid({
    type: "box",
    coords: [0, 0, 0, 2, 3, 4],
  });
  const solid = session.geometryEngine.getSolid(solidId);

  assert.ok(solid);
  assert.equal(getVolume(solid!), 24);
  assert.equal(getSurfaceArea(solid!), 52);
});

test("Step and STL fallback parsers return importable solids", () => {
  const step = parseStepLikeContent("BOX 10 20 30");
  const stl = parseStlLikeContent("solid part\nfacet normal 0 0 1\nendsolid");

  assert.equal(step[0]?.type, "box");
  assert.ok(stl.length >= 1);
});

test("Assembly manager stores components and exploded views", () => {
  const session = new CadSession();
  const boxId = session.geometryEngine.createSolid({
    type: "box",
    coords: [0, 0, 0, 1, 1, 1],
  });
  const assembly = session.assemblyManager.createAssembly("Main");
  const component = session.assemblyManager.addComponent(
    assembly.id,
    boxId,
    [0, 0, 0],
    [0, 0, 0],
  );
  const view = session.assemblyManager.createExplodedView(assembly.id, "Exploded");
  session.assemblyManager.addExplodeStep(
    assembly.id,
    view.id,
    [component.id],
    [1, 0, 0],
    10,
  );

  const stored = session.assemblyManager.getAssembly(assembly.id);
  assert.equal(stored?.components.length, 1);
  assert.equal(stored?.explodedViews[0]?.steps.length, 1);
});

test("Renderer can produce preview payloads", async () => {
  const session = new CadSession();
  session.sceneGraph.createCircle([0, 0, 10]);
  const preview = await session.renderer.renderImagePreview(
    session.sceneGraph.listEntities(),
    128,
    128,
  );

  assert.ok(preview.imageBase64.length > 0);
  assert.ok(
    preview.mimeType === "image/png" || preview.mimeType === "image/svg+xml",
  );
});

test("Geometry backend status is reported", async () => {
  const session = new CadSession();
  const backend = await session.geometryEngine.getBackendStatus();

  assert.ok(
    backend.backend === "occt" ||
      backend.backend === "mock" ||
      backend.backend === "occt-error",
  );
});

test("Python bridge and asset scaffolding exist", () => {
  assert.equal(existsSync("python/occt_bridge.py"), true);
  assert.equal(existsSync("python/mesh_analysis.py"), true);
  assert.equal(existsSync("assets/materials/materials.json"), true);
  assert.equal(existsSync("assets/templates/a3-landscape.json"), true);
});
