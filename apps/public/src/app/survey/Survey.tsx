import {
  CC1_NOT_AWARE,
  REGIONS,
  SUGGESTION_MAX_LENGTH,
  getInstrument,
  localize,
  type ClientType,
  type InstrumentDefinition,
  type Localized,
  type RegionCode,
  type Sex,
} from "@feedback/shared";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { loadContext, submitResponse, type ContextResult, type FormContext } from "../api";
import { clearDraft, loadDraft, saveDraft } from "../draft";
import {
  freshAnswers,
  toPayload,
  validateCc,
  validateComments,
  validateProfile,
  validateSqd,
  withCc1,
  type Answers,
  type Errors,
} from "./answers";
import { ChoiceGroup, ErrorSummary, FieldError, LikertItem } from "./fields";
import { Turnstile } from "./Turnstile";

type Step = "intro" | "profile" | "cc" | "sqd" | "comments" | "submit" | "done";
const NUMBERED_STEPS: Step[] = ["profile", "cc", "sqd", "comments", "submit"];

type LoadState = { status: "loading" } | Exclude<ContextResult, { ok: true }> | { status: "ready"; context: FormContext };

export function Survey({ code }: { code: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadContext(code).then((result) => {
      if (alive) setState(result.ok ? { status: "ready", context: result.context } : result);
    });
    return () => {
      alive = false;
    };
  }, [code, attempt]);

  if ("status" in state && state.status === "loading") {
    return (
      <Page>
        <p role="status" className="mt-10 text-center text-slate-600">
          Loading the survey…
        </p>
      </Page>
    );
  }
  if ("reason" in state) {
    const messages = {
      not_found:
        "This QR code is not active. Please ask the Public Assistance and Complaints Desk for the current survey or a paper form.",
      unavailable: "The survey is not available right now. Please try again later, or ask the desk for a paper form.",
      network: "The survey could not load. Please check your connection and try again.",
    } as const;
    return (
      <Page>
        <div role="alert" className="mt-10 rounded-lg border border-slate-300 bg-white p-6">
          <p className="text-slate-800">{messages[state.reason]}</p>
          {state.reason !== "not_found" && (
            <button
              type="button"
              className={buttonPrimary + " mt-4"}
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          )}
        </div>
      </Page>
    );
  }

  const instrument = getInstrument(state.context.instrumentCode);
  if (!instrument) {
    return (
      <Page>
        <p role="alert" className="mt-10 text-slate-800">
          This survey was updated. Please reload the page.
        </p>
      </Page>
    );
  }
  return <SurveyForm context={state.context} instrument={instrument} />;
}

interface Draft {
  answers: Answers;
  step: Step;
}

function SurveyForm({ context, instrument }: { context: FormContext; instrument: InstrumentDefinition }) {
  const code = context.servicePoint.code;
  // Read the saved draft once, on first render; a draft for another form version is ignored.
  const [initial] = useState<Draft>(() => {
    const draft = loadDraft<Draft>(code);
    return draft && draft.answers?.instrumentCode === context.instrumentCode && draft.step !== "done"
      ? draft
      : { answers: freshAnswers(context), step: "intro" };
  });

  const [answers, setAnswers] = useState<Answers>(initial.answers);
  const [step, setStep] = useState<Step>(initial.step);
  const [errors, setErrors] = useState<Errors>({});
  const [token, setToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; reload?: boolean } | null>(null);
  const [publicRef, setPublicRef] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (step !== "done") saveDraft(code, { answers, step } satisfies Draft);
  }, [code, answers, step]);

  // Moving to a new step puts focus on its heading, so screen readers announce where they are.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    heading.current?.focus();
  }, [step]);

  useEffect(() => {
    document.documentElement.lang = answers.lang;
  }, [answers.lang]);

  const onToken = useCallback((value: string | null) => setToken(value), []);
  const t = (text: Localized) => localize(text, answers.lang);
  const update = (patch: Partial<Answers>) => setAnswers((a) => ({ ...a, ...patch }));

  const advance = (problems: Errors, to: Step) => {
    setErrors(problems);
    if (Object.keys(problems).length === 0) setStep(to);
    else window.scrollTo({ top: 0 });
  };
  const back = (to: Step) => {
    setErrors({});
    setStep(to);
  };

  async function submit() {
    if (!token || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitResponse(toPayload(answers, code, token));
    setSubmitting(false);
    if (result.ok) {
      clearDraft(code);
      setPublicRef(result.publicRef);
      setStep("done");
      return;
    }
    // A Turnstile token works once; any failure needs a new one.
    setToken(null);
    setTurnstileKey((k) => k + 1);
    switch (result.reason) {
      case "invalid": {
        const problems: Errors = {};
        for (const field of Object.keys(result.fields)) problems[field.replace(/^sqd\./, "")] = "Please check this answer.";
        const fields = Object.keys(problems);
        const to: Step = fields.some((f) => f.startsWith("cc"))
          ? "cc"
          : fields.some((f) => f.startsWith("sqd"))
            ? "sqd"
            : fields.some((f) => f === "suggestion" || f === "email")
              ? "comments"
              : "profile";
        setErrors(problems);
        setStep(to);
        return;
      }
      case "verification":
        setSubmitError({ message: "The security check did not pass. Please wait for it to finish, then press Submit again." });
        return;
      case "form_changed":
        clearDraft(code);
        setSubmitError({ message: "This survey was updated while you were answering. Please reload the page.", reload: true });
        return;
      case "closed":
        setSubmitError({ message: "This QR code is no longer active. Please ask the desk for a paper form." });
        return;
      case "rate_limited":
        setSubmitError({ message: "Too many surveys were sent from your network just now. Please try again in a few minutes." });
        return;
      case "network":
        setSubmitError({ message: "Your answers could not be sent. Check your connection and press Submit again. Your answers are kept." });
        return;
      default:
        setSubmitError({ message: "Something went wrong on our side. Please press Submit again in a moment." });
    }
  }

  const stepNumber = NUMBERED_STEPS.indexOf(step) + 1;
  const serviceName = context.services.find((s) => s.id === answers.serviceId)?.name;

  return (
    <Page>
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{context.officeName}</p>
      <p className="text-sm text-slate-600">{context.servicePoint.label}</p>

      {stepNumber > 0 && (
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            Step {stepNumber} of {NUMBERED_STEPS.length}
          </p>
          <div className="mt-1 h-2 rounded-full bg-slate-200" aria-hidden="true">
            <div className="h-2 rounded-full bg-emerald-700" style={{ width: `${(stepNumber / NUMBERED_STEPS.length) * 100}%` }} />
          </div>
        </div>
      )}

      {step === "intro" && (
        <section>
          <h1 ref={heading} tabIndex={-1} className="mt-6 text-2xl font-bold text-slate-900">
            {t(instrument.title)}
          </h1>
          <p className="mt-4 text-slate-800">{t(instrument.intro)}</p>
          <p className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-950">
            Your answers are anonymous unless you choose to give an email address. We do not store your IP address.{" "}
            <a href="/privacy" target="_blank" rel="noopener" className="font-medium underline">
              Read the privacy notice<span className="sr-only"> (opens in a new tab)</span>
            </a>
            .
          </p>
          <button type="button" className={buttonPrimary + " mt-6 w-full"} onClick={() => back("profile")}>
            Start the survey
          </button>
          <p className="mt-6 text-xs text-slate-500">
            Anti-Red Tape Authority Client Satisfaction Form · PSA Approval No. {instrument.psaApprovalNo}
          </p>
        </section>
      )}

      {step === "profile" && (
        <section>
          <StepHeading innerRef={heading}>About you and your transaction</StepHeading>
          <ErrorSummary errors={errors} />
          <ChoiceGroup<ClientType>
            name="clientType"
            legend="Client type"
            options={(Object.keys(instrument.clientTypes) as ClientType[]).map((value) => ({
              value,
              label: t(instrument.clientTypes[value]),
            }))}
            value={answers.clientType}
            onChange={(clientType) => update({ clientType })}
            error={errors.clientType}
          />

          <div className="mt-6" id="serviceId">
            <label htmlFor="service" className="block text-base font-semibold text-slate-900">
              Service availed
            </label>
            <select
              id="service"
              className={inputClass}
              value={answers.serviceId ?? ""}
              onChange={(e) => update({ serviceId: e.target.value ? Number(e.target.value) : null })}
              aria-describedby={errors.serviceId ? "serviceId-error" : undefined}
            >
              <option value="">Choose a service…</option>
              {context.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(s.name)}
                </option>
              ))}
            </select>
            <FieldError id="serviceId-error" message={errors.serviceId} />
          </div>

          <div className="mt-6" id="transactionDate">
            <label htmlFor="date" className="block text-base font-semibold text-slate-900">
              Date of your transaction
            </label>
            <input
              id="date"
              type="date"
              className={inputClass}
              min={context.earliestTransactionDate}
              max={context.today}
              value={answers.transactionDate}
              onChange={(e) => update({ transactionDate: e.target.value })}
              aria-describedby={errors.transactionDate ? "transactionDate-error" : undefined}
            />
            <FieldError id="transactionDate-error" message={errors.transactionDate} />
          </div>

          <ChoiceGroup<Sex | "declined">
            name="sex"
            legend="Sex (optional)"
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "declined", label: "Prefer not to answer" },
            ]}
            value={answers.sex}
            onChange={(sex) => update({ sex })}
          />

          <div className="mt-6" id="age">
            <label htmlFor="age-input" className="block text-base font-semibold text-slate-900">
              Age (optional)
            </label>
            <input
              id="age-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              className={inputClass + " max-w-32"}
              value={answers.age}
              onChange={(e) => update({ age: e.target.value.replace(/\D/g, "") })}
              aria-describedby={errors.age ? "age-error" : undefined}
            />
            <FieldError id="age-error" message={errors.age} />
          </div>

          <div className="mt-6">
            <label htmlFor="region" className="block text-base font-semibold text-slate-900">
              Region of residence (optional)
            </label>
            <select
              id="region"
              className={inputClass}
              value={answers.region}
              onChange={(e) => update({ region: e.target.value as RegionCode | "" })}
            >
              <option value="">Prefer not to answer</option>
              {REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <Nav onBack={() => back("intro")} onNext={() => advance(validateProfile(answers, context), "cc")} />
        </section>
      )}

      {step === "cc" && (
        <section>
          <StepHeading innerRef={heading}>Citizen’s Charter</StepHeading>
          <p className="mt-2 text-slate-700">{t(instrument.ccDefinition)}</p>
          <ErrorSummary errors={errors} />
          {instrument.cc.map((q, index) => {
            if (index > 0 && answers.cc1 === CC1_NOT_AWARE) return null;
            const value = answers[q.code];
            return (
              <ChoiceGroup<number>
                key={q.code}
                name={q.code}
                legend={`${q.code.toUpperCase()}. ${t(q.text)}`}
                options={q.options.map((o) => ({ value: o.code, label: t(o.label) }))}
                value={value}
                onChange={(v) => setAnswers((a) => (q.code === "cc1" ? withCc1(a, v) : { ...a, [q.code]: v }))}
                error={errors[q.code]}
              />
            );
          })}
          {answers.cc1 === CC1_NOT_AWARE && (
            <p className="mt-6 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
              Because you chose option 4, CC2 and CC3 are recorded as N/A.
            </p>
          )}
          <Nav onBack={() => back("profile")} onNext={() => advance(validateCc(answers), "sqd")} />
        </section>
      )}

      {step === "sqd" && (
        <section>
          <StepHeading innerRef={heading}>Your experience</StepHeading>
          <p className="mt-2 text-slate-700">
            For each statement, choose the face that best matches your experience. Choose N/A if it does not apply to your
            transaction.
          </p>
          <ErrorSummary errors={errors} />
          {instrument.sqd.map((item, index) => (
            <LikertItem
              key={item.code}
              name={item.code}
              number={index}
              text={t(item.text)}
              hint={item.hint ? t(item.hint) : undefined}
              labels={{
                1: t(instrument.scale[1]),
                2: t(instrument.scale[2]),
                3: t(instrument.scale[3]),
                4: t(instrument.scale[4]),
                5: t(instrument.scale[5]),
              }}
              naLabel="N/A"
              value={answers.sqd[item.code]}
              onChange={(v) => setAnswers((a) => ({ ...a, sqd: { ...a.sqd, [item.code]: v } }))}
              error={errors[item.code]}
            />
          ))}
          <Nav onBack={() => back("cc")} onNext={() => advance(validateSqd(answers), "comments")} />
        </section>
      )}

      {step === "comments" && (
        <section>
          <StepHeading innerRef={heading}>Suggestions</StepHeading>
          <ErrorSummary errors={errors} />
          <div className="mt-6" id="suggestion">
            <label htmlFor="suggestion-input" className="block text-base font-semibold text-slate-900">
              {t(instrument.suggestionLabel)}
            </label>
            <textarea
              id="suggestion-input"
              rows={5}
              maxLength={SUGGESTION_MAX_LENGTH}
              className={inputClass}
              value={answers.suggestion}
              onChange={(e) => update({ suggestion: e.target.value })}
              aria-describedby="suggestion-count"
            />
            <p id="suggestion-count" className="mt-1 text-right text-xs text-slate-500">
              {answers.suggestion.length} / {SUGGESTION_MAX_LENGTH}
            </p>
            <FieldError id="suggestion-error" message={errors.suggestion} />
          </div>
          <div className="mt-6" id="email">
            <label htmlFor="email-input" className="block text-base font-semibold text-slate-900">
              {t(instrument.emailLabel)}
            </label>
            <p id="email-hint" className="mt-1 text-sm text-slate-600">
              Give your email only if you want the office to be able to reply. It is kept apart from your answers and deleted
              after {context.contactRetentionDays} days.
            </p>
            <input
              id="email-input"
              type="email"
              autoComplete="email"
              className={inputClass}
              value={answers.email}
              onChange={(e) => update({ email: e.target.value })}
              aria-describedby={errors.email ? "email-hint email-error" : "email-hint"}
            />
            <FieldError id="email-error" message={errors.email} />
          </div>
          <Nav onBack={() => back("sqd")} onNext={() => advance(validateComments(answers), "submit")} nextLabel="Review" />
        </section>
      )}

      {step === "submit" && (
        <section>
          <StepHeading innerRef={heading}>Ready to send</StepHeading>
          <dl className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Service</dt>
              <dd className="text-right font-medium text-slate-900">{serviceName ? t(serviceName) : "—"}</dd>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <dt className="text-slate-600">Date</dt>
              <dd className="font-medium text-slate-900">{answers.transactionDate}</dd>
            </div>
          </dl>
          <Turnstile siteKey={context.turnstileSiteKey} onToken={onToken} resetKey={turnstileKey} />
          {submitError && (
            <div role="alert" className="mt-4 rounded-lg border-2 border-red-700 bg-red-50 p-4 text-red-900">
              <p>{submitError.message}</p>
              {submitError.reload && (
                <button type="button" className={buttonSecondary + " mt-3"} onClick={() => window.location.reload()}>
                  Reload
                </button>
              )}
            </div>
          )}
          <div className="mt-6 flex gap-3">
            <button type="button" className={buttonSecondary} onClick={() => back("comments")} disabled={submitting}>
              Back
            </button>
            <button
              type="button"
              className={buttonPrimary + " flex-1"}
              onClick={() => void submit()}
              disabled={!token || submitting}
            >
              {submitting ? "Sending…" : token ? "Submit" : "Waiting for security check…"}
            </button>
          </div>
        </section>
      )}

      {step === "done" && (
        <section>
          <h1 ref={heading} tabIndex={-1} className="mt-8 text-3xl font-bold text-emerald-800">
            {t(instrument.thankYou)}
          </h1>
          <p className="mt-4 text-slate-800">Your response has been recorded. Thank you for helping us serve you better.</p>
          {publicRef && (
            <div className="mt-6 rounded-xl border border-slate-300 bg-white p-5">
              <p className="text-sm text-slate-600">Your reference</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-slate-900">{publicRef}</p>
              <p className="mt-2 text-sm text-slate-600">
                Keep this if you want to follow up with the Public Assistance and Complaints Desk.
              </p>
              <CopyButton text={publicRef} />
            </div>
          )}
        </section>
      )}
    </Page>
  );
}

function StepHeading({ children, innerRef }: { children: ReactNode; innerRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <h2 ref={innerRef} tabIndex={-1} className="mt-6 text-xl font-bold text-slate-900">
      {children}
    </h2>
  );
}

function Nav({ onBack, onNext, nextLabel = "Next" }: { onBack: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="mt-8 flex gap-3">
      <button type="button" className={buttonSecondary} onClick={onBack}>
        Back
      </button>
      <button type="button" className={buttonPrimary + " flex-1"} onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonSecondary + " mt-3"}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(text)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy reference"}</span>
    </button>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-6">{children}</main>;
}

const buttonPrimary =
  "min-h-12 rounded-lg bg-emerald-800 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-800";
const buttonSecondary =
  "min-h-12 rounded-lg border border-slate-400 bg-white px-5 py-3 text-base font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60";
const inputClass =
  "mt-2 block w-full rounded-lg border border-slate-400 bg-white px-3 py-3 text-base text-slate-900 focus:border-emerald-700";
