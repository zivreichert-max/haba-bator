# Fallback for the GitHub Actions schedule: run the poll update from this computer and push the change.
# Only for the case where GitHub's servers are blocked by the sources. Not registered by default; see README.
$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
New-Item -ItemType Directory -Force "$repo\logs" | Out-Null
$log = "$repo\logs\update-polls.log"

$today = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, "Israel Standard Time").ToString("yyyy-MM-dd")
if ($today -gt "2026-10-27") { "$(Get-Date -Format s) election day passed, skipping" | Add-Content $log; exit 0 }

"===== $(Get-Date -Format s)" | Add-Content $log
node scripts/update-polls.mjs *>> $log
$code = $LASTEXITCODE

git add data/polls.js
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "polls: local automatic update $(Get-Date -Format 'd.M.yyyy HH:mm')" *>> $log
  git push *>> $log
}
exit $code
