import { Migration } from '../../../src/migrations/migration.js'
import type { Schema } from '../../../src/schema/schema.js'

export default class CreateAuthorsTable extends Migration {
	async up(schema: Schema): Promise<void> {
		await schema.create('authors', (table) => {
			table.id()
			table.string('name')
			table.string('email').unique()
		})
	}

	async down(schema: Schema): Promise<void> {
		await schema.dropIfExists('authors')
	}
}
