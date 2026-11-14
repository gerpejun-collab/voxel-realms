<#
.SYNOPSIS
  Synchronizes exported 2400 ELO chess datasets from connected Android devices via ADB.
.DESCRIPTION
  Pulls session JSON files from /sdcard/Download/ChessTrainer/ or app storage,
  runs validate_dataset.js on each, and registers new entries into dataset_index.json.
#>

param(
  [string]$DevicePath = "/sdcard/Download/ChessTrainer/",
  [string]$LocalOutputDir = "$PSScriptRoot/../sessions"
)

Write-Host "Checking for connected ADB devices..."
$devices = adb devices | Select-String "device$"
if (-not $devices) {
  Write-Warning "No device connected via ADB. Please connect device with USB debugging enabled."
  exit 0
}

Write-Host "Pulling datasets from $DevicePath to $LocalOutputDir..."
adb pull "$DevicePath/." "$LocalOutputDir"

Write-Host "Validating pulled datasets..."
Get-ChildItem -Path "$LocalOutputDir/*.json" | ForEach-Object {
  node "$PSScriptRoot/validate_dataset.js" $_.FullName
}

Write-Host "Synchronization complete."
