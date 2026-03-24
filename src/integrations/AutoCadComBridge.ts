import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_PROG_IDS = [
  "AutoCAD.Application.24.3",
  "AutoCAD.Application.24.2",
  "AutoCAD.Application.24.1",
  "AutoCAD.Application.24",
  "AutoCAD.Application",
] as const;

export type AutoCadStatus = {
  visible: boolean;
  caption?: string;
  version?: string;
  documentName: string;
  documentPath: string;
  activeLayer: string;
  layerCount: number;
  modelSpaceCount: number;
};

export type AutoCadLayerInfo = {
  name: string;
  frozen: boolean;
  on: boolean;
  locked: boolean;
  color: number | null;
};

export type AutoCadEntityInfo = {
  handle: string;
  objectName: string;
  layer: string;
};

export type AutoCadListEntitiesFilter = {
  limit?: number;
  layer?: string;
  objectName?: string;
};

export type PowerShellRunner = (script: string) => Promise<string>;

function buildHereString(value: string): string {
  return `@'\n${value}\n'@`;
}

function buildBootstrapScript(): string {
  const progIds = DEFAULT_PROG_IDS.map((id) => `'${id}'`).join(", ");
  return [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "function Get-AutoCadApp {",
    `  $progIds = @(${progIds})`,
    "  foreach ($progId in $progIds) {",
    "    try {",
    "      $app = [Runtime.InteropServices.Marshal]::GetActiveObject($progId)",
    "      if ($null -ne $app) { return $app }",
    "    } catch {",
    "    }",
    "  }",
    "  throw 'No running AutoCAD instance found.'",
    "}",
    "$acad = Get-AutoCadApp",
    "$doc = $acad.ActiveDocument",
  ].join("\n");
}

function defaultRunner(script: string): Promise<string> {
  return execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    {
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  ).then(({ stdout }) => stdout);
}

export class AutoCadComBridge {
  constructor(private readonly runner: PowerShellRunner = defaultRunner) {}

  async getStatus(): Promise<AutoCadStatus> {
    return this.runJson<AutoCadStatus>([
      "$result = [pscustomobject]@{",
      "  visible = [bool]$acad.Visible",
      "  caption = if ($null -ne $acad.Caption) { [string]$acad.Caption } else { $null }",
      "  version = if ($null -ne $acad.Version) { [string]$acad.Version } else { $null }",
      "  documentName = [string]$doc.Name",
      "  documentPath = [string]$doc.FullName",
      "  activeLayer = [string]$doc.ActiveLayer.Name",
      "  layerCount = [int]$doc.Layers.Count",
      "  modelSpaceCount = [int]$doc.ModelSpace.Count",
      "}",
    ].join("\n"));
  }

  async listLayers(limit?: number): Promise<AutoCadLayerInfo[]> {
    const paramsJson = JSON.stringify({ limit: limit ?? null });
    return this.runJson<AutoCadLayerInfo[]>([
      `$params = ConvertFrom-Json ${buildHereString(paramsJson)}`,
      "$result = New-Object System.Collections.Generic.List[object]",
      "foreach ($layer in $doc.Layers) {",
      "  $result.Add([pscustomobject]@{",
      "    name = [string]$layer.Name",
      "    frozen = [bool]$layer.Freeze",
      "    on = [bool]$layer.LayerOn",
      "    locked = [bool]$layer.Lock",
      "    color = if ($null -ne $layer.Color) { [int]$layer.Color } else { $null }",
      "  })",
      "  if ($null -ne $params.limit -and $result.Count -ge [int]$params.limit) { break }",
      "}",
    ].join("\n"));
  }

  async listModelSpaceEntities(
    filter: AutoCadListEntitiesFilter = {},
  ): Promise<AutoCadEntityInfo[]> {
    const paramsJson = JSON.stringify({
      limit: filter.limit ?? 50,
      layer: filter.layer ?? null,
      objectName: filter.objectName ?? null,
    });
    return this.runJson<AutoCadEntityInfo[]>([
      `$params = ConvertFrom-Json ${buildHereString(paramsJson)}`,
      "$result = New-Object System.Collections.Generic.List[object]",
      "foreach ($entity in $doc.ModelSpace) {",
      "  if ($null -ne $params.layer -and [string]$entity.Layer -ne [string]$params.layer) { continue }",
      "  if ($null -ne $params.objectName -and [string]$entity.ObjectName -ne [string]$params.objectName) { continue }",
      "  $result.Add([pscustomobject]@{",
      "    handle = [string]$entity.Handle",
      "    objectName = [string]$entity.ObjectName",
      "    layer = [string]$entity.Layer",
      "  })",
      "  if ($result.Count -ge [int]$params.limit) { break }",
      "}",
    ].join("\n"));
  }

  async sendCommand(command: string): Promise<{ command: string; documentName: string }> {
    const paramsJson = JSON.stringify({ command });
    return this.runJson<{ command: string; documentName: string }>([
      `$params = ConvertFrom-Json ${buildHereString(paramsJson)}`,
      "$doc.SendCommand([string]$params.command + [Environment]::NewLine)",
      "$result = [pscustomobject]@{",
      "  command = [string]$params.command",
      "  documentName = [string]$doc.Name",
      "}",
    ].join("\n"));
  }

  private async runJson<T>(body: string): Promise<T> {
    const script = [
      buildBootstrapScript(),
      body,
      "$result | ConvertTo-Json -Compress -Depth 8",
    ].join("\n");
    const output = await this.runner(script);
    const text = output.trim();
    if (text === "") {
      throw new Error("AutoCAD bridge returned no output");
    }
    return JSON.parse(text) as T;
  }
}
