import { Migration } from '../../../src/migrations/migration.js'
import type { Schema } from '../../../src/schema/schema.js'

export default class CreateBooksTable extends Migration {
	async up(schema: Schema): Promise<void> {
		await schema.create('books', (table) => {
			table.id()
			table.foreignId('author_id').constrained('authors')
			table.string('title')
		})
	}

	async down(schema: Schema): Promise<void> {
		await schema.dropIfExists('books')
	}
}
