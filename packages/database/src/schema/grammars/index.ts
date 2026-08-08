import { MysqlGrammar } from './mysql.js'
import { PostgresGrammar } from './postgres.js'
import { SqliteGrammar } from './sqlite.js'
import type { Grammar } from './grammar.js'
import type { Dialect } from '../../types.js'

/**
 * The built-in grammar for a dialect.
 *
 * @remarks
 * Returns a fresh, stateless instance on every call; grammars are cheap enough
 * that callers do not cache them.
 *
 * @param dialect - Which database to compile for.
 * @returns The matching grammar.
 *
 * @example
 * ```ts
 * grammarFor('postgres').wrap('order') // '"order"'
 * ```
 *
 * @beta
 */
export function grammarFor(dialect: Dialect): Grammar {
	switch (dialect) {
		case 'postgres':
			return new PostgresGrammar()
		case 'mysql':
			return new MysqlGrammar()
		case 'sqlite':
			return new SqliteGrammar()
	}
}

export { Grammar } from './grammar.js'
export { MysqlGrammar, PostgresGrammar, SqliteGrammar }
