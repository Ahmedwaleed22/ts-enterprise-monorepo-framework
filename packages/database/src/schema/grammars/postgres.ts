import { Grammar } from './grammar.js'
import type { ColumnAttributes } from '../column.js'
import type { Dialect } from '../../types.js'

/**
 * Compiles blueprints to PostgreSQL DDL.
 *
 * @remarks
 * Notable choices: `bigserial` for auto-increment keys, `jsonb` over `json`,
 * `timestamp(3) without time zone`, real `true` / `false` boolean literals, and
 * a single `DROP TABLE ... CASCADE` so foreign key order never matters.
 *
 * `unsigned` is ignored — Postgres has no unsigned integer types.
 *
 * @beta
 */
export class PostgresGrammar extends Grammar {
	/** Always `'postgres'`. */
	readonly dialect: Dialect = 'postgres'

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
	 * Maps neutral types onto Postgres types, including `jsonb` for `json` and
	 * `timestamp(3) without time zone` for `timestamp`.
	 *
	 * @param column - The column being compiled.
	 * @returns A Postgres type name.
	 *
	 * @override
	 */
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

	/**
	 * `bigserial not null primary key`, which creates the backing sequence too.
	 *
	 * @param column - The `increments` column being compiled.
	 * @returns A complete column definition.
	 *
	 * @override
	 */
	protected incrementsSql(column: ColumnAttributes): string {
		return `${this.wrap(column.name)} bigserial not null primary key`
	}

	/**
	 * Postgres has a real boolean type, so literals are `true` / `false` rather
	 * than `1` / `0`.
	 *
	 * @param value - The boolean to render.
	 * @returns `'true'` or `'false'`.
	 *
	 * @override
	 */
	protected override booleanLiteral(value: boolean): string {
		return value ? 'true' : 'false'
	}

	/**
	 * Lists the tables in the connection's current schema, from `pg_tables`.
	 *
	 * @returns A query returning one `name` column per table.
	 */
	compileTableListing(): string {
		return "select tablename as name from pg_tables where schemaname = current_schema()"
	}

	/**
	 * One `DROP TABLE ... CASCADE` covering every table.
	 *
	 * @param tables - Tables to drop.
	 * @returns A single statement, or none if the list is empty.
	 */
	compileDropAllTables(tables: string[]): string[] {
		if (tables.length === 0) return []
		// CASCADE lets a single statement drop tables regardless of the order
		// their foreign keys point in.
		const list = tables.map((table) => this.wrap(table)).join(', ')
		return [`drop table if exists ${list} cascade`]
	}
}
