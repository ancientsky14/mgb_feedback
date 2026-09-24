import {
  ARTA_CSM_2420_03_ONSITE,
  CHANNELS,
  EXCLUSION_NOTE_MAX_LENGTH,
  EXCLUSION_REASON_LABELS,
  EXCLUSION_REASONS,
  getInstrument,
  SQD_CODES,
  type ExclusionReason,
} from "@feedback/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { useMeta } from "../hooks";
import { navigate } from "../router";
import { canWrite, type Me } from "../types";
import { Button, Card, ErrorBox, Field, inputClass, PageTitle } from "../ui";

interface ListItem {
  id: number;
  public_ref: string;
  transaction_date: string;
  channel: string;
  service_name: string;
  division_code: string;
  sqd0: number | null;
  suggestion: string | null;
  has_suggestion: number;
  comment_visibility: "cart_only" | "released";
  suspect_burst: number;
  has_contact: number;
  excluded_at: string | null;
  excluded_reason: ExclusionReason | null;
}

const SCALE: Record<number, string> = { 0: "N/A", 1: "Strongly Disagree", 2: "Disagree", 3: "Neither", 4: "Agree", 5: "Strongly Agree" };

export function ResponsesPage({ me }: { me: Me }) {
  const meta = useMeta();
  const [filters, setFilters] = useState({ from: "", to: "", service: "", channel: "", comments: false, excluded: "include" });
  const [openId, setOpenId] = useState<number | null>(null);
  const params = new URLSearchParams({
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.service ? { service: filters.service } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.comments ? { comments: "1" } : {}),
    ...(filters.excluded !== "include" ? { excluded: filters.excluded } : {}),
  }).toString();

  const list = useInfiniteQuery({
    queryKey: ["responses", params],
    queryFn: ({ pageParam }) =>
      api<{ items: ListItem[]; nextBefore: number | null }>(`/api/responses?${params}${pageParam ? `&before=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageTitle>Responses</PageTitle>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From">
          <input type="date" className={inputClass} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </Field>
        <Field label="To">
          <input type="date" className={inputClass} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </Field>
        <Field label="Service">
          <select className={inputClass} value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })}>
            <option value="">All</option>
            {meta.data?.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Channel">
          <select className={inputClass} value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })}>
            <option value="">All</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Excluded from reports">
          <select className={inputClass} value={filters.excluded} onChange={(e) => setFilters({ ...filters, excluded: e.target.value })}>
            <option value="include">Show, marked</option>
            <option value="hide">Hide</option>
            <option value="only">Only excluded</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={filters.comments} onChange={(e) => setFilters({ ...filters, comments: e.target.checked })} />
          With comments only
        </label>
        {canWrite(me) && filters.from && filters.to && (
          <a className="mb-0.5 rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold" href={`/api/export/responses.csv?from=${filters.from}&to=${filters.to}`}>
            Export CSV
          </a>
        )}
      </div>

      <ErrorBox error={list.error} />
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-(--ink-2)">
                <tr className="border-b border-(--hairline)">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Service</th>
                  <th className="py-2 pr-3 font-medium">Channel</th>
                  <th className="py-2 pr-3 font-medium">SQD0</th>
                  <th className="py-2 font-medium">Comment</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr
                    key={r.id}
                    className={`cursor-pointer border-b border-(--hairline) hover:bg-slate-50 ${openId === r.id ? "bg-emerald-50" : ""}`}
                    onClick={() => setOpenId(r.id)}
                  >
                    <td className="py-2 pr-3 tabular">
                      <button type="button" className="text-left underline" onClick={() => setOpenId(r.id)}>
                        {r.transaction_date}
                      </button>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-(--ink-2)">{r.division_code}</span> {r.service_name}
                    </td>
                    <td className="py-2 pr-3">
                      {r.channel}
                      {r.suspect_burst ? <span className="ml-1 rounded bg-amber-100 px-1 text-xs">burst</span> : null}
                      {r.excluded_reason ? (
                        <span className="ml-1 rounded bg-slate-200 px-1 text-xs">excluded · {EXCLUSION_REASON_LABELS[r.excluded_reason]}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{r.sqd0 === null ? "—" : SCALE[r.sqd0]}</td>
                    <td className="py-2">
                      {r.suggestion ? (
                        <span className="line-clamp-1">{r.suggestion}</span>
                      ) : r.has_suggestion ? (
                        <span className="text-(--ink-2)">Not yet released</span>
                      ) : (
                        ""
                      )}
                      {r.has_suggestion && r.comment_visibility === "cart_only" && canWrite(me) ? (
                        <span className="ml-1 rounded bg-sky-100 px-1 text-xs">to review</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.isPending && <p className="mt-3">Loading…</p>}
          {!list.isPending && items.length === 0 && <p className="mt-3 text-sm text-(--ink-2)">No responses match.</p>}
          {list.hasNextPage && (
            <Button variant="secondary" className="mt-3" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              Load more
            </Button>
          )}
        </Card>
        <div className="xl:col-span-2">{openId !== null && <ResponseDetail id={openId} me={me} />}</div>
      </div>
    </>
  );
}

function ResponseDetail({ id, me }: { id: number; me: Me }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["response", id], queryFn: () => api<Record<string, unknown>>(`/api/responses/${id}`) });
  const [contact, setContact] = useState<Record<string, unknown> | null>(null);
  const release = useMutation({
    mutationFn: () => api(`/api/responses/${id}/release-comment`, { body: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["response", id] });
      void qc.invalidateQueries({ queryKey: ["responses"] });
    },
  });
  const reveal = useMutation({
    mutationFn: (reason: string) => api<Record<string, unknown>>(`/api/responses/${id}/reveal-contact`, { body: { reason } }),
    onSuccess: setContact,
  });

  if (q.isPending) return <Card>Loading…</Card>;
  if (q.error) return <ErrorBox error={q.error} />;
  const r = q.data;
  const instrument = getInstrument(String(r.instrument_code)) ?? ARTA_CSM_2420_03_ONSITE;
  const cell = (k: string) => (r[k] === null || r[k] === undefined ? "—" : String(r[k]));

  return (
    <Card title={`Response ${String(r.public_ref)}`}>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
        <dt className="text-(--ink-2)">Service</dt>
        <dd className="col-span-2">
          {cell("division_code")} · {cell("service_name")}
        </dd>
        <dt className="text-(--ink-2)">Date</dt>
        <dd className="col-span-2">{cell("transaction_date")}</dd>
        <dt className="text-(--ink-2)">Channel</dt>
        <dd className="col-span-2">
          {cell("channel")}
          {r.control_no ? ` · control no. ${cell("control_no")}` : ""}
          {r.service_point_label ? ` · ${cell("service_point_label")}` : ""}
        </dd>
        <dt className="text-(--ink-2)">Form version</dt>
        <dd className="col-span-2">{cell("instrument_code")}</dd>
        <dt className="text-(--ink-2)">Client</dt>
        <dd className="col-span-2">
          {cell("client_type")} · {cell("sex")} · age {cell("age")} · {cell("region")}
        </dd>
        <dt className="text-(--ink-2)">CC1–CC3</dt>
        <dd className="col-span-2">
          {cell("cc1")} / {cell("cc2")} / {cell("cc3")}
        </dd>
      </dl>

      <table className="mt-4 w-full text-sm">
        <tbody>
          {SQD_CODES.map((code, i) => (
            <tr key={code} className="border-b border-(--hairline)">
              <td className="py-1 pr-2 align-top text-(--ink-2)">SQD{i}</td>
              <td className="py-1 pr-2">{instrument.sqd[i]?.text.en}</td>
              <td className="py-1 text-right whitespace-nowrap">{r[code] === null ? "blank" : SCALE[Number(r[code])]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4">
        <h3 className="text-sm font-semibold">Suggestion</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm">{r.suggestion ? String(r.suggestion) : <span className="text-(--ink-2)">None, or not released to your division.</span>}</p>
        {canWrite(me) && Boolean(r.suggestion) && r.comment_visibility === "cart_only" && (
          <Button className="mt-2" variant="secondary" onClick={() => release.mutate()} disabled={release.isPending}>
            Release to the division
          </Button>
        )}
        <ErrorBox error={release.error} />
      </div>

      {canWrite(me) && Boolean(r.has_contact) && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
          {contact ? (
            <p>
              Email: <strong>{String(contact.email ?? "—")}</strong>
              {contact.phone ? ` · Phone: ${String(contact.phone)}` : ""}
              <br />
              <span className="text-(--ink-2)">Deleted automatically after {String(contact.purge_after)}.</span>
            </p>
          ) : (
            <>
              <p>The client left contact details. Viewing them is recorded in the audit log.</p>
              <Button
                className="mt-2"
                variant="secondary"
                onClick={() => {
                  const reason = window.prompt("Why do you need the contact details? (recorded in the audit log)");
                  if (reason && reason.trim()) reveal.mutate(reason.trim());
                }}
              >
                Show contact details
              </Button>
            </>
          )}
          <ErrorBox error={reveal.error} />
        </div>
      )}

      {canWrite(me) && r.channel === "paper" && (
        <Button className="mt-4" variant="secondary" onClick={() => navigate(`/paper?edit=${id}`)}>
          Correct this paper form
        </Button>
      )}

      <Exclusion id={id} me={me} response={r} />
    </Card>
  );
}

/** Leave a response out of reports (staff test, spam, duplicate). The record itself stays. */
function Exclusion({ id, me, response: r }: { id: number; me: Me; response: Record<string, unknown> }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ExclusionReason>("staff_test");
  const [note, setNote] = useState("");
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["response", id] });
    void qc.invalidateQueries({ queryKey: ["responses"] });
  };
  const exclude = useMutation({
    mutationFn: () => api(`/api/responses/${id}/exclude`, { body: { reason, ...(note.trim() ? { note: note.trim() } : {}) } }),
    onSuccess: () => {
      setOpen(false);
      setNote("");
      refresh();
    },
  });
  const restore = useMutation({ mutationFn: () => api(`/api/responses/${id}/restore`, { body: {} }), onSuccess: refresh });

  if (r.excluded_at) {
    const label = EXCLUSION_REASON_LABELS[r.excluded_reason as ExclusionReason] ?? String(r.excluded_reason);
    return (
      <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm">
        <p>
          <strong>Excluded from reports</strong> · {label}
          {r.excluded_note ? ` · ${String(r.excluded_note)}` : ""}
          <br />
          <span className="text-(--ink-2)">
            By {String(r.excluded_by)} on {String(r.excluded_at).slice(0, 10)}. The response is kept on record.
          </span>
        </p>
        {me.role === "admin" && (
          <Button
            className="mt-2"
            variant="secondary"
            disabled={restore.isPending}
            onClick={() => {
              if (window.confirm("Count this response in reports again? This is recorded in the audit log.")) restore.mutate();
            }}
          >
            Restore to reports
          </Button>
        )}
        <ErrorBox error={restore.error} />
      </div>
    );
  }
  if (!canWrite(me)) return null;
  if (!open) {
    return (
      <Button className="mt-4 ml-2" variant="secondary" onClick={() => setOpen(true)}>
        Exclude from reports
      </Button>
    );
  }
  return (
    <form
      className="mt-4 rounded-lg border border-slate-300 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        exclude.mutate();
      }}
    >
      <p className="text-sm">
        The response stays on record but no longer counts in reports, the dashboard or report exports. Only an administrator can
        undo this. Use it for staff tests, spam and duplicates, never for an answer you disagree with.
        {r.channel === "import" ? " Replacing this import batch later removes its rows, and this exclusion with them." : ""}
      </p>
      <Field label="Reason">
        <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value as ExclusionReason)}>
          {EXCLUSION_REASONS.map((code) => (
            <option key={code} value={code}>
              {EXCLUSION_REASON_LABELS[code]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note (optional)" hint="No names or contact details.">
        <input className={inputClass} value={note} maxLength={EXCLUSION_NOTE_MAX_LENGTH} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="danger" disabled={exclude.isPending}>
          Exclude from reports
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <ErrorBox error={exclude.error} />
    </form>
  );
}
