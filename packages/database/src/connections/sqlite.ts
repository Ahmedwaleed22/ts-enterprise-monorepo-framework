import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { loadDriver } from './driver.js'
import type { Bindable, Connection, ConnectionConfig, Row } from '../types.js'

interface SqliteStatement {
	run(...params: unknown[]): unknown
	all(...params: unknown[]): unknown[]
}

interface SqliteDatabase {
	prepare(query: string): SqliteStatement
	exec(query: string): void
	close(): void
}

type SqliteConstructor = new (filename: string) => SqliteDatabase

/**
 * sqlite drivers accept only null, numbers, strings and buffers, so richer
 * JavaScript values are flattened to their storage representation here.
 */
function normalize(bindings: readonly Bindable[]): unknown[] {
	return bindings.map((value) => {
		if (value === undefined || value === null) return null
		if (typeof value === 'boolean') return value ? 1 : 0
		if (value instanceof Date) return value.toISOString()
		return value
	})
}

/**
 * Resolve a sqlite driver, preferring `better-sqlite3` when it is installed and
 * falling back to Node's built-in `node:sqlite` so the default configuration
 * works with no dependencies to install.
 */
async function resolveDriver(): Promise<SqliteConstructor> {
	try {
		const module = await loadDriver<{ default: SqliteConstructor }>(
			'better-sqlite3',
			'better-sqlite3',
		)
		return module.default
	} catch {
		const module = await loadDriver<{ DatabaseSync: SqliteConstructor }>(
			'node:sqlite',
			'better-sqlite3',
		)
		return module.DatabaseSync
	}
}

export async function createSqliteConnection(config: ConnectionConfig): Promise<Connection> {
	const filename = config.url ?? 'database/database.sqlite'
	if (filename !== ':memory:') {
		// Create the containing directory so a fresh checkout can migrate
		// without anyone having to mkdir by hand first.
		await mkdir(dirname(resolve(filename)), { recursive: true })
	}

	const Database = await resolveDriver()
	const database = new Database(filename)
	// Foreign keys are off by default in sqlite; turn them on so the schema
	// behaves like Postgres and MySQL.
	database.exec('PRAGMA foreign_keys = ON')

	let depth = 0

	const connection: Connection = {
		dialect: 'sqlite',

		// These drivers are synchronous, but the methods stay `async` so a
		// driver error surfaces as a rejected promise like the other dialects
		// rather than throwing before the caller has a promise to catch.
		// eslint-disable-next-line @typescript-eslint/require-await
		async select<T extends Row = Row>(query: string, bindings: readonly Bindable[] = []) {
			return database.prepare(query).all(...normalize(bindings)) as T[]
		},

		// eslint-disable-next-line @typescript-eslint/require-await
		async statement(query: string, bindings: readonly Bindable[] = []) {
			database.prepare(query).run(...normalize(bindings))
		},

		async transaction<T>(callback: (connection: Connection) => Promise<T>): Promise<T> {
			// sqlite has no nested transactions, so inner calls use savepoints.
			const savepoint = depth > 0 ? `sp_${depth}` : undefined
			database.exec(savepoint ? `SAVEPOINT ${savepoint}` : 'BEGIN')
			depth += 1
			try {
				const result = await callback(connection)
				database.exec(savepoint ? `RELEASE ${savepoint}` : 'COMMIT')
				return result
			} catch (error) {
				database.exec(savepoint ? `ROLLBACK TO ${savepoint}` : 'ROLLBACK')
				throw error
			} finally {
				depth -= 1
			}
		},

		// eslint-disable-next-line @typescript-eslint/require-await
		async close() {
			database.close()
		},
	}

	return connection
}
