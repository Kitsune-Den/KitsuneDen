import { describe, expect, it } from "vitest";
import { encodePowerShellCommand } from "../lib/remote-exec";

describe("encodePowerShellCommand", () => {
  it("produces UTF-16LE base64 that PowerShell -EncodedCommand decodes", () => {
    // The canonical PowerShell test: encode a Write-Host, expect the base64
    // matches what `powershell -EncodedCommand` would accept. Verified by
    // round-trip: decode the base64 as UTF-16LE and compare strings.
    const input = "Write-Host Hello";
    const encoded = encodePowerShellCommand(input);
    const decoded = Buffer.from(encoded, "base64").toString("utf16le");
    expect(decoded).toBe(input);
  });

  it("handles non-ASCII characters (the gotcha that costs an hour)", () => {
    const input = "Write-Host '⚡ Ragnarök'";
    const encoded = encodePowerShellCommand(input);
    const decoded = Buffer.from(encoded, "base64").toString("utf16le");
    expect(decoded).toBe(input);
  });

  it("handles multi-line commands with pipes and quotes", () => {
    const input = `Get-Process java | Where-Object { $_.Name -eq "java" } | Select-Object Id`;
    const encoded = encodePowerShellCommand(input);
    const decoded = Buffer.from(encoded, "base64").toString("utf16le");
    expect(decoded).toBe(input);
  });

  it("produces stable output (deterministic for the same input)", () => {
    const input = "Start-Process notepad";
    expect(encodePowerShellCommand(input)).toBe(encodePowerShellCommand(input));
  });
});
