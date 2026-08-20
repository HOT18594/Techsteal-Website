# Deploy script: pushes env vars to the Vercel project, then deploys to production.
# Reads the token from .vercel-token (or VERCEL_TOKEN env var) — never typed inline.
$ErrorActionPreference = "Stop"

$token = $env:VERCEL_TOKEN
if (-not $token -and (Test-Path ".vercel-token")) {
  $token = (Get-Content ".vercel-token" -Raw).Trim()
}
if (-not $token) {
  Write-Error "No token: set VERCEL_TOKEN or create a .vercel-token file."
}

Write-Host "==> Applying env vars to Vercel..."
node scripts/apply-vercel-env.mjs
if ($LASTEXITCODE -ne 0) { throw "apply-vercel-env failed" }

Write-Host "==> Deploying to production..."
& npx --yes vercel deploy --prod --token $token
exit $LASTEXITCODE