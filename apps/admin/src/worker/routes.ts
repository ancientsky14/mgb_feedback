import type { Role } from "@feedback/shared";
import type { Context, Hono } from "hono";
import type { AdminHono } from "./env";

// Deny by default: an API route can only be registered through `route`, which refuses to
// register it without a list of roles and records that list. A test checks that every API
// route on the app is in the registry, so a route added any other way fails the build.

export type Method = "GET" | "POST" | "PUT" | "PATCH";
export type AdminContext = Context<AdminHono>;

export const ALL_ROLES: readonly Role[] = ["admin", "cart", "division_focal", "management"];
export const CART_ROLES: readonly Role[] = ["admin", "cart"];
export const ADMIN_ONLY: readonly Role[] = ["admin"];

export const ROUTE_ROLES = new Map<string, readonly Role[]>();

export function route(
  app: Hono<AdminHono>,
  method: Method,
  path: string,
  roles: readonly Role[],
  handler: (c: AdminContext) => Response | Promise<Response>,
): void {
  if (roles.length === 0) throw new Error(`${method} ${path} has no roles`);
  ROUTE_ROLES.set(`${method} ${path}`, roles);
  app.on(method, path, async (c) => {
    if (!roles.includes(c.get("staff").role)) return c.json({ error: "forbidden" }, 403);
    return handler(c);
  });
}
