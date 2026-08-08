export { configFromEnv, normalizeDialect } from './config.js'
export { createConnection } from './connections/index.js'
export { run as runConsole } from './console.js'
export type { ConsoleOptions } from './console.js'

export { Migration } from './migrations/migration.js'
export { Migrator } from './migrations/migrator.js'
export type { MigrationStatus, MigratorOptions } from './migrations/migrator.js'
export { MigrationRepository } from './migrations/repository.js'

export { Blueprint } from './schema/blueprint.js'
export { ColumnDefinition } from './schema/column.js'
export type { ColumnType, ReferentialAction } from './schema/column.js'
export { raw } from './schema/expression.js'
export type { RawExpression } from './schema/expression.js'
export { Grammar, MysqlGrammar, PostgresGrammar, SqliteGrammar, grammarFor } from './schema/grammars/index.js'
export { Schema } from './schema/schema.js'

export { SeederRunner } from './seeders/runner.js'
export type { SeederRunnerOptions } from './seeders/runner.js'
export { Seeder } from './seeders/seeder.js'
export type { SeederConstructor } from './seeders/seeder.js'

export type { Bindable, Connection, ConnectionConfig, Dialect, Row } from './types.js'
