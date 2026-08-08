import { defaultIndexName } from '../blueprint.js'
import { isRaw } from '../expression.js'
import type { Blueprint, IndexDefinition } from '../blueprint.js'
import type { ColumnAttributes } from '../column.js'
import type { RawExpression } from '../expression.js'
import type { Bindable, Dialect } from '../../types.js'

/**
 * Turns dialect-neutral blueprints into SQL.
 *
 * Subclasses supply the parts that genuinely differ between databases — type
 * names, identifier quoting, auto-increment syntax — while the structure of a
 * CREATE TABLE is shared here.
 */
export abstract class Grammar {
	abstract readonly dialect: Dialect

	/** Quote an identifier so reserved words and mixed case are safe. */
	abstract wrap(identifier: string): string

	/** The dialect's column type for a neutral column description. */
	protected abstract typeFor(column: ColumnAttributes): string

	/** The full column definition for an auto-incrementing primary key. */
	protected abstract incrementsSql(column: ColumnAttributes): string

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

	compileDropIfExists(table: string): string {
		return `drop table if exists ${this.wrap(table)}`
	}

	compileRename(from: string, to: string): string {
		return `alter table ${this.wrap(from)} rename to ${this.wrap(to)}`
	}

	compileCreateIndex(table: string, index: IndexDefinition): string {
		const columns = index.columns.map((column) => this.wrap(column)).join(', ')
		const unique = index.unique ? 'unique ' : ''
		return `create ${unique}index ${this.wrap(index.name)} on ${this.wrap(table)} (${columns})`
	}

	compileDropIndex(_table: string, name: string): string {
		return `drop index ${this.wrap(name)}`
	}

	/** Query listing every table in the current database/schema. */
	abstract compileTableListing(): string

	/** Statements that drop the given tables, ignoring foreign key order. */
	abstract compileDropAllTables(tables: string[]): string[]

	// -- Shared building blocks ----------------------------------------------

	protected columnSql(column: ColumnAttributes): string {
		if (column.type === 'increments') return this.incrementsSql(column)

		let sql = `${this.wrap(column.name)} ${this.typeFor(column)}`
		sql += column.nullable ? ' null' : ' not null'
		if (column.default !== undefined) {
			sql += ` default ${this.defaultSql(column.default)}`
		}
		return sql
	}

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

	/** Column-level `.unique()` / `.index()` flags plus explicit blueprint indexes. */
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

	protected defaultSql(value: Bindable | RawExpression): string {
		if (isRaw(value)) return value.value
		if (value === null || value === undefined) return 'null'
		if (typeof value === 'boolean') return this.booleanLiteral(value)
		if (typeof value === 'number') return String(value)
		if (value instanceof Date) return this.quoteString(value.toISOString())
		return this.quoteString(value)
	}

	protected booleanLiteral(value: boolean): string {
		return value ? '1' : '0'
	}

	protected quoteString(value: string): string {
		return `'${value.replace(/'/g, "''")}'`
	}
}
