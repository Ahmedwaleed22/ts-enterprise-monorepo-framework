/**
 * sqlite flavour of the Drizzle schema. See `schema.pg.ts` for the rationale.
 *
 * Types follow `SqliteGrammar.typeFor`: every integer width collapses to
 * `integer`, `string`/`text` to `text`, `boolean` to `integer` — and, the one
 * that bites, `timestamp` to **`text`**, defaulted to `CURRENT_TIMESTAMP`.
 *
 * Drizzle's built-in `integer({ mode: 'timestamp' })` expects a unix integer,
 * so it would silently misread those columns. `textTimestamp` below maps the
 * text representation to `Date` instead, which both matches the migration and
 * keeps the inferred row type identical to the other two dialects.
 */
import { customType, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * sqlite's `CURRENT_TIMESTAMP` writes `YYYY-MM-DD HH:MM:SS` in UTC, with no
 * zone marker. Reads append the `Z` that makes it unambiguous; writes emit
 * millisecond precision, which sqlite compares correctly as text because the
 * format is fixed-width and lexicographically ordered.
 */
const textTimestamp = customType<{ data: Date; driverData: string }>({
  dataType: () => "text",
  toDriver: (value) => value.toISOString().replace("T", " ").replace("Z", ""),
  fromDriver: (value) => new Date(`${value.replace(" ", "T")}Z`),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("member"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: textTimestamp("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: textTimestamp("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const posts = sqliteTable(
  "posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    body: text("body"),
    publishedAt: textTimestamp("published_at"),
    createdAt: textTimestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: textTimestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("posts_user_id_published_at_index").on(table.userId, table.publishedAt)],
);
