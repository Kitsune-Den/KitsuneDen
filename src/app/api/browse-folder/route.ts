import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function GET() {
  try {
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select server install directory'
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq 'OK') { $dialog.SelectedPath } else { '' }
`.trim();

    const result = execSync(`powershell -NoProfile -Command "${ps.replace(/\n/g, "; ")}"`, {
      timeout: 60000,
      encoding: "utf-8",
      windowsHide: false,
    }).trim();

    if (!result) {
      return NextResponse.json({ path: "", cancelled: true });
    }

    return NextResponse.json({ path: result, cancelled: false });
  } catch {
    return NextResponse.json(
      { path: "", cancelled: true, error: "Failed to open folder picker" },
      { status: 500 }
    );
  }
}
