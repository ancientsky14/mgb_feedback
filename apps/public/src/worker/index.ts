import { createApp } from "./app";
import type { PublicEnv } from "./env";
import { verifyTurnstile } from "./turnstile";

const app = createApp({ verifyTurnstile, now: () => new Date() });

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<PublicEnv>;
