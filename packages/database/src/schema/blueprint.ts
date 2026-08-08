import { ColumnDefinition } from './column.js'
import { raw } from './expression.js'
import type { ColumnType } from './column.js'

/**
 * A named index over one or more columns.
 *
 * @remarks
 * Produced by {@link Blueprint.index} / {@link Blueprint.unique} and by the
 * column-level `.index()` / `.unique()` flags. Exposed for custom grammars,
 * which is why it is `@beta` alongside {@link Grammar}.
 *
 * @beta
 */
export interface IndexDefinition {
	/** Index name, defaulting to the `{table}_{columns}_{index|unique}` convention. */
	name: string
	/** Columns covered, in order — order matters for composite indexes. */
	columns: string[]
	/** Whether the index enforces uniqueness. */
	unique: boolean
}

/**
 * Whether a blueprint describes a new table or a change to an existing one.
 *
 * @public
 */
export type BlueprintMode = 'create' | 'alter'

/**
 * Collects the columns and indexes that make up a table.
 *
 * @remarks
 * Nothing here is dialect-specific — a {@link Grammar} translates the collected
 * definitions into SQL for whichever database is configured. A blueprint is
 * inert: it records intent and emits no SQL until a grammar compiles it.
 *
 * Migrations receive one through {@link Schema.create} or {@link Schema.table}
 * rather than constructing it themselves.
 *
 * @example
 * ```ts
 * await schema.create('users', (table) => {
 *   table.id()
 *   table.string('email').unique()
 *   table.foreignId('team_id').constrained('teams')
 *   table.timestamps()
 *   table.index(['team_id', 'role'])
 * })
 * ```
 *
 * @public
 */
export class Blueprint {
	/** Columns declared so far, in declaration order. */
	readonly columns: ColumnDefinition[] = []

	/**
	 * Explicit multi-column indexes. Column-level `.index()` / `.unique()` flags
	 * are not listed here; the grammar derives those at compile time.
	 *
	 * @beta
	 */
	readonly indexes: IndexDefinition[] = []

	/**
	 * Columns queued for removal by {@link Blueprint.dropColumn}.
	 *
	 * @beta
	 */
	readonly droppedColumns: string[] = []

	/**
	 * Indexes queued for removal by {@link Blueprint.dropIndex}.
	 *
	 * @beta
	 */
	readonly droppedIndexes: string[] = []

	constructor(
		/** Table name, unquoted. */
		readonly table: string,
		/** Whether this blueprint creates a table or alters an existing one. */
		readonly mode: BlueprintMode = 'create',
	) {}

	// -- Columns -------------------------------------------------------------

	/**
	 * Auto-incrementing primary key.
	 *
	 * @remarks
	 * Compiles to whatever each dialect requires: `bigserial` on Postgres,
	 * `bigint unsigned auto_increment` on MySQL, and
	 * `integer primary key autoincrement` on sqlite — the only spelling sqlite
	 * treats as a true rowid alias.
	 *
	 * @param name - Column name.
	 * @returns The new column, for chaining.
	 */
	id(name = 'id'): ColumnDefinition {
		return this.addColumn(name, 'increments', { primary: true, unsigned: true })
	}

	/**
	 * UUID column: native `uuid` on Postgres, `char(36)` on MySQL, `text` on
	 * sqlite. Values are not generated or validated for you.
	 *
	 * @param name - Column name.
	 * @returns The new column, for chaining.
	 */
	uuid(name: string): ColumnDefinition {
		return this.addColumn(name, 'uuid')
	}

	/**
	 * Variable-length string, i.e. `varchar(length)`.
	 *
	 * @param name - Column name.
	 * @param length - Maximum characters.
	 * @returns The new column, for chaining.
	 */
	string(name: string, length = 255): ColumnDefinition {
		return this.addColumn(name, 'string', { length })
	}

	/**
	 * Unbounded text.
	 *
	 * @param name - Column name.
	 * @returns The new column, for chaining.
	 */
	text(name: string): ColumnDefinition {
		return this.addColumn(name, 'text')
	}

	/**
	 * 32-bit integer.
	 *
	 * @param name - Column name.
	 * @returns The new column, for chaining.
	 */
	integer(name: string): ColumnDefinition {
		return this.addColumn(name, 'integer')
	}

	/**
	 * 64-bit integer.
	 *
	 * @remarks
	 * sqlite stores every integer in one variable-width type, so the distinction
	 * from {@link Blueprint.integer} only matters on Postgres and MySQL.
	 *
	 * @param name - Column name.
	 * @returns The new column, for chaining.
	 */
	bigInteger(name: string): ColumnDefinition {
		return this.addColumn(name, 'bigInteger')
	}

	/**
	 * Boolean column.
	 *
	 * @remarks
	 * A real `boolean` on Postgres; `tinyint(1)` on MySQL and an integer on
	 * sqlite, both of which read back as `1`/`0` rather than `true`/`false`.
	 *
	 * @param name - Column name.
	 * @returns The new column, for chaining.
	 */
	boolean(name: string): ColumnDefinition {
		return this.addColumn(name, 'boolean')
	}

	/**
	 * Double-precision floating point. Use {@link Blueprint.decimal} for money.
	 *
	 * @param name - Column name.
	 * @returns The new column, for chaining.
	 */
	float(name: string): ColumnDefinition {
		return this.addColumn(name, 'float')
	}

	/**
	 * Fixed-point decimal.
	 *
	 * @remarks
	 * sqlite has no real fixed-point type and stores these as `numeric`, so
	 * precision is advisory there.
	 *
	 * @param name - Column name.
	 * @param precision - Total digits.
	 * @param scale - Digits after the decimal point.
	 * @returns The new column, for chaining.
	 */
	decimal(name: string, precision = 8, scale = 2): ColumnDefinition {
		return this.addColumn(name, 'decimal', { precision, scale })
	}

	/**
	 * Calendar date with no time component.
	 *
	 * @param name - Column name.
	 * @returns The new column, for chaining.
	 */
	date(name: string): ColumnDefinition {
		return this.addColumn(name, 'date')
	}

	/**
	 * Timestamp with millisecond precision, without time zone.
	 *
	 * @remarks
	 * Stored as ISO-8601 text on sqlite, since it has no date type.
	 *
	 * @param name - Column name.
	 * @returns The new column, for chaining.
	 */
	timestamp(name: string): ColumnDefinition {
		return this.addColumn(name, 'timestamp')
	}

	/**
	 * JSON document: `jsonb` on Postgres, `json` on MySQL, `text` on sqlite.
	 *
	 * @param name - Column name.
	 * @returns The new column, for chaining.
	 */
	json(name: string): ColumnDefinition {
		return this.addColumn(name, 'json')
	}

	/**
	 * Unsigned big integer intended to hold another table's `id`.
	 *
	 * @remarks
	 * Declares the column only. Follow with
	 * {@link ColumnDefinition.constrained} or
	 * {@link ColumnDefinition.references} to add the actual foreign key.
	 *
	 * @param name - Column name, conventionally `{table}_id`.
	 * @returns The new column, for chaining.
	 */
	foreignId(name: string): ColumnDefinition {
		return this.addColumn(name, 'bigInteger', { unsigned: true })
	}

	/**
	 * `created_at` and `updated_at`, both defaulting to the current time.
	 *
	 * @remarks
	 * Neither column is maintained after insert — nothing here updates
	 * `updated_at` on write; that is the application's job.
	 */
	timestamps(): void {
		this.timestamp('created_at').default(raw('CURRENT_TIMESTAMP'))
		this.timestamp('updated_at').default(raw('CURRENT_TIMESTAMP'))
	}

	/**
	 * Nullable `deleted_at` column for soft-delete support.
	 *
	 * @param name - Column name.
	 * @returns The new column, for chaining.
	 */
	softDeletes(name = 'deleted_at'): ColumnDefinition {
		return this.timestamp(name).nullable()
	}

	// -- Indexes -------------------------------------------------------------

	/**
	 * Composite (or single-column) index.
	 *
	 * @param columns - Column name, or names in index order.
	 * @param name - Index name.
	 * @defaultValue name - `{table}_{columns}_index`
	 * @returns This blueprint, for chaining.
	 */
	index(columns: string | string[], name?: string): this {
		return this.addIndex(columns, false, name)
	}

	/**
	 * Composite (or single-column) unique index.
	 *
	 * @param columns - Column name, or names in index order.
	 * @param name - Index name.
	 * @defaultValue name - `{table}_{columns}_unique`
	 * @returns This blueprint, for chaining.
	 */
	unique(columns: string | string[], name?: string): this {
		return this.addIndex(columns, true, name)
	}

	// -- Drops ---------------------------------------------------------------

	/**
	 * Queue columns for removal.
	 *
	 * @remarks
	 * Only meaningful on an `alter` blueprint. One `ALTER TABLE ... DROP COLUMN`
	 * is emitted per name; older sqlite builds reject the statement outright,
	 * and no dialect will restore the data, so this is not reversible.
	 *
	 * @param names - Columns to drop.
	 * @returns This blueprint, for chaining.
	 *
	 * @beta
	 */
	dropColumn(...names: string[]): this {
		this.droppedColumns.push(...names)
		return this
	}

	/**
	 * Queue an index for removal.
	 *
	 * @remarks
	 * Takes the index name, not the column name. Indexes the builder created
	 * are named `{table}_{columns}_index`, or `..._unique` when unique.
	 *
	 * @param name - Index to drop.
	 * @returns This blueprint, for chaining.
	 *
	 * @beta
	 */
	dropIndex(name: string): this {
		this.droppedIndexes.push(name)
		return this
	}

	// -- Internals -----------------------------------------------------------

	private addColumn(
		name: string,
		type: ColumnType,
		options: {
			length?: number
			precision?: number
			scale?: number
			primary?: boolean
			unsigned?: boolean
		} = {},
	): ColumnDefinition {
		const column = new ColumnDefinition(name, type, options)
		this.columns.push(column)
		return column
	}

	private addIndex(columns: string | string[], unique: boolean, name?: string): this {
		const list = Array.isArray(columns) ? columns : [columns]
		this.indexes.push({
			columns: list,
			unique,
			name: name ?? defaultIndexName(this.table, list, unique),
		})
		return this
	}
}

/**
 * Laravel's naming convention: `posts_author_id_index`.
 *
 * @param table - Table the index belongs to.
 * @param columns - Columns covered, in index order.
 * @param unique - Whether the index is unique, which changes the suffix.
 * @returns The generated index name.
 *
 * @internal
 */
export function defaultIndexName(
	table: string,
	columns: string[],
	unique: boolean,
): string {
	return `${table}_${columns.join('_')}_${unique ? 'unique' : 'index'}`
}
