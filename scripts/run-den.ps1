# Launcher for the KitsuneDen scheduled task (see install-startup-task.ps1).
#
# The installer copies this file into the repo's data\ folder and points the
# task there: data\ is git-ignored, so switching branches can never remove the
# launcher out from under a running task. It works from either folder, since
# both sit one level below the repo root.
#
# Starts the Den (npm run start, port 3001) and appends its output to
# data\den-server.log.
#
# Stopping a scheduled task only terminates the task's own process (this
# PowerShell). Without help, its children (cmd -> npm -> node) would keep
# running and keep port 3001. So before starting anything, this script puts
# itself in a Windows job object marked KILL_ON_JOB_CLOSE. Every process it
# starts inherits the job, and when this process ends for any reason
# (task stopped, killed, crashed) Windows closes the job and ends them all.

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot   # scripts\ or data\ -> repo root
$npm  = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { $npm = "C:\Program Files\nodejs\npm.cmd" }
$log  = Join-Path $repo "data\den-server.log"
New-Item -ItemType Directory -Force -Path (Join-Path $repo "data") | Out-Null

function Write-LauncherLog($msg) {
    Add-Content -Path $log -Value "[launcher $(Get-Date -Format s)] $msg" -Encoding utf8
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class DenJob {
    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimits {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct IoCounters { public ulong R, W, O, RB, WB, OB; }

    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }

    const int JobObjectExtendedLimitInformation = 9;
    const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")]
    static extern IntPtr GetCurrentProcess();

    // Deliberately never closed: the handle must live exactly as long as
    // this process, and Windows closes it (killing the job) when we exit.
    static IntPtr handle;

    public static void TieChildrenToThisProcess() {
        handle = CreateJobObject(IntPtr.Zero, null);
        if (handle == IntPtr.Zero) throw new Exception("CreateJobObject failed: " + Marshal.GetLastWin32Error());
        var info = new ExtendedLimits();
        info.Basic.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        int size = Marshal.SizeOf(typeof(ExtendedLimits));
        IntPtr ptr = Marshal.AllocHGlobal(size);
        try {
            Marshal.StructureToPtr(info, ptr, false);
            if (!SetInformationJobObject(handle, JobObjectExtendedLimitInformation, ptr, (uint)size))
                throw new Exception("SetInformationJobObject failed: " + Marshal.GetLastWin32Error());
        } finally {
            Marshal.FreeHGlobal(ptr);
        }
        if (!AssignProcessToJobObject(handle, GetCurrentProcess()))
            throw new Exception("AssignProcessToJobObject failed: " + Marshal.GetLastWin32Error());
    }
}
"@

try {
    [DenJob]::TieChildrenToThisProcess()
} catch {
    Write-LauncherLog "could not create the kill-on-close job: $($_.Exception.Message)"
    throw
}

Set-Location $repo
# cmd does the redirect so the log stays plain UTF-8 like the existing one.
cmd.exe /c "`"$npm`" run start >> data\den-server.log 2>&1"
exit $LASTEXITCODE
