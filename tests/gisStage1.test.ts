import test from "node:test";
import assert from "node:assert/strict";
import { SceneGraph } from "../src/core/SceneGraph.js";
import { parseCsvPointsToEntities } from "../src/parsers/CsvParser.js";
import {
  exportEntitiesToGeoJson,
  parseGeoJsonToEntities,
} from "../src/parsers/GeoJsonParser.js";
import { transformBetweenLocalAndWorld } from "../src/utils/crs.js";

test("SceneGraph persists georeference metadata through snapshot roundtrip", () => {
  const source = new SceneGraph();
  source.setGeoReference({
    crs: { code: "EPSG:4490", name: "CGCS2000", units: "m" },
    origin: { x: 500000, y: 4000000 },
    extent: { minX: 0, minY: 0, maxX: 1000, maxY: 800 },
    drawingScale: 100,
  });

  const restored = new SceneGraph();
  restored.restoreSnapshot(source.exportSnapshot());

  assert.deepEqual(restored.getGeoReference(), {
    crs: { code: "EPSG:4490", name: "CGCS2000", units: "m" },
    origin: { x: 500000, y: 4000000 },
    extent: { minX: 0, minY: 0, maxX: 1000, maxY: 800 },
    drawingScale: 100,
  });
});

test("parseCsvPointsToEntities keeps tabular attributes on sampling points", () => {
  const entities = parseCsvPointsToEntities(
    [
      "id,x,y,type,ph",
      "SP-1,120.5,35.2,soil,7.1",
      "SP-2,121.5,36.2,water,6.8",
    ].join("\n"),
    { idColumn: "id", kind: "sampling_point" },
  );

  assert.equal(entities.length, 2);
  assert.equal(entities[0]?.type, "point");
  assert.equal(entities[0]?.properties?.kind, "sampling_point");
  assert.equal(entities[0]?.properties?.label, "SP-1");
  assert.equal(entities[0]?.properties?.ph, "7.1");
});

test("GeoJSON parser imports point, line, and polygon features", () => {
  const entities = parseGeoJsonToEntities(
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "P1",
          properties: { kind: "sampling_point" },
          geometry: { type: "Point", coordinates: [10, 20] },
        },
        {
          type: "Feature",
          id: "L1",
          properties: { kind: "profile_line" },
          geometry: {
            type: "LineString",
            coordinates: [[0, 0], [5, 5], [10, 5]],
          },
        },
        {
          type: "Feature",
          id: "A1",
          properties: { kind: "boundary_polygon" },
          geometry: {
            type: "Polygon",
            coordinates: [[[0, 0], [6, 0], [6, 4], [0, 0]]],
          },
        },
      ],
    }),
  );

  assert.equal(entities.length, 3);
  assert.equal(entities[0]?.type, "point");
  assert.equal(entities[1]?.type, "polyline");
  assert.equal(entities[2]?.type, "polygon");
});

test("GeoJSON export preserves layer and basic geometry", () => {
  const geojson = exportEntitiesToGeoJson([
    {
      id: "sample-1",
      type: "point",
      coords: [10, 20],
      layer: "samples",
      properties: { kind: "sampling_point" },
    },
    {
      id: "boundary-1",
      type: "rectangle",
      coords: [0, 0, 5, 4],
      layer: "boundary",
      properties: { kind: "boundary_polygon" },
    },
  ]);

  assert.equal(geojson.type, "FeatureCollection");
  assert.equal(geojson.features.length, 2);
  assert.equal(geojson.features[0]?.properties?.layer, "samples");
  assert.equal(geojson.features[1]?.geometry?.type, "Polygon");
});

test("CRS helper transforms between local and world coordinates", () => {
  const world = transformBetweenLocalAndWorld(
    { x: 5, y: 7 },
    {
      origin: { x: 100, y: 200 },
      drawingScale: 10,
    },
    "local_to_world",
  );
  const local = transformBetweenLocalAndWorld(
    world,
    {
      origin: { x: 100, y: 200 },
      drawingScale: 10,
    },
    "world_to_local",
  );

  assert.deepEqual(world, { x: 150, y: 270, z: undefined });
  assert.deepEqual(local, { x: 5, y: 7, z: undefined });
});
