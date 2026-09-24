import {
  AGE_BRACKETS,
  ARTA_CSM_2420_03_ONSITE,
  ccOptionShare,
  CHANNELS,
  CLIENT_TYPES,
  REGIONS,
  SEXES,
  SQD_CODES,
  type CsmReport,
  type Totals,
} from "@feedback/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { useMeta } from "../hooks";
import type { Me } from "../types";
import { Button, Card, ErrorBox, Field, inputClass, int, manilaMonth, Notice, PageTitle, pct, RatingBadge } from "../ui";

const inst = ARTA_CSM_2420_03_ONSITE;
const LIKERT_COLUMNS = [
  ["sd", "Strongly Disagree"],
  ["d", "Disagree"],
  ["n", "Neither"],
  ["a", "Agree"],
  ["sa", "Strongly Agree"],
  ["na", "N/A"],
  ["blank", "Blank"],
] as const;

export function ReportPage({ me }: { me: Me }) {
  const meta = useMeta();
  const [from, setFrom] = useState(`${manilaMonth().slice(0, 4)}-01`);
  const [to, setTo] = useState(manilaMonth());
  const [division, setDivision] = useState("");
  const params = new URLSearchParams({ from, to, ...(division ? { division } : {}) }).toString();
  const q = useQuery({
    queryKey: ["report", params],
    queryFn: () => api<CsmReport>(`/api/reports/csm?${params}`),
    enabled: from <= to,
  });
  const r = q.data;
  const method = meta.data?.settings.office_overall_method;

  return (
    <>
      <PageTitle
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              Print or save as PDF
            </Button>
            <a className="rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold" href={`/api/reports/csm.xlsx?${params}`}>
              Excel (.xlsx)
            </a>
            <a className="rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold" href={`/api/reports/csm.csv?${params}`}>
              Summary CSV
            </a>
            <a className="rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold" href={`/api/reports/csm.csv?${params}&kind=detail`}>
              Detail CSV
            </a>
          </>
        }
      >
        Client Satisfaction Measurement report
      </PageTitle>

      <div className="no-print mb-6 flex flex-wrap items-end gap-4">
        <Field label="From month">
          <input type="month" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To month">
          <input type="month" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {me.role !== "division_focal" && (
          <Field label="Division">
            <select className={inputClass} value={division} onChange={(e) => setDivision(e.target.value)}>
              <option value="">Whole office</option>
              {meta.data?.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {from > to && <Notice tone="warning">The start month is after the end month.</Notice>}
      <ErrorBox error={q.error} />
      {q.isPending && from <= to && <p>Loading…</p>}

      {r && (
        <div className="space-y-6">
          <p className="text-sm text-(--ink-2)">
            Period {r.period.from} to {r.period.to}. Score = (Strongly Agree + Agree) ÷ (responses − N/A); the overall score
            pools SQD1–SQD8. Bands: Outstanding 95.00–100 · Very Satisfactory 90.00–94.99 · Satisfactory 80.00–89.99 · Fair
            60.00–79.99 · Poor below 60.00.
            {r.includesLegacyTallies && " Includes paper tallies imported from before go-live."}
          </p>
          {r.officeExcludesHiddenServices && (
            <Notice>Services with fewer than 5 responses are hidden and left out of the totals, to keep respondents anonymous.</Notice>
          )}

          <Card title="Summary by service">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-(--ink-2)">
                  <tr className="border-b border-(--hairline)">
                    <th className="py-2 pr-3 font-medium">Division</th>
                    <th className="py-2 pr-3 font-medium">Service</th>
                    <th className="py-2 pr-3 text-right font-medium">Transactions</th>
                    <th className="py-2 pr-3 text-right font-medium">Respondents</th>
                    <th className="py-2 pr-3 text-right font-medium">Response rate</th>
                    <th className="py-2 pr-3 text-right font-medium">SQD0</th>
                    <th className="py-2 pr-3 text-right font-medium">Overall</th>
                    <th className="py-2 font-medium">Rating</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {r.services.map((s) => (
                    <tr key={s.service.id} className="border-b border-(--hairline)">
                      <td className="py-2 pr-3">{s.service.divisionCode}</td>
                      <td className="py-2 pr-3">
                        {s.service.name}
                        {s.service.isPlaceholder && <span className="ml-1 text-xs text-amber-800">(placeholder)</span>}
                      </td>
                      <td className="py-2 pr-3 text-right">{int(s.transactions)}</td>
                      {s.suppressed ? (
                        <td colSpan={5} className="py-2 text-(--ink-2)">
                          Fewer than 5 responses (hidden)
                        </td>
                      ) : (
                        <>
                          <td className="py-2 pr-3 text-right">{int(s.respondents)}</td>
                          <td className="py-2 pr-3 text-right">{pct(s.responseRate)}</td>
                          <td className="py-2 pr-3 text-right">{pct(s.sqd.sqd0.score.hundredths)}</td>
                          <td className="py-2 pr-3 text-right">{pct(s.overall.hundredths)}</td>
                          <td className="py-2">
                            <RatingBadge rating={s.rating} />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-3" colSpan={2}>
                      All services
                    </td>
                    <td className="py-2 pr-3 text-right">{int(r.office.transactions)}</td>
                    <td className="py-2 pr-3 text-right">{int(r.office.respondents)}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.office.responseRate)}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.office.sqd.sqd0.score.hundredths)}</td>
                    <td className="py-2 pr-3 text-right">{pct(r.office.overall.hundredths)}</td>
                    <td className="py-2">
                      <RatingBadge rating={r.office.rating} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-(--ink-2)">
              Mean of the service scores: {pct(r.office.overallMeanOfServices)}.{" "}
              {method === "mean_of_services"
                ? "The office setting reports this mean as the office score."
                : "The office setting reports the pooled score above."}{" "}
              Confirm which one ARTA expects against last year’s filed report.
            </p>
          </Card>

          <Card title="Service quality dimensions, all services">
            <LikertTable totals={r.office} />
          </Card>

          <Card title="Citizen’s Charter">
            <div className="grid gap-6 lg:grid-cols-3">
              {inst.cc.map((question) => (
                <div key={question.code}>
                  <h3 className="text-sm font-semibold">
                    {question.code.toUpperCase()}. {question.text.en}
                  </h3>
                  <table className="mt-2 w-full text-sm">
                    <tbody className="tabular">
                      {question.options.map((o) => {
                        const share = ccOptionShare(r.office.cc, question.code, o.code);
                        const isNa = (question.code === "cc2" && o.code === 5) || (question.code === "cc3" && o.code === 4);
                        return (
                          <tr key={o.code} className="border-b border-(--hairline)">
                            <td className="py-1 pr-2">
                              {o.code}. {o.label.en}
                            </td>
                            <td className="py-1 pr-2 text-right">{int(r.office.cc[question.code][o.code])}</td>
                            <td className="py-1 text-right">{isNa ? "—" : pct(share.hundredths)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm">
              Awareness {pct(r.office.ccSummary.awareness.hundredths)} · Visibility {pct(r.office.ccSummary.visibility.hundredths)}{" "}
              · Helpfulness {pct(r.office.ccSummary.helpfulness.hundredths)}
            </p>
          </Card>

          <Card title="Respondents">
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
              <Breakdown title="Client type" data={r.demographics.clientType} labels={Object.fromEntries([...CLIENT_TYPES.map((c) => [c, inst.clientTypes[c].en]), ["unspecified", "Not given"]])} />
              <Breakdown title="Sex" data={r.demographics.sex} labels={Object.fromEntries([...SEXES.map((s) => [s, s === "male" ? "Male" : "Female"]), ["unspecified", "Not given"]])} />
              <Breakdown title="Age" data={r.demographics.ageBracket} labels={Object.fromEntries(AGE_BRACKETS.map((b) => [b.code, b.label]))} />
              <Breakdown
                title="Region of residence"
                data={r.demographics.region}
                labels={Object.fromEntries([...REGIONS.map((x) => [x.code, x.name]), ["unspecified", "Not given"]])}
                hideZero
              />
              <Breakdown title="Channel" data={r.demographics.channel} labels={Object.fromEntries(CHANNELS.map((c) => [c, c.replace("_", " ")]))} />
            </div>
            {r.includesLegacyTallies && (
              <p className="mt-3 text-sm text-(--ink-2)">Paper tallies carry no respondent details, so these counts cover per-response data only.</p>
            )}
          </Card>

          {r.services
            .filter((s) => !s.suppressed && s.respondents > 0)
            .map((s) => (
              <Card key={s.service.id} title={`${s.service.divisionCode} · ${s.service.name}`}>
                <LikertTable totals={s} />
              </Card>
            ))}
        </div>
      )}
    </>
  );
}

function LikertTable({ totals }: { totals: Totals }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-(--ink-2)">
          <tr className="border-b border-(--hairline)">
            <th className="py-2 pr-3 font-medium">Item</th>
            {LIKERT_COLUMNS.map(([key, label]) => (
              <th key={key} className="py-2 pr-3 text-right font-medium">
                {label}
              </th>
            ))}
            <th className="py-2 text-right font-medium">Score</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {SQD_CODES.map((code, i) => {
            const { counts, score } = totals.sqd[code];
            return (
              <tr key={code} className="border-b border-(--hairline)">
                <td className="py-2 pr-3">
                  SQD{i} <span className="text-(--ink-2)">{inst.sqd[i]?.dimension}</span>
                </td>
                {LIKERT_COLUMNS.map(([key]) => (
                  <td key={key} className="py-2 pr-3 text-right">
                    {int(counts[key])}
                  </td>
                ))}
                <td className="py-2 text-right font-medium">{pct(score.hundredths)}</td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <td className="py-2 pr-3">Overall (SQD1–8)</td>
            <td colSpan={LIKERT_COLUMNS.length} />
            <td className="py-2 text-right">{pct(totals.overall.hundredths)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Breakdown({
  title,
  data,
  labels,
  hideZero = false,
}: {
  title: string;
  data: Record<string, number | null>;
  labels: Record<string, string>;
  hideZero?: boolean;
}) {
  const entries = Object.entries(data).filter(([, v]) => !hideZero || v !== 0);
  const hidden = entries.length > 0 && entries.every(([, v]) => v === null);
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {hidden ? (
        <p className="mt-2 text-sm text-(--ink-2)">Hidden: a group is smaller than 5.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <tbody className="tabular">
            {entries.map(([k, v]) => (
              <tr key={k} className="border-b border-(--hairline)">
                <td className="py-1 pr-2">{labels[k] ?? k}</td>
                <td className="py-1 text-right">{int(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
