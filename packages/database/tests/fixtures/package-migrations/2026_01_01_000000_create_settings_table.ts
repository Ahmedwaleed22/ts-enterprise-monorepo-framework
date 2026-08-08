import { Migration } from '../../../src/migrations/migration.js'
import type { Schema } from '../../../src/schema/schema.js'

/**
 * Dated before both application fixtures, so a run proves sources are merged by
 * filename rather than concatenated source by source.
 */
export default class CreateSettingsTable extends Migration {
	async up(schema: Schema): Promise<void> {
		await schema.create('settings', (table) => {
			table.string('key').primary()
			table.text('value')
		})
	}

	async down(schema: Schema): Promise<void> {
		await schema.dropIfExists('settings')
	}
}
