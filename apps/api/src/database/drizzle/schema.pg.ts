/**
 * Postgres flavour of the Drizzle schema.
 *
 * Drizzle does not create these tables — `packages/database` still owns
 * migrations — so this is a *description* of an existing schema and has to be
 * kept in step with `database/migrations` by hand. Every column type here was
 * read off `PostgresGrammar.typeFor`: `id()` is `bigserial`, `foreignId()` is
 * `bigint`, `string(n)` is `varchar(n)` and `timestamp()` is
 * `timestamp(3) without time zone`.
 *
 * The sibling `schema.mysql.ts` and `schema.sqlite.ts` describe the same tables
 * for the other dialects; `schema.types.ts` asserts at compile time that all
 * three infer identical row types.
 */
import { bigint, bigserial, boolean, index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: varchar("role", { length: 32 }).notNull().default("member"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
});

export const posts = pgTable(
  "posts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    body: text("body"),
    publishedAt: timestamp("published_at", { precision: 3, mode: "date" }),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("posts_user_id_published_at_index").on(table.userId, table.publishedAt)],
);
