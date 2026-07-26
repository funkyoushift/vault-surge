param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$sourceRoot = Join-Path $ProjectRoot "sdk-mod"
$modFolder = Join-Path $sourceRoot "VaultSurge"
$outputRoot = Join-Path $ProjectRoot "build\sdk-mod"
$sdkmodPath = Join-Path $outputRoot "VaultSurge.sdkmod"

if (-not (Test-Path -LiteralPath $modFolder -PathType Container)) {
    throw "SDK mod source folder was not found: $modFolder"
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
if (Test-Path -LiteralPath $sdkmodPath) {
    Remove-Item -LiteralPath $sdkmodPath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archiveStream = [System.IO.File]::Open(
    $sdkmodPath,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write
)
try {
    $archive = New-Object System.IO.Compression.ZipArchive(
        $archiveStream,
        [System.IO.Compression.ZipArchiveMode]::Create,
        $false
    )
    try {
        Get-ChildItem -LiteralPath $modFolder -Recurse -File |
            Where-Object {
                $_.FullName -notmatch '[\\/]+__pycache__[\\/]' -and
                $_.Extension -ne '.pyc'
            } |
            ForEach-Object {
                $relative = $_.FullName.Substring($sourceRoot.Length + 1).Replace('\', '/')
                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive,
                    $_.FullName,
                    $relative,
                    [System.IO.Compression.CompressionLevel]::Optimal
                ) | Out-Null
            }
    }
    finally {
        $archive.Dispose()
    }
}
finally {
    $archiveStream.Dispose()
}

Write-Host "Built $sdkmodPath"
