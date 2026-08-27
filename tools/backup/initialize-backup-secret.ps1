param([switch]$Generate)

. (Join-Path $PSScriptRoot 'backup-common.ps1')

if ($Generate) {
  $bytes = [byte[]]::new(32)
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $plain = [Convert]::ToBase64String($bytes)
  $secure = ConvertTo-SecureString $plain -AsPlainText -Force
  $plain = $null
} else {
  $secure = Read-Host 'Придумай пароль резервных копий (минимум 16 символов)' -AsSecureString
  $confirmation = Read-Host 'Повтори пароль' -AsSecureString
  $first = Convert-SecureStringToPlainText $secure
  $second = Convert-SecureStringToPlainText $confirmation
  try {
    if ($first.Length -lt 16) { throw 'Пароль должен содержать не менее 16 символов.' }
    if ($first -cne $second) { throw 'Пароли не совпадают.' }
  } finally {
    $first = $null
    $second = $null
  }
}

$root = Get-AiTrainerRepositoryRoot
$secretPath = Join-Path $root 'config\backup-passphrase.dpapi'
if (Test-Path -LiteralPath $secretPath) { throw 'Ключ уже существует. Он не перезаписан.' }
$protected = ConvertFrom-SecureString $secure
[System.IO.File]::WriteAllText($secretPath, $protected, [Text.UTF8Encoding]::new($false))
Write-Output 'Ключ резервирования сохранён через Windows DPAPI и доступен только текущей учётной записи Windows.'
if ($Generate) { Write-Output 'Создан случайный локальный ключ. Для переноса копий на другой ПК позже потребуется отдельно настроить переносимый пароль.' }
