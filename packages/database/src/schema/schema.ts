import { Blueprint } from './blueprint.js'
import { grammarFor } from './grammars/index.js'
import type { Grammar } from './grammars/grammar.js'
import type { Connection } from '../types.js'

/**
 * The schema builder handed to every migration.
 *
 * Migrations describe *what* the table should look like; the grammar for the
 * configured database decides how to say it. The same migration file therefore
 * runs unchanged against Postgres, MySQL and sqlite.
 */
export class Schema {
	readonly grammar: Grammar

	constructor(private readonly connection: Connection) {
		this.grammar = grammarFor(connection.dialect)
	}

	/** The dialect currently being migrated, for the rare dialect-specific step. */
	get dialect() {
		return this.connection.dialect
	}

	/** Create a new table. */
	async create(table: string, define: (table: Blueprint) => void): Promise<void> {
		const blueprint = new Blueprint(table, 'create')
		define(blueprint)
		await this.run(this.grammar.compileCreate(blueprint))
	}

	/** Add to or drop from an existing table. */
	async table(table: string, define: (table: Blueprint) => void): Promise<void> {
		const blueprint = new Blueprint(table, 'alter')
		define(blueprint)
		await this.run(this.grammar.compileAlter(blueprint))
	}

	async drop(table: string): Promise<void> {
		await this.connection.statement(`drop table ${this.grammar.wrap(table)}`)
	}

	async dropIfExists(table: string): Promise<void> {
		await this.connection.statement(this.grammar.compileDropIfExists(table))
	}

	async rename(from: string, to: string): Promise<void> {
		await this.connection.statement(this.grammar.compileRename(from, to))
	}

	/** Every table name in the current database or schema. */
	async tableNames(): Promise<string[]> {
		const rows = await this.connection.select<{ name: string }>(
			this.grammar.compileTableListing(),
		)
		return rows.map((row) => row.name)
	}

	async hasTable(table: string): Promise<boolean> {
		return (await this.tableNames()).includes(table)
	}

	/** Drop every table — the destructive half of `migrate:fresh`. */
	async dropAllTables(): Promise<void> {
		await this.run(this.grammar.compileDropAllTables(await this.tableNames()))
	}

	/** Escape hatch for DDL the builder does not model. */
	async raw(query: string): Promise<void> {
		await this.connection.statement(query)
	}

	private async run(statements: string[]): Promise<void> {
		for (const statement of statements) {
			await this.connection.statement(statement)
		}
	}
}
