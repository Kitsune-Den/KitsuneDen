<#
.SYNOPSIS
    Registers (or removes) a Windows scheduled task that runs the Den.

.DESCRIPTION
    Copies scripts\run-den.ps1 into the repo's data\ folder and registers a
    task that runs it hidden, restarts it if it fails, and never starts a
    second copy. The launcher ties the Den's processes to the task, so
    stopping the task stops the Den and frees port 3001.

    Run `npm run build` first; the task runs the production build.

.PARAMETER AtStartup
    Start when Windows boots, whether or not anyone signs in. Needs an
    elevated (Run as administrator) PowerShell. Without it, the task starts
    when you sign in, which needs no admin rights.

.PARAMETER Uninstall
    Stop and remove the task.

.PARAMETER TaskName
    Name of the scheduled task. Defaults to KitsuneDen.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install-startup-task.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install-startup-task.ps1 -Uninstall
#>
param(
    [switch]$AtStartup,
    [switch]$Uninstall,
    [string]$TaskName = "KitsuneDen"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$user = "$env:USERDOMAIN\$env:USERNAME"

if ($Uninstall) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed the '$TaskName' task. The Den is stopped."
    } else {
        Write-Host "There is no '$TaskName' task."
    }
    exit 0
}

if ($AtStartup) {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "-AtStartup needs an elevated PowerShell (Run as administrator). Leave it off to start the Den when you sign in instead."
    }
}

if (-not (Test-Path (Join-Path $repo ".next\BUILD_ID"))) {
    Write-Warning "No production build found. Run 'npm run build' in $repo before starting the task."
}

# The task points at a copy in data\ (git-ignored), so checking out a branch
# that predates scripts\run-den.ps1 can't break a running install.
$dataDir = Join-Path $repo "data"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$launcher = Join-Path $dataDir "run-den.ps1"
Copy-Item -Path (Join-Path $PSScriptRoot "run-den.ps1") -Destination $launcher -Force

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`"" `
    -WorkingDirectory $repo

if ($AtStartup) {
    $trigger = New-ScheduledTaskTrigger -AtStartup
    # S4U: runs as you without storing your password, even before anyone signs in.
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Highest
} else {
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
}
# Gives networking a moment to come up before the Den binds its port.
$trigger.Delay = "PT30S"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Force `
    -Description "Runs the KitsuneDen dashboard (port 3001) from $repo. Logs: data\den-server.log" `
    -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal | Out-Null

$when = if ($AtStartup) { "when Windows starts" } else { "when $user signs in" }
Write-Host ""
Write-Host "Registered the '$TaskName' task. It starts the Den $when."
Write-Host "  Start now:   Start-ScheduledTask $TaskName"
Write-Host "  Stop:        Stop-ScheduledTask $TaskName   (stops the Den and frees port 3001)"
Write-Host "  Logs:        $dataDir\den-server.log"
Write-Host "  Remove:      powershell -ExecutionPolicy Bypass -File scripts\install-startup-task.ps1 -Uninstall"
