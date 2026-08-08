import { Migration, type Schema } from "@monorepo-framework/database";

/**
 * Dummy schema — replace the columns here with the real user model.
 */
export default class CreateUsersTable extends Migration {
  async up(schema: Schema): Promise<void> {
    await schema.create("users", (table) => {
      table.id();
      table.string("name");
      table.string("email").unique();
      table.string("role", 32).default("member");
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  }

  async down(schema: Schema): Promise<void> {
    await schema.dropIfExists("users");
  }
}
