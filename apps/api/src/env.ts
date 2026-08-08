import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from this file rather than the working directory so `.env` is found
// whether commands run from the app or the workspace root — the same reasoning
// as the migration paths in `database/console.ts`.
//
// Node loads the file natively (>= 20.12), so this needs no `dotenv` dependency.
// Real environment variables already set by the shell or the deployment
// platform win: `loadEnvFile` does not overwrite them.
const envFile = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
