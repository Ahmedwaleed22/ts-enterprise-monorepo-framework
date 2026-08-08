/**
 * MySQL flavour of the Drizzle schema. See `schema.pg.ts` for the rationale.
 *
 * Types follow `MysqlGrammar.typeFor`: `id()` is `bigint unsigned
 * auto_increment`, `foreignId()` is `bigint unsigned`, `boolean()` is
 * `tinyint(1)` (which Drizzle's `boolean()` reads back as a boolean) and
 * `timestamp()` is `datetime(3)` — note `datetime`, not MySQL's `timestamp`.
 */
import { bigint, boolean, datetime, index, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// `datetime` has no `defaultNow()` helper the way `timestamp` does — MySQL only
// allows CURRENT_TIMESTAMP as a DATETIME default from 5.6 onward, so Drizzle
// makes you write it out.
const now = sql`CURRENT_TIMESTAMP(3)`;

export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: varchar("role", { length: 32 }).notNull().default("member"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: datetime("created_at", { fsp: 3, mode: "date" }).notNull().default(now),
  updatedAt: datetime("updated_at", { fsp: 3, mode: "date" }).notNull().default(now),
});

export const posts = mysqlTable(
  "posts",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    body: text("body"),
    publishedAt: datetime("published_at", { fsp: 3, mode: "date" }),
    createdAt: datetime("created_at", { fsp: 3, mode: "date" }).notNull().default(now),
    updatedAt: datetime("updated_at", { fsp: 3, mode: "date" }).notNull().default(now),
  },
  (table) => [index("posts_user_id_published_at_index").on(table.userId, table.publishedAt)],
);
