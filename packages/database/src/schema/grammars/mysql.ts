import { Grammar } from './grammar.js'
import type { ColumnAttributes } from '../column.js'
import type { Dialect } from '../../types.js'

export class MysqlGrammar extends Grammar {
	readonly dialect: Dialect = 'mysql'

	wrap(identifier: string): string {
		return `\`${identifier.replace(/`/g, '``')}\``
	}

	protected typeFor(column: ColumnAttributes): string {
		const unsigned = column.unsigned ? ' unsigned' : ''
		switch (column.type) {
			case 'string':
				return `varchar(${column.length ?? 255})`
			case 'text':
				return 'text'
			case 'integer':
				return `int${unsigned}`
			case 'bigInteger':
				return `bigint${unsigned}`
			case 'boolean':
				return 'tinyint(1)'
			case 'float':
				return 'double'
			case 'decimal':
				return `decimal(${column.precision ?? 8}, ${column.scale ?? 2})`
			case 'date':
				return 'date'
			case 'timestamp':
				return 'datetime(3)'
			case 'json':
				return 'json'
			case 'uuid':
				return 'char(36)'
			case 'increments':
				return `bigint${unsigned}`
		}
	}

	protected incrementsSql(column: ColumnAttributes): string {
		return `${this.wrap(column.name)} bigint unsigned not null auto_increment primary key`
	}

	override compileDropIndex(table: string, name: string): string {
		// MySQL scopes index names to their table, so the table must be named.
		return `drop index ${this.wrap(name)} on ${this.wrap(table)}`
	}

	compileTableListing(): string {
		return 'select table_name as name from information_schema.tables where table_schema = database()'
	}

	compileDropAllTables(tables: string[]): string[] {
		if (tables.length === 0) return []
		const list = tables.map((table) => this.wrap(table)).join(', ')
		// MySQL has no CASCADE for DROP TABLE, so constraint checking is
		// suspended for the duration of the drop instead.
		return [
			'set foreign_key_checks = 0',
			`drop table if exists ${list}`,
			'set foreign_key_checks = 1',
		]
	}
}
