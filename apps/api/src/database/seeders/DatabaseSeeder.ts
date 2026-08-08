import { Seeder } from "@monorepo-framework/database";
import PostSeeder from "./PostSeeder.js";
import UserSeeder from "./UserSeeder.js";

/**
 * Entry point for `pnpm db db:seed`.
 *
 * Order matters: posts reference users, so users are seeded first.
 */
export default class DatabaseSeeder extends Seeder {
  async run(): Promise<void> {
    await this.call(UserSeeder, PostSeeder);
  }
}
