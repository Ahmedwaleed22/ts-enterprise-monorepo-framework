import { loadDriver } from './driver.js'
import { toPositionalPlaceholders } from './placeholders.js'
import type { Bindable, Connection, ConnectionConfig, Row } from '../types.js'

interface PgQueryResult {
	rows: Row[]
}

interface PgClient {
	query(text: string, values?: unknown[]): Promise<PgQueryResult>
	release(): void
}

interface PgPool {
	query(text: string, values?: unknown[]): Promise<PgQueryResult>
	connect(): Promise<PgClient>
	end(): Promise<void>
}

interface PgModule {
	default: { Pool: new (options: Record<string, unknown>) => PgPool }
}

function normalize(bindings: readonly Bindable[]): unknown[] {
	return bindings.map((value) => value ?? null)
}

/**
 * Wrap a checked-out client so statements inside a transaction run on the same
 * physical connection rather than being handed back to the pool.
 */
function clientConnection(client: PgClient, parent: Connection): Connection {
	return {
		dialect: 'postgres',
		async select<T extends Row = Row>(query: string, bindings: readonly Bindable[] = []) {
			const result = await client.query(toPositionalPlaceholders(query), normalize(bindings))
			return result.rows as T[]
		},
		async statement(query: string, bindings: readonly Bindable[] = []) {
			await client.query(toPositionalPlaceholders(query), normalize(bindings))
		},
		transaction: parent.transaction.bind(parent),
		close: () => Promise.resolve(),
	}
}

export async function createPostgresConnection(
	config: ConnectionConfig,
): Promise<Connection> {
	const module = await loadDriver<PgModule>('pg', 'pg @types/pg')
	const pool = new module.default.Pool(
		config.url
			? { connectionString: config.url, ssl: config.ssl ? { rejectUnauthorized: false } : undefined }
			: {
					host: config.host,
					port: config.port,
					database: config.database,
					user: config.username,
					password: config.password,
					ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
				},
	)

	const connection: Connection = {
		dialect: 'postgres',

		async select<T extends Row = Row>(query: string, bindings: readonly Bindable[] = []) {
			const result = await pool.query(toPositionalPlaceholders(query), normalize(bindings))
			return result.rows as T[]
		},

		async statement(query: string, bindings: readonly Bindable[] = []) {
			await pool.query(toPositionalPlaceholders(query), normalize(bindings))
		},

		async transaction<T>(callback: (connection: Connection) => Promise<T>): Promise<T> {
			const client = await pool.connect()
			try {
				await client.query('BEGIN')
				const result = await callback(clientConnection(client, connection))
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
