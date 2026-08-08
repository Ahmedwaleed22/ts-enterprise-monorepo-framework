import type { Schema } from '../schema/schema.js'
import type { Connection } from '../types.js'

/**
 * Base class for every migration.
 *
 * `up` applies the change and `down` reverses it. Both receive the schema
 * builder for the configured database, so migrations stay dialect-neutral.
 */
export abstract class Migration {
	abstract up(schema: Schema, connection: Connection): Promise<void> | void

	abstract down(schema: Schema, connection: Connection): Promise<void> | void
}

export type MigrationConstructor = new () => Migration

/** A migration file's default export may be the class or a ready instance. */
export type MigrationModule = {
	default?: Migration | MigrationConstructor
}

export function instantiate(exported: Migration | MigrationConstructor): Migration {
	return typeof exported === 'function' ? new exported() : exported
}
