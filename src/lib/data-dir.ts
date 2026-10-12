import path from "path";

/**
 * Where the Den keeps its runtime files: the activity log, the password hash
 * and session secret from first-run setup, the setup code. Defaults to
 * ./data next to the app; KITSUNEDEN_DATA_DIR moves it (tests, or a packaged
 * install that should write under %APPDATA%).
 */
export function dataDir(): string {
  return process.env.KITSUNEDEN_DATA_DIR || path.join(process.cwd(), "data");
}
