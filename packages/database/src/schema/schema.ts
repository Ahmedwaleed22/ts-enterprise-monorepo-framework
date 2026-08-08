import { Blueprint } from './blueprint.js'
import { grammarFor } from './grammars/index.js'
import type { Grammar } from './grammars/grammar.js'
import type { Connection } from '../types.js'

/**
 * The schema builder handed to every migration.
 *
 * @remarks
 * Migrations describe *what* the table should look like; the grammar for the
 * configured database decides how to say it. The same migration file therefore
 * runs unchanged against Postgres, MySQL and sqlite.
 *
 * Statements are issued as they are compiled, in order. Whether a failed
 * migration leaves partial DDL behind depends on the database, not on this
 * class: {@link Migrator} wraps each step in a transaction on Postgres and
 * sqlite, but MySQL commits implicitly on DDL.
 *
 * @example
 * ```ts
 * export default class CreateUsersTable extends Migration {
 *   async up(schema: Schema): Promise<void> {
 *     await schema.create('users', (table) => {
 *       table.id()
 *       table.string('email').unique()
 *       table.timestamps()
 *     })
 *   }
 *
 *   async down(schema: Schema): Promise<void> {
 *     await schema.dropIfExists('users')
 *   }
 * }
 * ```
 *
 * @public
 */
export class Schema {
	/**
	 * The compiler for the connection's dialect, for inspecting or reusing the
	 * generated SQL — {@link Grammar.wrap} in particular, to quote an identifier
	 * the same way the builder does.
	 *
	 * @beta
	 */
	readonly grammar: Grammar

	/**
	 * @param connection - Database to run the DDL against. Pass a transaction's
	 * connection to keep the statements inside it.
	 */
	constructor(private readonly connection: Connection) {
		this.grammar = grammarFor(connection.dialect)
	}

	/** The dialect currently being migrated, for the rare dialect-specific step. */
	get dialect() {
		return this.connection.dialect
	}

	/**
	 * Create a new table.
	 *
	 * @remarks
	 * Fails if the table already exists — guard with {@link Schema.hasTable}
	 * when that is a possibility. Foreign keys are emitted inside the
	 * `CREATE TABLE`, because sqlite cannot add them afterwards, so a referenced
	 * table must be created first.
	 *
	 * @param table - Table name, unquoted.
	 * @param define - Callback that declares the columns and indexes.
	 */
	async create(table: string, define: (table: Blueprint) => void): Promise<void> {
		const blueprint = new Blueprint(table, 'create')
		define(blueprint)
		await this.run(this.grammar.compileCreate(blueprint))
	}

	/**
	 * Add to or drop from an existing table.
	 *
	 * @remarks
	 * Columns are added one `ALTER TABLE` at a time, sqlite's limit. Modifying
	 * an existing column's type or nullability is not supported; use
	 * {@link Schema.raw} for that.
	 *
	 * @param table - Table name, unquoted.
	 * @param define - Callback that declares the additions and drops.
	 */
	async table(table: string, define: (table: Blueprint) => void): Promise<void> {
		const blueprint = new Blueprint(table, 'alter')
		define(blueprint)
		await this.run(this.grammar.compileAlter(blueprint))
	}

	/**
	 * Drop a table, failing if it does not exist.
	 *
	 * @param table - Table name, unquoted.
	 */
	async drop(table: string): Promise<void> {
		await this.connection.statement(`drop table ${this.grammar.wrap(table)}`)
	}

	/**
	 * Drop a table if it exists — the usual body of a migration's `down`.
	 *
	 * @param table - Table name, unquoted.
	 */
	async dropIfExists(table: string): Promise<void> {
		await this.connection.statement(this.grammar.compileDropIfExists(table))
	}

	/**
	 * Rename a table.
	 *
	 * @remarks
	 * Indexes and constraints follow the table, but their generated *names* keep
	 * the old table's prefix on every dialect.
	 *
	 * @param from - Current table name.
	 * @param to - New table name.
	 *
	 * @beta
	 */
	async rename(from: string, to: string): Promise<void> {
		await this.connection.statement(this.grammar.compileRename(from, to))
	}

	/**
	 * Every table name in the current database or schema.
	 *
	 * @remarks
	 * Scoped to the connection's current schema on Postgres and its current
	 * database on MySQL. sqlite's internal `sqlite_%` tables are excluded.
	 *
	 * @returns Table names, in whatever order the catalogue returns them.
	 */
	async tableNames(): Promise<string[]> {
		const rows = await this.connection.select<{ name: string }>(
			this.grammar.compileTableListing(),
		)
		return rows.map((row) => row.name)
	}

	/**
	 * Whether a table exists.
	 *
	 * @param table - Table name, unquoted and case-sensitive.
	 * @returns `true` if the catalogue lists it.
	 */
	async hasTable(table: string): Promise<boolean> {
		return (await this.tableNames()).includes(table)
	}

	/**
	 * Drop every table — the destructive half of `migrate:fresh`.
	 *
	 * @remarks
	 * Includes the migrations tracking table, so the next run starts from batch
	 * one. Foreign key order is handled per dialect: `CASCADE` on Postgres,
	 * suspended constraint checks on MySQL and sqlite.
	 */
	async dropAllTables(): Promise<void> {
		await this.run(this.grammar.compileDropAllTables(await this.tableNames()))
	}

	/**
	 * Escape hatch for DDL the builder does not model.
	 *
	 * @remarks
	 * The query is sent verbatim and takes no bindings, so anything interpolated
	 * into it is an injection vector. Statements written here are dialect
	 * specific — branch on {@link Schema.dialect} when a migration must run
	 * everywhere.
	 *
	 * @param query - Literal SQL.
	 */
	async raw(query: string): Promise<void> {
		await this.connection.statement(query)
	}

	private async run(statements: string[]): Promise<void> {
		for (const statement of statements) {
			await this.connection.statement(statement)
		}
	}
}
