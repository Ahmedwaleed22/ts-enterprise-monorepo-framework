import type { Schema } from '../schema/schema.js'
import type { Connection } from '../types.js'

/**
 * Base class for every migration.
 *
 * @remarks
 * `up` applies the change and `down` reverses it. Both receive the schema
 * builder for the configured database, so migrations stay dialect-neutral.
 *
 * A migration file is discovered by filename and must default-export either the
 * class or a ready instance. Filenames are timestamp-prefixed and applied in
 * lexical order, which is what makes that order chronological.
 *
 * On Postgres and sqlite each step runs inside a transaction, so a throw undoes
 * the whole migration; on MySQL, DDL commits implicitly and a failed migration
 * can leave the table half-built.
 *
 * @example
 * ```ts
 * import { Migration, type Schema } from '@monorepo-framework/database'
 *
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
export abstract class Migration {
	/**
	 * Apply the change.
	 *
	 * @param schema - Dialect-neutral schema builder, already bound to the
	 * migration's transaction where the database supports one.
	 * @param connection - The same connection, for data changes the schema
	 * builder does not cover.
	 *
	 * @virtual
	 */
	abstract up(schema: Schema, connection: Connection): Promise<void> | void

	/**
	 * Reverse the change made by {@link Migration.up}.
	 *
	 * @remarks
	 * Called by `migrate:rollback` and `migrate:reset`. Should be safe to run
	 * against a database where `up` only partly succeeded, so prefer
	 * {@link Schema.dropIfExists} over {@link Schema.drop}.
	 *
	 * @param schema - Dialect-neutral schema builder.
	 * @param connection - The same connection.
	 *
	 * @virtual
	 */
	abstract down(schema: Schema, connection: Connection): Promise<void> | void
}

/**
 * A migration class, constructible with no arguments.
 *
 * @internal
 */
export type MigrationConstructor = new () => Migration

/**
 * A migration file's default export may be the class or a ready instance.
 *
 * @internal
 */
export type MigrationModule = {
	default?: Migration | MigrationConstructor
}

/**
 * Accept either form of a migration file's default export and return an
 * instance.
 *
 * @internal
 */
export function instantiate(exported: Migration | MigrationConstructor): Migration {
	return typeof exported === 'function' ? new exported() : exported
}
