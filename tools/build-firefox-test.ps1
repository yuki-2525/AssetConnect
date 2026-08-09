$ErrorActionPreference = 'Stop'

$sourceRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $sourceRoot 'manifest.json'

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "manifest.json was not found: $manifestPath"
}

$sourceManifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = [string]$sourceManifest.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw 'The manifest version is missing.'
}

$outputPath = Join-Path $sourceRoot "AssetConnect_firefox_v.$version.zip"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("AssetConnect-firefox-" + [Guid]::NewGuid().ToString('N'))

try {
  New-Item -ItemType Directory -Path $tempRoot | Out-Null

  Get-ChildItem -LiteralPath $sourceRoot -Force | Where-Object {
    $_.Name -notin @('.git', '.github', 'docs', 'tools', '.DS_Store') -and
    $_.Name -notlike '*.git*' -and
    $_.Name -notlike '*.zip'
  } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $tempRoot -Recurse -Force
  }

  $firefoxManifest = Get-Content -Raw -LiteralPath (Join-Path $tempRoot 'manifest.json') | ConvertFrom-Json
  $firefoxManifest.background = [PSCustomObject]@{
    scripts = @('background/background.js')
  }
  if ($firefoxManifest.permissions -notcontains 'webRequestBlocking') {
    $firefoxManifest.permissions = @($firefoxManifest.permissions) + 'webRequestBlocking'
  }
  $firefoxManifest | Add-Member -NotePropertyName browser_specific_settings -NotePropertyValue ([PSCustomObject]@{
    gecko = [PSCustomObject]@{
      id = 'AssetConnect@sakurayuki.dev'
      strict_min_version = '140.0'
      data_collection_permissions = [PSCustomObject]@{
        required = @('none')
      }
    }
    gecko_android = [PSCustomObject]@{
      strict_min_version = '142.0'
    }
  }) -Force

  $manifestJson = $firefoxManifest | ConvertTo-Json -Depth 100
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText(
    (Join-Path $tempRoot 'manifest.json'),
    $manifestJson + [Environment]::NewLine,
    $utf8NoBom
  )

  if (Test-Path -LiteralPath $outputPath) {
    Remove-Item -LiteralPath $outputPath -Force
  }
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::Open(
    $outputPath,
    [System.IO.Compression.ZipArchiveMode]::Create
  )
  try {
    Get-ChildItem -LiteralPath $tempRoot -File -Recurse | ForEach-Object {
      $relativePath = $_.FullName.Substring($tempRoot.Length).TrimStart([char[]]@(92, 47))
      # ZIP entry names must use forward slashes. Firefox cannot resolve locale
      # files when they are stored with Windows path separators.
      $entryName = $relativePath -replace '\\', '/'
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive,
        $_.FullName,
        $entryName,
        [System.IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
  } finally {
    $archive.Dispose()
  }

  $archive = [System.IO.Compression.ZipFile]::OpenRead($outputPath)
  try {
    $manifestEntry = $archive.GetEntry('manifest.json')
    if (-not $manifestEntry) {
      throw 'manifest.json was not found at the ZIP root.'
    }
    $localeEntry = $archive.GetEntry("_locales/$($sourceManifest.default_locale)/messages.json")
    if (-not $localeEntry) {
      throw 'The default locale file was not found at its ZIP path.'
    }
    $reader = New-Object System.IO.StreamReader($manifestEntry.Open())
    try {
      $packagedManifest = $reader.ReadToEnd() | ConvertFrom-Json
    } finally {
      $reader.Dispose()
    }
  } finally {
    $archive.Dispose()
  }

  if (
    $packagedManifest.background.service_worker -or
    $packagedManifest.background.scripts.Count -ne 1 -or
    $packagedManifest.background.scripts[0] -ne 'background/background.js' -or
    $packagedManifest.permissions -notcontains 'webRequestBlocking' -or
    $packagedManifest.browser_specific_settings.gecko.id -ne 'AssetConnect@sakurayuki.dev' -or
    $packagedManifest.browser_specific_settings.gecko_android.strict_min_version -ne '142.0'
  ) {
    throw 'Firefox manifest validation failed.'
  }

  Write-Host 'Firefox test ZIP created:'
  Write-Host "  $outputPath"
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
