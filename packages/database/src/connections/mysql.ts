import { loadDriver } from './driver.js'
import type { Bindable, Connection, ConnectionConfig, Row } from '../types.js'

interface MysqlConnection {
	query(query: string, values?: unknown[]): Promise<[unknown, unknown]>
	release(): void
}

interface MysqlPool {
	query(query: string, values?: unknown[]): Promise<[unknown, unknown]>
	getConnection(): Promise<MysqlConnection>
	end(): Promise<void>
}

interface MysqlModule {
	default: { createPool: (options: Record<string, unknown>) => MysqlPool }
}

function normalize(bindings: readonly Bindable[]): unknown[] {
	return bindings.map((value) => value ?? null)
}

/**
 * MySQL returns `[rows, fields]`; DDL and writes put a result header in the
 * first slot instead of an array, which callers of `select` never want.
 */
function rowsOf<T extends Row>(result: [unknown, unknown]): T[] {
	const [rows] = result
	return Array.isArray(rows) ? (rows as T[]) : []
}

function pooledConnection(client: MysqlConnection, parent: Connection): Connection {
	return {
		dialect: 'mysql',
		async select<T extends Row = Row>(query: string, bindings: readonly Bindable[] = []) {
			return rowsOf<T>(await client.query(query, normalize(bindings)))
		},
		async statement(query: string, bindings: readonly Bindable[] = []) {
			await client.query(query, normalize(bindings))
		},
		transaction: parent.transaction.bind(parent),
		close: () => Promise.resolve(),
	}
}

/**
 * Open a MySQL connection backed by a `mysql2` pool.
 *
 * @remarks
 * Requires the optional `mysql2` peer dependency. MySQL speaks `?` placeholders
 * natively, so no rewriting is needed. Note that MySQL commits implicitly on
 * DDL — a transaction here protects data changes, not schema changes.
 *
 * Reached through {@link createConnection} in application code.
 *
 * @param config - Either `url`, or the discrete host/port/database fields.
 * @returns An open connection; {@link Connection.close} drains the pool.
 * @throws Error naming `mysql2` if the driver is not installed.
 *
 * @internal
 */
export async function createMysqlConnection(config: ConnectionConfig): Promise<Connection> {
	const module = await loadDriver<MysqlModule>('mysql2/promise', 'mysql2')
	const pool = module.default.createPool(
		config.url
			? { uri: config.url }
			: {
					host: config.host,
					port: config.port,
					database: config.database,
					user: config.username,
					password: config.password,
					ssl: config.ssl ? {} : undefined,
				},
	)

	const connection: Connection = {
		dialect: 'mysql',

		async select<T extends Row = Row>(query: string, bindings: readonly Bindable[] = []) {
			return rowsOf<T>(await pool.query(query, normalize(bindings)))
		},

		async statement(query: string, bindings: readonly Bindable[] = []) {
			await pool.query(query, normalize(bindings))
		},

		async transaction<T>(callback: (connection: Connection) => Promise<T>): Promise<T> {
			const client = await pool.getConnection()
			try {
				await client.query('START TRANSACTION')
				const result = await callback(pooledConnection(client, connection))
				await client.query('COMMIT')
				return result
			} catch (error) {
				await client.query('ROLLBACK')
				throw error
			} finally {
				client.release()
			}
		},

		close: () => pool.end(),
	}

	return connection
}
