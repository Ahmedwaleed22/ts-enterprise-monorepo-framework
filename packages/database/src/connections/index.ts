import { configFromEnv } from '../config.js'
import { createMysqlConnection } from './mysql.js'
import { createPostgresConnection } from './postgres.js'
import { createSqliteConnection } from './sqlite.js'
import type { Connection, ConnectionConfig } from '../types.js'

/**
 * Open a connection to the configured database.
 *
 * With no argument the configuration is read from the environment, so the same
 * call works across sqlite, Postgres and MySQL without any code change.
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
