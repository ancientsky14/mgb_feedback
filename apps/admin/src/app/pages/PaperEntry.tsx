import { ARTA_CSM_2420_03_ONSITE, CLIENT_TYPES, getInstrument, REGIONS, SQD_CODES, type SqdCode } from "@feedback/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../api";
import { useMeta } from "../hooks";
import { Button, Card, ErrorBox, Field, inputClass, Notice, PageTitle } from "../ui";

type Sqd = Record<SqdCode, number | null>;
type SaveResult = { changed?: string[]; publicRef?: string };

interface PaperForm {
  instrument: string;
  controlNo: string;
  transactionDate: string;
  servicePointId: string;
  serviceId: string;
  clientType: string;
  sex: string;
  age: string;
  region: string;
  cc1: number | null;
  cc2: number | null;
  cc3: number | null;
  sqd: Sqd;
  suggestion: string;
  email: string;
}

const blankSqd = (): Sqd => Object.fromEntries(SQD_CODES.map((c) => [c, null])) as Sqd;

function emptyForm(keep?: Partial<PaperForm>): PaperForm {
  return {
    instrument: keep?.instrument ?? ARTA_CSM_2420_03_ONSITE.code,
    controlNo: keep?.controlNo ?? "",
    transactionDate: keep?.transactionDate ?? "",
    servicePointId: keep?.servicePointId ?? "",
    serviceId: keep?.serviceId ?? "",
    clientType: "",
    sex: "",
    age: "",
    region: "",
    cc1: null,
    cc2: null,
    cc3: null,
    sqd: blankSqd(),
    suggestion: "",
    email: "",
  };
}

/** 2026-0101 → 2026-0102: steps the trailing number, keeping its width. */
function nextControlNo(value: string): string {
  const m = /^(.*?)(\d+)$/.exec(value);
  if (!m) return "";
  const n = String(Number(m[2]) + 1).padStart(m[2]!.length, "0");
  return `${m[1]}${n}`;
}

const nullIfEmpty = (s: string) => (s.trim() === "" ? null : s.trim());

/** The form as stored, for a correction. */
function formFromResponse(r: Record<string, unknown>): PaperForm {
  const str = (k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));
  return {
    instrument: str("instrument_code"),
    controlNo: str("control_no"),
    transactionDate: str("transaction_date"),
    servicePointId: str("service_point_id"),
    serviceId: str("service_id"),
    clientType: str("client_type"),
    sex: str("sex"),
    age: str("age"),
    region: str("region"),
    cc1: (r.cc1 as number | null) ?? null,
    cc2: (r.cc2 as number | null) ?? null,
    cc3: (r.cc3 as number | null) ?? null,
    sqd: Object.fromEntries(SQD_CODES.map((c) => [c, (r[c] as number | null) ?? null])) as Sqd,
    suggestion: str("suggestion"),
    email: "",
  };
}

export function PaperEntry() {
  const editId = Number(new URLSearchParams(window.location.search).get("edit")) || null;
  const existing = useQuery({
    queryKey: ["response", editId],
    queryFn: () => api<Record<string, unknown>>(`/api/responses/${editId}`),
    enabled: editId !== null,
  });
  if (editId === null) return <PaperFormView initial={emptyForm()} editId={null} />;
  if (existing.error) return <ErrorBox error={existing.error} />;
  if (!existing.data) return <p>Loading…</p>;
  // Mounted once the stored form has loaded, so it starts from those values.
  return <PaperFormView key={editId} initial={formFromResponse(existing.data)} editId={editId} />;
}

function PaperFormView({ initial, editId }: { initial: PaperForm; editId: number | null }) {
  const meta = useMeta();
  const qc = useQueryClient();
  const [form, setForm] = useState<PaperForm>(initial);
  const [saved, setSaved] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        controlNo: form.controlNo,
        servicePointId: form.servicePointId ? Number(form.servicePointId) : null,
        serviceId: Number(form.serviceId),
        instrument: form.instrument,
        transactionDate: form.transactionDate,
        clientType: nullIfEmpty(form.clientType),
        sex: nullIfEmpty(form.sex),
        age: form.age.trim() === "" ? null : Number(form.age),
        region: nullIfEmpty(form.region),
        cc1: form.cc1,
        cc2: form.cc2,
        cc3: form.cc3,
        sqd: form.sqd,
        suggestion: nullIfEmpty(form.suggestion),
        email: editId ? null : nullIfEmpty(form.email),
      };
      return editId
        ? api<SaveResult>(`/api/paper-responses/${editId}`, { method: "PUT", body })
        : api<SaveResult>("/api/paper-responses", { body });
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["responses"] });
      if (editId) {
        setSaved(`Correction saved (${result.changed?.length ?? 0} fields changed).`);
        return;
      }
      setSaved(`Saved as ${result.publicRef ?? "—"}, control no. ${form.controlNo}.`);
      setForm(
        emptyForm({
          instrument: form.instrument,
          transactionDate: form.transactionDate,
          servicePointId: form.servicePointId,
          serviceId: form.serviceId,
          controlNo: nextControlNo(form.controlNo),
        }),
      );
      window.scrollTo({ top: 0 });
    },
  });

  const instrument = getInstrument(form.instrument) ?? ARTA_CSM_2420_03_ONSITE;
  const set = (patch: Partial<PaperForm>) => {
    setSaved(null);
    setForm((f) => ({ ...f, ...patch }));
  };
  const inconsistentCc = form.cc1 === 4 && ((form.cc2 !== null && form.cc2 !== 5) || (form.cc3 !== null && form.cc3 !== 4));
  const fieldErrors = save.error instanceof ApiError ? save.error.body.fields : undefined;
  const canSave = form.controlNo.trim() && form.transactionDate && form.serviceId;

  return (
    <>
      <PageTitle>{editId ? "Correct a paper form" : "Type in a paper form"}</PageTitle>
      <p className="-mt-4 mb-4 text-sm text-(--ink-2)">
        Copy the form exactly as written. Leave blank what the client left blank, and keep the paper original filed by its
        control number.
      </p>
      {saved && (
        <div role="status" className="mb-4 rounded-lg border-2 border-emerald-700 bg-emerald-50 p-3 text-sm text-emerald-950">
          {saved}
        </div>
      )}
      <ErrorBox error={save.error} />
      {fieldErrors && (
        <ul className="mb-4 list-disc pl-5 text-sm text-red-900">
          {Object.entries(fieldErrors).map(([k, v]) => (
            <li key={k}>
              {k}: {v.join(", ")}
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save.mutate();
        }}
        className="space-y-6"
      >
        <Card title="Form and transaction">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Control no.">
              <input className={inputClass} value={form.controlNo} onChange={(e) => set({ controlNo: e.target.value })} required />
            </Field>
            <Field label="Date of transaction">
              <input type="date" className={inputClass} value={form.transactionDate} onChange={(e) => set({ transactionDate: e.target.value })} required />
            </Field>
            <Field label="Form version">
              <select className={inputClass} value={form.instrument} onChange={(e) => set({ instrument: e.target.value })}>
                {meta.data?.instruments
                  .filter((i) => i.status !== "draft")
                  .map((i) => (
                    <option key={i.code} value={i.code}>
                      {i.code} ({i.status})
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Service availed">
              <select className={inputClass} value={form.serviceId} onChange={(e) => set({ serviceId: e.target.value })} required>
                <option value="">Choose…</option>
                {meta.data?.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Where the form was given (optional)">
              <select className={inputClass} value={form.servicePointId} onChange={(e) => set({ servicePointId: e.target.value })}>
                <option value="">Not recorded</option>
                {meta.data?.servicePoints.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Client">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Client type">
              <select className={inputClass} value={form.clientType} onChange={(e) => set({ clientType: e.target.value })}>
                <option value="">Blank</option>
                {CLIENT_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {instrument.clientTypes[c].en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sex">
              <select className={inputClass} value={form.sex} onChange={(e) => set({ sex: e.target.value })}>
                <option value="">Blank</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
            <Field label="Age">
              <input inputMode="numeric" className={inputClass} value={form.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="Region of residence">
              <select className={inputClass} value={form.region} onChange={(e) => set({ region: e.target.value })}>
                <option value="">Blank</option>
                {REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Citizen’s Charter">
          {inconsistentCc && (
            <Notice tone="warning">
              CC1 is 4 but CC2 or CC3 has an answer other than N/A. That is fine if it is what the client wrote; it is kept as written.
            </Notice>
          )}
          <div className="space-y-4">
            {instrument.cc.map((q) => (
              <fieldset key={q.code}>
                <legend className="text-sm font-semibold">
                  {q.code.toUpperCase()}. {q.text.en}
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...q.options.map((o) => ({ value: o.code as number | null, label: `${o.code}. ${o.label.en}` })), { value: null, label: "Blank" }].map((o) => (
                    <label key={String(o.value)} className="flex items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1 text-sm">
                      <input type="radio" name={q.code} checked={form[q.code] === o.value} onChange={() => set({ [q.code]: o.value } as Partial<PaperForm>)} />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </Card>

        <Card title="Service quality (SQD0–SQD8)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--hairline) text-(--ink-2)">
                  <th className="py-2 pr-3 text-left font-medium">Item</th>
                  {["SD", "D", "N", "A", "SA", "N/A", "Blank"].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SQD_CODES.map((code, i) => (
                  <tr key={code} className="border-b border-(--hairline)">
                    <td className="py-2 pr-3">
                      <span className="font-medium">SQD{i}.</span> {instrument.sqd[i]?.text.en}
                    </td>
                    {[1, 2, 3, 4, 5, 0, null].map((v) => (
                      <td key={String(v)} className="px-2 py-2 text-center">
                        <input
                          type="radio"
                          name={code}
                          aria-label={`SQD${i} ${v === null ? "blank" : v === 0 ? "N/A" : v}`}
                          checked={form.sqd[code] === v}
                          onChange={() => set({ sqd: { ...form.sqd, [code]: v } })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Suggestions and email">
          <Field label="Suggestions (as written)">
            <textarea rows={3} maxLength={2000} className={inputClass} value={form.suggestion} onChange={(e) => set({ suggestion: e.target.value })} />
          </Field>
          {!editId && (
            <div className="mt-4">
              <Field label="Email address (only if the client wrote one)" hint="Kept apart from the answers and deleted after the retention period.">
                <input type="email" className={inputClass} value={form.email} onChange={(e) => set({ email: e.target.value })} />
              </Field>
            </div>
          )}
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={!canSave || save.isPending}>
            {save.isPending ? "Saving…" : editId ? "Save correction" : "Save and start the next form"}
          </Button>
        </div>
      </form>
    </>
  );
}
