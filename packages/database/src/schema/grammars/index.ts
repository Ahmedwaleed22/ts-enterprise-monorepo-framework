import { MysqlGrammar } from './mysql.js'
import { PostgresGrammar } from './postgres.js'
import { SqliteGrammar } from './sqlite.js'
import type { Grammar } from './grammar.js'
import type { Dialect } from '../../types.js'

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
