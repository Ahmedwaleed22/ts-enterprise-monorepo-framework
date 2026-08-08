/**
 * Laravel-style migrations and seeders that run unchanged on Postgres, MySQL
 * and sqlite.
 *
 * @remarks
 * Migrations describe tables in dialect-neutral terms through {@link Schema}
 * and {@link Blueprint}; a {@link Grammar} compiles them to SQL for whichever
 * database is configured. Switching database means changing one environment
 * variable, not rewriting migrations.
 *
 * The layers, from the bottom up:
 *
 * - {@link createConnection} / {@link Connection} — a driver-agnostic handle,
 *   configured by {@link configFromEnv}. Drivers are optional peer dependencies
 *   loaded lazily.
 * - {@link Grammar} — compiles blueprints to a dialect's SQL.
 * - {@link Schema} / {@link Blueprint} / {@link ColumnDefinition} — the builder
 *   a migration writes against.
 * - {@link Migration} / {@link Migrator} — discovery, ordering, batching and
 *   rollback.
 * - {@link Seeder} / {@link SeederRunner} — portable seed data.
 * - {@link runConsole} — the CLI an application wires up.
 *
 * ### Release tags
 *
 * Everything here carries a TSDoc release tag:
 *
 * - `@public` — the supported surface: migrations, seeders, the schema builder,
 *   connections and configuration.
 * - `@beta` — usable, but still moving. Two groups: the grammar extension point
 *   ({@link Grammar} and friends, {@link ColumnAttributes},
 *   {@link IndexDefinition}, {@link ForeignKeyDefinition}), whose protected
 *   surface will grow as the builder learns more modifiers; and the
 *   `ALTER TABLE` path ({@link Blueprint.dropColumn},
 *   {@link Blueprint.dropIndex}, {@link Schema.rename}), which is thin and the
 *   least exercised across the three dialects.
 * - `@internal` — not exported from this entry point, and free to change.
 * - `@alpha` — deliberately unused. API Extractor drops `@alpha` class methods
 *   from the doc model outright, so on a method it behaves like `@internal`
 *   rather than like a weaker `@beta`.
 *
 * @packageDocumentation
 */

export { configFromEnv, normalizeDialect } from './config.js'
export { createConnection } from './connections/index.js'
export { run as runConsole } from './console.js'
export type { ConsoleOptions } from './console.js'

export { Migration } from './migrations/migration.js'
export { Migrator } from './migrations/migrator.js'
export type { MigrationStatus, MigratorOptions } from './migrations/migrator.js'
export { MigrationRepository } from './migrations/repository.js'
export type { MigrationRecord } from './migrations/repository.js'

export { Blueprint } from './schema/blueprint.js'
export type { BlueprintMode, IndexDefinition } from './schema/blueprint.js'
export { ColumnDefinition } from './schema/column.js'
export type {
	ColumnAttributes,
	ColumnType,
	ForeignKeyDefinition,
	ReferentialAction,
} from './schema/column.js'
export { raw } from './schema/expression.js'
export type { RawExpression } from './schema/expression.js'
// `RAW` is the brand symbol `RawExpression` is declared with. It is exported
// only because that declaration references it — build raw expressions with
// `raw()`.
export { RAW } from './schema/expression.js'
export { Grammar, MysqlGrammar, PostgresGrammar, SqliteGrammar, grammarFor } from './schema/grammars/index.js'
export { Schema } from './schema/schema.js'

export { SeederRunner } from './seeders/runner.js'
export type { SeederRunnerOptions } from './seeders/runner.js'
export { Seeder } from './seeders/seeder.js'
export type { SeederConstructor } from './seeders/seeder.js'

export type { Bindable, Connection, ConnectionConfig, Dialect, Row } from './types.js'
