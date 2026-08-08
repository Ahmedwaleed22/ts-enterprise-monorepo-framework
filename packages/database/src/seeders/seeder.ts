import { grammarFor } from '../schema/grammars/index.js'
import type { Bindable, Connection, Row } from '../types.js'

/** Postgres caps a statement at 65535 bound parameters; stay well under it. */
const MAX_ROWS_PER_INSERT = 500

export type SeederConstructor = new (connection: Connection) => Seeder

/**
 * Base class for every seeder.
 *
 * Seeders write through the portable `insert` helper rather than raw SQL, so
 * the same seed data loads into Postgres, MySQL or sqlite unchanged.
 */
export abstract class Seeder {
	constructor(protected readonly connection: Connection) {}

	abstract run(): Promise<void>

	/** Run other seeders, sharing this seeder's connection. */
	protected async call(...seeders: SeederConstructor[]): Promise<void> {
		for (const Constructor of seeders) {
			const seeder = new Constructor(this.connection)
			console.log(`Seeding: ${Constructor.name}`)
			await seeder.run()
		}
	}

	/** Insert rows, chunked so large seed sets stay within parameter limits. */
	protected async insert(table: string, rows: readonly Row[]): Promise<void> {
		if (rows.length === 0) return

		const grammar = grammarFor(this.connection.dialect)
		// Every row is expected to share the first row's shape.
		const columns = Object.keys(rows[0])
		const columnList = columns.map((column) => grammar.wrap(column)).join(', ')
		const placeholders = `(${columns.map(() => '?').join(', ')})`

		for (let offset = 0; offset < rows.length; offset += MAX_ROWS_PER_INSERT) {
			const chunk = rows.slice(offset, offset + MAX_ROWS_PER_INSERT)
			const bindings = chunk.flatMap((row) => columns.map((column) => row[column] as Bindable))

			await this.connection.statement(
				`insert into ${grammar.wrap(table)} (${columnList}) ` +
					`values ${chunk.map(() => placeholders).join(', ')}`,
				bindings,
			)
		}

		if (columns.includes('id')) await this.syncSequence(table)
	}

	/** Remove every row from a table. */
	protected async truncate(table: string): Promise<void> {
		const grammar = grammarFor(this.connection.dialect)
		// DELETE rather than TRUNCATE: sqlite has no TRUNCATE, and on the other
		// dialects TRUNCATE trips over foreign keys pointing at the table.
		await this.connection.statement(`delete from ${grammar.wrap(table)}`)
	}

	/**
	 * Postgres sequences do not advance when a row supplies its own id, so
	 * seeding with explicit ids would make the next application insert collide.
	 * MySQL and sqlite adjust their counters on their own.
	 */
	private async syncSequence(table: string, column = 'id'): Promise<void> {
		if (this.connection.dialect !== 'postgres') return

		const grammar = grammarFor(this.connection.dialect)
		await this.connection.statement(
			`select setval(
				pg_get_serial_sequence(?, ?),
				coalesce((select max(${grammar.wrap(column)}) from ${grammar.wrap(table)}), 1),
				true
			)`,
			[table, column],
		)
	}
}
