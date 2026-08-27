param(
  [Parameter(Mandatory=$true)][string]$BackupPath,
  [string]$DatabaseName = 'ai-trainer'
)

. (Join-Path $PSScriptRoot 'backup-common.ps1')

$BackupPath = [System.IO.Path]::GetFullPath($BackupPath)
if (-not (Test-Path -LiteralPath $BackupPath -PathType Leaf)) { throw "Копия не найдена: $BackupPath" }
$checksumPath = "$BackupPath.sha256"
if (Test-Path -LiteralPath $checksumPath -PathType Leaf) {
  $expected = ([System.IO.File]::ReadAllText($checksumPath).Trim() -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { throw 'Контрольная сумма резервной копии не совпадает.' }
}

$root = Get-AiTrainerRepositoryRoot
$node = Get-AiTrainerNode
$crypto = Join-Path $PSScriptRoot 'backup-crypto.mjs'
$verifier = Join-Path $PSScriptRoot 'verify-sqlite.mjs'
$temporarySql = Join-Path ([System.IO.Path]::GetTempPath()) "ai-trainer-restore-$([Guid]::NewGuid().ToString('N')).sql"
$temporaryDatabase = Join-Path ([System.IO.Path]::GetTempPath()) "ai-trainer-restore-$([Guid]::NewGuid().ToString('N')).sqlite3"
$receiptPath = "$BackupPath.verified.json"
$passphrase = Get-AiTrainerBackupPassphrase

try {
  $env:AI_TRAINER_BACKUP_PASSPHRASE = $passphrase
  $exitCode = Invoke-AiTrainerProcess $node @($crypto, 'decrypt', $BackupPath, $temporarySql)
  if ($exitCode -ne 0) { throw "Расшифровка завершилась с кодом $exitCode." }
  & $node $verifier $temporarySql $temporaryDatabase $receiptPath
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { throw "Пробное восстановление завершилось с кодом $exitCode." }
  Write-Output 'Копия расшифрована и успешно восстановлена в изолированную временную SQLite. Рабочая облачная D1 не изменялась.'
} finally {
  Remove-Item Env:AI_TRAINER_BACKUP_PASSPHRASE -ErrorAction SilentlyContinue
  $passphrase = $null
  Remove-AiTrainerTemporaryFile $temporarySql
  Remove-AiTrainerTemporaryFile $temporaryDatabase
}
