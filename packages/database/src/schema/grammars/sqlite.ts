import { Grammar } from './grammar.js'
import type { ColumnAttributes } from '../column.js'
import type { Dialect } from '../../types.js'

export class SqliteGrammar extends Grammar {
	readonly dialect: Dialect = 'sqlite'

	wrap(identifier: string): string {
		return `"${identifier.replace(/"/g, '""')}"`
	}

	protected typeFor(column: ColumnAttributes): string {
		switch (column.type) {
			case 'string':
			case 'text':
			case 'uuid':
			case 'json':
				return 'text'
			case 'integer':
			case 'bigInteger':
				return 'integer'
			case 'boolean':
				// sqlite has no boolean type; 0/1 in an integer column is the
				// conventional representation.
				return 'integer'
			case 'float':
				return 'real'
			case 'decimal':
				return 'numeric'
			case 'date':
			case 'timestamp':
				return 'text'
			case 'increments':
				return 'integer'
		}
	}

	protected incrementsSql(column: ColumnAttributes): string {
		// sqlite only makes a column a true rowid alias with exactly this
		// spelling, so the type must stay `integer` even for a big key.
		return `${this.wrap(column.name)} integer not null primary key autoincrement`
	}

	compileTableListing(): string {
		return "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'"
	}

	compileDropAllTables(tables: string[]): string[] {
		if (tables.length === 0) return []
		// sqlite drops one table per statement; foreign key enforcement is
		// suspended so the order the tables come back in does not matter.
		return [
			'pragma foreign_keys = off',
			...tables.map((table) => this.compileDropIfExists(table)),
			'pragma foreign_keys = on',
		]
	}
}
