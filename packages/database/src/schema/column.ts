import type { RawExpression } from './expression.js'
import type { Bindable } from '../types.js'

/**
 * The dialect-neutral column types a {@link Blueprint} can declare.
 *
 * @remarks
 * Each grammar maps these onto its own type names — `json` becomes `jsonb` on
 * Postgres, `json` on MySQL and `text` on sqlite, for instance. `increments` is
 * not declared directly; use {@link Blueprint.id}.
 *
 * @public
 */
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

/**
 * What a foreign key does to this row when the referenced row changes.
 *
 * @public
 */
export type ReferentialAction = 'cascade' | 'restrict' | 'set null' | 'no action'

/**
 * The target and behaviour of a column's foreign key.
 *
 * @remarks
 * Built by {@link ColumnDefinition.references} and
 * {@link ColumnDefinition.constrained} rather than written by hand. Constraints
 * are emitted inside `CREATE TABLE`, because sqlite cannot add them afterwards.
 *
 * @beta
 */
export interface ForeignKeyDefinition {
	/** Table being referenced. */
	table: string
	/** Column in that table, almost always its primary key. */
	column: string
	/** Action when the referenced row is deleted. */
	onDelete?: ReferentialAction
	/** Action when the referenced key is updated. */
	onUpdate?: ReferentialAction
}

/**
 * The dialect-neutral description a grammar compiles into SQL.
 *
 * @remarks
 * This is the wire format between the builder and the grammars. It is exposed
 * so custom grammars can be written against it, which is also why it is `@beta`
 * — fields will be added here as the builder grows column modifiers.
 *
 * @beta
 */
export interface ColumnAttributes {
	/** Column name, unquoted. */
	name: string
	/** Neutral type the grammar maps to a dialect type. */
	type: ColumnType
	/** Character length for `string`. */
	length?: number
	/** Total digits for `decimal`. */
	precision?: number
	/** Digits after the point for `decimal`. */
	scale?: number
	/** Whether NULL is allowed. */
	nullable: boolean
	/** Whether a unique index covers this column alone. */
	unique: boolean
	/** Whether a plain index covers this column alone. */
	indexed: boolean
	/** Whether this column is (part of) the primary key. */
	primary: boolean
	/** MySQL-only; Postgres and sqlite have no unsigned integers. */
	unsigned: boolean
	/** DEFAULT value, or a {@link RawExpression} for literal SQL. */
	default?: Bindable | RawExpression
	/** Foreign key constraint, if any. */
	foreignKey?: ForeignKeyDefinition
}

/**
 * A single column in a {@link Blueprint}, described in dialect-neutral terms.
 *
 * @remarks
 * The grammar for the active database turns these descriptions into SQL, so a
 * migration written once runs unchanged on Postgres, MySQL and sqlite.
 *
 * Every modifier returns `this`, so they chain. Instances come from the
 * `Blueprint` column methods rather than being constructed directly.
 *
 * @example
 * ```ts
 * table.string('email', 320).unique()
 * table.foreignId('team_id').constrained('teams')
 * ```
 *
 * @public
 */
export class ColumnDefinition {
	/**
	 * The collected description, as handed to the grammar.
	 *
	 * @beta
	 */
	readonly attributes: ColumnAttributes

	/**
	 * Columns are normally created by the {@link Blueprint} methods; construct
	 * one directly only when building a blueprint by hand.
	 *
	 * @param name - Column name, unquoted.
	 * @param type - Neutral column type.
	 * @param options - Any attributes to preset; the rest default to `false`.
	 *
	 * @beta
	 */
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

	/**
	 * Allow NULL in this column.
	 *
	 * @param value - Pass `false` to revert to NOT NULL.
	 * @returns This column, for chaining.
	 */
	nullable(value = true): this {
		this.attributes.nullable = value
		return this
	}

	/**
	 * Set the column's DEFAULT.
	 *
	 * @remarks
	 * Plain values are quoted for the target dialect — booleans become `true`
	 * on Postgres and `1` elsewhere. Wrap with {@link raw} to emit literal SQL
	 * such as `CURRENT_TIMESTAMP`.
	 *
	 * @param value - The default, or a raw SQL expression.
	 * @returns This column, for chaining.
	 */
	default(value: Bindable | RawExpression): this {
		this.attributes.default = value
		return this
	}

	/**
	 * Add a unique index covering this column.
	 *
	 * @remarks
	 * The index is named `{table}_{column}_unique`. For a multi-column unique
	 * index use {@link Blueprint.unique} instead.
	 *
	 * @param value - Pass `false` to drop the flag again.
	 * @returns This column, for chaining.
	 */
	unique(value = true): this {
		this.attributes.unique = value
		return this
	}

	/**
	 * Add a plain index covering this column, named `{table}_{column}_index`.
	 *
	 * @param value - Pass `false` to drop the flag again.
	 * @returns This column, for chaining.
	 */
	index(value = true): this {
		this.attributes.indexed = value
		return this
	}

	/**
	 * Make this column the table's primary key.
	 *
	 * @remarks
	 * Marking several columns primary produces one composite key. Not needed
	 * after {@link Blueprint.id}, which is already primary.
	 *
	 * @param value - Pass `false` to drop the flag again.
	 * @returns This column, for chaining.
	 */
	primary(value = true): this {
		this.attributes.primary = value
		return this
	}

	/**
	 * Mark the column unsigned.
	 *
	 * @remarks
	 * Postgres and sqlite have no unsigned integers, so this is honoured on
	 * MySQL only — it is a storage hint, never a portable constraint.
	 *
	 * @param value - Pass `false` to drop the flag again.
	 * @returns This column, for chaining.
	 */
	unsigned(value = true): this {
		this.attributes.unsigned = value
		return this
	}

	/**
	 * Point this column at another table's column.
	 *
	 * @remarks
	 * Replaces any foreign key already declared on this column, including the
	 * `ON DELETE` and `ON UPDATE` actions.
	 *
	 * @param table - Table being referenced.
	 * @param column - Column in that table.
	 * @returns This column, for chaining.
	 */
	references(table: string, column = 'id'): this {
		this.attributes.foreignKey = { table, column }
		return this
	}

	/**
	 * What happens to this row when the referenced row is deleted.
	 *
	 * @param action - The referential action to emit.
	 * @returns This column, for chaining.
	 * @throws Error if no foreign key has been declared yet — call
	 * {@link ColumnDefinition.references} first.
	 */
	onDelete(action: ReferentialAction): this {
		this.requireForeignKey('onDelete').onDelete = action
		return this
	}

	/**
	 * What happens to this row when the referenced key is updated.
	 *
	 * @param action - The referential action to emit.
	 * @returns This column, for chaining.
	 * @throws Error if no foreign key has been declared yet — call
	 * {@link ColumnDefinition.references} first.
	 */
	onUpdate(action: ReferentialAction): this {
		this.requireForeignKey('onUpdate').onUpdate = action
		return this
	}

	/**
	 * Shorthand for `references(table).onDelete('cascade')`.
	 *
	 * @param table - Table being referenced.
	 * @param column - Column in that table.
	 * @returns This column, for chaining.
	 */
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
