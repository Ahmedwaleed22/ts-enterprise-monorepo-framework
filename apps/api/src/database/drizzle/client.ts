/**
 * The Drizzle handle the application queries through.
 *
 * Reads the same `DB_CONNECTION` / `DATABASE_URL` environment as
 * `packages/database`, via `configFromEnv`, and opens the matching driver. The
 * driver import is dynamic so only the database actually in use has to be
 * installed, mirroring how `createConnection` behaves.
 *
 * ### The one compromise
 *
 * Drizzle types a database handle by its dialect, so there is no single type
 * that covers all three. Postgres is used as the reference type and the other
 * two handles are cast to it. That is sound only for the query surface the
 * dialects share — `select`, `insert`, `update`, `delete`, `where`, joins — and
 * it is *not* checked for dialect-specific extras. `onConflictDoUpdate`
 * (Postgres/sqlite) and `onDuplicateKeyUpdate` (MySQL) are the ones you will
 * hit first: both typecheck here, and exactly one of them works at runtime.
 *
 * The table objects are re-exported from whichever schema file matches the live
 * dialect, so the SQL Drizzle generates is always the right flavour even though
 * the types come from Postgres.
 */
import { configFromEnv } from "@monorepo-framework/database";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as pgSchema from "./schema.pg.js";

const config = configFromEnv();

/** Which database this process is talking to. */
export const dialect = config.dialect;

/** The application-facing handle type. Postgres stands in for all three. */
export type Db = NodePgDatabase<typeof pgSchema>;

interface Connected {
  db: Db;
  schema: typeof pgSchema;
  close: () => Promise<void>;
}

async function connect(): Promise<Connected> {
  switch (config.dialect) {
    case "postgres": {
      const [{ drizzle }, { Pool }, schema] = await Promise.all([
        import("drizzle-orm/node-postgres"),
        import("pg"),
        import("./schema.pg.js"),
      ]);

      // `ssl` here only asks for an encrypted socket; it does not verify the
      // server certificate — the same caveat `ConnectionConfig.ssl` carries.
      const ssl = config.ssl ? { rejectUnauthorized: false } : undefined;
      const pool = config.url
        ? new Pool({ connectionString: config.url, ssl })
        : new Pool({
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.username,
            password: config.password,
            ssl,
          });

      return { db: drizzle(pool, { schema }), schema, close: () => pool.end() };
    }

    case "mysql": {
      const [{ drizzle }, { createPool }, schema] = await Promise.all([
        import("drizzle-orm/mysql2"),
        import("mysql2/promise"),
        import("./schema.mysql.js"),
      ]);

      const pool = config.url
        ? createPool(config.url)
        : createPool({
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.username,
            password: config.password,
            ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
          });

      return {
        db: drizzle(pool, { schema, mode: "default" }) as unknown as Db,
        schema: schema as unknown as typeof pgSchema,
        close: () => pool.end(),
      };
    }

    case "sqlite": {
      const [{ drizzle }, { default: Database }, schema] = await Promise.all([
        import("drizzle-orm/better-sqlite3"),
        import("better-sqlite3"),
        import("./schema.sqlite.js"),
      ]);

      const file = new Database(config.url ?? "database/database.sqlite");
      // sqlite ignores foreign keys unless asked, so the constraints the
      // migrations declare would otherwise go unenforced.
      file.pragma("foreign_keys = ON");

      return {
        db: drizzle(file, { schema }) as unknown as Db,
        schema: schema as unknown as typeof pgSchema,
        close: () => {
          // better-sqlite3 is synchronous; the interface is async for the pools.
          file.close();
          return Promise.resolve();
        },
      };
    }
  }
}

const connected = await connect();

export const db = connected.db;
export const { users, posts } = connected.schema;

/** Release the pool. Call on shutdown; Postgres and MySQL hold it open. */
export const closeDb = connected.close;
