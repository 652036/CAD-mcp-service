import test from "node:test";
import assert from "node:assert/strict";
import { SceneGraph } from "../src/core/SceneGraph.js";

test("SceneGraph renames and deletes layers while preserving entities", () => {
  const scene = new SceneGraph();
  scene.createLayer("Parts", { color: "#ff0000" });
  const entityId = scene.createLine([0, 0, 10, 0], { layer: "Parts" });

  scene.renameLayer("Parts", "Main");
  assert.equal(scene.getEntity(entityId)?.layer, "Main");
  assert.ok(scene.getLayers().has("Main"));
  assert.ok(!scene.getLayers().has("Parts"));

  scene.deleteLayer("Main");
  assert.equal(scene.getEntity(entityId)?.layer, "0");
  assert.ok(!scene.getLayers().has("Main"));
});

test("SceneGraph replaceEntity updates stored properties", () => {
  const scene = new SceneGraph();
  const entityId = scene.createCircle([5, 5, 2]);
  const entity = scene.getEntity(entityId);
  assert.ok(entity);
  scene.replaceEntity({
    ...entity!,
    properties: {
      color: "#00ff00",
      lineweight: 0.25,
    },
  });

  assert.deepEqual(scene.getEntity(entityId)?.properties, {
    color: "#00ff00",
    lineweight: 0.25,
  });
});

test("SceneGraph blocks renaming or deleting locked layers", () => {
  const scene = new SceneGraph();
  scene.createLayer("Locked");
  scene.createPoint([1, 2], { layer: "Locked" });
  scene.setLayerLocked("Locked", true);

  assert.throws(() => scene.renameLayer("Locked", "Renamed"), /locked/i);
  assert.throws(() => scene.deleteLayer("Locked"), /locked/i);
});
