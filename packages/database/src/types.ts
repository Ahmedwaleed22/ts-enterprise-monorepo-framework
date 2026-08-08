/**
 * The SQL dialects the schema builder knows how to compile for.
 *
 * @remarks
 * Everything above the driver layer (migrations, seeders, the schema builder)
 * is written once and compiled per dialect, so application code never needs to
 * branch on which database is configured.
 *
 * @public
 */
export type Dialect = 'postgres' | 'mysql' | 'sqlite'

/**
 * A row returned from a {@link Connection.select}, keyed by column name.
 *
 * @remarks
 * Values are `unknown` because each driver maps SQL types differently — a
 * Postgres `boolean` arrives as a JavaScript boolean, while the sqlite drivers
 * hand back `0` or `1`. Pass a type argument to `select` to assert the shape
 * you expect.
 *
 * @public
 */
export type Row = Record<string, unknown>

/**
 * A value that can be bound to a placeholder in a prepared statement.
 *
 * @remarks
 * `undefined` is accepted and normalised to `NULL` by every driver, so an
 * optional field can be passed straight through without a guard.
 *
 * @public
 */
export type Bindable = string | number | boolean | Date | null | undefined

/**
 * Everything needed to open a {@link Connection}.
 *
 * @remarks
 * Usually built by {@link configFromEnv} rather than by hand. Only `dialect` is
 * required; the rest are per-dialect and ignored where they do not apply.
 *
 * @example
 * ```ts
 * const config: ConnectionConfig = { dialect: 'sqlite', url: ':memory:' }
 * ```
 *
 * @public
 */
export interface ConnectionConfig {
	/** Which database this configuration describes. */
	dialect: Dialect

	/**
	 * Full connection string. Takes precedence over the discrete host/port
	 * fields when present. For sqlite this is the file path, or `:memory:`.
	 */
	url?: string

	/** Server hostname. Postgres/MySQL only. */
	host?: string

	/**
	 * Server port. Postgres/MySQL only.
	 *
	 * @defaultValue `5432` for Postgres and `3306` for MySQL, when built by {@link configFromEnv}
	 */
	port?: number

	/** Database (schema) name. Postgres/MySQL only. */
	database?: string

	/** Login user. Postgres/MySQL only. */
	username?: string

	/** Login password. Postgres/MySQL only. */
	password?: string

	/**
	 * Connect over TLS. Postgres/MySQL only.
	 *
	 * @remarks
	 * Enabling this does not verify the server certificate — it is meant for
	 * hosted databases that require an encrypted socket, not as a substitute for
	 * a properly pinned CA.
	 *
	 * @defaultValue `false`
	 */
	ssl?: boolean
}

/**
 * A live handle to the configured database.
 *
 * @remarks
 * Bindings are always written as `?` placeholders regardless of dialect; each
 * driver rewrites them to its own placeholder syntax before executing. That
 * keeps migrations, seeders and the schema builder free of dialect branches.
 *
 * Obtain one from {@link createConnection}, and always {@link Connection.close}
 * it when the process is done — the Postgres and MySQL drivers hold a pool open
 * otherwise.
 *
 * @public
 */
export interface Connection {
	/** Which database this connection talks to. */
	readonly dialect: Dialect

	/**
	 * Run a query and return its rows.
	 *
	 * @typeParam T - The row shape to assert; not validated at runtime.
	 * @param query - SQL using `?` placeholders.
	 * @param bindings - Values for the placeholders, in order.
	 * @returns The result set, empty if the query matched nothing.
	 */
	select<T extends Row = Row>(query: string, bindings?: readonly Bindable[]): Promise<T[]>

	/**
	 * Run a statement for its effect, discarding any result set.
	 *
	 * @param query - SQL using `?` placeholders.
	 * @param bindings - Values for the placeholders, in order.
	 */
	statement(query: string, bindings?: readonly Bindable[]): Promise<void>

	/**
	 * Run `callback` inside a transaction, rolling back if it throws.
	 *
	 * @remarks
	 * The callback receives a connection bound to the transaction — statements
	 * issued on the outer connection are *not* part of it. On sqlite, nested
	 * calls use savepoints, since sqlite has no true nested transactions.
	 *
	 * @param callback - Work to perform atomically.
	 * @returns Whatever the callback resolves to, once the commit succeeds.
	 * @throws Whatever the callback threw, after the rollback completes.
	 */
	transaction<T>(callback: (connection: Connection) => Promise<T>): Promise<T>

	/** Release the underlying driver resources. */
	close(): Promise<void>
}
