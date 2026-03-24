import test from "node:test";
import assert from "node:assert/strict";
import { AutoCadComBridge } from "../src/integrations/AutoCadComBridge.js";

test("AutoCadComBridge parses status JSON from PowerShell", async () => {
  let capturedScript = "";
  const bridge = new AutoCadComBridge(async (script) => {
    capturedScript = script;
    return JSON.stringify({
      visible: true,
      caption: "AutoCAD 2024",
      version: "24.3s",
      documentName: "demo.dwg",
      documentPath: "C:/demo.dwg",
      activeLayer: "0",
      layerCount: 35,
      modelSpaceCount: 47435,
    });
  });

  const status = await bridge.getStatus();

  assert.equal(status.documentName, "demo.dwg");
  assert.equal(status.layerCount, 35);
  assert.match(capturedScript, /Get-AutoCadApp/);
  assert.match(capturedScript, /ActiveLayer\.Name/);
});

test("AutoCadComBridge lists modelspace entities with filters", async () => {
  let capturedScript = "";
  const bridge = new AutoCadComBridge(async (script) => {
    capturedScript = script;
    return JSON.stringify([
      { handle: "1A", objectName: "AcDbPolyline", layer: "DLSS" },
      { handle: "1B", objectName: "AcDbPolyline", layer: "DLSS" },
    ]);
  });

  const entities = await bridge.listModelSpaceEntities({
    limit: 2,
    layer: "DLSS",
    objectName: "AcDbPolyline",
  });

  assert.equal(entities.length, 2);
  assert.equal(entities[0]?.layer, "DLSS");
  assert.match(capturedScript, /AcDbPolyline/);
  assert.match(capturedScript, /DLSS/);
});

test("AutoCadComBridge reports empty output as an error", async () => {
  const bridge = new AutoCadComBridge(async () => "");

  await assert.rejects(
    () => bridge.listLayers(5),
    /AutoCAD bridge returned no output/,
  );
});
