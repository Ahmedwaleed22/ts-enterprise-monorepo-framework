import { Grammar } from './grammar.js'
import type { ColumnAttributes } from '../column.js'
import type { Dialect } from '../../types.js'

export class PostgresGrammar extends Grammar {
	readonly dialect: Dialect = 'postgres'

	wrap(identifier: string): string {
		return `"${identifier.replace(/"/g, '""')}"`
	}

	protected typeFor(column: ColumnAttributes): string {
		switch (column.type) {
			case 'string':
				return `varchar(${column.length ?? 255})`
			case 'text':
				return 'text'
			case 'integer':
				return 'integer'
			case 'bigInteger':
				return 'bigint'
			case 'boolean':
				return 'boolean'
			case 'float':
				return 'double precision'
			case 'decimal':
				return `numeric(${column.precision ?? 8}, ${column.scale ?? 2})`
			case 'date':
				return 'date'
			case 'timestamp':
				return 'timestamp(3) without time zone'
			case 'json':
				return 'jsonb'
			case 'uuid':
				return 'uuid'
			case 'increments':
				return 'bigserial'
		}
	}

	protected incrementsSql(column: ColumnAttributes): string {
		return `${this.wrap(column.name)} bigserial not null primary key`
	}

	protected override booleanLiteral(value: boolean): string {
		return value ? 'true' : 'false'
	}

	compileTableListing(): string {
		return "select tablename as name from pg_tables where schemaname = current_schema()"
	}

	compileDropAllTables(tables: string[]): string[] {
		if (tables.length === 0) return []
		// CASCADE lets a single statement drop tables regardless of the order
		// their foreign keys point in.
		const list = tables.map((table) => this.wrap(table)).join(', ')
		return [`drop table if exists ${list} cascade`]
	}
}
