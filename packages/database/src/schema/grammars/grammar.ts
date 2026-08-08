import { defaultIndexName } from '../blueprint.js'
import { isRaw } from '../expression.js'
import type { Blueprint, IndexDefinition } from '../blueprint.js'
import type { ColumnAttributes } from '../column.js'
import type { RawExpression } from '../expression.js'
import type { Bindable, Dialect } from '../../types.js'

/**
 * Turns dialect-neutral blueprints into SQL.
 *
 * @remarks
 * Subclasses supply the parts that genuinely differ between databases — type
 * names, identifier quoting, auto-increment syntax — while the structure of a
 * `CREATE TABLE` is shared here. {@link grammarFor} returns the built-in
 * implementation for a dialect.
 *
 * Grammars are stateless and cheap to construct, and every `compile*` method is
 * pure: it returns SQL strings and touches no connection.
 *
 * This is the package's extension point for supporting a database it does not
 * ship, and is `@beta` because the protected surface subclasses build on will
 * keep growing as the builder learns more column modifiers.
 *
 * @beta
 */
export abstract class Grammar {
	/** The dialect this grammar compiles for. */
	abstract readonly dialect: Dialect

	/**
	 * Quote an identifier so reserved words and mixed case are safe.
	 *
	 * @remarks
	 * Escapes any embedded quote character by doubling it. Identifiers are
	 * quoted, never validated — do not build one from user input.
	 *
	 * @param identifier - Table, column or index name, unquoted.
	 * @returns The quoted identifier, ready to interpolate into SQL.
	 *
	 * @virtual
	 */
	abstract wrap(identifier: string): string

	/**
	 * The dialect's column type for a neutral column description.
	 *
	 * @param column - The column being compiled.
	 * @returns A SQL type name such as `varchar(255)`.
	 *
	 * @virtual
	 */
	protected abstract typeFor(column: ColumnAttributes): string

	/**
	 * The full column definition for an auto-incrementing primary key.
	 *
	 * @remarks
	 * Returns the whole fragment rather than just a type name, because the three
	 * dialects disagree about where the primary key and auto-increment keywords
	 * belong.
	 *
	 * @param column - The `increments` column being compiled.
	 * @returns A complete column definition.
	 *
	 * @virtual
	 */
	protected abstract incrementsSql(column: ColumnAttributes): string

	/**
	 * Compile a `create` blueprint.
	 *
	 * @remarks
	 * Emits the `CREATE TABLE` first, then one statement per index. Foreign keys
	 * are inlined as table constraints rather than added afterwards, because
	 * sqlite has no `ADD CONSTRAINT`.
	 *
	 * @param blueprint - The table to create.
	 * @returns Statements to execute in order.
	 */
	compileCreate(blueprint: Blueprint): string[] {
		const definitions = blueprint.columns.map((column) => this.columnSql(column.attributes))

		const primaries = blueprint.columns
			.map((column) => column.attributes)
			.filter((column) => column.primary && column.type !== 'increments')
		if (primaries.length > 0) {
			const columns = primaries.map((column) => this.wrap(column.name)).join(', ')
			definitions.push(`primary key (${columns})`)
		}

		for (const column of blueprint.columns) {
			const constraint = this.foreignKeySql(blueprint.table, column.attributes)
			if (constraint) definitions.push(constraint)
		}

		const statements = [
			`create table ${this.wrap(blueprint.table)} (\n  ${definitions.join(',\n  ')}\n)`,
		]

		for (const index of this.indexesOf(blueprint)) {
			statements.push(this.compileCreateIndex(blueprint.table, index))
		}

		return statements
	}

	/**
	 * Compile an `alter` blueprint.
	 *
	 * @remarks
	 * Order is adds, then column drops, then index creates, then index drops.
	 * Each added column gets its own `ALTER TABLE`, which is all sqlite accepts.
	 *
	 * @param blueprint - The changes to apply.
	 * @returns Statements to execute in order.
	 */
	compileAlter(blueprint: Blueprint): string[] {
		const statements: string[] = []

		// One ADD COLUMN per statement — sqlite accepts no more than that, and
		// the other dialects are happy either way.
		for (const column of blueprint.columns) {
			statements.push(
				`alter table ${this.wrap(blueprint.table)} add column ${this.columnSql(column.attributes)}`,
			)
		}

		for (const name of blueprint.droppedColumns) {
			statements.push(
				`alter table ${this.wrap(blueprint.table)} drop column ${this.wrap(name)}`,
			)
		}

		for (const index of this.indexesOf(blueprint)) {
			statements.push(this.compileCreateIndex(blueprint.table, index))
		}

		for (const name of blueprint.droppedIndexes) {
			statements.push(this.compileDropIndex(blueprint.table, name))
		}

		return statements
	}

	/**
	 * `DROP TABLE IF EXISTS`.
	 *
	 * @param table - Table name, unquoted.
	 * @returns One statement.
	 */
	compileDropIfExists(table: string): string {
		return `drop table if exists ${this.wrap(table)}`
	}

	/**
	 * `ALTER TABLE ... RENAME TO`.
	 *
	 * @param from - Current table name.
	 * @param to - New table name.
	 * @returns One statement.
	 */
	compileRename(from: string, to: string): string {
		return `alter table ${this.wrap(from)} rename to ${this.wrap(to)}`
	}

	/**
	 * `CREATE INDEX` / `CREATE UNIQUE INDEX`.
	 *
	 * @param table - Table the index covers.
	 * @param index - The index to create.
	 * @returns One statement.
	 */
	compileCreateIndex(table: string, index: IndexDefinition): string {
		const columns = index.columns.map((column) => this.wrap(column)).join(', ')
		const unique = index.unique ? 'unique ' : ''
		return `create ${unique}index ${this.wrap(index.name)} on ${this.wrap(table)} (${columns})`
	}

	/**
	 * `DROP INDEX`.
	 *
	 * @remarks
	 * Index names are database-wide on Postgres and sqlite, so the table is
	 * unused here; {@link MysqlGrammar} overrides this because MySQL scopes
	 * index names to their table.
	 *
	 * @param _table - Table the index covers, ignored by the base implementation.
	 * @param name - Index name.
	 * @returns One statement.
	 *
	 * @virtual
	 */
	compileDropIndex(_table: string, name: string): string {
		return `drop index ${this.wrap(name)}`
	}

	/**
	 * Query listing every table in the current database/schema.
	 *
	 * @returns A query returning one `name` column per table.
	 *
	 * @virtual
	 */
	abstract compileTableListing(): string

	/**
	 * Statements that drop the given tables, ignoring foreign key order.
	 *
	 * @param tables - Tables to drop; an empty list compiles to no statements.
	 * @returns Statements to execute in order, including any needed to suspend
	 * and restore constraint checking.
	 *
	 * @virtual
	 */
	abstract compileDropAllTables(tables: string[]): string[]

	// -- Shared building blocks ----------------------------------------------

	/**
	 * One column definition, as it appears inside `CREATE TABLE` or after
	 * `ADD COLUMN`.
	 *
	 * @param column - The column being compiled.
	 * @returns A column definition fragment.
	 */
	protected columnSql(column: ColumnAttributes): string {
		if (column.type === 'increments') return this.incrementsSql(column)

		let sql = `${this.wrap(column.name)} ${this.typeFor(column)}`
		sql += column.nullable ? ' null' : ' not null'
		if (column.default !== undefined) {
			sql += ` default ${this.defaultSql(column.default)}`
		}
		return sql
	}

	/**
	 * The table-level `CONSTRAINT ... FOREIGN KEY` clause for a column.
	 *
	 * @param table - Table the column belongs to, used to name the constraint
	 * `{table}_{column}_foreign`.
	 * @param column - The column being compiled.
	 * @returns The clause, or `undefined` if the column has no foreign key.
	 */
	protected foreignKeySql(table: string, column: ColumnAttributes): string | undefined {
		const foreignKey = column.foreignKey
		if (!foreignKey) return undefined

		let sql =
			`constraint ${this.wrap(`${table}_${column.name}_foreign`)} ` +
			`foreign key (${this.wrap(column.name)}) ` +
			`references ${this.wrap(foreignKey.table)} (${this.wrap(foreignKey.column)})`
		if (foreignKey.onDelete) sql += ` on delete ${foreignKey.onDelete}`
		if (foreignKey.onUpdate) sql += ` on update ${foreignKey.onUpdate}`
		return sql
	}

	/**
	 * Column-level `.unique()` / `.index()` flags plus explicit blueprint indexes.
	 *
	 * @param blueprint - The blueprint being compiled.
	 * @returns Every index to create, column-derived ones first.
	 */
	protected indexesOf(blueprint: Blueprint): IndexDefinition[] {
		const fromColumns = blueprint.columns
			.map((column) => column.attributes)
			.filter((column) => column.unique || column.indexed)
			.map((column) => ({
				columns: [column.name],
				unique: column.unique,
				name: defaultIndexName(blueprint.table, [column.name], column.unique),
			}))

		return [...fromColumns, ...blueprint.indexes]
	}

	/**
	 * A DEFAULT value as a SQL literal.
	 *
	 * @param value - The default declared on the column. A {@link RawExpression}
	 * is emitted verbatim; everything else is quoted for the dialect.
	 * @returns A literal safe to interpolate into a column definition.
	 */
	protected defaultSql(value: Bindable | RawExpression): string {
		if (isRaw(value)) return value.value
		if (value === null || value === undefined) return 'null'
		if (typeof value === 'boolean') return this.booleanLiteral(value)
		if (typeof value === 'number') return String(value)
		if (value instanceof Date) return this.quoteString(value.toISOString())
		return this.quoteString(value)
	}

	/**
	 * How the dialect spells a boolean literal.
	 *
	 * @param value - The boolean to render.
	 * @returns `'1'` or `'0'` by default; {@link PostgresGrammar} overrides this
	 * with `true` / `false`.
	 *
	 * @virtual
	 */
	protected booleanLiteral(value: boolean): string {
		return value ? '1' : '0'
	}

	/**
	 * Single-quote a string literal, doubling any embedded quote.
	 *
	 * @param value - The string to quote.
	 * @returns The quoted literal.
	 */
	protected quoteString(value: string): string {
		return `'${value.replace(/'/g, "''")}'`
	}
}
