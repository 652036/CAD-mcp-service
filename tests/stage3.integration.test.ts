import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import shpwrite from "shp-write";
import { DrawingManager } from "../src/core/DrawingManager.js";
import { exportEntitiesToShapefileZip, parseShapefileToEntities } from "../src/parsers/ShapefileParser.js";
import { readDrawingTemplate } from "../src/resources/templates.js";

function writeShapefile(
  rows: Array<Record<string, unknown>>,
  geometryType: string,
  geometries: unknown[],
): Promise<{ shp: DataView; shx: DataView; dbf: DataView; prj?: string }> {
  return new Promise((resolve, reject) => {
    shpwrite.write(rows, geometryType, geometries, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });
}

test("DrawingManager stores template and layout/export options", () => {
  const drawings = new DrawingManager();
  const drawing = drawings.createDrawing("Map Plate", "thesis-a3-map.json");

  drawings.setLayoutOptions(drawing.id, { title: "Hydrogeology Map", scale: 1000 });
  drawings.setExportOptions(drawing.id, { preferredFormat: "svg" });

  const stored = drawings.getDrawing(drawing.id);
  assert.equal(stored?.template, "thesis-a3-map.json");
  assert.deepEqual(stored?.layoutOptions, {
    title: "Hydrogeology Map",
    scale: 1000,
  });
  assert.deepEqual(stored?.exportOptions, {
    preferredFormat: "svg",
  });
});

test("template resource loader reads thesis map template", async () => {
  const template = await readDrawingTemplate("thesis-a3-map.json");
  assert.equal(template.name, "Thesis A3 Map");
  assert.equal(template.paperSize, "A3");
});

test("shapefile helpers export zip bytes and import point entities", async () => {
  const zip = await exportEntitiesToShapefileZip([
    {
      id: "sample-1",
      type: "point",
      coords: [120.5, 30.2],
      properties: { kind: "sampling_point", name: "SP-1" },
      layer: "samples",
    },
  ]);
  assert.ok(zip.byteLength > 100);

  const dir = await mkdtemp(path.join(os.tmpdir(), "cad-mcp-shp-"));
  const shape = await writeShapefile(
    [{ name: "SP-1", kind: "sampling_point" }],
    "POINT",
    [[120.5, 30.2]],
  );
  const shpPath = path.join(dir, "points.shp");
  const shxPath = path.join(dir, "points.shx");
  const dbfPath = path.join(dir, "points.dbf");
  await writeFile(shpPath, Buffer.from(shape.shp.buffer));
  await writeFile(shxPath, Buffer.from(shape.shx.buffer));
  await writeFile(dbfPath, Buffer.from(shape.dbf.buffer));

  const imported = await parseShapefileToEntities({ shpPath, dbfPath });
  assert.equal(imported.length, 1);
  assert.equal(imported[0]?.type, "point");
  assert.equal(imported[0]?.properties?.name, "SP-1");

  const rawDbf = await readFile(dbfPath);
  assert.ok(rawDbf.byteLength > 0);
});
