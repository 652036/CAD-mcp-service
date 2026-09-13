// User strings are JSON data carried as base64, never PowerShell source.
export function buildAutoCadScript(request: object): string {
  const payload = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
  return `$request = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')))\n` + String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
function Fail($code, $message) { throw ($code + ': ' + $message) }
function Get-WindowIdentity($app) {
  $handle = [long]$app.HWND
  [uint32]$ownerId = 0
  [void][CadMcpWindow]::GetWindowThreadProcessId([IntPtr]$handle, [ref]$ownerId)
  if ($ownerId -eq 0) { Fail 'TARGET_WINDOW_NOT_FOUND' 'AutoCAD window no longer exists.' }
  $owner = Get-Process -Id $ownerId
  return @{ windowHandle = [string]$handle; processId = [int]$ownerId; processStartTime = $owner.StartTime.ToUniversalTime().ToString('o') }
}
function Get-AutoCadApps {
  $known = @('AutoCAD.Application.25.1', 'AutoCAD.Application.25', 'AutoCAD.Application.24.3', 'AutoCAD.Application.24.2', 'AutoCAD.Application.24.1', 'AutoCAD.Application.24', 'AutoCAD.Application')
  $registered = @([Microsoft.Win32.Registry]::ClassesRoot.GetSubKeyNames() | Where-Object { $_ -match '^AutoCAD\.Application(\.\d+)*$' })
  $seen = @{}
  $apps = New-Object System.Collections.Generic.List[object]
  $discoveryErrors = New-Object System.Collections.Generic.List[string]
  foreach ($progId in @($registered + $known | Select-Object -Unique)) {
    try {
      $candidate = [Runtime.InteropServices.Marshal]::GetActiveObject($progId)
      $identity = Get-WindowIdentity $candidate
      if (!$seen.ContainsKey($identity.windowHandle)) {
        $seen[$identity.windowHandle] = $true
        $apps.Add(@{ app = $candidate; identity = $identity })
      }
    } catch {
      if ($_.Exception.Message -notmatch '0x800401F3') { $discoveryErrors.Add($progId + ': ' + $_.Exception.Message) }
    }
  }
  if ($apps.Count -eq 0) {
    if (@(Get-Process -Name acad -ErrorAction SilentlyContinue).Count -gt 0) {
      Fail 'AUTOCAD_UNAVAILABLE' ('AutoCAD is running but COM is unavailable. Wait for startup, close modal dialogs, and run the MCP host at the same Windows privilege level. ' + ($discoveryErrors | Select-Object -First 1))
    }
    Fail 'NO_RUNNING_AUTOCAD' 'Open desktop AutoCAD and a drawing first. This bridge does not launch or create documents automatically.'
  }
  return ,$apps
}
function Find-Document($app, $name, $target) {
  $matches = New-Object System.Collections.Generic.List[object]
  foreach ($item in $app.Documents) {
    $matchesTarget = $false
    if ($null -ne $target) {
      if ($target.documentPath) { $matchesTarget = ([string]$item.FullName -eq [string]$target.documentPath) }
      else { $matchesTarget = ([string]$item.Name -eq [string]$target.documentName) }
      if ($matchesTarget -and $target.documentWindowHandle) { $matchesTarget = ([string]$item.HWND -eq [string]$target.documentWindowHandle) }
    } else { $matchesTarget = ([string]$item.Name -eq $name -or [string]$item.FullName -eq $name) }
    if ($matchesTarget) { $matches.Add($item) }
  }
  if ($matches.Count -ne 1) { Fail 'TARGET_DOCUMENT_NOT_FOUND' 'The requested drawing is closed, renamed, or ambiguous. List documents and attach again; no other drawing was selected.' }
  return $matches[0]
}
function Get-Status($app, $doc, $identity) {
  $hasDoc = $null -ne $doc
  $active = if ($app.Documents.Count -gt 0) { $app.ActiveDocument } else { $null }
  return [pscustomobject]@{
    connected = $true; visible = [bool]$app.Visible; caption = [string]$app.Caption; version = [string]$app.Version
    windowHandle = $identity.windowHandle; processId = $identity.processId; processStartTime = $identity.processStartTime
    documentWindowHandle = if ($hasDoc) { [string]$doc.HWND } else { $null }
    documentCount = [int]$app.Documents.Count; hasDocument = $hasDoc
    documentName = if ($hasDoc) { [string]$doc.Name } else { '' }
    documentPath = if ($hasDoc) { [string]$doc.FullName } else { '' }
    activeDocumentName = if ($null -ne $active) { [string]$active.Name } else { '' }
    activeLayer = if ($hasDoc) { [string]$doc.ActiveLayer.Name } else { '' }
    layerCount = if ($hasDoc) { [int]$doc.Layers.Count } else { 0 }
    modelSpaceCount = if ($hasDoc) { [int]$doc.ModelSpace.Count } else { 0 }
    isQuiescent = [bool]$app.GetAcadState().IsQuiescent
    commandActive = if ($hasDoc) { [int]$doc.GetVariable('CMDACTIVE') } else { $null }
    bound = $null -ne $request.target
  }
}
try {
  Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class CadMcpWindow { [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId); }'
  $apps = Get-AutoCadApps
  $params = $request.params
  $target = $request.target
  if ($request.action -eq 'documents') {
    $applicationInfos = New-Object System.Collections.Generic.List[object]
    $documentInfos = New-Object System.Collections.Generic.List[object]
    foreach ($entry in $apps) {
      $app = $entry.app
      $applicationInfos.Add([pscustomobject]@{ windowHandle = $entry.identity.windowHandle; processId = $entry.identity.processId; caption = [string]$app.Caption; version = [string]$app.Version })
      foreach ($item in $app.Documents) {
        $documentInfos.Add([pscustomobject]@{ windowHandle = $entry.identity.windowHandle; processId = $entry.identity.processId; name = [string]$item.Name; path = [string]$item.FullName; active = [bool]$item.Active; readOnly = [bool]$item.ReadOnly; saved = [bool]$item.Saved })
      }
    }
    $result = @{ applications = @($applicationInfos.ToArray()); documents = @($documentInfos.ToArray()) }
  } else {
    $wantedHandle = if ($null -ne $target) { $target.windowHandle } else { $params.windowHandle }
    $choices = @($apps | Where-Object { !$wantedHandle -or $_.identity.windowHandle -eq $wantedHandle })
    if ($choices.Count -eq 0) { Fail 'TARGET_WINDOW_NOT_FOUND' 'The attached AutoCAD window is no longer reachable through COM. List documents and attach again.' }
    if ($choices.Count -gt 1) { Fail 'AMBIGUOUS_AUTOCAD' ('Multiple AutoCAD windows are reachable. Attach with windowHandle: ' + (($choices | ForEach-Object { $_.identity.windowHandle }) -join ', ')) }
    $acad = $choices[0].app
    $identity = $choices[0].identity
    if ($null -ne $target -and ($target.processId -ne $identity.processId -or $target.processStartTime -cne $identity.processStartTime)) {
      Fail 'TARGET_WINDOW_NOT_FOUND' 'AutoCAD process identity changed. Attach again before operating.'
    }
    $doc = $null
    if ($params.document) { $doc = Find-Document $acad $params.document $null }
    elseif ($null -ne $target) { $doc = Find-Document $acad $null $target }
    elseif ($acad.Documents.Count -gt 0) { $doc = $acad.ActiveDocument }
    if ($null -eq $doc -and $request.action -ne 'status') { Fail 'NO_DOCUMENT' 'AutoCAD is connected but has no open drawing. Open a drawing, then attach.' }
    switch ($request.action) {
      'status' { $result = Get-Status $acad $doc $identity }
      { $_ -in 'attach', 'activate' } {
        if ($request.action -eq 'activate' -or $params.activate) {
          if (!$acad.GetAcadState().IsQuiescent) { Fail 'AUTOCAD_BUSY' 'Finish the current command or modal dialog before switching drawings.' }
          $acad.Visible = $true
          $doc.Activate()
        }
        $result = Get-Status $acad $doc $identity
      }
      'layers' {
        $items = New-Object System.Collections.Generic.List[object]
        foreach ($layer in $doc.Layers) {
          $items.Add([pscustomobject]@{ name = [string]$layer.Name; frozen = [bool]$layer.Freeze; on = [bool]$layer.LayerOn; locked = [bool]$layer.Lock; color = [int]$layer.Color })
          if ($items.Count -ge $params.limit) { break }
        }
        $result = @($items.ToArray())
      }
      'entities' {
        $items = New-Object System.Collections.Generic.List[object]
        foreach ($entity in $doc.ModelSpace) {
          if ($params.layer -and [string]$entity.Layer -ne $params.layer) { continue }
          if ($params.objectName -and [string]$entity.ObjectName -ne $params.objectName) { continue }
          $items.Add([pscustomobject]@{ handle = [string]$entity.Handle; objectName = [string]$entity.ObjectName; layer = [string]$entity.Layer })
          if ($items.Count -ge $params.limit) { break }
        }
        $result = @($items.ToArray())
      }
      'variables' {
        $result = @{}
        foreach ($name in $params.names) { $result[$name] = $doc.GetVariable([string]$name) }
      }
      'command' {
        if ([string]$acad.ActiveDocument.HWND -ne [string]$doc.HWND) { Fail 'TARGET_NOT_ACTIVE' 'The bound drawing is not active. Use autocad_activate_document explicitly before sending commands.' }
        if (!$acad.GetAcadState().IsQuiescent -or [int]$doc.GetVariable('CMDACTIVE') -ne 0) { Fail 'AUTOCAD_BUSY' 'AutoCAD is busy or awaiting input. Finish or cancel the current command in AutoCAD before sending another.' }
        $text = [string]$params.command
        if (!$text.EndsWith([string][char]13) -and !$text.EndsWith([string][char]10)) { $text += [char]13 }
        # A mutation is submitted exactly once. Never retry after an ambiguous COM failure.
        $doc.SendCommand($text)
        $state = 'submitted'
        $idle = $null
        $commandActive = $null
        if ($params.waitForIdle) {
          $watch = [Diagnostics.Stopwatch]::StartNew()
          $state = 'timeout'
          do {
            Start-Sleep -Milliseconds 100
            try {
              $idle = [bool]$acad.GetAcadState().IsQuiescent
              $commandActive = [int]$doc.GetVariable('CMDACTIVE')
              if ($idle -and $commandActive -eq 0) { $state = 'idle_observed'; break }
            } catch { $idle = $null; $commandActive = $null }
          } while ($watch.ElapsedMilliseconds -lt $params.timeoutMs)
        }
        $result = @{ command = $params.command; documentName = [string]$doc.Name; documentPath = [string]$doc.FullName; state = $state; commandActive = $commandActive; isQuiescent = $idle }
      }
      default { Fail 'INVALID_ACTION' 'Unknown bridge action.' }
    }
  }
  ConvertTo-Json -InputObject $result -Compress -Depth 10
} catch {
  $message = $_.Exception.Message
  $code = 'AUTOCAD_ERROR'
  if ($message -match '^([A-Z_]+): (.*)$') { $code = $Matches[1]; $message = $Matches[2] }
  @{ bridgeError = @{ code = $code; message = $message } } | ConvertTo-Json -Compress -Depth 5
}
`;
}
