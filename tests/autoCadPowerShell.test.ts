import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildAutoCadScript } from "../src/integrations/autoCadScript.js";

const execFileAsync = promisify(execFile);
const windowsOnly = { skip: process.platform !== "win32", timeout: 20000 };
const target = {
  windowHandle: "70001",
  processId: 456,
  processStartTime: "2026-09-12T10:00:00.0000000Z",
  documentName: "first.dwg",
  documentPath: "C:/cad/first.dwg",
  documentWindowHandle: "90001",
};

type Fixture = {
  noDocuments?: boolean;
  layerCount?: number;
  entityCount?: number;
  activeDocument?: "first" | "second";
  quiescent?: boolean;
  commandActive?: number;
};

async function runFakeAutoCad(
  action: string,
  params: Record<string, unknown> = {},
  boundTarget: Record<string, unknown> | null = null,
  fixture: Fixture = {},
): Promise<any> {
  const encodedFixture = Buffer.from(JSON.stringify({
    noDocuments: false, layerCount: 0, entityCount: 0,
    activeDocument: "first", quiescent: true, commandActive: 0,
    ...fixture,
  }), "utf8").toString("base64");
  const fakeDiscovery = String.raw`
  $fakeFixture = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('FIXTURE_JSON')))
  $script:fakeQuiescent = [bool]$fakeFixture.quiescent
  $script:fakeCommandActive = [int]$fakeFixture.commandActive
  $fakeLayer = [pscustomobject]@{ Name = '地块'; Freeze = $false; LayerOn = $true; Lock = $false; Color = 7 }
  $fakeEntity = [pscustomobject]@{ Handle = '1A'; ObjectName = 'AcDbPolyline'; Layer = '地块' }
  $fakeLayers = @(if ($fakeFixture.layerCount -eq 1) { $fakeLayer })
  $fakeEntities = @(if ($fakeFixture.entityCount -eq 1) { $fakeEntity })
  $fakeFirst = [pscustomobject]@{
    Name = 'first.dwg'; FullName = 'C:/cad/first.dwg'; HWND = '90001'
    Active = ($fakeFixture.activeDocument -eq 'first'); ReadOnly = $false; Saved = $true
    ActiveLayer = [pscustomobject]@{ Name = '0' }; Layers = $fakeLayers; ModelSpace = $fakeEntities
  }
  $fakeSecond = [pscustomobject]@{
    Name = 'second.dwg'; FullName = 'C:/cad/second.dwg'; HWND = '90002'
    Active = ($fakeFixture.activeDocument -eq 'second'); ReadOnly = $false; Saved = $true
    ActiveLayer = [pscustomobject]@{ Name = '0' }; Layers = @(); ModelSpace = @()
  }
  foreach ($fakeDocument in @($fakeFirst, $fakeSecond)) {
    $fakeDocument | Add-Member -MemberType ScriptMethod -Name GetVariable -Value {
      param($name)
      if ($name -eq 'CMDACTIVE') { return $script:fakeCommandActive }
      if ($name -eq 'CLAYER') { return '0' }
      throw 'Unexpected system variable in test fixture'
    }
    $fakeDocument | Add-Member -MemberType ScriptMethod -Name SendCommand -Value {
      param($command)
      throw 'TEST_SEND_COMMAND_WAS_CALLED'
    }
  }
  $fakeDocuments = if ($fakeFixture.noDocuments) { @() } else { @($fakeFirst, $fakeSecond) }
  $fakeActiveDocument = if ($fakeFixture.noDocuments) { $null } elseif ($fakeFixture.activeDocument -eq 'second') { $fakeSecond } else { $fakeFirst }
  $fakeApp = [pscustomobject]@{
    Visible = $true; Caption = 'Fake AutoCAD'; Version = '24.3'
    Documents = @($fakeDocuments); ActiveDocument = $fakeActiveDocument
  }
  $fakeApp | Add-Member -MemberType ScriptMethod -Name GetAcadState -Value {
    return [pscustomobject]@{ IsQuiescent = $script:fakeQuiescent }
  }
  $apps = @(@{
    app = $fakeApp
    identity = @{ windowHandle = '70001'; processId = 456; processStartTime = '2026-09-12T10:00:00.0000000Z' }
  })
`.replace("FIXTURE_JSON", encodedFixture);
  const generated = buildAutoCadScript({ action, params, target: boundTarget });
  const discoveryLine = "  $apps = Get-AutoCadApps";
  assert.equal(generated.split(discoveryLine).length, 2, "replace only the real COM discovery call");
  const script = generated.replace(discoveryLine, fakeDiscovery);
  const directory = await mkdtemp(path.join(tmpdir(), "cad-mcp-powershell-test-"));
  const scriptPath = path.join(directory, "fake-autocad.ps1");
  try {
    await writeFile(scriptPath, "\uFEFF" + script, "utf8");
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-STA",
      "-ExecutionPolicy", "Bypass", "-File", scriptPath,
    ], { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024, encoding: "utf8" });
    return JSON.parse(stdout.replace(/^\uFEFF/, "").trim());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("PowerShell status handles AutoCAD with zero documents and rejects document work", windowsOnly, async () => {
  const status = await runFakeAutoCad("status", {}, null, { noDocuments: true });
  assert.equal(status.connected, true);
  assert.equal(status.hasDocument, false);
  assert.equal(status.documentCount, 0);
  assert.equal(status.documentName, "");
  assert.equal(status.commandActive, null);
  assert.equal(status.layerCount, 0);
  assert.equal(status.modelSpaceCount, 0);

  const layers = await runFakeAutoCad("layers", { limit: 5 }, null, { noDocuments: true });
  assert.equal(layers.bridgeError?.code, "NO_DOCUMENT");
});

test("PowerShell layer and entity collections stay arrays for zero and one item", windowsOnly, async () => {
  for (const count of [0, 1]) {
    const fixture = { layerCount: count, entityCount: count };
    const layers = await runFakeAutoCad("layers", { limit: 5 }, null, fixture);
    const entities = await runFakeAutoCad("entities", { limit: 5 }, null, fixture);
    assert.ok(Array.isArray(layers));
    assert.ok(Array.isArray(entities));
    assert.equal(layers.length, count);
    assert.equal(entities.length, count);
    if (count) {
      assert.equal(layers[0].name, "地块");
      assert.equal(entities[0].handle, "1A");
    }
  }
});

test("PowerShell rejects stale document paths and reopened document window handles", windowsOnly, async () => {
  for (const stale of [
    { ...target, documentPath: "C:/cad/closed.dwg" },
    { ...target, documentWindowHandle: "99999" },
  ]) {
    const result = await runFakeAutoCad("layers", { limit: 5 }, stale);
    assert.equal(result.bridgeError?.code, "TARGET_DOCUMENT_NOT_FOUND");
  }
});

test("PowerShell rejects missing windows and reused process identities", windowsOnly, async () => {
  for (const stale of [
    { ...target, windowHandle: "99999" },
    { ...target, processId: 999 },
    { ...target, processStartTime: "2026-09-12T11:00:00.0000000Z" },
  ]) {
    const result = await runFakeAutoCad("status", {}, stale);
    assert.equal(result.bridgeError?.code, "TARGET_WINDOW_NOT_FOUND");
  }
});

test("PowerShell rejects a command after the user activates a different drawing", windowsOnly, async () => {
  const result = await runFakeAutoCad(
    "command",
    { command: "_.REGEN", waitForIdle: false, timeoutMs: 1000 },
    target,
    { activeDocument: "second" },
  );
  assert.equal(result.bridgeError?.code, "TARGET_NOT_ACTIVE");
  assert.ok(!result.bridgeError.message.includes("TEST_SEND_COMMAND_WAS_CALLED"));
});

test("PowerShell rejects commands when AutoCAD is busy or awaiting command input", windowsOnly, async () => {
  for (const fixture of [
    { quiescent: false, commandActive: 0 },
    { quiescent: true, commandActive: 1 },
  ]) {
    const result = await runFakeAutoCad(
      "command",
      { command: "_.REGEN", waitForIdle: false, timeoutMs: 1000 },
      target,
      fixture,
    );
    assert.equal(result.bridgeError?.code, "AUTOCAD_BUSY");
    assert.ok(!result.bridgeError.message.includes("TEST_SEND_COMMAND_WAS_CALLED"));
  }
});
