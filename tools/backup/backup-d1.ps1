param(
  [string]$DatabaseName = 'ai-trainer',
  [string]$OutputDirectory
)

. (Join-Path $PSScriptRoot 'backup-common.ps1')

$root = Get-AiTrainerRepositoryRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root 'backups' }
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null

$node = Get-AiTrainerNode
$wrangler = Get-AiTrainerWrangler
$wranglerConfig = Join-Path $root 'apps\bot-worker\wrangler.jsonc'
$crypto = Join-Path $PSScriptRoot 'backup-crypto.mjs'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $OutputDirectory "ai-trainer-$stamp.aitbackup"
$checksumPath = "$backupPath.sha256"
$temporarySql = Join-Path ([System.IO.Path]::GetTempPath()) "ai-trainer-export-$([Guid]::NewGuid().ToString('N')).sql"
$passphrase = Get-AiTrainerBackupPassphrase

try {
  $nodeDirectory = Split-Path -Parent $node
  $env:Path = "$nodeDirectory;$env:Path"
  Push-Location (Join-Path $root 'apps\bot-worker')
  try {
    $exitCode = Invoke-AiTrainerProcess $node @($wrangler, 'd1', 'export', $DatabaseName, '--remote', '--output', $temporarySql, '--skip-confirmation', '--config', $wranglerConfig)
    if ($exitCode -ne 0) { throw "Cloudflare D1 export завершился с кодом $exitCode." }
  } finally { Pop-Location }

  $info = Get-Item -LiteralPath $temporarySql
  if ($info.Length -lt 1024) { throw 'Экспорт D1 подозрительно мал и не будет сохранён.' }
  $sample = [System.IO.File]::ReadAllText($temporarySql)
  if ($sample -notmatch '(?is)CREATE\s+TABLE.*users') { throw 'Экспорт не содержит ожидаемую таблицу users.' }

  $env:AI_TRAINER_BACKUP_PASSPHRASE = $passphrase
  $exitCode = Invoke-AiTrainerProcess $node @($crypto, 'encrypt', $temporarySql, $backupPath)
  if ($exitCode -ne 0) { throw "Шифрование завершилось с кодом $exitCode." }
  $hash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  [System.IO.File]::WriteAllText($checksumPath, "$hash  $([System.IO.Path]::GetFileName($backupPath))`n", [Text.UTF8Encoding]::new($false))
  Write-Output "Резервная копия создана: $backupPath"
  Write-Output "SHA-256: $hash"
} catch {
  if (Test-Path -LiteralPath $backupPath) { Remove-Item -LiteralPath $backupPath -Force }
  if (Test-Path -LiteralPath $checksumPath) { Remove-Item -LiteralPath $checksumPath -Force }
  throw
} finally {
  Remove-Item Env:AI_TRAINER_BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
  $passphrase = $null
  Remove-AiTrainerTemporaryFile $temporarySql
}
