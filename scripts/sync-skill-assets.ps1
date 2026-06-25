# Sync data/ and scripts/ from src/ui-ux-pro-max/ into .claude/skills/ui-ux-pro-max/.
#
# Run this whenever data/*.csv or scripts/*.py change in the source of truth
# (src/ui-ux-pro-max/). The skill ships these as real file copies — not symlinks —
# so the plugin works on Windows clones (where git checkout drops symlinks).
#
# Usage:
#   pwsh scripts/sync-skill-assets.ps1

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Src = Join-Path $RepoRoot 'src/ui-ux-pro-max'
$Dst = Join-Path $RepoRoot '.claude/skills/ui-ux-pro-max'

if (-not (Test-Path (Join-Path $Src 'data')) -or -not (Test-Path (Join-Path $Src 'scripts'))) {
    Write-Error "Source dirs missing at $Src"
    exit 1
}

Write-Host "Syncing data/    -> $Dst\data"
if (Test-Path (Join-Path $Dst 'data')) { Remove-Item -Recurse -Force (Join-Path $Dst 'data') }
Copy-Item -Recurse (Join-Path $Src 'data') (Join-Path $Dst 'data')

Write-Host "Syncing scripts/ -> $Dst\scripts"
if (Test-Path (Join-Path $Dst 'scripts')) { Remove-Item -Recurse -Force (Join-Path $Dst 'scripts') }
Copy-Item -Recurse (Join-Path $Src 'scripts') (Join-Path $Dst 'scripts')

# Drop Python caches that may have been copied along
Get-ChildItem -Recurse -Force -Directory -Path (Join-Path $Dst 'scripts') -Filter '__pycache__' -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item -Recurse -Force $_.FullName }

Write-Host "Done. Stage changes with: git add .claude/skills/ui-ux-pro-max/"
