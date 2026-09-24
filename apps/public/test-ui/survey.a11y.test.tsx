import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app/App";
import type { FormContext } from "../src/app/api";
import type { Answers } from "../src/app/survey/answers";

const CODE = "PACD01";
const context: FormContext = {
  officeName: "Mines and Geosciences Bureau Regional Office No. I",
  servicePoint: { code: CODE, label: "Public Assistance and Complaints Desk" },
  instrumentCode: "ARTA-2420-03-ONSITE",
  languages: ["en"],
  services: [
    { id: 1, name: { en: "Information and consultation" } },
    { id: 2, name: { en: "Geohazard assessment" } },
  ],
  defaultServiceId: null,
  today: "2026-09-24",
  earliestTransactionDate: "2026-06-26",
  contactRetentionDays: 365,
  turnstileSiteKey: "0x4AAAAAAAtest-site-key",
};

const complete: Answers = {
  submissionId: "3f9a1c52-0000-4000-8000-000000000001",
  instrumentCode: context.instrumentCode,
  lang: "en",
  serviceId: 1,
  transactionDate: context.today,
  clientType: "citizen",
  sex: "female",
  age: "34",
  region: "R01",
  cc1: 1,
  cc2: 1,
  cc3: 1,
  sqd: { sqd0: 5, sqd1: 5, sqd2: 4, sqd3: 5, sqd4: 0, sqd5: 5, sqd6: 5, sqd7: 5, sqd8: 5 },
  suggestion: "",
  email: "",
};

/** WCAG 2.2 A/AA rules. Colour contrast needs real layout, which jsdom lacks; it is checked by hand and in Lighthouse. */
async function violations() {
  const result = await axe.run(document.body, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

function open(path: string, draft?: { answers: Answers; step: string }) {
  window.history.pushState({}, "", path);
  if (draft) sessionStorage.setItem(`csm-draft:${CODE}`, JSON.stringify(draft));
  return render(<App />);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/context/")) return Response.json(context);
      if (url === "/api/responses" && init?.method === "POST") return Response.json({ publicRef: "AB12CD34EF56" }, { status: 201 });
      return new Response("not found", { status: 404 });
    }),
  );
  // Turnstile passes at once, so the last step can be reached without Cloudflare.
  window.turnstile = {
    render: (_el: HTMLElement, options: Record<string, unknown>) => {
      (options.callback as (token: string) => void)("test-token");
      return "widget-1";
    },
    remove: () => undefined,
  };
  window.scrollTo = () => undefined;
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  delete window.turnstile;
});

describe("the survey meets WCAG 2.2 AA (automated rules)", () => {
  it.each([
    ["intro", "HELP US SERVE YOU BETTER!"],
    ["profile", "About you and your transaction"],
    ["cc", "Citizen’s Charter"],
    ["sqd", "Your experience"],
    ["comments", "Suggestions"],
    ["submit", "Ready to send"],
  ])("on the %s step", async (step, heading) => {
    open(`/q/${CODE}`, { answers: complete, step });
    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    expect(await violations()).toEqual([]);
  });

  it("when a step has errors: the summary is announced and takes focus", async () => {
    open(`/q/${CODE}`, { answers: { ...complete, clientType: null, serviceId: null }, step: "profile" });
    await screen.findByRole("heading", { name: "About you and your transaction" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const alert = await screen.findByRole("alert");
    expect(document.activeElement).toBe(alert);
    expect(await violations()).toEqual([]);
  });

  it("after sending: the thank-you page with the reference", async () => {
    open(`/q/${CODE}`, { answers: complete, step: "submit" });
    const submit = await screen.findByRole("button", { name: "Submit" });
    await act(async () => fireEvent.click(submit));
    await waitFor(() => expect(screen.getByText("AB12CD34EF56")).toBeTruthy());
    expect(await violations()).toEqual([]);
  });

  it("the step counter is readable, and the page language follows the survey", async () => {
    open(`/q/${CODE}`, { answers: complete, step: "cc" });
    expect(await screen.findByText("Step 2 of 5")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });

  it.each([["/"], ["/privacy"], ["/not-a-page"]])("on %s", async (path) => {
    open(path);
    await screen.findAllByRole("heading");
    expect(await violations()).toEqual([]);
  });
});
