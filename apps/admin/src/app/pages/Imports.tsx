import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { useMeta } from "../hooks";
import { Button, Card, ErrorBox, Field, inputClass, int, manilaMonth, Notice, PageTitle } from "../ui";

interface Batch {
  id: number;
  kind: "online_csv" | "paper_tally";
  file_name: string;
  period_from: string | null;
  period_to: string | null;
  rows_imported: number;
  rows_rejected: number;
  imported_by: string;
  imported_at: string;
  replaced_by: number | null;
}

interface OnlinePreview {
  missingColumns: string[];
  ignoredColumns: string[];
  dataRows: number;
  acceptedRows: number;
  rejectedCount: number;
  rejectedRows: { row: number; errors: string[] }[];
  warningCount: number;
  warnings: string[];
  months: string[];
  duplicateOfBatch: number | null;
  overlap: { responses: number; tallyBatches: number };
}

interface TallyPreview {
  records: number;
  months: string[];
  rowErrors: { row: number; errors: string[] }[];
  warningCount: number;
  warnings: string[];
  duplicateOfBatch: number | null;
  overlap: { responses: number; tallyBatches: number };
}

export function ImportsPage() {
  const batches = useQuery({ queryKey: ["imports"], queryFn: () => api<{ items: Batch[] }>("/api/imports") });
  return (
    <>
      <PageTitle>Imports</PageTitle>
      <p className="-mt-4 mb-6 max-w-3xl text-sm text-(--ink-2)">
        Bring in the office’s CSM records from before go-live, so the annual report covers the whole year. Nothing is saved
        until you commit, and a file can be replaced later without touching anything else.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        <OnlineImport batches={batches.data?.items ?? []} />
        <TallyImport batches={batches.data?.items ?? []} />
      </div>
      <Card title="Import history" className="mt-6">
        <ErrorBox error={batches.error} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-(--ink-2)">
              <tr className="border-b border-(--hairline)">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Kind</th>
                <th className="py-2 pr-3 font-medium">File</th>
                <th className="py-2 pr-3 font-medium">Months</th>
                <th className="py-2 pr-3 text-right font-medium">Rows</th>
                <th className="py-2 pr-3 text-right font-medium">Left out</th>
                <th className="py-2 pr-3 font-medium">By</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {batches.data?.items.map((b) => (
                <tr key={b.id} className="border-b border-(--hairline)">
                  <td className="py-2 pr-3">{b.id}</td>
                  <td className="py-2 pr-3">{b.kind === "online_csv" ? "Online form" : "Paper tally"}</td>
                  <td className="py-2 pr-3">{b.file_name}</td>
                  <td className="py-2 pr-3">
                    {b.period_from} – {b.period_to}
                  </td>
                  <td className="py-2 pr-3 text-right">{int(b.rows_imported)}</td>
                  <td className="py-2 pr-3 text-right">{int(b.rows_rejected)}</td>
                  <td className="py-2 pr-3">
                    {b.imported_by}
                    <br />
                    <span className="text-xs text-(--ink-2)">{b.imported_at.slice(0, 16).replace("T", " ")} UTC</span>
                  </td>
                  <td className="py-2">{b.replaced_by ? `Replaced by #${b.replaced_by}` : "In use"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function useFile() {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const input = (
    <input
      type="file"
      accept=".csv,text/csv"
      className="block text-sm"
      onChange={async (e) => {
        const f = e.target.files?.[0];
        setFile(f ? { name: f.name, text: await f.text() } : null);
      }}
    />
  );
  return { file, input, clear: () => setFile(null) };
}

function ReplaceSelect({ batches, kind, value, onChange }: { batches: Batch[]; kind: Batch["kind"]; value: string; onChange: (v: string) => void }) {
  const candidates = batches.filter((b) => b.kind === kind && b.replaced_by === null);
  return (
    <Field label="This file" hint="Replacing removes that batch's rows and puts this file's rows in, in one step.">
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Adds new records</option>
        {candidates.map((b) => (
          <option key={b.id} value={b.id}>
            Replaces batch #{b.id} ({b.file_name})
          </option>
        ))}
      </select>
    </Field>
  );
}

function Overlap({ overlap, duplicateOf }: { overlap: { responses: number; tallyBatches: number }; duplicateOf: number | null }) {
  return (
    <>
      {duplicateOf !== null && <Notice tone="warning">This exact file was already imported as batch #{duplicateOf}. Choose “Replaces batch #{duplicateOf}” if you mean to re-import it.</Notice>}
      {(overlap.responses > 0 || overlap.tallyBatches > 0) && (
        <Notice tone="warning">
          These months already have {int(overlap.responses)} responses and {int(overlap.tallyBatches)} tally batches. Check that this file
          does not count the same forms again.
        </Notice>
      )}
    </>
  );
}

function OnlineImport({ batches }: { batches: Batch[] }) {
  const qc = useQueryClient();
  const meta = useMeta();
  const { file, input } = useFile();
  const [dateOrder, setDateOrder] = useState<"mdy" | "dmy">("mdy");
  const [instrument, setInstrument] = useState("ARTA-2420-03-ONSITE");
  const [replace, setReplace] = useState("");
  const [acceptRejects, setAcceptRejects] = useState(false);
  const body = () => ({
    fileName: file!.name,
    text: file!.text,
    dateOrder,
    instrument,
    allowRejectedRows: acceptRejects,
    replaceBatchId: replace ? Number(replace) : null,
  });
  const preview = useMutation({ mutationFn: () => api<OnlinePreview>("/api/imports/online/preview", { body: body() }) });
  const commit = useMutation({
    mutationFn: () => api<{ imported: number; rejected: number }>("/api/imports/online/commit", { body: body() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["imports"] });
      preview.reset();
    },
  });
  const p = preview.data;

  return (
    <Card title="Old online form (CSV export)">
      <p className="mb-3 text-sm text-(--ink-2)">
        Export the responses sheet as CSV. Columns are found by their ARTA item codes (CC1, SQD0…), and email addresses are
        never imported.
      </p>
      <div className="space-y-3">
        {input}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dates in the file are written as">
            <select className={inputClass} value={dateOrder} onChange={(e) => setDateOrder(e.target.value as "mdy" | "dmy")}>
              <option value="mdy">Month/Day/Year (9/23/2026)</option>
              <option value="dmy">Day/Month/Year (23/9/2026)</option>
            </select>
          </Field>
          <Field label="The old form used">
            <select className={inputClass} value={instrument} onChange={(e) => setInstrument(e.target.value)}>
              {meta.data?.instruments.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.code}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ReplaceSelect batches={batches} kind="online_csv" value={replace} onChange={setReplace} />
        <Button variant="secondary" disabled={!file || preview.isPending} onClick={() => preview.mutate()}>
          Preview
        </Button>
      </div>
      <ErrorBox error={preview.error} />
      {p && (
        <div className="mt-4 space-y-2 text-sm">
          {p.missingColumns.length > 0 ? (
            <Notice tone="warning">Missing columns: {p.missingColumns.join(", ")}. Nothing can be imported until they are found.</Notice>
          ) : (
            <p>
              {int(p.acceptedRows)} of {int(p.dataRows)} rows can be imported, covering {p.months[0]} to {p.months[p.months.length - 1]}.{" "}
              {p.rejectedCount > 0 && <strong>{int(p.rejectedCount)} rows cannot be read.</strong>}
            </p>
          )}
          {p.ignoredColumns.length > 0 && <p className="text-(--ink-2)">Not imported: {p.ignoredColumns.join(", ")}.</p>}
          <Overlap overlap={p.overlap} duplicateOf={p.duplicateOfBatch} />
          {p.rejectedRows.length > 0 && (
            <details open>
              <summary className="cursor-pointer font-medium">Rows that cannot be read</summary>
              <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5">
                {p.rejectedRows.map((r) => (
                  <li key={r.row}>
                    Row {r.row}: {r.errors.join("; ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {p.warningCount > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">{int(p.warningCount)} warnings (answers kept as blank)</summary>
              <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5">
                {p.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {p.missingColumns.length === 0 && p.acceptedRows > 0 && (
            <div className="space-y-2 pt-2">
              {p.rejectedCount > 0 && (
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={acceptRejects} onChange={(e) => setAcceptRejects(e.target.checked)} />
                  <span>Import the readable rows and leave out the {int(p.rejectedCount)} that cannot be read.</span>
                </label>
              )}
              <Button disabled={commit.isPending || (p.rejectedCount > 0 && !acceptRejects)} onClick={() => commit.mutate()}>
                Import {int(p.acceptedRows)} rows
              </Button>
            </div>
          )}
        </div>
      )}
      <ErrorBox error={commit.error} />
      {commit.data && <Notice>Imported {int(commit.data.imported)} rows.</Notice>}
    </Card>
  );
}

function TallyImport({ batches }: { batches: Batch[] }) {
  const qc = useQueryClient();
  const { file, input } = useFile();
  const [from, setFrom] = useState(`${manilaMonth().slice(0, 4)}-01`);
  const [to, setTo] = useState(manilaMonth());
  const [replace, setReplace] = useState("");
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const body = () => ({ fileName: file!.name, text: file!.text, allowWarnings: acceptWarnings, replaceBatchId: replace ? Number(replace) : null });
  const preview = useMutation({ mutationFn: () => api<TallyPreview>("/api/imports/tally/preview", { body: body() }) });
  const commit = useMutation({
    mutationFn: () => api<{ records: number }>("/api/imports/tally/commit", { body: body() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["imports"] });
      preview.reset();
    },
  });
  const p = preview.data;

  return (
    <Card title="Paper tally sheets">
      <p className="mb-3 text-sm text-(--ink-2)">
        Download the template, copy each month’s tally into it (one row per service), and upload it. Blank cells count as zero.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From month">
          <input type="month" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To month">
          <input type="month" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <a className="mb-0.5 rounded-lg border border-slate-400 bg-white px-4 py-2 text-sm font-semibold" href={`/api/imports/tally-template?from=${from}&to=${to}`}>
          Download template
        </a>
      </div>
      <div className="mt-4 space-y-3">
        {input}
        <ReplaceSelect batches={batches} kind="paper_tally" value={replace} onChange={setReplace} />
        <Button variant="secondary" disabled={!file || preview.isPending} onClick={() => preview.mutate()}>
          Preview
        </Button>
      </div>
      <ErrorBox error={preview.error} />
      {p && (
        <div className="mt-4 space-y-2 text-sm">
          {p.rowErrors.length > 0 ? (
            <>
              <Notice tone="warning">Fix these rows and upload the sheet again:</Notice>
              <ul className="max-h-48 list-disc overflow-auto pl-5">
                {p.rowErrors.map((r) => (
                  <li key={r.row}>
                    Row {r.row}: {r.errors.join("; ")}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {int(p.records)} counts across {p.months.join(", ")}.
            </p>
          )}
          <Overlap overlap={p.overlap} duplicateOf={p.duplicateOfBatch} />
          {p.warningCount > 0 && (
            <details open>
              <summary className="cursor-pointer font-medium">{int(p.warningCount)} rows whose answers do not add up to the respondents</summary>
              <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5">
                {p.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {p.rowErrors.length === 0 && p.records > 0 && (
            <div className="space-y-2 pt-2">
              {p.warningCount > 0 && (
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={acceptWarnings} onChange={(e) => setAcceptWarnings(e.target.checked)} />
                  <span>I checked these against the paper tally; import as written.</span>
                </label>
              )}
              <Button disabled={commit.isPending || (p.warningCount > 0 && !acceptWarnings)} onClick={() => commit.mutate()}>
                Import tally
              </Button>
            </div>
          )}
        </div>
      )}
      <ErrorBox error={commit.error} />
      {commit.data && <Notice>Imported {int(commit.data.records)} counts.</Notice>}
    </Card>
  );
}
