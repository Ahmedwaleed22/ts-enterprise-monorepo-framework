import { Seeder } from '../../../src/seeders/seeder.js'

export default class DatabaseSeeder extends Seeder {
	async run(): Promise<void> {
		await this.truncate('books')
		await this.truncate('authors')

		await this.insert('authors', [
			{ id: 1, name: 'Ursula K. Le Guin', email: 'ursula@example.com' },
			{ id: 2, name: 'Italo Calvino', email: 'italo@example.com' },
		])

		await this.insert('books', [
			{ id: 1, author_id: 1, title: 'A Wizard of Earthsea' },
			{ id: 2, author_id: 2, title: 'Invisible Cities' },
		])
	}
}
