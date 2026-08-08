import { Migration, type Schema } from "@monorepo-framework/database";

/**
 * Dummy schema — kept alongside `users` so the foreign key, index and
 * nullable-column paths of the migrator are exercised end to end.
 */
export default class CreatePostsTable extends Migration {
  async up(schema: Schema): Promise<void> {
    await schema.create("posts", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users");
      table.string("title");
      table.string("slug").unique();
      table.text("body").nullable();
      table.timestamp("published_at").nullable();
      table.timestamps();

      table.index(["user_id", "published_at"]);
    });
  }

  async down(schema: Schema): Promise<void> {
    await schema.dropIfExists("posts");
  }
}
