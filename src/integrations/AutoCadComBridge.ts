import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildAutoCadScript } from "./autoCadScript.js";

const execFileAsync = promisify(execFile);

export type AutoCadStatus = {
  connected: boolean;
  visible: boolean;
  caption?: string;
  version?: string;
  windowHandle: string;
  processId: number;
  processStartTime: string;
  documentWindowHandle?: string;
  documentCount: number;
  hasDocument: boolean;
  documentName: string;
  documentPath: string;
  activeDocumentName: string;
  activeLayer: string;
  layerCount: number;
  modelSpaceCount: number;
  isQuiescent: boolean;
  commandActive: number | null;
  bound: boolean;
};

export type AutoCadTarget = Pick<AutoCadStatus,
  "windowHandle" | "processId" | "processStartTime" | "documentWindowHandle" | "documentName" | "documentPath">;
export type AutoCadAttachOptions = { windowHandle?: string; document?: string; activate?: boolean };
export type AutoCadCommandOptions = { waitForIdle?: boolean; timeoutMs?: number };
export type AutoCadLayerInfo = { name: string; frozen: boolean; on: boolean; locked: boolean; color: number | null };
export type AutoCadEntityInfo = { handle: string; objectName: string; layer: string };
export type AutoCadListEntitiesFilter = { limit?: number; layer?: string; objectName?: string };
export type AutoCadDocumentInfo = {
  windowHandle: string; processId: number; name: string; path: string;
  active: boolean; readOnly: boolean; saved: boolean;
};
export type AutoCadDocuments = {
  applications: Array<{ windowHandle: string; processId: number; caption: string; version: string }>;
  documents: AutoCadDocumentInfo[];
};
export type AutoCadCommandResult = {
  command: string; documentName: string; documentPath: string;
  state: "submitted" | "idle_observed" | "timeout";
  commandActive: number | null; isQuiescent: boolean | null;
};
export type PowerShellRunner = (script: string) => Promise<string>;

async function defaultRunner(script: string): Promise<string> {
  if (process.platform !== "win32") throw new Error("WINDOWS_REQUIRED: AutoCAD COM requires Windows.");
  // A private temporary script avoids Windows command-line length limits and shell quoting.
  const directory = await mkdtemp(path.join(tmpdir(), "cad-mcp-"));
  const file = path.join(directory, "bridge.ps1");
  try {
    await writeFile(file, "\uFEFF" + script, "utf8");
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File", file,
    ], { windowsHide: true, timeout: 45000, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" });
    return stdout;
  } catch (error) {
    const failure = error as { killed?: boolean; stderr?: string; message?: string };
    if (failure.killed) {
      throw new Error("BRIDGE_TIMEOUT: AutoCAD did not respond within 45 seconds. A submitted command may still be running; inspect its result before retrying.");
    }
    throw new Error(`POWERSHELL_FAILED: ${failure.stderr?.trim() || failure.message || String(error)}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function nonempty(value: string | undefined, name: string, max = 1024): void {
  if (value !== undefined && (!value.trim() || value.length > max || value.includes("\0"))) {
    throw new Error(`INVALID_ARGUMENT: ${name} must contain 1..${max} characters and no NUL.`);
  }
}

export class AutoCadComBridge {
  private target: AutoCadTarget | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly runner: PowerShellRunner = defaultRunner) {}

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  getStatus(): Promise<AutoCadStatus> { return this.enqueue(() => this.runJson("status")); }

  listDocuments(): Promise<AutoCadDocuments> {
    // Discovery also works when a previous attachment has gone stale.
    return this.enqueue(() => this.runJson("documents", {}, null));
  }

  attach(options: AutoCadAttachOptions = {}): Promise<AutoCadStatus> {
    return this.enqueue(async () => {
      nonempty(options.document, "document", 4096);
      if (options.windowHandle !== undefined && !/^\d{1,20}$/.test(options.windowHandle)) {
        throw new Error("INVALID_ARGUMENT: windowHandle must be a decimal HWND from autocad_list_documents.");
      }
      const status = await this.runJson<AutoCadStatus>("attach", { ...options, activate: options.activate ?? true }, null);
      this.bind(status);
      return { ...status, bound: true };
    });
  }

  detach(): Promise<{ detached: true }> {
    return this.enqueue(async () => { this.target = null; return { detached: true }; });
  }

  activateDocument(document: string): Promise<AutoCadStatus> {
    return this.enqueue(async () => {
      nonempty(document, "document", 4096);
      const status = await this.runJson<AutoCadStatus>("activate", { document });
      this.bind(status);
      return { ...status, bound: true };
    });
  }

  getVariables(names: string[]): Promise<Record<string, unknown>> {
    return this.enqueue(() => {
      if (!names.length || names.length > 50 || names.some(name => !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name))) {
        throw new Error("INVALID_ARGUMENT: Supply 1..50 valid AutoCAD system variable names.");
      }
      return this.runJson("variables", { names });
    });
  }

  listLayers(limit = 500): Promise<AutoCadLayerInfo[]> {
    return this.enqueue(() => {
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("INVALID_ARGUMENT: limit must be 1..500.");
      return this.runJson("layers", { limit });
    });
  }

  listModelSpaceEntities(filter: AutoCadListEntitiesFilter = {}): Promise<AutoCadEntityInfo[]> {
    return this.enqueue(() => {
      const limit = filter.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("INVALID_ARGUMENT: limit must be 1..1000.");
      nonempty(filter.layer, "layer", 255);
      nonempty(filter.objectName, "objectName", 256);
      return this.runJson("entities", { ...filter, limit });
    });
  }

  sendCommand(command: string, options: AutoCadCommandOptions = {}): Promise<AutoCadCommandResult> {
    return this.enqueue(() => {
      nonempty(command, "command", 16000);
      const timeoutMs = options.timeoutMs ?? 10000;
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
        throw new Error("INVALID_ARGUMENT: timeoutMs must be 1000..30000.");
      }
      return this.runJson("command", { command, waitForIdle: options.waitForIdle ?? false, timeoutMs });
    });
  }

  private bind(status: AutoCadStatus): void {
    if (!status.windowHandle || !Number.isInteger(status.processId) || status.processId <= 0 ||
        !status.processStartTime || !status.hasDocument || !status.documentName) {
      throw new Error("INVALID_ATTACHMENT: AutoCAD did not return a complete window and document identity.");
    }
    this.target = {
      windowHandle: status.windowHandle, processId: status.processId, processStartTime: status.processStartTime,
      documentName: status.documentName, documentPath: status.documentPath,
      ...(status.documentWindowHandle ? { documentWindowHandle: status.documentWindowHandle } : {}),
    };
  }

  private async runJson<T>(action: string, params: object = {}, target = this.target): Promise<T> {
    const output = (await this.runner(buildAutoCadScript({ action, params, target }))).replace(/^\uFEFF/, "").trim();
    if (!output) throw new Error("AutoCAD bridge returned no output");
    let result: unknown;
    try { result = JSON.parse(output); }
    catch { throw new Error("INVALID_BRIDGE_OUTPUT: AutoCAD bridge returned malformed JSON."); }
    if (result === null || typeof result !== "object") throw new Error("INVALID_BRIDGE_OUTPUT: Expected an object or array.");
    if ("bridgeError" in result) {
      const failure = result.bridgeError as { code?: string; message?: string };
      throw new Error(`${failure.code ?? "AUTOCAD_ERROR"}: ${failure.message ?? "Unknown COM error"}`);
    }
    return result as T;
  }
}
