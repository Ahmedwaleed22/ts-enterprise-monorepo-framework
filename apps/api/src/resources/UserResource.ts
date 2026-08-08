import type { User } from "../database/drizzle/schema.types.js";
import { JsonResource } from "./JsonResource.js";

/** The public shape of a user. This, not the table, is the API contract. */
export interface UserPayload {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export class UserResource extends JsonResource<User, UserPayload> {
  toArray(): UserPayload {
    return {
      id: this.resource.id,
      name: this.resource.name,
      email: this.resource.email,
      role: this.resource.role,
      isActive: this.resource.isActive,
      // Serialised explicitly rather than leaving a `Date` for `JSON.stringify`
      // to handle, so the format is the resource's decision and not a default.
      createdAt: this.resource.createdAt.toISOString(),
    };
  }
}
