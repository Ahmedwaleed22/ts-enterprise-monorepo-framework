/**
 * The SQL dialects the schema builder knows how to compile for.
 *
 * Everything above the driver layer (migrations, seeders, the schema builder)
 * is written once and compiled per dialect, so application code never needs to
 * branch on which database is configured.
 */
export type Dialect = 'postgres' | 'mysql' | 'sqlite'

/** A row returned from a `select`, keyed by column name. */
export type Row = Record<string, unknown>

/** A value that can be bound to a placeholder in a prepared statement. */
export type Bindable = string | number | boolean | Date | null | undefined

export interface ConnectionConfig {
	dialect: Dialect
	/**
	 * Full connection string. Takes precedence over the discrete host/port
	 * fields when present. For sqlite this is the file path, or `:memory:`.
	 */
	url?: string
	host?: string
	port?: number
	database?: string
	username?: string
	password?: string
	/** Postgres/MySQL only. */
	ssl?: boolean
}

/**
 * A live handle to the configured database.
 *
 * Bindings are always written as `?` placeholders regardless of dialect; each
 * driver rewrites them to its own placeholder syntax before executing.
 */
export interface Connection {
	readonly dialect: Dialect
	/** Run a query and return its rows. */
	select<T extends Row = Row>(query: string, bindings?: readonly Bindable[]): Promise<T[]>
	/** Run a statement for its effect, discarding any result set. */
	statement(query: string, bindings?: readonly Bindable[]): Promise<void>
	/** Run `callback` inside a transaction, rolling back if it throws. */
	transaction<T>(callback: (connection: Connection) => Promise<T>): Promise<T>
	/** Release the underlying driver resources. */
	close(): Promise<void>
}
