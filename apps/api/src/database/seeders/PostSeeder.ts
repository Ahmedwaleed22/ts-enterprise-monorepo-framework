import { Seeder } from "@monorepo-framework/database";

/** Dummy data — depends on the users seeded by UserSeeder. */
export default class PostSeeder extends Seeder {
  async run(): Promise<void> {
    await this.truncate("posts");

    await this.insert("posts", [
      {
        id: 1,
        user_id: 1,
        title: "Notes on the Analytical Engine",
        slug: "notes-on-the-analytical-engine",
        body: "The engine weaves algebraic patterns just as the loom weaves flowers.",
        published_at: new Date("2026-01-12T09:00:00.000Z"),
      },
      {
        id: 2,
        user_id: 2,
        title: "On Computable Numbers",
        slug: "on-computable-numbers",
        body: "A definition of what it means for a number to be computable.",
        published_at: new Date("2026-02-03T14:30:00.000Z"),
      },
      {
        id: 3,
        user_id: 3,
        title: "Compilers Should Read English",
        slug: "compilers-should-read-english",
        body: "Programming is easier when the source looks like the problem.",
        published_at: new Date("2026-03-21T11:15:00.000Z"),
      },
      {
        id: 4,
        user_id: 3,
        title: "Draft: the case for subroutines",
        slug: "draft-the-case-for-subroutines",
        body: null,
        published_at: null,
      },
      {
        id: 5,
        user_id: 4,
        title: "Checking the Trajectory by Hand",
        slug: "checking-the-trajectory-by-hand",
        body: "Confidence in a result comes from being able to recompute it.",
        published_at: new Date("2026-04-08T16:45:00.000Z"),
      },
    ]);
  }
}
