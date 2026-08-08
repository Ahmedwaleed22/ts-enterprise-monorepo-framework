import { Grammar } from './grammar.js'
import type { ColumnAttributes } from '../column.js'
import type { Dialect } from '../../types.js'

/**
 * Compiles blueprints to sqlite DDL.
 *
 * @remarks
 * sqlite has few types, so most columns collapse onto `text`, `integer`, `real`
 * or `numeric`. Booleans become `1`/`0` integers and timestamps become ISO-8601
 * text, which is what makes reading a sqlite row differ from Postgres.
 *
 * Auto-increment keys must be spelled `integer primary key autoincrement`
 * exactly, so a `bigInteger`-shaped key is still declared `integer`.
 *
 * @beta
 */
export class SqliteGrammar extends Grammar {
	/** Always `'sqlite'`. */
	readonly dialect: Dialect = 'sqlite'

	/**
	 * Quote with double quotes, doubling any embedded one.
	 *
	 * @param identifier - Table, column or index name, unquoted.
	 * @returns The quoted identifier.
	 */
	wrap(identifier: string): string {
		return `"${identifier.replace(/"/g, '""')}"`
	}

	/**
	 * Collapses the neutral types onto sqlite's four storage classes — `text`,
	 * `integer`, `real` and `numeric`.
	 *
	 * @param column - The column being compiled.
	 * @returns A sqlite type name.
	 *
	 * @override
	 */
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

	/**
	 * `integer not null primary key autoincrement` — the only spelling sqlite
	 * treats as a rowid alias, so the type stays `integer` even for a big key.
	 *
	 * @param column - The `increments` column being compiled.
	 * @returns A complete column definition.
	 *
	 * @override
	 */
	protected incrementsSql(column: ColumnAttributes): string {
		// sqlite only makes a column a true rowid alias with exactly this
		// spelling, so the type must stay `integer` even for a big key.
		return `${this.wrap(column.name)} integer not null primary key autoincrement`
	}

	/**
	 * Lists user tables from `sqlite_master`, excluding sqlite's own `sqlite_%`
	 * bookkeeping tables.
	 *
	 * @returns A query returning one `name` column per table.
	 */
	compileTableListing(): string {
		return "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'"
	}

	/**
	 * One `DROP TABLE` per table, bracketed by pragmas that suspend foreign key
	 * enforcement so the drop order does not matter.
	 *
	 * @param tables - Tables to drop.
	 * @returns Statements to execute in order, or none if the list is empty.
	 */
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
