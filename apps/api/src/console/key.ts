import "../env.js";

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runConsole } from "@monorepo-framework/encryption";

const here = dirname(fileURLToPath(import.meta.url));

// Resolved from this file rather than the working directory so the command
// behaves the same whether run from the app or the workspace root. Two levels
// up from `src/console` (and from `dist/console`) is the app root.
process.exitCode = await runConsole(process.argv.slice(2), {
  envFile: join(here, "..", "..", ".env"),
});
