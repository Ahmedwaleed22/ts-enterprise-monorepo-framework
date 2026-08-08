import { Grammar } from './grammar.js'
import type { ColumnAttributes } from '../column.js'
import type { Dialect } from '../../types.js'

/**
 * Compiles blueprints to MySQL (and MariaDB) DDL.
 *
 * @remarks
 * Notable choices: `bigint unsigned auto_increment` keys, `tinyint(1)` for
 * booleans, `datetime(3)` for timestamps, and `char(36)` for UUIDs. This is the
 * only dialect that honours `unsigned`.
 *
 * MySQL commits implicitly on DDL, so a migration compiled here cannot be
 * rolled back by a transaction — see {@link Migrator}.
 *
 * @beta
 */
export class MysqlGrammar extends Grammar {
	/** Always `'mysql'`. */
	readonly dialect: Dialect = 'mysql'

	/**
	 * Quote with backticks, doubling any embedded one.
	 *
	 * @param identifier - Table, column or index name, unquoted.
	 * @returns The quoted identifier.
	 */
	wrap(identifier: string): string {
		return `\`${identifier.replace(/`/g, '``')}\``
	}

	/**
	 * Maps neutral types onto MySQL types, appending ` unsigned` to integer
	 * types when the column asked for it.
	 *
	 * @param column - The column being compiled.
	 * @returns A MySQL type name.
	 *
	 * @override
	 */
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

	/**
	 * `bigint unsigned not null auto_increment primary key`.
	 *
	 * @param column - The `increments` column being compiled.
	 * @returns A complete column definition.
	 *
	 * @override
	 */
	protected incrementsSql(column: ColumnAttributes): string {
		return `${this.wrap(column.name)} bigint unsigned not null auto_increment primary key`
	}

	/**
	 * `DROP INDEX ... ON table`, since MySQL scopes index names to their table.
	 *
	 * @param table - Table the index covers; required here, unlike the base
	 * implementation.
	 * @param name - Index name.
	 * @returns One statement.
	 *
	 * @override
	 */
	override compileDropIndex(table: string, name: string): string {
		// MySQL scopes index names to their table, so the table must be named.
		return `drop index ${this.wrap(name)} on ${this.wrap(table)}`
	}

	/**
	 * Lists the tables in the connection's current database, from
	 * `information_schema`.
	 *
	 * @returns A query returning one `name` column per table.
	 */
	compileTableListing(): string {
		return 'select table_name as name from information_schema.tables where table_schema = database()'
	}

	/**
	 * Drops every table with constraint checking suspended, since MySQL has no
	 * `CASCADE` for `DROP TABLE`.
	 *
	 * @param tables - Tables to drop.
	 * @returns Three statements, or none if the list is empty.
	 */
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
