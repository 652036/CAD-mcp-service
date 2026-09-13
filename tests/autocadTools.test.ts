import test from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { AUTOCAD_TOOL_NAMES, registerAutoCadTools } from "../src/tools/autocadTools.js";

type ToolDefinition = {
  inputSchema: z.ZodRawShape;
};
type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;
type Bridge = NonNullable<Parameters<typeof registerAutoCadTools>[1]>;
type BridgeMethod = keyof Bridge;

function harness(invoke: (method: BridgeMethod, args: unknown[]) => unknown) {
  const registered = new Map<string, { config: ToolDefinition; handler: ToolHandler }>();
  const bridge = Object.fromEntries([
    "getStatus", "listDocuments", "attach", "detach", "activateDocument",
    "getVariables", "listLayers", "listModelSpaceEntities", "sendCommand",
  ].map((method) => [
    method,
    async (...args: unknown[]) => invoke(method as BridgeMethod, args),
  ])) as unknown as Bridge;
  const server = {
    registerTool(name: string, config: ToolDefinition, handler: ToolHandler) {
      assert.ok(!registered.has(name), "tool names must be unique");
      registered.set(name, { config, handler });
    },
  } as unknown as McpServer;
  registerAutoCadTools(server, bridge);
  return {
    registered,
    parse(name: string, args: unknown) {
      const entry = registered.get(name);
      assert.ok(entry, "tool must be registered: " + name);
      return z.object(entry.config.inputSchema).parse(args);
    },
    async call(name: string, args: unknown = {}) {
      const entry = registered.get(name);
      assert.ok(entry, "tool must be registered: " + name);
      const parsed = z.object(entry.config.inputSchema).parse(args);
      return entry.handler(parsed);
    },
  };
}

function payload(result: CallToolResult) {
  const text = result.content.find((item) => item.type === "text");
  assert.ok(text && text.type === "text");
  return JSON.parse(text.text);
}

test("AutoCAD tools register the complete live-window lifecycle without duplicates", () => {
  const tools = harness(() => ({}));
  assert.deepEqual([...tools.registered.keys()], [...AUTOCAD_TOOL_NAMES]);
  assert.equal(tools.registered.size, 9);
  for (const name of [
    "autocad_list_documents", "autocad_attach", "autocad_detach",
    "autocad_activate_document", "autocad_get_variables",
  ]) {
    assert.ok(tools.registered.has(name));
  }
});

test("every AutoCAD bridge failure returns the MCP isError flag and a readable error", async () => {
  const tools = harness(() => { throw new Error("AutoCAD is unavailable"); });
  const args: Record<string, unknown> = {
    autocad_activate_document: { document: "demo.dwg" },
    autocad_get_variables: { names: ["CMDACTIVE"] },
    autocad_send_command: { command: "_.REGEN" },
  };

  for (const name of AUTOCAD_TOOL_NAMES) {
    const result = await tools.call(name, args[name] ?? {});
    assert.equal(result.isError, true, name);
    assert.deepEqual(payload(result), { success: false, error: "AutoCAD is unavailable" }, name);
  }
});

test("AutoCAD tools preserve raw command whitespace and forward wait options", async () => {
  const calls: Array<{ method: BridgeMethod; args: unknown[] }> = [];
  const data = { command: " _.REGEN \n", documentName: "demo.dwg", state: "idle_observed" };
  const tools = harness((method, args) => {
    calls.push({ method, args });
    return data;
  });

  const result = await tools.call("autocad_send_command", {
    command: data.command,
    waitForIdle: true,
    timeoutMs: 5000,
  });

  assert.deepEqual(calls, [{
    method: "sendCommand",
    args: [data.command, { waitForIdle: true, timeoutMs: 5000 }],
  }]);
  assert.notEqual(result.isError, true);
  assert.deepEqual(payload(result), { success: true, data });
});

test("AutoCAD tools forward document selection, variables and asynchronous detach results", async () => {
  const calls: Array<{ method: BridgeMethod; args: unknown[] }> = [];
  const tools = harness(async (method, args) => {
    calls.push({ method, args });
    await new Promise<void>((resolve) => setImmediate(resolve));
    return method === "detach" ? { detached: true } : { accepted: true };
  });

  await tools.call("autocad_attach", { windowHandle: "12345", document: "设计图.dwg", activate: true });
  await tools.call("autocad_activate_document", { document: "C:/图纸/设计图.dwg" });
  await tools.call("autocad_get_variables", { names: ["CMDACTIVE", "CLAYER"] });
  const detached = await tools.call("autocad_detach");

  assert.deepEqual(calls, [
    { method: "attach", args: [{ windowHandle: "12345", document: "设计图.dwg", activate: true }] },
    { method: "activateDocument", args: ["C:/图纸/设计图.dwg"] },
    { method: "getVariables", args: [["CMDACTIVE", "CLAYER"]] },
    { method: "detach", args: [] },
  ]);
  assert.deepEqual(payload(detached), { success: true, data: { detached: true } });
});

test("AutoCAD idle timeout is an MCP error that preserves submitted-command observations without retrying", async () => {
  let submissions = 0;
  const data = {
    command: "_.REGEN", documentName: "demo.dwg", documentPath: "C:/demo.dwg",
    state: "timeout", commandActive: 1, isQuiescent: false,
  };
  const tools = harness((method) => {
    assert.equal(method, "sendCommand");
    submissions += 1;
    return data;
  });

  const result = await tools.call("autocad_send_command", {
    command: data.command, waitForIdle: true, timeoutMs: 1000,
  });

  assert.equal(result.isError, true);
  assert.equal(payload(result).success, false);
  assert.deepEqual(payload(result).data, data);
  assert.match(payload(result).error, /AUTOCAD_IDLE_TIMEOUT/);
  assert.match(payload(result).error, /Do not resend.*before inspecting/);
  assert.equal(submissions, 1);
});

test("AutoCAD tools preserve document enumeration and layer/entity collection counts", async () => {
  const documents = {
    applications: [{ windowHandle: "12345", processId: 456 }],
    documents: [{ windowHandle: "12345", processId: 456, name: "设计图.dwg", active: true }],
  };
  const layer = { name: "0", frozen: false, on: true, locked: false, color: 7 };
  const tools = harness((method) => {
    if (method === "listDocuments") return documents;
    if (method === "listLayers") return [layer];
    if (method === "listModelSpaceEntities") return [];
    throw new Error("Unexpected method: " + method);
  });

  assert.deepEqual(payload(await tools.call("autocad_list_documents")), { success: true, data: documents });
  assert.deepEqual(payload(await tools.call("autocad_list_layers")), {
    success: true, data: { layers: [layer], count: 1 },
  });
  assert.deepEqual(payload(await tools.call("autocad_list_modelspace_entities")), {
    success: true, data: { entities: [], count: 0 },
  });
});

test("AutoCAD tool schemas reject invalid input before any bridge call", () => {
  let callCount = 0;
  const tools = harness(() => { callCount += 1; });
  const invalid: Array<[string, unknown]> = [
    ["autocad_attach", { windowHandle: " " }],
    ["autocad_attach", { windowHandle: "1".repeat(21) }],
    ["autocad_attach", { windowHandle: "0x12345" }],
    ["autocad_attach", { windowHandle: " 12345 " }],
    ["autocad_attach", { windowHandle: "-12345" }],
    ["autocad_attach", { document: " " }],
    ["autocad_activate_document", { document: "x".repeat(4097) }],
    ["autocad_list_layers", { limit: 0 }],
    ["autocad_list_layers", { limit: 501 }],
    ["autocad_list_modelspace_entities", { limit: 1001 }],
    ["autocad_list_modelspace_entities", { limit: 1.5 }],
    ["autocad_list_modelspace_entities", { layer: "x".repeat(256) }],
    ["autocad_list_modelspace_entities", { objectName: "x".repeat(257) }],
    ["autocad_get_variables", { names: [] }],
    ["autocad_get_variables", { names: Array(51).fill("CLAYER") }],
    ["autocad_get_variables", { names: ["CMDACTIVE; exit"] }],
    ["autocad_get_variables", { names: ["A".repeat(65)] }],
    ["autocad_send_command", { command: " " }],
    ["autocad_send_command", { command: "x".repeat(16001) }],
    ["autocad_send_command", { command: "_.REGEN", timeoutMs: 999 }],
    ["autocad_send_command", { command: "_.REGEN", timeoutMs: 30001 }],
  ];

  for (const [name, args] of invalid) {
    assert.throws(() => tools.parse(name, args), { name: "ZodError" });
  }
  assert.equal(callCount, 0);
  assert.equal(tools.parse("autocad_attach", { windowHandle: "1".repeat(20) }).windowHandle, "1".repeat(20));
  assert.equal(tools.parse("autocad_list_layers", { limit: 500 }).limit, 500);
  assert.equal(tools.parse("autocad_list_modelspace_entities", { limit: 1000 }).limit, 1000);
  assert.equal(tools.parse("autocad_send_command", { command: "_.REGEN", timeoutMs: 30000 }).timeoutMs, 30000);
});
