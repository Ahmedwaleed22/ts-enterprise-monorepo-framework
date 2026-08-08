import { asc, eq } from "drizzle-orm";
import type { Request, Response } from "express";

import { db, users } from "../database/drizzle/client.js";
import { UserResource } from "../resources/UserResource.js";

/**
 * CRUD over the `users` table, written entirely through Drizzle.
 *
 * Queries select whole rows; `UserResource` decides what leaves the process.
 *
 * Every query here sticks to the subset of the API that behaves identically on
 * Postgres, MySQL and sqlite. The notable absence is `.returning()`: Postgres
 * and sqlite support it, MySQL does not, so writes re-read the row through its
 * unique key instead. That costs a round trip and is the concrete price of
 * keeping all three dialects on the table.
 */

// Express 5 types a route parameter as `string | string[]`, since a pattern can
// bind the same name more than once. `:id` never will, but the type has to be
// narrowed regardless.
function parseId(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const index = async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 25, 100);

  const rows = await db.select().from(users).orderBy(asc(users.id)).limit(limit);

  return res.status(200).json({ data: UserResource.collection(rows) });
};

export const show = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ message: "Invalid user id" });

  // Drizzle types a result set as `T[]`, so destructuring would hand back a
  // `T` that is actually `undefined` on a miss. Check the length instead.
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (rows.length === 0) return res.status(404).json({ message: "User not found" });

  return res.status(200).json({ data: UserResource.make(rows[0]) });
};

export const store = async (req: Request, res: Response) => {
  // Fields are picked explicitly rather than spreading the body, so a caller
  // cannot set `id` or flip `role` to admin by adding a key.
  const { name, email, role } = req.body as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "`name` is required" });
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ message: "`email` is required" });
  }

  const address = email.trim().toLowerCase();
  const now = new Date();

  await db.insert(users).values({
    name: name.trim(),
    email: address,
    role: typeof role === "string" ? role : "member",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.select().from(users).where(eq(users.email, address)).limit(1);

  return res.status(201).json({ data: UserResource.make(created[0]) });
};

export const update = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ message: "Invalid user id" });

  const { name, role, isActive } = req.body as Record<string, unknown>;

  // `updatedAt` is set here because nothing in the migration layer maintains it
  // — `Blueprint.timestamps()` documents that as the application's job.
  const changes: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (typeof name === "string" && name.trim()) changes.name = name.trim();
  if (typeof role === "string") changes.role = role;
  if (typeof isActive === "boolean") changes.isActive = isActive;

  await db.update(users).set(changes).where(eq(users.id, id));

  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (rows.length === 0) return res.status(404).json({ message: "User not found" });

  return res.status(200).json({ data: UserResource.make(rows[0]) });
};

export const destroy = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ message: "Invalid user id" });

  await db.delete(users).where(eq(users.id, id));

  return res.status(204).send();
};
