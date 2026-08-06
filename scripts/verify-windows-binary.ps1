#Requires -Version 5.1
<#
.SYNOPSIS
    Verifies a published monodocs Windows x64 release binary on a real Windows host.

.DESCRIPTION
    PR CI builds and smoke-tests the standalone binary, and verify-published.yml exercises the
    published npm package. Neither covers the release asset itself or the long-running commands,
    so this script downloads the published binary, checks it against its .sha256, and drives the
    checks that are otherwise done by hand -- including `serve` and `watch`.

    Node.js is not required: everything runs through the binary under test.

    scripts/verify-linux-binary.sh is the Linux counterpart. They are separate scripts so that a
    host which deliberately has no Node.js does not need PowerShell installed either, and because
    the platform-specific checks differ. docs/maintenance.md records the checks both must cover.

    What this script deliberately does NOT cover, and still needs a person:
      * Browser rendering: sidebar, search interaction, dark mode, narrow-width drawer.
      * SmartScreen / Mark of the Web. Downloads here use curl.exe or Invoke-WebRequest, neither of
        which attaches a Mark of the Web, so the warning is not exercised. The binary is unsigned by
        policy (docs/roadmap.md 8.5) and the site documents the warning; see docs/status.md.
      * `serve --open`, which launches the default browser.

.PARAMETER Version
    Release to verify, with or without the leading "v" (for example v0.9.0).

.PARAMETER WorkDir
    Directory for downloads, scratch builds, and logs. Defaults to %TEMP%\monodocs-verify-<version>.
    It is kept after the run so failures can be inspected; pass -Clean to remove it on success.

.PARAMETER BinaryPath
    Verify an already downloaded binary instead of fetching it. Requires -Sha256Path.

.PARAMETER Sha256Path
    Checksum file matching -BinaryPath.

.PARAMETER NoticesPath
    NOTICES file matching -BinaryPath. Downloaded when omitted.

.PARAMETER SourcePath
    Local checkout to take examples/ from instead of downloading the tagged source archive.

.PARAMETER Port
    Port for the `serve` check. Defaults to the documented 4173.

.PARAMETER Clean
    Remove the work directory when every check passed.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\verify-windows-binary.ps1 -Version v0.9.0

.EXAMPLE
    pwsh -File .\scripts\verify-windows-binary.ps1 -Version 0.9.0 -SourcePath C:\src\monodocs -Port 4183
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$WorkDir,
    [string]$BinaryPath,
    [string]$Sha256Path,
    [string]$NoticesPath,
    [string]$SourcePath,
    [int]$Port = 4173,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Windows PowerShell 5.1 still defaults to TLS 1.0 for Invoke-WebRequest.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repository = 'kuttsun/monodocs'
$AssetName = 'monodocs-windows-x64.exe'
$NoticesName = 'monodocs-windows-x64-NOTICES.txt'
$Tag = if ($Version.StartsWith('v')) { $Version } else { "v$Version" }
$PlainVersion = $Tag.Substring(1)

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Checks = New-Object System.Collections.ArrayList
$Running = New-Object System.Collections.ArrayList
$RunIndex = 0

# --------------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------------

function Write-Section {
    param([string]$Title)
    Write-Host ''
    Write-Host "== $Title" -ForegroundColor Cyan
}

function Invoke-Check {
    param([string]$Name, [scriptblock]$Body)
    try {
        & $Body
        [void]$Checks.Add([pscustomobject]@{ Name = $Name; Status = 'PASS'; Detail = '' })
        Write-Host ("  [PASS] {0}" -f $Name) -ForegroundColor Green
    } catch {
        [void]$Checks.Add([pscustomobject]@{ Name = $Name; Status = 'FAIL'; Detail = $_.Exception.Message })
        Write-Host ("  [FAIL] {0}" -f $Name) -ForegroundColor Red
        Write-Host ("         {0}" -f $_.Exception.Message) -ForegroundColor Red
    }
}

function Assert-That {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Write-Utf8File {
    param([string]$Path, [string]$Content)
    [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

function Add-Utf8Text {
    param([string]$Path, [string]$Content)
    [System.IO.File]::AppendAllText($Path, $Content, $Utf8NoBom)
}

# Opened with FileShare.ReadWrite because the serve / watch logs are read while the process that
# writes them is still running.
function Read-Utf8File {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    try {
        $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        try {
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
            try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
        } finally { $stream.Dispose() }
    } catch [System.IO.IOException] {
        # Transient sharing violation while the writer flushes; the caller polls.
        return ''
    }
}

# Non-ASCII strings are built from code points: Windows PowerShell 5.1 reads a BOM-less .ps1 with
# the ANSI code page, which would mangle literal Japanese in this file.
function New-UnicodeString {
    param([int[]]$CodePoints)
    return [string]::Join('', [char[]]$CodePoints)
}

# Start-Process joins -ArgumentList without quoting, so paths with spaces must be quoted here.
function ConvertTo-ArgumentLine {
    param([string[]]$Arguments)
    $quoted = foreach ($argument in $Arguments) {
        if ($argument -match '\s') { '"' + $argument + '"' } else { $argument }
    }
    return ($quoted -join ' ')
}

function Get-RemoteFile {
    param([string]$Url, [string]$Destination)
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        & $curl.Path --fail --location --silent --show-error --output $Destination $Url
        if ($LASTEXITCODE -ne 0) { throw "Download failed ($LASTEXITCODE): $Url" }
    } else {
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
    }
}

# Runs the binary to completion and returns its exit code with both captured streams.
function Invoke-Bin {
    param([string[]]$Arguments, [string]$WorkingDirectory)
    $script:RunIndex++
    $outLog = Join-Path $LogDir ("run-{0:d2}.out.log" -f $script:RunIndex)
    $errLog = Join-Path $LogDir ("run-{0:d2}.err.log" -f $script:RunIndex)
    $process = Start-Process -FilePath $Bin `
        -ArgumentList (ConvertTo-ArgumentLine $Arguments) `
        -WorkingDirectory $WorkingDirectory `
        -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        StdOut   = (Read-Utf8File $outLog)
        StdErr   = (Read-Utf8File $errLog)
        OutLog   = $outLog
        ErrLog   = $errLog
    }
}

# Starts a long-running command (serve / watch) and returns a handle for polling its logs.
function Start-BinProcess {
    param([string[]]$Arguments, [string]$WorkingDirectory, [string]$Label)
    $outLog = Join-Path $LogDir "$Label.out.log"
    $errLog = Join-Path $LogDir "$Label.err.log"
    $process = Start-Process -FilePath $Bin `
        -ArgumentList (ConvertTo-ArgumentLine $Arguments) `
        -WorkingDirectory $WorkingDirectory `
        -NoNewWindow -PassThru `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    $handle = [pscustomobject]@{ Process = $process; OutLog = $outLog; ErrLog = $errLog; Label = $Label }
    [void]$Running.Add($handle)
    return $handle
}

function Stop-BinProcess {
    param($Handle)
    if ($null -eq $Handle) { return }
    if (-not $Handle.Process.HasExited) {
        Stop-Process -Id $Handle.Process.Id -Force -ErrorAction SilentlyContinue
        $Handle.Process.WaitForExit(10000) | Out-Null
    }
    $Running.Remove($Handle)
}

function Wait-Until {
    param([scriptblock]$Condition, [int]$TimeoutSec = 60, [int]$PollMs = 500, [string]$Message = 'Condition not met')
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (& $Condition) { return }
        Start-Sleep -Milliseconds $PollMs
    }
    throw "$Message (timed out after ${TimeoutSec}s)"
}

function Test-PortOpen {
    param([string]$TargetHost, [int]$TargetPort)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($TargetHost, $TargetPort, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(500)) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Get-HttpBody {
    param([string]$Url, [int]$TimeoutSec = 15)
    return (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec).Content
}

# Opens the live-reload SSE stream without a browser, so the reload broadcast itself is verifiable.
function Open-SseStream {
    param([string]$Url)
    # Needed on Windows PowerShell 5.1; already loaded on PowerShell 7.
    try { Add-Type -AssemblyName System.Net.Http -ErrorAction Stop } catch { }
    $client = New-Object System.Net.Http.HttpClient
    $client.Timeout = [TimeSpan]::FromMinutes(5)
    $response = $client.GetAsync($Url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    return [pscustomobject]@{
        Client      = $client
        Response    = $response
        Reader      = (New-Object System.IO.StreamReader($stream))
        StatusCode  = [int]$response.StatusCode
        ContentType = $response.Content.Headers.ContentType.MediaType
    }
}

function Wait-SseEvent {
    param($Stream, [string]$Pattern, [int]$TimeoutSec = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $pending = $null
    while ((Get-Date) -lt $deadline) {
        # A timed-out ReadLineAsync stays pending; keep the same task rather than starting a
        # second concurrent read on the stream.
        if ($null -eq $pending) { $pending = $Stream.Reader.ReadLineAsync() }
        if ($pending.Wait(500)) {
            $line = $pending.Result
            $pending = $null
            if ($null -eq $line) { throw 'Live reload stream closed before the reload event' }
            if ($line -like $Pattern) { return $line }
        }
    }
    throw "No '$Pattern' line on the live reload stream within ${TimeoutSec}s"
}

function Close-SseStream {
    param($Stream)
    if ($null -eq $Stream) { return }
    try { $Stream.Reader.Dispose() } catch { }
    try { $Stream.Response.Dispose() } catch { }
    try { $Stream.Client.Dispose() } catch { }
}

function New-Marker {
    param([string]$Prefix)
    return ("{0}-{1}" -f $Prefix, [guid]::NewGuid().ToString('N').Substring(0, 8))
}

# --------------------------------------------------------------------------------------------
# Setup: acquire the release asset, verify its checksum, and stage the example documents.
# Failures here are fatal -- every later check depends on them.
# --------------------------------------------------------------------------------------------

if (-not $WorkDir) { $WorkDir = Join-Path $env:TEMP "monodocs-verify-$PlainVersion" }
$WorkDir = [System.IO.Path]::GetFullPath($WorkDir)
$LogDir = Join-Path $WorkDir 'logs'
New-Item -ItemType Directory -Force -Path $WorkDir, $LogDir | Out-Null

Write-Host "monodocs $Tag - Windows x64 release binary verification" -ForegroundColor White
Write-Host "Work directory: $WorkDir"

# The point of this pass is that the release asset runs where Node.js is absent, so say it out loud
# when the host has one. It does not weaken any single check below, only what the run demonstrates.
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host 'Note: node is on PATH. The binary carries its own runtime, but a Node-free host is what this pass is meant to demonstrate.' -ForegroundColor Yellow
}

try {
    Write-Section 'Acquiring the release asset'

    $downloadBase = "https://github.com/$Repository/releases/download/$Tag"
    if ($BinaryPath) {
        Assert-That ([bool]$Sha256Path) '-BinaryPath requires -Sha256Path'
        $Bin = [System.IO.Path]::GetFullPath($BinaryPath)
        $checksumFile = [System.IO.Path]::GetFullPath($Sha256Path)
    } else {
        $Bin = Join-Path $WorkDir $AssetName
        $checksumFile = "$Bin.sha256"
        Write-Host "  Downloading $AssetName (about 130 MiB)"
        Get-RemoteFile "$downloadBase/$AssetName" $Bin
        Get-RemoteFile "$downloadBase/$AssetName.sha256" $checksumFile
    }

    if ($NoticesPath) {
        $noticesFile = [System.IO.Path]::GetFullPath($NoticesPath)
    } else {
        $noticesFile = Join-Path $WorkDir $NoticesName
        Get-RemoteFile "$downloadBase/$NoticesName" $noticesFile
    }

    # sha256sum format: "<hash>  <file name>".
    $expectedHash = ((Get-Content -LiteralPath $checksumFile -First 1) -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileHash -LiteralPath $Bin -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expectedHash -ne $actualHash) {
        throw "SHA-256 mismatch. Published: $expectedHash / downloaded: $actualHash"
    }
    Write-Host "  [PASS] SHA-256 matches the published checksum ($actualHash)" -ForegroundColor Green
    [void]$Checks.Add([pscustomobject]@{ Name = 'SHA-256 matches the published checksum'; Status = 'PASS'; Detail = '' })

    Write-Section 'Staging example documents'

    if ($SourcePath) {
        $examplesRoot = Join-Path ([System.IO.Path]::GetFullPath($SourcePath)) 'examples'
    } else {
        $archive = Join-Path $WorkDir "monodocs-$PlainVersion-source.zip"
        $extractRoot = Join-Path $WorkDir 'source'
        if (-not (Test-Path -LiteralPath $archive)) {
            Get-RemoteFile "https://github.com/$Repository/archive/refs/tags/$Tag.zip" $archive
        }
        if (Test-Path -LiteralPath $extractRoot) { Remove-Item -LiteralPath $extractRoot -Recurse -Force }
        Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot -Force
        $examplesRoot = (Get-ChildItem -LiteralPath $extractRoot -Directory | Select-Object -First 1).FullName
        $examplesRoot = Join-Path $examplesRoot 'examples'
    }
    Assert-That (Test-Path -LiteralPath (Join-Path $examplesRoot 'en')) "examples/en not found under $examplesRoot"

    # Independent copies so that the serve and watch edits cannot interfere with each other.
    $docsEn = Join-Path $WorkDir 'docs-en'
    $docsServe = Join-Path $WorkDir 'docs-serve'
    $docsWatch = Join-Path $WorkDir 'docs-watch'
    function Copy-Examples {
        param([string]$Locale, [string]$Destination)
        if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
        Copy-Item -LiteralPath (Join-Path $examplesRoot $Locale) -Destination $Destination -Recurse
    }
    Copy-Examples 'en' $docsEn
    Copy-Examples 'ja' $docsServe
    Copy-Examples 'ja' $docsWatch
    Write-Host '  Staged docs-en / docs-serve / docs-watch'

    # --------------------------------------------------------------------------------------------
    # Checks. Each one is recorded and the run continues, so a single pass reports everything.
    # --------------------------------------------------------------------------------------------

    Write-Section 'Basic commands'

    Invoke-Check "--version reports $PlainVersion" {
        $result = Invoke-Bin @('--version') $WorkDir
        Assert-That ($result.ExitCode -eq 0) "Exit code $($result.ExitCode)"
        Assert-That ($result.StdOut.Trim() -eq $PlainVersion) "Reported '$($result.StdOut.Trim())'"
    }

    Invoke-Check '--help lists build / watch / serve / validate' {
        $result = Invoke-Bin @('--help') $WorkDir
        Assert-That ($result.ExitCode -eq 0) "Exit code $($result.ExitCode)"
        foreach ($command in @('build', 'watch', 'serve', 'validate')) {
            Assert-That ($result.StdOut -match "(?m)^\s+$command\b") "Missing '$command' in help output"
        }
    }

    Invoke-Check 'validate reports no issues for examples/en' {
        $result = Invoke-Bin @('validate', $docsEn) $WorkDir
        Assert-That ($result.ExitCode -eq 0) "Exit code $($result.ExitCode): $($result.StdErr)"
        Assert-That ($result.StdOut -match 'No issues found') "Unexpected output: $($result.StdOut)"
    }

    Write-Section 'Build output'

    $defaultBuildDir = Join-Path $WorkDir 'build-default'
    New-Item -ItemType Directory -Force -Path $defaultBuildDir | Out-Null
    $defaultOutput = Join-Path $defaultBuildDir 'dist\docs.html'

    Invoke-Check 'build without -o writes dist\docs.html' {
        $result = Invoke-Bin @('build', $docsEn) $defaultBuildDir
        Assert-That ($result.ExitCode -eq 0) "Exit code $($result.ExitCode): $($result.StdErr)"
        Assert-That (Test-Path -LiteralPath $defaultOutput) 'dist\docs.html was not created'
        # 0.9.0 renamed the default output; make sure the old name is really gone.
        Assert-That (-not (Test-Path -LiteralPath (Join-Path $defaultBuildDir 'dist\manual.html'))) 'dist\manual.html was created'
    }

    Invoke-Check 'HTML output is self-contained' {
        $html = Read-Utf8File $defaultOutput
        Assert-That ($html -match '__MONODOCS_DATA__') 'Embedded document payload not found'
        Assert-That ($html -match 'data-route') 'No pages were rendered'
        Assert-That (-not ($html -match 'src="https?://')) 'External asset reference found'
    }

    # Path handling is the one area where Windows can differ from the Linux binary that was already
    # verified, so this exercises spaces plus non-ASCII in both the directory and the file name.
    Invoke-Check 'build succeeds from a path with spaces and Japanese characters' {
        $awkwardDir = Join-Path $WorkDir ((New-UnicodeString @(0x691C, 0x8A3C)) + ' ' + (New-UnicodeString @(0x30C7, 0x30A3, 0x30EC, 0x30AF, 0x30C8, 0x30EA)))
        $awkwardFile = Join-Path $awkwardDir ((New-UnicodeString @(0x51FA, 0x529B)) + ' docs.html')
        New-Item -ItemType Directory -Force -Path $awkwardDir | Out-Null
        $result = Invoke-Bin @('build', $docsEn, '-o', $awkwardFile) $awkwardDir
        Assert-That ($result.ExitCode -eq 0) "Exit code $($result.ExitCode): $($result.StdErr)"
        Assert-That (Test-Path -LiteralPath $awkwardFile) 'Output file was not created'
    }

    Write-Section 'Browser-dependent features fail as designed'

    Invoke-Check 'PDF output fails and points at the npm build' {
        $pdfDir = Join-Path $WorkDir 'build-pdf'
        New-Item -ItemType Directory -Force -Path $pdfDir | Out-Null
        $pdfPath = Join-Path $pdfDir 'docs.pdf'
        $result = Invoke-Bin @('build', $docsEn, '--format', 'pdf', '-o', $pdfPath) $pdfDir
        Assert-That ($result.ExitCode -ne 0) 'The binary produced a PDF instead of failing'
        Assert-That (-not (Test-Path -LiteralPath $pdfPath)) 'A PDF file was written'
        # Matched on ASCII so the assertion does not depend on the console code page. The
        # standalone branch of the message must win: users of the binary have no Node.js.
        Assert-That ($result.StdErr -match 'npm install -g monodocs') "Unexpected message: $($result.StdErr)"
        Assert-That (-not ($result.StdErr -match 'pnpm add puppeteer-core')) 'Got the npm-package guidance, not the standalone one'
    }

    Invoke-Check 'Mermaid pre-render fails and points at the npm build' {
        $preRenderDir = Join-Path $WorkDir 'build-prerender'
        New-Item -ItemType Directory -Force -Path $preRenderDir | Out-Null
        $configPath = Join-Path $preRenderDir 'pre-render.yml'
        Write-Utf8File $configPath "mermaid:`n  mode: pre-render`n"
        $result = Invoke-Bin @('build', $docsEn, '-c', $configPath, '-o', (Join-Path $preRenderDir 'pre.html')) $preRenderDir
        Assert-That ($result.ExitCode -ne 0) 'Pre-render succeeded without a browser'
        Assert-That ($result.StdErr -match 'npm install -g monodocs') "Unexpected message: $($result.StdErr)"
    }

    Write-Section 'Redistribution notices'

    Invoke-Check 'NOTICES covers monodocs, the Node.js runtime, and dependencies' {
        $notices = Read-Utf8File $noticesFile
        foreach ($needle in @('MIT License', 'Node.js runtime', 'Components:')) {
            Assert-That ($notices -match [regex]::Escape($needle)) "Missing '$needle'"
        }
        $unknownEntry = (New-UnicodeString @(0x2014)) + '  UNKNOWN'
        Assert-That (-not ($notices -match [regex]::Escape($unknownEntry))) 'Unresolved license entry found'
    }

    Write-Section 'serve (long-running; out of scope for verify-published.yml)'

    $serveDir = Join-Path $WorkDir 'serve'
    New-Item -ItemType Directory -Force -Path $serveDir | Out-Null
    $serveUrl = "http://127.0.0.1:$Port/"
    $serveHandle = $null
    $sse = $null
    try {
        Invoke-Check "serve starts on port $Port and injects live reload" {
            Assert-That (-not (Test-PortOpen '127.0.0.1' $Port)) "Port $Port is already in use; rerun with -Port"
            $script:serveHandle = Start-BinProcess @('serve', $docsServe, '-p', "$Port") $serveDir 'serve'
            Wait-Until -TimeoutSec 90 -Message 'serve did not start listening' -Condition {
                (Read-Utf8File $script:serveHandle.OutLog) -match 'Serving at' -and (Test-PortOpen '127.0.0.1' $Port)
            }
            $body = Get-HttpBody $serveUrl
            Assert-That ($body -match '__MONODOCS_DATA__') 'Served page has no document payload'
            Assert-That ($body -match 'EventSource') 'Live reload script was not injected'
            Assert-That ($body -match '__monodocs-livereload') 'Live reload endpoint not referenced'
        }

        Invoke-Check 'live reload broadcasts a rebuild over SSE and serves the new content' {
            Assert-That ($null -ne $script:serveHandle) 'serve is not running'
            $script:sse = Open-SseStream ($serveUrl + '__monodocs-livereload')
            Assert-That ($script:sse.StatusCode -eq 200) "Live reload endpoint returned $($script:sse.StatusCode)"
            Assert-That ($script:sse.ContentType -eq 'text/event-stream') "Content-Type was $($script:sse.ContentType)"

            $marker = New-Marker 'MONODOCS-SERVE'
            Add-Utf8Text (Join-Path $docsServe 'index.md') "`n`n## $marker`n"
            Wait-SseEvent $script:sse 'data: reload*' 90 | Out-Null

            Wait-Until -TimeoutSec 30 -Message 'Served page never picked up the edit' -Condition {
                try { (Get-HttpBody $serveUrl) -match $marker } catch { $false }
            }
            Assert-That ((Read-Utf8File $script:serveHandle.OutLog) -match 'Rebuilt') 'No rebuild was reported on stdout'
        }

        Invoke-Check 'serve releases the port when it stops' {
            Close-SseStream $script:sse
            $script:sse = $null
            Stop-BinProcess $script:serveHandle
            $script:serveHandle = $null
            Wait-Until -TimeoutSec 15 -Message "Port $Port stayed open" -Condition { -not (Test-PortOpen '127.0.0.1' $Port) }
        }
    } finally {
        Close-SseStream $sse
        Stop-BinProcess $serveHandle
    }

    Write-Section 'watch (long-running; out of scope for verify-published.yml)'

    $watchDir = Join-Path $WorkDir 'watch'
    New-Item -ItemType Directory -Force -Path $watchDir | Out-Null
    $watchOutput = Join-Path $watchDir 'out\watch.html'
    $watchHandle = $null
    try {
        Invoke-Check 'watch performs the initial build and keeps watching' {
            $script:watchHandle = Start-BinProcess @('watch', $docsWatch, '-o', $watchOutput) $watchDir 'watch'
            Wait-Until -TimeoutSec 90 -Message 'watch did not produce its initial build' -Condition {
                (Test-Path -LiteralPath $watchOutput) -and ((Read-Utf8File $script:watchHandle.OutLog) -match 'Watching for changes')
            }
            Assert-That ((Read-Utf8File $script:watchHandle.OutLog) -match 'Generated') 'No build summary was reported'
        }

        Invoke-Check 'watch rebuilds after a source edit' {
            Assert-That ($null -ne $script:watchHandle) 'watch is not running'
            $marker = New-Marker 'MONODOCS-WATCH'
            Add-Utf8Text (Join-Path $docsWatch 'index.md') "`n`n## $marker`n"
            Wait-Until -TimeoutSec 90 -Message 'Output file never picked up the edit' -Condition {
                (Read-Utf8File $watchOutput) -match $marker
            }
        }

        Invoke-Check 'watch stops on request' {
            Stop-BinProcess $script:watchHandle
            $script:watchHandle = $null
        }
    } finally {
        Stop-BinProcess $watchHandle
    }
} finally {
    foreach ($handle in @($Running.ToArray())) { Stop-BinProcess $handle }
}

# --------------------------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------------------------

Write-Section 'Summary'
$Checks | Format-Table -AutoSize -Property Status, Name, Detail | Out-String | Write-Host
$failed = @($Checks | Where-Object { $_.Status -eq 'FAIL' })
Write-Host ("{0} passed, {1} failed" -f ($Checks.Count - $failed.Count), $failed.Count)

Write-Host ''
Write-Host 'Still to check by hand:' -ForegroundColor Yellow
Write-Host ("  1. Open {0} in a browser: sidebar, previous/next" -f (Join-Path $WorkDir 'build-default\dist\docs.html'))
Write-Host '     navigation, search (kana folding, highlighting, arrow keys and Enter), dark mode,'
Write-Host '     and the drawer at a narrow window width.'
Write-Host '  2. SmartScreen / Mark of the Web, which downloads from this script never attach.'
Write-Host '     The binary is unsigned by policy, so a warning is expected; see docs/status.md.'
Write-Host '  3. serve --open, which launches the default browser.'

if ($failed.Count -eq 0 -and $Clean) {
    Remove-Item -LiteralPath $WorkDir -Recurse -Force
    Write-Host ''
    Write-Host "Removed $WorkDir"
} else {
    Write-Host ''
    Write-Host "Logs and build outputs: $WorkDir"
}

exit ([int]($failed.Count -gt 0))
