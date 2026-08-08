import { ColumnDefinition } from './column.js'
import { raw } from './expression.js'
import type { ColumnType } from './column.js'

export interface IndexDefinition {
	name: string
	columns: string[]
	unique: boolean
}

/** Whether a blueprint describes a new table or a change to an existing one. */
export type BlueprintMode = 'create' | 'alter'

/**
 * Collects the columns and indexes that make up a table.
 *
 * Nothing here is dialect-specific — a {@link Grammar} translates the collected
 * definitions into SQL for whichever database is configured.
 */
export class Blueprint {
	readonly columns: ColumnDefinition[] = []
	readonly indexes: IndexDefinition[] = []
	readonly droppedColumns: string[] = []
	readonly droppedIndexes: string[] = []

	constructor(
		readonly table: string,
		readonly mode: BlueprintMode = 'create',
	) {}

	// -- Columns -------------------------------------------------------------

	/** Auto-incrementing primary key. */
	id(name = 'id'): ColumnDefinition {
		return this.addColumn(name, 'increments', { primary: true, unsigned: true })
	}

	uuid(name: string): ColumnDefinition {
		return this.addColumn(name, 'uuid')
	}

	string(name: string, length = 255): ColumnDefinition {
		return this.addColumn(name, 'string', { length })
	}

	text(name: string): ColumnDefinition {
		return this.addColumn(name, 'text')
	}

	integer(name: string): ColumnDefinition {
		return this.addColumn(name, 'integer')
	}

	bigInteger(name: string): ColumnDefinition {
		return this.addColumn(name, 'bigInteger')
	}

	boolean(name: string): ColumnDefinition {
		return this.addColumn(name, 'boolean')
	}

	float(name: string): ColumnDefinition {
		return this.addColumn(name, 'float')
	}

	decimal(name: string, precision = 8, scale = 2): ColumnDefinition {
		return this.addColumn(name, 'decimal', { precision, scale })
	}

	date(name: string): ColumnDefinition {
		return this.addColumn(name, 'date')
	}

	timestamp(name: string): ColumnDefinition {
		return this.addColumn(name, 'timestamp')
	}

	json(name: string): ColumnDefinition {
		return this.addColumn(name, 'json')
	}

	/** Unsigned big integer intended to hold another table's `id`. */
	foreignId(name: string): ColumnDefinition {
		return this.addColumn(name, 'bigInteger', { unsigned: true })
	}

	/** `created_at` and `updated_at`, both defaulting to the current time. */
	timestamps(): void {
		this.timestamp('created_at').default(raw('CURRENT_TIMESTAMP'))
		this.timestamp('updated_at').default(raw('CURRENT_TIMESTAMP'))
	}

	/** Nullable `deleted_at` column for soft-delete support. */
	softDeletes(name = 'deleted_at'): ColumnDefinition {
		return this.timestamp(name).nullable()
	}

	// -- Indexes -------------------------------------------------------------

	/** Composite (or single-column) index. */
	index(columns: string | string[], name?: string): this {
		return this.addIndex(columns, false, name)
	}

	/** Composite (or single-column) unique index. */
	unique(columns: string | string[], name?: string): this {
		return this.addIndex(columns, true, name)
	}

	// -- Drops ---------------------------------------------------------------

	dropColumn(...names: string[]): this {
		this.droppedColumns.push(...names)
		return this
	}

	dropIndex(name: string): this {
		this.droppedIndexes.push(name)
		return this
	}

	// -- Internals -----------------------------------------------------------

	private addColumn(
		name: string,
		type: ColumnType,
		options: { length?: number; precision?: number; scale?: number; primary?: boolean; unsigned?: boolean } = {},
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

/** Laravel's naming convention: `posts_author_id_index`. */
export function defaultIndexName(
	table: string,
	columns: string[],
	unique: boolean,
): string {
	return `${table}_${columns.join('_')}_${unique ? 'unique' : 'index'}`
}
