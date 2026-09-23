import { CHANNELS, type Rating } from "@feedback/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Link } from "../router";
import type { Me } from "../types";
import { Card, ErrorBox, int, Notice, PageTitle, pct, RatingBadge, StatTile } from "../ui";

interface Summary {
  respondents: number;
  transactions: number | null;
  responseRate: number | null;
  overall: number | null;
  rating: Rating | null;
  sqd0: number | null;
  ccAwareness: number | null;
  channel: Record<string, number | null>;
  officeExcludesHiddenServices: boolean;
  byService: {
    id: number;
    name: string;
    divisionCode: string;
    respondents: number;
    overall: number | null;
    rating: Rating | null;
    suppressed: boolean;
  }[];
}

interface DashboardData {
  today: string;
  thisMonth: Summary;
  yearToDate: Summary;
  alerts: {
    expiredInstruments: { code: string; psaApprovalNo: string; psaExpiry: string }[];
    placeholderServices: number;
    unreleasedComments: number;
    suspectBursts: number;
  };
}

const CHANNEL_LABELS: Record<string, string> = {
  qr: "QR code",
  paper: "Paper form",
  import: "Imported (old system)",
  kiosk: "Kiosk",
  online_link: "Online link",
};

export function Dashboard({ me }: { me: Me }) {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardData>("/api/dashboard") });
  if (q.isPending) return <p>Loading…</p>;
  if (q.error) return <ErrorBox error={q.error} />;
  const { today, thisMonth, yearToDate: ytd, alerts } = q.data;
  const year = today.slice(0, 4);

  return (
    <>
      <PageTitle>Dashboard</PageTitle>
      <p className="-mt-4 mb-4 text-sm text-(--ink-2)">
        Year to date, January {year} to today ({today}). Scores use the ARTA formula.
      </p>

      {alerts.expiredInstruments.map((i) => (
        <Notice key={i.code} tone="warning">
          The ARTA form in use (PSA approval {i.psaApprovalNo}) passed its printed expiry date, {i.psaExpiry}. Ask CART to get
          the current version from ARTA.
        </Notice>
      ))}
      {alerts.placeholderServices > 0 && (
        <Notice tone="warning">
          {alerts.placeholderServices} services are still placeholders. Replace them with the Citizen’s Charter list under{" "}
          <Link to="/setup" className="underline">
            Services &amp; QR codes
          </Link>
          .
        </Notice>
      )}
      {alerts.unreleasedComments > 0 && me.role !== "management" && (
        <Notice>
          {alerts.unreleasedComments} comments are waiting for CART review.{" "}
          <Link to="/responses" className="underline">
            Open responses
          </Link>
        </Notice>
      )}
      {alerts.suspectBursts > 0 && (
        <Notice tone="warning">
          {alerts.suspectBursts} responses this month came in unusual bursts from one network and are flagged for review.
        </Notice>
      )}
      {ytd.officeExcludesHiddenServices && (
        <Notice>Services with fewer than 5 responses are hidden and left out of these totals, to keep respondents anonymous.</Notice>
      )}

      <section aria-label="Overall score" className="mb-6 rounded-xl border border-(--hairline) bg-(--surface) p-6">
        <p className="text-sm text-(--ink-2)">Overall score this year (SQD1–SQD8)</p>
        <p className="mt-1 text-5xl font-semibold">{pct(ytd.overall)}</p>
        <p className="mt-2 text-base">
          <RatingBadge rating={ytd.rating} />
        </p>
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Responses this year" value={int(ytd.respondents)} context={`${int(thisMonth.respondents)} this month`} />
        <StatTile label="Satisfied with the service (SQD0)" value={pct(ytd.sqd0)} />
        <StatTile label="Aware of the Citizen’s Charter" value={pct(ytd.ccAwareness)} />
        <StatTile
          label="Response rate"
          value={pct(ytd.responseRate)}
          context={ytd.transactions === null ? "Enter monthly transaction counts to see this" : `${int(ytd.transactions)} transactions`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="By service, this year" className="xl:col-span-2">
          {ytd.byService.length === 0 ? (
            <p className="text-sm text-(--ink-2)">No responses yet this year.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-(--ink-2)">
                  <tr className="border-b border-(--hairline)">
                    <th className="py-2 pr-3 font-medium">Division</th>
                    <th className="py-2 pr-3 font-medium">Service</th>
                    <th className="py-2 pr-3 text-right font-medium">Responses</th>
                    <th className="py-2 pr-3 text-right font-medium">Overall</th>
                    <th className="py-2 font-medium">Rating</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {ytd.byService.map((s) => (
                    <tr key={s.id} className="border-b border-(--hairline) last:border-0">
                      <td className="py-2 pr-3">{s.divisionCode}</td>
                      <td className="py-2 pr-3">{s.name}</td>
                      {s.suppressed ? (
                        <td colSpan={3} className="py-2 text-(--ink-2)">
                          Fewer than 5 responses (hidden)
                        </td>
                      ) : (
                        <>
                          <td className="py-2 pr-3 text-right">{int(s.respondents)}</td>
                          <td className="py-2 pr-3 text-right">{pct(s.overall)}</td>
                          <td className="py-2">
                            <RatingBadge rating={s.rating} />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="How responses came in, this year">
          <table className="w-full text-sm">
            <tbody className="tabular">
              {CHANNELS.map((c) => (
                <tr key={c} className="border-b border-(--hairline) last:border-0">
                  <td className="py-2">{CHANNEL_LABELS[c]}</td>
                  <td className="py-2 text-right">{ytd.channel[c] === null ? "hidden" : int(ytd.channel[c])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
