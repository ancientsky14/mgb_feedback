import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { importRoutes } from "./api/imports";
import { reportRoutes } from "./api/reports";
import { responseRoutes } from "./api/responses";
import { setupRoutes } from "./api/setup";
import { authenticate, sameOriginWrites } from "./auth";
import type { AdminHono } from "./env";

export function createApp() {
  const app = new Hono<AdminHono>();

  app.use("/api/*", secureHeaders({ referrerPolicy: "no-referrer" }));
  app.use("/api/*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
  });
  app.use("/api/*", sameOriginWrites);
  app.use("/api/*", authenticate);

  setupRoutes(app);
  reportRoutes(app);
  responseRoutes(app);
  importRoutes(app);

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    console.error(JSON.stringify({ msg: "unhandled", path: c.req.path, error: err.message }));
    return c.json({ error: "server_error" }, 500);
  });
  return app;
}
