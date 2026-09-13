import test from "node:test";
import assert from "node:assert/strict";
import { AutoCadComBridge } from "../src/integrations/AutoCadComBridge.js";

type Request = {
  action: string;
  params: Record<string, unknown>;
  target: Record<string, unknown> | null;
};

function requestFromScript(script: string): Request {
  const match = script.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/);
  assert.ok(match, "PowerShell request must use UTF-8 JSON encoded as base64");
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

function status(documentName = "demo.dwg", windowHandle = "12345") {
  return {
    visible: true,
    caption: "AutoCAD 2024",
    version: "24.3s",
    documentName,
    documentPath: "C:/绘图/" + documentName,
    activeDocumentName: documentName,
    activeLayer: "0",
    layerCount: 35,
    modelSpaceCount: 47435,
    windowHandle,
    processId: 456,
    processStartTime: "2026-09-12T10:00:00.0000000Z",
    documentCount: 2,
    hasDocument: true,
    isQuiescent: true,
    commandActive: 0,
    bound: false,
  };
}

function bindingFor(data: ReturnType<typeof status>) {
  return {
    windowHandle: data.windowHandle,
    processId: data.processId,
    processStartTime: data.processStartTime,
    documentName: data.documentName,
    documentPath: data.documentPath,
  };
}

test("AutoCadComBridge parses status without implicitly binding the document", async () => {
  const requests: Request[] = [];
  const bridge = new AutoCadComBridge(async (script) => {
    requests.push(requestFromScript(script));
    return JSON.stringify(status());
  });

  const result = await bridge.getStatus();
  await bridge.getStatus();

  assert.equal(result.documentName, "demo.dwg");
  assert.equal(result.layerCount, 35);
  assert.equal(result.windowHandle, "12345");
  assert.deepEqual(requests.map((request) => request.target), [null, null]);
});

test("AutoCadComBridge attaches to a window/document and explicitly detaches", async () => {
  const requests: Request[] = [];
  const selected = status("设计图.dwg", "70001");
  const bridge = new AutoCadComBridge(async (script) => {
    const request = requestFromScript(script);
    requests.push(request);
    return JSON.stringify(request.action === "layers" ? [] : selected);
  });

  await bridge.attach({ windowHandle: selected.windowHandle, document: selected.documentName, activate: true });
  await bridge.listLayers(5);
  assert.deepEqual(requests[0].params, {
    windowHandle: selected.windowHandle,
    document: selected.documentName,
    activate: true,
  });
  assert.deepEqual(requests[1].target, bindingFor(selected));

  assert.deepEqual(await bridge.detach(), { detached: true });
  await bridge.getStatus();
  assert.equal(requests.length, 3, "detaching must not close a drawing or call AutoCAD");
  assert.equal(requests[2].target, null);
});

test("a failed reattach preserves the previous drawing binding", async () => {
  const requests: Request[] = [];
  const selected = status();
  const bridge = new AutoCadComBridge(async (script) => {
    const request = requestFromScript(script);
    requests.push(request);
    if (requests.length === 2) throw new Error("requested drawing is not open");
    return JSON.stringify(selected);
  });

  await bridge.attach();
  await assert.rejects(bridge.attach({ document: "missing.dwg" }), /not open/);
  await bridge.getStatus();

  assert.deepEqual(requests[2].target, bindingFor(selected));
});

test("an incomplete attach response cannot replace an existing binding", async () => {
  const requests: Request[] = [];
  const selected = status();
  const bridge = new AutoCadComBridge(async (script) => {
    requests.push(requestFromScript(script));
    return JSON.stringify(requests.length === 2 ? { ...selected, windowHandle: "" } : selected);
  });

  await bridge.attach();
  await assert.rejects(bridge.attach({ document: "other.dwg" }));
  await bridge.getStatus();

  assert.deepEqual(requests[2].target, bindingFor(selected));
});

test("document activation changes the bound drawing while preserving application identity", async () => {
  const requests: Request[] = [];
  const first = status();
  const second = { ...status("另一个图纸.dwg"), documentWindowHandle: "98002" };
  const bridge = new AutoCadComBridge(async (script) => {
    const request = requestFromScript(script);
    requests.push(request);
    return JSON.stringify(request.action === "attach" ? first : second);
  });

  await bridge.attach();
  const activated = await bridge.activateDocument(second.documentName);
  await bridge.getStatus();

  assert.equal(activated.bound, true);
  assert.deepEqual(requests[1].target, bindingFor(first));
  assert.deepEqual(requests[1].params, { document: second.documentName });
  assert.deepEqual(requests[2].target, { ...bindingFor(second), documentWindowHandle: second.documentWindowHandle });
});

test("document discovery ignores a previous binding to allow recovery from a closed target", async () => {
  const requests: Request[] = [];
  const documents = { applications: [], documents: [] };
  const bridge = new AutoCadComBridge(async (script) => {
    const request = requestFromScript(script);
    requests.push(request);
    return JSON.stringify(request.action === "attach" ? status() : documents);
  });

  await bridge.attach();
  assert.deepEqual(await bridge.listDocuments(), documents);
  assert.equal(requests[1].action, "documents");
  assert.equal(requests[1].target, null);
});

test("queued calls wait for attach and resolve the binding when they execute", async () => {
  const requests: Request[] = [];
  const selected = status("queued.dwg");
  let finishAttach!: (result: string) => void;
  const attached = new Promise<string>((resolve) => { finishAttach = resolve; });
  const bridge = new AutoCadComBridge(async (script) => {
    const request = requestFromScript(script);
    requests.push(request);
    if (request.action === "attach") return attached;
    return JSON.stringify(selected);
  });

  const pendingAttach = bridge.attach();
  const pendingStatus = bridge.getStatus();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1, "COM calls must not overlap");
  finishAttach(JSON.stringify(selected));
  await Promise.all([pendingAttach, pendingStatus]);

  assert.deepEqual(requests.map((request) => request.action), ["attach", "status"]);
  assert.deepEqual(requests[1].target, bindingFor(selected));
});

test("detach participates in the queue so later calls cannot revive a pending attachment", async () => {
  const requests: Request[] = [];
  let finishAttach!: (result: string) => void;
  const attached = new Promise<string>((resolve) => { finishAttach = resolve; });
  const bridge = new AutoCadComBridge(async (script) => {
    const request = requestFromScript(script);
    requests.push(request);
    return request.action === "attach" ? attached : JSON.stringify(status());
  });

  const pendingAttach = bridge.attach();
  const pendingDetach = bridge.detach();
  const pendingStatus = bridge.getStatus();
  finishAttach(JSON.stringify(status()));
  await Promise.all([pendingAttach, pendingDetach, pendingStatus]);

  assert.deepEqual(requests.map((request) => request.action), ["attach", "status"]);
  assert.equal(requests[1].target, null);
});

test("AutoCadComBridge preserves Chinese, quotes and newlines in command parameters", async () => {
  const command = '(princ "中文 \'quoted\'")\r\n\'@\n$(Write-Output injected)\n';
  let capturedScript = "";
  const bridge = new AutoCadComBridge(async (script) => {
    capturedScript = script;
    return JSON.stringify({ command, documentName: "设计图.dwg", completed: true });
  });

  await bridge.sendCommand(command, { waitForIdle: true, timeoutMs: 5000 });

  const request = requestFromScript(capturedScript);
  assert.equal(request.action, "command");
  assert.equal(request.params.command, command);
  assert.equal(request.params.waitForIdle, true);
  assert.equal(request.params.timeoutMs, 5000);
  assert.ok(!capturedScript.includes(command), "caller text must never be interpolated into PowerShell source");
});

test("AutoCadComBridge lists modelspace entities with encoded filters", async () => {
  let capturedScript = "";
  const layer = "地块'@\n$(test)";
  const bridge = new AutoCadComBridge(async (script) => {
    capturedScript = script;
    return JSON.stringify([
      { handle: "1A", objectName: "AcDbPolyline", layer },
      { handle: "1B", objectName: "AcDbPolyline", layer },
    ]);
  });

  const entities = await bridge.listModelSpaceEntities({ limit: 2, layer, objectName: "AcDbPolyline" });

  assert.equal(entities.length, 2);
  assert.equal(entities[0]?.layer, layer);
  assert.deepEqual(requestFromScript(capturedScript).params, { limit: 2, layer, objectName: "AcDbPolyline" });
});

test("AutoCadComBridge keeps empty collections as arrays", async () => {
  const bridge = new AutoCadComBridge(async () => "[]");
  assert.deepEqual(await bridge.listLayers(), []);
  assert.deepEqual(await bridge.listModelSpaceEntities(), []);
});

test("AutoCadComBridge reports empty and malformed output as errors", async () => {
  const empty = new AutoCadComBridge(async () => "  \r\n");
  const malformed = new AutoCadComBridge(async () => "not json");

  await assert.rejects(empty.listLayers(5), /AutoCAD bridge returned no output/);
  await assert.rejects(malformed.getStatus());
});

test("AutoCadComBridge accepts a UTF-8 BOM but rejects scalar JSON output", async () => {
  const bom = new AutoCadComBridge(async () => "\uFEFF" + JSON.stringify(status()));
  assert.equal((await bom.getStatus()).documentName, "demo.dwg");

  for (const output of ["null", "42", "true", JSON.stringify("text")]) {
    const bridge = new AutoCadComBridge(async () => output);
    await assert.rejects(bridge.getStatus(), /INVALID_BRIDGE_OUTPUT/);
  }
});

test("structured PowerShell failures reject and do not poison the next queued call", async () => {
  let callCount = 0;
  const bridge = new AutoCadComBridge(async () => {
    callCount += 1;
    return JSON.stringify(callCount === 1
      ? { bridgeError: { code: "AUTOCAD_BUSY", message: "AutoCAD is awaiting input" } }
      : status());
  });

  const failed = bridge.getStatus();
  const recovered = bridge.getStatus();
  await assert.rejects(failed, /AutoCAD is awaiting input/);
  assert.equal((await recovered).documentName, "demo.dwg");
});

test("AutoCadComBridge rejects invalid direct-call arguments before invoking PowerShell", async () => {
  let callCount = 0;
  const bridge = new AutoCadComBridge(async () => {
    callCount += 1;
    return "{}";
  });

  for (const invoke of [
    () => bridge.listLayers(0),
    () => bridge.listLayers(501),
    () => bridge.listModelSpaceEntities({ limit: 1001 }),
    () => bridge.listModelSpaceEntities({ limit: 1.5 }),
    () => bridge.sendCommand("   "),
    () => bridge.sendCommand("x".repeat(16001)),
    () => bridge.sendCommand("_.REGEN", { timeoutMs: 999 }),
    () => bridge.getVariables([]),
    () => bridge.getVariables(["CMDACTIVE; exit"]),
    () => bridge.activateDocument("   "),
  ]) {
    await assert.rejects(async () => invoke());
  }
  assert.equal(callCount, 0);
});
