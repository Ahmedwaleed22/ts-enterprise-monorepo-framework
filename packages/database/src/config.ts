import type { ConnectionConfig, Dialect } from './types.js'

// Typed with `undefined` in the value so an unknown alias is a type error to
// ignore rather than a silently-trusted lookup.
const DIALECT_ALIASES: Record<string, Dialect | undefined> = {
	pg: 'postgres',
	pgsql: 'postgres',
	postgres: 'postgres',
	postgresql: 'postgres',
	mysql: 'mysql',
	mariadb: 'mysql',
	sqlite: 'sqlite',
	sqlite3: 'sqlite',
}

const DEFAULT_PORTS: Record<Dialect, number> = {
	postgres: 5432,
	mysql: 3306,
	sqlite: 0,
}

/**
 * Resolve a user-supplied database name to a canonical {@link Dialect}.
 *
 * @remarks
 * Accepts the common aliases people actually type in `DB_CONNECTION` or a URL
 * scheme — `pg`, `pgsql`, `postgresql`, `mariadb`, `sqlite3` — so configuration
 * does not depend on remembering the internal spelling. Matching is
 * case-insensitive.
 *
 * @param value - A dialect name or alias, e.g. `"pg"`.
 * @returns The canonical dialect.
 * @throws Error if the value matches no known dialect. The message lists the
 * accepted aliases.
 *
 * @example
 * ```ts
 * normalizeDialect('POSTGRESQL') // 'postgres'
 * normalizeDialect('mariadb')    // 'mysql'
 * ```
 *
 * @public
 */
export function normalizeDialect(value: string): Dialect {
	const dialect = DIALECT_ALIASES[value.toLowerCase()]
	if (!dialect) {
		const supported = [...new Set(Object.keys(DIALECT_ALIASES))].join(', ')
		throw new Error(`Unsupported database dialect "${value}". Supported: ${supported}.`)
	}
	return dialect
}

/**
 * Derive the dialect from a connection string's scheme, so a single
 * `DATABASE_URL` is enough to configure any supported database.
 *
 * @internal
 */
function dialectFromUrl(url: string): Dialect | undefined {
	const scheme = /^([a-z0-9+]+):/i.exec(url)?.[1]
	if (!scheme) return undefined
	if (scheme === 'file') return 'sqlite'
	return DIALECT_ALIASES[scheme.toLowerCase()]
}

/**
 * Build a connection config from the environment, Laravel-style.
 *
 * @remarks
 * Resolution order:
 *
 * 1. `DB_CONNECTION` names the dialect if set (via {@link normalizeDialect}).
 * 2. Otherwise the scheme of `DATABASE_URL` decides — `postgres://`, `mysql://`,
 *    `file:`, and their aliases.
 * 3. Otherwise sqlite, so the stack runs with no infrastructure at all.
 *
 * For sqlite the result carries a plain filesystem path in `url`: any `file:`
 * scheme is stripped, then `DB_DATABASE`, then `database/database.sqlite`.
 * For Postgres and MySQL a `DATABASE_URL` is passed through untouched;
 * otherwise the discrete `DB_HOST` / `DB_PORT` / `DB_DATABASE` / `DB_USERNAME` /
 * `DB_PASSWORD` / `DB_SSL` variables are read, each with a sensible default.
 *
 * @param env - Environment to read from, injectable for tests.
 * @returns A config ready to hand to {@link createConnection}.
 * @throws Error if `DB_CONNECTION` names an unsupported dialect.
 *
 * @example
 * ```ts
 * // DB_CONNECTION=postgres DB_HOST=db.internal DB_DATABASE=app
 * const config = configFromEnv()
 * // { dialect: 'postgres', host: 'db.internal', port: 5432, database: 'app', ... }
 * ```
 *
 * @public
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ConnectionConfig {
	const url = env.DATABASE_URL?.trim()

	const dialect = env.DB_CONNECTION
		? normalizeDialect(env.DB_CONNECTION)
		: url
			? (dialectFromUrl(url) ?? 'sqlite')
			: 'sqlite'

	if (dialect === 'sqlite') {
		return {
			dialect,
			// Strip the `file:` scheme so drivers get a plain filesystem path.
			url: (url?.replace(/^file:(\/\/)?/, '') || env.DB_DATABASE) ?? 'database/database.sqlite',
		}
	}

	if (url) return { dialect, url }

	return {
		dialect,
		host: env.DB_HOST ?? '127.0.0.1',
		port: env.DB_PORT ? Number(env.DB_PORT) : DEFAULT_PORTS[dialect],
		database: env.DB_DATABASE ?? 'app',
		username: env.DB_USERNAME ?? (dialect === 'postgres' ? 'postgres' : 'root'),
		password: env.DB_PASSWORD ?? '',
		ssl: env.DB_SSL === 'true',
	}
}
