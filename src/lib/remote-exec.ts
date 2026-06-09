/**
 * Execute a PowerShell command on a remote Windows host by shelling out
 * to the local OpenSSH client (ssh.exe). Used by the MC adapter's
 * lifecycle path to start servers that live on LAN/tailnet peers without
 * standing up a sibling agent on every box.
 *
 * Why ssh.exe vs an in-process ssh2 client:
 *   - Windows OpenSSH client is already installed on every modern
 *     Windows (Server 2019+, Win 10+) so no new dep.
 *   - The `ssh` binary respects the standard known_hosts / config / agent,
 *     matching what an operator would do by hand.
 *   - ssh2 ships native bindings that complicate the npm install on this
 *     project (better-sqlite3 already does that song-and-dance).
 *   - A one-shot fire-and-wait is plenty for our case; we don't need a
 *     long-lived multiplexed channel.
 *
 * Why PowerShell -EncodedCommand:
 *   - Windows OpenSSH's default remote shell is cmd.exe. Sending raw
 *     PowerShell over a cmd shell triggers cmd's quoting rules — pipes,
 *     semicolons, parens, and quoted strings all get re-interpreted
 *     before reaching powershell.exe. Base64-encoding the command bypasses
 *     all of that: cmd just hands the opaque blob to powershell, which
 *     decodes and executes it intact. Same trick the dashboard already
 *     uses to send PowerShell from WSL bash to kitsuneden-host.
 *   - EncodedCommand wants UTF-16LE, NOT UTF-8 — common gotcha that costs
 *     an hour the first time you hit it.
 */

import { spawn } from "node:child_process";

export interface SshTarget {
  host: string;
  port?: number;
  user: string;
  /** Absolute path to the private key file on the dashboard host. */
  identityFile: string;
}

export interface RemoteExecResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Encode a PowerShell command for `powershell -EncodedCommand`. */
export function encodePowerShellCommand(psCommand: string): string {
  // PowerShell's -EncodedCommand expects base64 of the UTF-16LE bytes.
  // Buffer.from(str, "utf16le") gives us LE on every platform.
  return Buffer.from(psCommand, "utf16le").toString("base64");
}

/**
 * SSH into the target and run a PowerShell command. Resolves when ssh
 * exits, with collected stdout/stderr and the exit code. Never rejects —
 * connection errors become `{ ok: false, stderr: "..." }`.
 *
 * `timeoutMs` is the hard ceiling on the whole operation including
 * connection handshake. Anything over ~30s for a "start the server"
 * command suggests something hung; the dashboard cares about being
 * responsive more than about waiting forever.
 */
export function execRemotePowerShell(
  target: SshTarget,
  psCommand: string,
  options: { timeoutMs?: number } = {}
): Promise<RemoteExecResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const encoded = encodePowerShellCommand(psCommand);

  const sshArgs = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `ConnectTimeout=${Math.max(5, Math.floor(timeoutMs / 1000 / 2))}`,
    "-i",
    target.identityFile,
  ];
  if (target.port && target.port !== 22) {
    sshArgs.push("-p", String(target.port));
  }
  sshArgs.push(
    `${target.user}@${target.host}`,
    `powershell -NoProfile -EncodedCommand ${encoded}`
  );

  return new Promise<RemoteExecResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: RemoteExecResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const proc = spawn("ssh", sshArgs, { windowsHide: true });
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish({
        ok: false,
        exitCode: null,
        stdout,
        stderr: stderr + `\n[remote-exec] timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      finish({
        ok: false,
        exitCode: null,
        stdout,
        stderr: stderr + `\n[remote-exec] spawn error: ${err.message}`,
      });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, exitCode: code, stdout, stderr });
    });
  });
}
