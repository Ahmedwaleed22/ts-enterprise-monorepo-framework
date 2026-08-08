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
 * Reads `DATABASE_URL` first; otherwise falls back to the discrete
 * `DB_CONNECTION` / `DB_HOST` / `DB_PORT` / `DB_DATABASE` / `DB_USERNAME` /
 * `DB_PASSWORD` variables. Defaults to a local sqlite file so the stack runs
 * with no infrastructure at all.
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
