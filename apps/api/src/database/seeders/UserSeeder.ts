import { Seeder } from "@monorepo-framework/database";

/**
 * Dummy data — swap these rows for whatever the real user model needs.
 *
 * Ids are explicit so PostSeeder can reference them without a round trip;
 * the framework resyncs the underlying sequence afterwards.
 */
export default class UserSeeder extends Seeder {
  async run(): Promise<void> {
    await this.truncate("users");

    await this.insert("users", [
      { id: 1, name: "Ada Lovelace", email: "ada@example.com", role: "admin", is_active: true },
      { id: 2, name: "Alan Turing", email: "alan@example.com", role: "admin", is_active: true },
      { id: 3, name: "Grace Hopper", email: "grace@example.com", role: "member", is_active: true },
      { id: 4, name: "Katherine Johnson", email: "katherine@example.com", role: "member", is_active: true },
      { id: 5, name: "Edsger Dijkstra", email: "edsger@example.com", role: "member", is_active: false },
    ]);
  }
}
