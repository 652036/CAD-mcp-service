import test from "node:test";
import assert from "node:assert/strict";
import { CadSession } from "../src/session/CadSession.js";
import {
  computeAverageElevation,
  computeCutFillVolumeFromArea,
  computeGridSurfaceVolume,
  computeSectionArea,
  getEntityPlanarArea,
  getProfileLength,
  sampleProfileFromPoints,
  selectEntitiesInsidePolygon,
} from "../src/utils/terrainMath.js";

test("terrain helpers compute profile length and section samples", () => {
  const session = new CadSession();
  const profileId = session.sceneGraph.createPolyline([0, 0, 10, 0, 20, 0], {
    properties: { kind: "profile_line" },
  });
  const pointA = session.sceneGraph.createPoint([0, 1], {
    properties: { kind: "sampling_point", elevation: 100 },
  });
  const pointB = session.sceneGraph.createPoint([10, 1], {
    properties: { kind: "sampling_point", elevation: 110 },
  });
  const pointC = session.sceneGraph.createPoint([20, 1], {
    properties: { kind: "sampling_point", elevation: 120 },
  });

  const profile = session.sceneGraph.getEntity(profileId)!;
  const samples = sampleProfileFromPoints(profile, [
    session.sceneGraph.getEntity(pointA)!,
    session.sceneGraph.getEntity(pointB)!,
    session.sceneGraph.getEntity(pointC)!,
  ]);
  const section = computeSectionArea(samples, 90);

  assert.equal(getProfileLength(profile as never), 20);
  assert.equal(samples.length, 3);
  assert.equal(samples[1]?.station, 10);
  assert.equal(section.area, 400);
  assert.equal(section.signedArea, 400);
});

test("terrain helpers compute area and select elevated points inside boundary", () => {
  const session = new CadSession();
  const boundaryId = session.sceneGraph.createPolygon([0, 0, 10, 0, 10, 10, 0, 10], {
    properties: { kind: "boundary_polygon", closed: true },
  });
  const inside = session.sceneGraph.createPoint([2, 2], {
    properties: { kind: "sampling_point", elevation: 12 },
  });
  session.sceneGraph.createPoint([20, 20], {
    properties: { kind: "sampling_point", elevation: 30 },
  });

  const boundary = session.sceneGraph.getEntity(boundaryId)!;
  const selected = selectEntitiesInsidePolygon(
    boundary as never,
    session.sceneGraph.listEntities(),
  );
  const { average, count } = computeAverageElevation(selected);
  const cutFill = computeCutFillVolumeFromArea(
    getEntityPlanarArea(boundary),
    average,
    10,
  );

  assert.equal(getEntityPlanarArea(boundary), 100);
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.id, inside);
  assert.equal(count, 1);
  assert.equal(average, 12);
  assert.equal(cutFill.cutVolume, 200);
  assert.equal(cutFill.fillVolume, 0);
});

test("terrain helpers compute grid surface volume from sample elevations", () => {
  const session = new CadSession();
  session.sceneGraph.createPoint([0, 0], {
    properties: { kind: "sampling_point", elevation: 8 },
  });
  session.sceneGraph.createPoint([10, 0], {
    properties: { kind: "sampling_point", elevation: 10 },
  });
  session.sceneGraph.createPoint([20, 0], {
    properties: { kind: "sampling_point", elevation: 12 },
  });

  const result = computeGridSurfaceVolume(
    session.sceneGraph.listEntities(),
    25,
    9,
  );

  assert.equal(result.sampleCount, 3);
  assert.equal(result.averageElevation, 10);
  assert.equal(result.volume, 75);
  assert.equal(result.cutVolume, 75);
  assert.equal(result.fillVolume, 0);
});
