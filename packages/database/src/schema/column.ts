import type { RawExpression } from './expression.js'
import type { Bindable } from '../types.js'

export type ColumnType =
	| 'increments'
	| 'string'
	| 'text'
	| 'integer'
	| 'bigInteger'
	| 'boolean'
	| 'float'
	| 'decimal'
	| 'date'
	| 'timestamp'
	| 'json'
	| 'uuid'

export type ReferentialAction = 'cascade' | 'restrict' | 'set null' | 'no action'

export interface ForeignKeyDefinition {
	table: string
	column: string
	onDelete?: ReferentialAction
	onUpdate?: ReferentialAction
}

/** The dialect-neutral description a grammar compiles into SQL. */
export interface ColumnAttributes {
	name: string
	type: ColumnType
	length?: number
	precision?: number
	scale?: number
	nullable: boolean
	unique: boolean
	indexed: boolean
	primary: boolean
	unsigned: boolean
	default?: Bindable | RawExpression
	foreignKey?: ForeignKeyDefinition
}

/**
 * A single column in a {@link Blueprint}, described in dialect-neutral terms.
 *
 * The grammar for the active database turns these descriptions into SQL, so a
 * migration written once runs unchanged on Postgres, MySQL and sqlite.
 */
export class ColumnDefinition {
	readonly attributes: ColumnAttributes

	constructor(name: string, type: ColumnType, options: Partial<ColumnAttributes> = {}) {
		this.attributes = {
			name,
			type,
			nullable: false,
			unique: false,
			indexed: false,
			primary: false,
			unsigned: false,
			...options,
		}
	}

	/** Allow NULL in this column. */
	nullable(value = true): this {
		this.attributes.nullable = value
		return this
	}

	/** Set the column's DEFAULT. Wrap with `raw()` to emit literal SQL. */
	default(value: Bindable | RawExpression): this {
		this.attributes.default = value
		return this
	}

	/** Add a unique index covering this column. */
	unique(value = true): this {
		this.attributes.unique = value
		return this
	}

	/** Add a plain index covering this column. */
	index(value = true): this {
		this.attributes.indexed = value
		return this
	}

	/** Make this column the table's primary key. */
	primary(value = true): this {
		this.attributes.primary = value
		return this
	}

	/** Postgres has no unsigned integers, so this is honoured on MySQL only. */
	unsigned(value = true): this {
		this.attributes.unsigned = value
		return this
	}

	/** Point this column at another table's column. */
	references(table: string, column = 'id'): this {
		this.attributes.foreignKey = { table, column }
		return this
	}

	/** What happens to this row when the referenced row is deleted. */
	onDelete(action: ReferentialAction): this {
		this.requireForeignKey('onDelete').onDelete = action
		return this
	}

	/** What happens to this row when the referenced key is updated. */
	onUpdate(action: ReferentialAction): this {
		this.requireForeignKey('onUpdate').onUpdate = action
		return this
	}

	/** Shorthand for `references(table).onDelete('cascade')`. */
	constrained(table: string, column = 'id'): this {
		return this.references(table, column).onDelete('cascade')
	}

	private requireForeignKey(method: string): ForeignKeyDefinition {
		const foreignKey = this.attributes.foreignKey
		if (!foreignKey) {
			throw new Error(
				`Cannot call ${method}() on "${this.attributes.name}" — call references() first.`,
			)
		}
		return foreignKey
	}
}
