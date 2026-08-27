param(
  [ValidateRange(1,365)][int]$KeepVerifiedBackups = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$backupDirectory = Join-Path $root 'backups'
[System.IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
$statusPath = Join-Path $backupDirectory 'last-run.json'
$startedAt = [DateTime]::UtcNow

function Write-BackupStatus([string]$Status, [string]$Message, [string]$BackupName = '') {
  $payload = [ordered]@{
    status = $Status
    startedAt = $startedAt.ToString('o')
    finishedAt = [DateTime]::UtcNow.ToString('o')
    backup = $BackupName
    message = $Message
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText($statusPath, "$payload`n", [Text.UTF8Encoding]::new($false))
}

try {
  $before = @{}
  Get-ChildItem -LiteralPath $backupDirectory -Filter '*.aitbackup' -File -ErrorAction SilentlyContinue |
    ForEach-Object { $before[$_.FullName] = $true }

  & (Join-Path $PSScriptRoot 'backup-d1.ps1') -OutputDirectory $backupDirectory

  $created = @(Get-ChildItem -LiteralPath $backupDirectory -Filter '*.aitbackup' -File |
    Where-Object { -not $before.ContainsKey($_.FullName) })
  if ($created.Count -ne 1) { throw "Ожидалась одна новая копия, создано: $($created.Count)." }
  $backup = $created[0]

  & (Join-Path $PSScriptRoot 'verify-backup.ps1') -BackupPath $backup.FullName
  $receipt = "$($backup.FullName).verified.json"
  if (-not (Test-Path -LiteralPath $receipt -PathType Leaf)) { throw 'После проверки не создана квитанция восстановления.' }

  $verified = @(Get-ChildItem -LiteralPath $backupDirectory -Filter '*.aitbackup' -File |
    Where-Object { Test-Path -LiteralPath "$($_.FullName).verified.json" } |
    Sort-Object LastWriteTimeUtc -Descending)
  $expired = @($verified | Select-Object -Skip $KeepVerifiedBackups)
  foreach ($archive in $expired) {
    $archivePath = [System.IO.Path]::GetFullPath($archive.FullName)
    if (-not $archivePath.StartsWith([System.IO.Path]::GetFullPath($backupDirectory) + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Отказ от удаления архива вне каталога backups: $archivePath"
    }
    foreach ($path in @($archivePath, "$archivePath.sha256", "$archivePath.verified.json")) {
      if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force }
    }
  }

  Write-BackupStatus 'success' "Копия создана и проверена; удалено старых проверенных копий: $($expired.Count)." $backup.Name
  Write-Output "Цикл резервирования завершён: $($backup.Name). Проверенных копий сохранено: $($verified.Count - $expired.Count)."
} catch {
  Write-BackupStatus 'failed' $_.Exception.Message
  throw
}
