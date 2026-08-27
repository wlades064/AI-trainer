Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-AiTrainerRepositoryRoot {
  return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
}

function Get-AiTrainerNode {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $bundled = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $bundled -PathType Leaf) { return $bundled }
  throw 'Node.js не найден. Установи Node.js либо запускай резервирование из среды Codex.'
}

function Get-AiTrainerWrangler {
  $root = Get-AiTrainerRepositoryRoot
  $wrangler = Join-Path $root 'apps\bot-worker\node_modules\wrangler\bin\wrangler.js'
  if (-not (Test-Path -LiteralPath $wrangler -PathType Leaf)) {
    throw 'Wrangler не найден. Сначала установи зависимости в apps\bot-worker.'
  }
  return $wrangler
}

function Invoke-AiTrainerProcess([string]$FilePath, [string[]]$Arguments) {
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.UseShellExecute = $false
  foreach ($argument in $Arguments) { [void]$startInfo.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::Start($startInfo)
  if (-not $process) { throw "Не удалось запустить процесс: $FilePath" }
  $process.WaitForExit()
  return $process.ExitCode
}

function Convert-SecureStringToPlainText([Security.SecureString]$SecureValue) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Get-AiTrainerBackupPassphrase {
  if ($env:AI_TRAINER_BACKUP_PASSPHRASE) {
    if ($env:AI_TRAINER_BACKUP_PASSPHRASE.Length -lt 16) { throw 'Пароль резервной копии короче 16 символов.' }
    return $env:AI_TRAINER_BACKUP_PASSPHRASE
  }
  $root = Get-AiTrainerRepositoryRoot
  $secretPath = Join-Path $root 'config\backup-passphrase.dpapi'
  if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
    throw 'Пароль резервирования не настроен. Запусти initialize-backup-secret.ps1.'
  }
  $protected = [System.IO.File]::ReadAllText($secretPath).Trim()
  $secure = ConvertTo-SecureString $protected
  $plain = Convert-SecureStringToPlainText $secure
  if ($plain.Length -lt 16) { throw 'Сохранённый пароль резервной копии повреждён.' }
  return $plain
}

function Remove-AiTrainerTemporaryFile([string]$Path) {
  $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $resolvedPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $resolvedPath.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Отказ от удаления файла вне временного каталога: $resolvedPath"
  }
  if (Test-Path -LiteralPath $resolvedPath -PathType Leaf) {
    Remove-Item -LiteralPath $resolvedPath -Force
  }
}
