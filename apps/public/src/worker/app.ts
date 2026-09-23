import {
  addDays,
  fieldErrors,
  generatePublicRef,
  getInstrument,
  isAcceptableTransactionDate,
  isServicePointCode,
  manilaDate,
  onlineSubmissionSchema,
} from "@feedback/shared";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import {
  activeInstrumentCode,
  bumpBucket,
  findServicePoint,
  insertResponse,
  intSetting,
  isServiceOffered,
  refForSubmission,
  servicesForPoint,
} from "./db";
import type { PublicEnv } from "./env";
import { clientIp, ipKey } from "./ip";
import type { VerifyTurnstile } from "./turnstile";

export interface PublicDeps {
  verifyTurnstile: VerifyTurnstile;
  now: () => Date;
}

const MAX_BODY_BYTES = 16 * 1024;
/** Submissions per client address per hour before refusing. */
export const HOURLY_CAP = 60;
/** Above this many in one hour from one address, responses are kept but flagged for review. */
export const BURST_FLAG_THRESHOLD = 10;

async function limited(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return false;
  const { success } = await limiter.limit({ key });
  return !success;
}

export function createApp(deps: PublicDeps) {
  const app = new Hono<{ Bindings: PublicEnv }>();

  app.use("/api/*", secureHeaders({ referrerPolicy: "no-referrer" }));
  app.use("/api/*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
  });

  app.get("/api/context/:code", async (c) => {
    if (await limited(c.env.READ_LIMITER, `read:${clientIp(c.req.raw.headers) ?? "unknown"}`)) {
      return c.json({ error: "rate_limited" }, 429);
    }
    const code = c.req.param("code").toUpperCase();
    if (!isServicePointCode(code)) return c.json({ error: "not_found" }, 404);

    const today = manilaDate(deps.now());
    const point = await findServicePoint(c.env.DB, code, today);
    if (!point) return c.json({ error: "not_found" }, 404);

    const instrumentCode = await activeInstrumentCode(c.env.DB, point.mode);
    const instrument = instrumentCode ? getInstrument(instrumentCode) : undefined;
    if (!instrument) return c.json({ error: "unavailable" }, 503);

    const services = await servicesForPoint(c.env.DB, point.division_id);
    const maxAgeDays = await intSetting(c.env.DB, "online_max_transaction_age_days", 90);
    const contactRetentionDays = await intSetting(c.env.DB, "contact_retention_days", 365);
    return c.json({
      officeName: c.env.OFFICE_NAME,
      servicePoint: { code: point.code, label: point.label },
      instrumentCode: instrument.code,
      languages: instrument.approvedLanguages,
      services: services.map((s) => ({
        id: s.id,
        name: { en: s.name, ...(s.name_fil ? { fil: s.name_fil } : {}), ...(s.name_ilo ? { ilo: s.name_ilo } : {}) },
      })),
      defaultServiceId: services.some((s) => s.id === point.default_service_id) ? point.default_service_id : null,
      today,
      earliestTransactionDate: addDays(today, -maxAgeDays),
      contactRetentionDays,
      turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
    });
  });

  app.post("/api/responses", async (c) => {
    const ip = clientIp(c.req.raw.headers);
    if (await limited(c.env.SUBMIT_LIMITER, `submit:${ip ?? "unknown"}`)) return c.json({ error: "rate_limited" }, 429);

    // Fail closed: without its secrets the Worker cannot verify or rate-limit, so it refuses.
    const secret = c.env.TURNSTILE_SECRET_KEY;
    const ipSecret = c.env.IP_HASH_SECRET;
    if (!secret || !ipSecret) return c.json({ error: "unavailable" }, 503);

    if (Number(c.req.header("Content-Length") ?? 0) > MAX_BODY_BYTES) return c.json({ error: "too_large" }, 413);
    const raw = await c.req.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) return c.json({ error: "too_large" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const parsed = onlineSubmissionSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid", fields: fieldErrors(parsed.error) }, 400);
    const s = parsed.data;

    // A retry of a submission that already landed — the reply was lost on a bad connection.
    // Checked before Turnstile, because the retry carries the same, already-spent token.
    const existing = await refForSubmission(c.env.DB, s.submissionId);
    if (existing) return c.json({ publicRef: existing }, 200);

    const check = await deps.verifyTurnstile({
      secret,
      token: s.turnstileToken,
      ip,
      expectedHostname: c.env.TURNSTILE_EXPECTED_HOSTNAME,
    });
    if (!check.ok) return c.json({ error: "verification_failed" }, 403);

    const now = deps.now();
    const today = manilaDate(now);
    const point = await findServicePoint(c.env.DB, s.servicePoint.toUpperCase(), today);
    if (!point) return c.json({ error: "service_point_unavailable" }, 409);
    // The form must be the version in use now; if it changed since the page loaded, reload it.
    if ((await activeInstrumentCode(c.env.DB, point.mode)) !== s.instrument) {
      return c.json({ error: "form_changed" }, 409);
    }
    const instrument = getInstrument(s.instrument);
    if (!instrument?.approvedLanguages.includes(s.lang)) {
      return c.json({ error: "invalid", fields: { lang: ["Language not offered"] } }, 400);
    }
    if (!(await isServiceOffered(c.env.DB, s.serviceId, point.division_id))) {
      return c.json({ error: "invalid", fields: { serviceId: ["Service not offered here"] } }, 400);
    }
    const maxAgeDays = await intSetting(c.env.DB, "online_max_transaction_age_days", 90);
    if (!isAcceptableTransactionDate(s.transactionDate, today, maxAgeDays)) {
      return c.json({ error: "invalid", fields: { transactionDate: ["Date must be today or recent"] } }, 400);
    }

    const count = await bumpBucket(c.env.DB, await ipKey(ipSecret, ip ?? "unknown", today), now.toISOString().slice(0, 13));
    if (count > HOURLY_CAP) return c.json({ error: "rate_limited" }, 429);

    const retentionDays = await intSetting(c.env.DB, "contact_retention_days", 365);
    const submittedAt = now.toISOString();
    for (let attempt = 0; attempt < 3; attempt++) {
      const publicRef = generatePublicRef();
      try {
        await insertResponse(
          c.env.DB,
          {
            publicRef,
            submissionId: s.submissionId,
            instrumentCode: s.instrument,
            serviceId: s.serviceId,
            servicePointId: point.id,
            channel: "qr",
            lang: s.lang,
            transactionDate: s.transactionDate,
            clientType: s.clientType,
            sex: s.sex,
            age: s.age,
            region: s.region,
            cc1: s.cc1,
            cc2: s.cc2,
            cc3: s.cc3,
            sqd: s.sqd,
            suggestion: s.suggestion,
            suspectBurst: count > BURST_FLAG_THRESHOLD,
            submittedAt,
          },
          s.email ? { email: s.email, consentAt: submittedAt, purgeAfter: addDays(today, retentionDays) } : null,
        );
        return c.json({ publicRef }, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("responses.submission_id")) {
          const winner = await refForSubmission(c.env.DB, s.submissionId);
          if (winner) return c.json({ publicRef: winner }, 200);
        }
        if (message.includes("responses.public_ref")) continue; // a 60-bit collision: draw again
        throw err;
      }
    }
    return c.json({ error: "unavailable" }, 503);
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((err, c) => {
    // Log what failed, never the request body: it can hold an email address or a complaint.
    console.error(JSON.stringify({ msg: "unhandled", path: c.req.path, error: err.message }));
    return c.json({ error: "server_error" }, 500);
  });

  return app;
}
