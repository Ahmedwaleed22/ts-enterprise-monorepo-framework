import { configFromEnv } from '../config.js'
import { createMysqlConnection } from './mysql.js'
import { createPostgresConnection } from './postgres.js'
import { createSqliteConnection } from './sqlite.js'
import type { Connection, ConnectionConfig } from '../types.js'

/**
 * Open a connection to the configured database.
 *
 * @remarks
 * With no argument the configuration is read from the environment via
 * {@link configFromEnv}, so the same call works across sqlite, Postgres and
 * MySQL without any code change.
 *
 * The driver is imported lazily, so only the database actually in use needs to
 * be installed. Postgres and MySQL open a pool that stays alive until
 * {@link Connection.close} is called.
 *
 * @param config - What to connect to.
 * @returns An open connection.
 * @throws Error if the dialect's driver is not installed. The message names the
 * package to add.
 *
 * @example
 * ```ts
 * const connection = await createConnection()
 * try {
 *   await new Migrator(connection, { path: './migrations' }).run()
 * } finally {
 *   await connection.close()
 * }
 * ```
 *
 * @public
 */
export function createConnection(
	config: ConnectionConfig = configFromEnv(),
): Promise<Connection> {
	switch (config.dialect) {
		case 'postgres':
			return createPostgresConnection(config)
		case 'mysql':
			return createMysqlConnection(config)
		case 'sqlite':
			return createSqliteConnection(config)
	}
}

export { createMysqlConnection, createPostgresConnection, createSqliteConnection }

/* Re-exported for tests and for `createConnection` above; not part of the
   package entry point, where `createConnection` is the single door in. */
