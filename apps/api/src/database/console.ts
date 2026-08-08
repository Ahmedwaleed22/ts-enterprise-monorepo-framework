import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runConsole } from "@monorepo-framework/database";

const here = dirname(fileURLToPath(import.meta.url));

// Resolved from this file rather than the working directory so the commands
// behave the same whether run from the app or the workspace root.
process.exitCode = await runConsole(process.argv.slice(2), {
  migrations: join(here, "migrations"),
  seeders: join(here, "seeders"),
});
