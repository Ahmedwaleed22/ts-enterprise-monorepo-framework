import { grammarFor } from '../schema/grammars/index.js'
import type { Bindable, Connection, Row } from '../types.js'

/** Postgres caps a statement at 65535 bound parameters; stay well under it. */
const MAX_ROWS_PER_INSERT = 500

/**
 * A seeder class, constructible from a {@link Connection}.
 *
 * @remarks
 * This is the shape {@link Seeder.call} and {@link SeederRunner} expect a
 * seeder file to default-export.
 *
 * @public
 */
export type SeederConstructor = new (connection: Connection) => Seeder

/**
 * Base class for every seeder.
 *
 * @remarks
 * Seeders write through the portable {@link Seeder.insert} helper rather than
 * raw SQL, so the same seed data loads into Postgres, MySQL or sqlite
 * unchanged.
 *
 * Seeders are not tracked the way migrations are: running one twice runs it
 * twice. Start with {@link Seeder.truncate} when a seeder needs to be
 * repeatable.
 *
 * `DatabaseSeeder` is the conventional entry point and composes the rest
 * through {@link Seeder.call}.
 *
 * @example
 * ```ts
 * import { Seeder } from '@monorepo-framework/database'
 *
 * export default class UserSeeder extends Seeder {
 *   async run(): Promise<void> {
 *     await this.truncate('users')
 *     await this.insert('users', [
 *       { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' },
 *     ])
 *   }
 * }
 * ```
 *
 * @public
 */
export abstract class Seeder {
	constructor(
		/**
		 * Database being seeded. Available to subclasses for anything the
		 * portable helpers do not cover.
		 */
		protected readonly connection: Connection,
	) {}

	/**
	 * Write this seeder's data.
	 *
	 * @virtual
	 */
	abstract run(): Promise<void>

	/**
	 * Run other seeders, sharing this seeder's connection.
	 *
	 * @remarks
	 * Sequential, in the order given, so a seeder may depend on rows an earlier
	 * one inserted.
	 *
	 * @param seeders - Seeder classes to instantiate and run.
	 */
	protected async call(...seeders: SeederConstructor[]): Promise<void> {
		for (const Constructor of seeders) {
			const seeder = new Constructor(this.connection)
			console.log(`Seeding: ${Constructor.name}`)
			await seeder.run()
		}
	}

	/**
	 * Insert rows, chunked so large seed sets stay within parameter limits.
	 *
	 * @remarks
	 * Column names come from the first row, and every row is assumed to share
	 * that shape — a later row with extra keys silently loses them, and one
	 * missing a key binds `undefined`, i.e. `NULL`.
	 *
	 * Rows are sent in chunks of 500 to stay under Postgres' 65535-parameter
	 * cap. The chunks are separate statements, so a failure part-way through
	 * leaves earlier chunks inserted unless the caller wrapped the seeder in a
	 * transaction.
	 *
	 * When the rows carry an explicit `id`, the table's Postgres sequence is
	 * resynced afterwards so the next application insert does not collide.
	 *
	 * @param table - Table name, unquoted.
	 * @param rows - Rows to insert; an empty array is a no-op.
	 */
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

	/**
	 * Remove every row from a table.
	 *
	 * @remarks
	 * Issues a `DELETE`, not a `TRUNCATE`: sqlite has no `TRUNCATE`, and on the
	 * other dialects `TRUNCATE` trips over foreign keys pointing at the table.
	 * As a result auto-increment counters are *not* reset.
	 *
	 * @param table - Table name, unquoted.
	 */
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
	 *
	 * @internal
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
