import { Migration } from '../../../src/migrations/migration.js'
import type { Schema } from '../../../src/schema/schema.js'

/**
 * Dated after both application fixtures. Deliberately declares no foreign key
 * into an application table — a package cannot rely on where its own migrations
 * land relative to another source's.
 */
export default class CreateWidgetsTable extends Migration {
	async up(schema: Schema): Promise<void> {
		await schema.create('widgets', (table) => {
			table.id()
			table.string('name')
		})
	}

	async down(schema: Schema): Promise<void> {
		await schema.dropIfExists('widgets')
	}
}
