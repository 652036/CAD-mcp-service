import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "mcp.config.json");
const reportPath = path.join(root, "tmp", "mcp-autocad-live-report.json");
const expectedTools = [
  "autocad_status",
  "autocad_list_documents",
  "autocad_attach",
  "autocad_detach",
  "autocad_activate_document",
  "autocad_list_layers",
  "autocad_list_modelspace_entities",
  "autocad_get_variables",
  "autocad_send_command",
];
const variableArgs = { names: ["CMDACTIVE", "CMDNAMES", "TILEMODE", "VIEWCTR", "VIEWSIZE"] };
const requestOptions = { timeout: 60_000 };

function errorDetails(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    ...(error?.code !== undefined ? { code: error.code } : {}),
  };
}

function parsePayload(result) {
  if (result?.structuredContent) return result.structuredContent;
  const text = result?.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string") {
    return { success: false, error: "Tool did not return JSON text or structured content" };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: "Tool text content is not JSON", text };
  }
}

function isUnavailable(entry) {
  const message = String(entry?.payload?.error ?? entry?.error?.message ?? "");
  return /NO_RUNNING_AUTOCAD|AUTOCAD_UNAVAILABLE|NO_DOCUMENT|No running AutoCAD instance found|(?:only supported on|requires) Windows/i.test(message);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: node scripts/verify-autocad-mcp.mjs [--command-smoke]\nDefault: read-only inspection of the running AutoCAD document.\n--command-smoke: also activate the attached window and send (princ), waiting for idle.\nExit codes: 0 verified, 1 verification failed, 2 AutoCAD/document unavailable.");
    return;
  }

  const commandSmoke = args.includes("--command-smoke");
  const report = {
    startedAt: new Date().toISOString(),
    mode: commandSmoke ? "command-smoke" : "read-only",
    configPath,
    outcome: "failed",
    ok: false,
    expectedTools,
    calls: [],
    errors: [],
  };
  const stderr = [];
  let client;
  let transport;
  let connected = false;
  let availableTools = new Set();

  const call = async (name, toolArgs = {}) => {
    const startedAt = Date.now();
    const entry = { name, args: toolArgs, durationMs: 0, ok: false };
    try {
      const result = await client.callTool({ name, arguments: toolArgs }, undefined, requestOptions);
      entry.result = result;
      entry.payload = parsePayload(result);
      entry.ok = result.isError !== true && entry.payload?.success === true;
    } catch (error) {
      entry.error = errorDetails(error);
    }
    entry.durationMs = Date.now() - startedAt;
    entry.status = entry.ok ? "passed" : isUnavailable(entry) ? "unavailable" : "failed";
    report.calls.push(entry);
    return entry;
  };

  const skip = (name, toolArgs, reason) => {
    report.calls.push({ name, args: toolArgs, status: "skipped", ok: null, reason });
  };

  try {
    const unknownArgs = args.filter((arg) => arg !== "--command-smoke");
    if (unknownArgs.length > 0) throw new Error("Unknown arguments: " + unknownArgs.join(", "));

    const config = JSON.parse(await readFile(configPath, "utf8"));
    const server = config.mcpServers?.["cad-mcp-server"];
    if (!server || typeof server.command !== "string" || server.command.length === 0) {
      throw new Error("mcp.config.json must contain cad-mcp-server with a command");
    }
    if (server.args !== undefined && (!Array.isArray(server.args) || server.args.some((arg) => typeof arg !== "string"))) {
      throw new Error("cad-mcp-server.args must be an array of strings");
    }
    if (server.cwd !== undefined && typeof server.cwd !== "string") {
      throw new Error("cad-mcp-server.cwd must be a string");
    }
    if (server.env !== undefined && (server.env === null || typeof server.env !== "object" || Array.isArray(server.env) || Object.values(server.env).some((value) => typeof value !== "string"))) {
      throw new Error("cad-mcp-server.env must be an object with string values");
    }

    const launch = {
      command: server.command,
      args: server.args ?? [],
      cwd: path.resolve(root, server.cwd ?? "."),
      // The SDK supplies its normal inherited environment and merges these overrides.
      ...(server.env === undefined ? {} : { env: server.env }),
      stderr: "pipe",
    };
    report.runtime = {
      command: launch.command,
      args: launch.args,
      cwd: launch.cwd,
      configuredEnvironmentKeys: Object.keys(server.env ?? {}),
      environmentPolicy: "MCP SDK inherited defaults plus configured env overrides; values omitted from report",
    };

    transport = new StdioClientTransport(launch);
    transport.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk).toString("utf8")));
    client = new Client({ name: "cad-mcp-autocad-verifier", version: "2.0.0" }, { capabilities: {} });
    await client.connect(transport, requestOptions);
    connected = true;
    await client.ping(requestOptions);

    const names = [];
    let cursor;
    const seenCursors = new Set();
    do {
      const listed = await client.listTools(cursor ? { cursor } : {}, requestOptions);
      names.push(...listed.tools.map((tool) => tool.name));
      cursor = listed.nextCursor;
      if (cursor && seenCursors.has(cursor)) throw new Error("tools/list repeated a pagination cursor");
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    availableTools = new Set(names);
    const autocadTools = names.filter((name) => name.startsWith("autocad_")).sort();
    const missing = expectedTools.filter((name) => !availableTools.has(name));
    const unexpected = autocadTools.filter((name) => !expectedTools.includes(name));
    const duplicates = autocadTools.filter((name, index) => autocadTools.indexOf(name) !== index);
    report.toolInventory = { totalCount: names.length, autocadTools, missing, unexpected, duplicates };
    if (missing.length || unexpected.length || duplicates.length) {
      throw new Error("Expected exactly the 9 AutoCAD tools; missing=" + (missing.join(",") || "none") + "; unexpected=" + (unexpected.join(",") || "none") + "; duplicates=" + (duplicates.join(",") || "none"));
    }

    const status = await call("autocad_status");
    const documents = await call("autocad_list_documents");
    let ready = status.ok && documents.ok;
    const readSteps = [
      ["autocad_attach", { activate: false }],
      ["autocad_status", {}],
      ["autocad_list_layers", { limit: 20 }],
      ["autocad_list_modelspace_entities", { limit: 20 }],
      ["autocad_get_variables", variableArgs],
    ];
    for (const [name, toolArgs] of readSteps) {
      if (!ready) {
        skip(name, toolArgs, "A preceding AutoCAD inspection or attachment did not succeed");
        continue;
      }
      const entry = await call(name, toolArgs);
      ready = entry.ok;
    }

    if (commandSmoke) {
      const commandSteps = [
        ["autocad_attach", { activate: true }],
        ["autocad_send_command", { command: "(princ)", waitForIdle: true, timeoutMs: 10_000 }],
        ["autocad_get_variables", variableArgs],
      ];
      for (const [name, toolArgs] of commandSteps) {
        if (!ready) {
          skip(name, toolArgs, "Command smoke requires successful preceding inspection and attachment");
          continue;
        }
        const entry = await call(name, toolArgs);
        ready = entry.ok;
      }
    }
  } catch (error) {
    report.errors.push(errorDetails(error));
  } finally {
    // Detaching releases this verifier's binding; it does not close or save the drawing.
    if (connected && availableTools.has("autocad_detach")) await call("autocad_detach");
    try {
      await transport?.close();
    } catch (error) {
      report.errors.push({ stage: "transport.close", ...errorDetails(error) });
    }
  }

  const failed = report.errors.length > 0 || report.calls.some((entry) => entry.status === "failed");
  const unavailable = report.calls.some((entry) => entry.status === "unavailable");
  const skipped = report.calls.some((entry) => entry.status === "skipped");
  report.outcome = failed ? "failed" : unavailable ? "unavailable" : skipped || report.calls.length === 0 ? "failed" : "passed";
  report.ok = report.outcome === "passed";
  report.exitCode = report.ok ? 0 : report.outcome === "unavailable" ? 2 : 1;
  report.generatedAt = new Date().toISOString();
  report.stderr = stderr.join("").trim();
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    ok: report.ok,
    outcome: report.outcome,
    mode: report.mode,
    exitCode: report.exitCode,
    reportPath,
    runtime: report.runtime,
    toolInventory: report.toolInventory,
    calls: report.calls.map(({ result, ...entry }) => entry),
    errors: report.errors,
    stderr: report.stderr,
  }, null, 2));
  process.exitCode = report.exitCode;
}

main().catch((error) => {
  console.error(JSON.stringify({ outcome: "failed", reportPath, error: errorDetails(error) }, null, 2));
  process.exitCode = 1;
});

