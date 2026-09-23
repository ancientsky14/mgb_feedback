<#
.SYNOPSIS
  Backs up the feedback D1 database and proves the backup by restoring it.

.DESCRIPTION
  1. Counts the rows in every table.
  2. Exports the whole database (schema and data) to a .sql file.
  3. Restores that file into a throwaway local database and counts again.
  4. Fails unless every restored count lies between the counts taken before and after the
     export (new survey responses can arrive while it runs).
  5. Keeps the newest -Keep backups and deletes older ones.

  A file nobody has restored is not a backup: a truncated export or a missing table looks
  fine until the day it is needed. This script finds out on the night it is taken.

  The backups contain personal data (email addresses given for follow-up). Keep -OutDir on
  storage the office controls, readable only by the people who administer the system: not a
  personal OneDrive, not a shared folder open to the whole office.

  You run this (or Windows Task Scheduler does, on an office PC). The app never runs it.

.PARAMETER Local
  Rehearse against the local development database instead of the deployed one.

.EXAMPLE
  powershell -File scripts/backup.ps1 -OutDir D:\feedback-backups
.EXAMPLE
  powershell -File scripts/backup.ps1 -Local
#>
param(
  [string]$Database = "feedback",
  [string]$OutDir = (Join-Path $PSScriptRoot "..\backups"),
  [int]$Keep = 30,
  [switch]$Local
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$config = Join-Path $root "db.wrangler.jsonc"
# db.wrangler.jsonc's default local state is the folder the dev servers share.
# @(...) around the whole if: a one-element array returned from `if` is unwrapped to a
# string, and splatting a string passes each character as its own argument.
[string[]]$source = @(if ($Local) { "--local" } else { "--remote" })
$tables = @(
  "divisions", "services", "instrument_versions", "service_points", "import_batches", "responses",
  "response_contacts", "legacy_tallies", "transaction_counts", "staff", "audit_log", "settings"
)

function Invoke-Count([string[]]$Target, [string]$Table) {
  $out = & npx wrangler d1 execute $Database @Target -c $config --command "SELECT count(*) AS n FROM $Table" --json 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Could not count $Table" }
  return [int](($out | Out-String | ConvertFrom-Json)[0].results[0].n)
}

function Get-Counts([string[]]$Target) {
  $counts = @{}
  foreach ($t in $tables) { $counts[$t] = Invoke-Count $Target $t }
  return $counts
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutDir "feedback-$stamp.sql"

Write-Host "Counting rows before the export..."
$before = Get-Counts $source

Write-Host "Exporting to $file ..."
& npx wrangler d1 export $Database @source -c $config --output $file
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $file) -or (Get-Item $file).Length -eq 0) { throw "Export failed or is empty" }

$after = Get-Counts $source

Write-Host "Restoring into a throwaway database to verify..."
$scratch = Join-Path ([IO.Path]::GetTempPath()) "feedback-restore-$stamp"
try {
  & npx wrangler d1 execute $Database --local --persist-to $scratch -c $config --file $file --yes | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "The backup could not be restored" }
  $problems = @()
  $restored = @{}
  foreach ($t in $tables) {
    try { $restored[$t] = Invoke-Count @("--local", "--persist-to", $scratch) $t }
    catch { $problems += "$t is missing from the restored copy"; continue }
    $r = $restored[$t]
    if ($r -lt $before[$t] -or $r -gt $after[$t]) { $problems += "$t restored $r rows, expected $($before[$t])..$($after[$t])" }
  }
  if ($problems.Count -gt 0) { throw "Backup verification FAILED:`n  " + ($problems -join "`n  ") }

  $summary = ($tables | ForEach-Object { "$_=$($restored[$_])" }) -join ", "
  Write-Host "Verified: $summary"
}
finally {
  Remove-Item -Recurse -Force $scratch -ErrorAction SilentlyContinue
}

# Keep the newest $Keep verified backups.
Get-ChildItem $OutDir -Filter "feedback-*.sql" | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item -Force
Write-Host "Backup OK: $file"
