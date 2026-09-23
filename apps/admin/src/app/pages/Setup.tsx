import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { useMeta } from "../hooks";
import { Link } from "../router";
import type { Meta, ServicePointRow, ServiceRow } from "../types";
import { Button, Card, ErrorBox, Field, inputClass, Notice, PageTitle } from "../ui";

type Tab = "services" | "points" | "counts" | "divisions";

export function SetupPage() {
  const [tab, setTab] = useState<Tab>("services");
  const meta = useMeta();
  const tabs: [Tab, string][] = [
    ["services", "Services"],
    ["points", "QR codes"],
    ["counts", "Transaction counts"],
    ["divisions", "Divisions"],
  ];
  return (
    <>
      <PageTitle>Services &amp; QR codes</PageTitle>
      <div role="tablist" className="mb-6 flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === key ? "bg-emerald-800 text-white" : "border border-slate-300 bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorBox error={meta.error} />
      {meta.data && tab === "services" && <Services meta={meta.data} />}
      {meta.data && tab === "points" && <ServicePoints meta={meta.data} />}
      {meta.data && tab === "counts" && <TransactionCounts meta={meta.data} />}
      {meta.data && tab === "divisions" && <Divisions meta={meta.data} />}
    </>
  );
}

function useSave<T>(path: (id: number | null) => string, method: (id: number | null) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: T }) => api(path(id), { method: method(id), body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["meta"] }),
  });
}

// ---- Services -------------------------------------------------------------------------------

interface ServiceDraft {
  divisionId: number;
  name: string;
  ccRef: string;
  classification: string;
  processingDays: string;
  isExternal: boolean;
  isPlaceholder: boolean;
  active: boolean;
  sortOrder: string;
}

function toDraft(s: ServiceRow | null, meta: Meta): ServiceDraft {
  return {
    divisionId: s?.division_id ?? meta.divisions[0]?.id ?? 0,
    name: s?.name ?? "",
    ccRef: s?.cc_ref ?? "",
    classification: s?.classification ?? "",
    processingDays: s?.processing_days ? String(s.processing_days) : "",
    isExternal: s ? s.is_external === 1 : true,
    isPlaceholder: s ? s.is_placeholder === 1 : false,
    active: s ? s.active === 1 : true,
    sortOrder: String(s?.sort_order ?? 0),
  };
}

function Services({ meta }: { meta: Meta }) {
  const [editing, setEditing] = useState<ServiceRow | "new" | null>(null);
  const placeholders = meta.services.filter((s) => s.is_placeholder && s.active).length;
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2" title="Services clients can rate">
        {placeholders > 0 && (
          <Notice tone="warning">
            {placeholders} services are placeholders. Replace them with the external services in the office’s current Citizen’s
            Charter, then untick “placeholder”.
          </Notice>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-(--ink-2)">
              <tr className="border-b border-(--hairline)">
                <th className="py-2 pr-3 font-medium">Service</th>
                <th className="py-2 pr-3 font-medium">Division</th>
                <th className="py-2 pr-3 font-medium">Charter ref.</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {meta.services.map((s) => (
                <tr key={s.id} className="border-b border-(--hairline)">
                  <td className="py-2 pr-3">{s.name}</td>
                  <td className="py-2 pr-3">{meta.divisions.find((d) => d.id === s.division_id)?.code}</td>
                  <td className="py-2 pr-3">{s.cc_ref ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {s.active ? "Active" : "Inactive"}
                    {s.is_placeholder ? " · placeholder" : ""}
                    {s.is_external ? "" : " · internal"}
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="secondary" onClick={() => setEditing(s)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button className="mt-4" onClick={() => setEditing("new")}>
          Add a service
        </Button>
      </Card>
      {editing && (
        <ServiceForm key={editing === "new" ? "new" : editing.id} meta={meta} service={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
      )}
    </div>
  );
}

function ServiceForm({ meta, service, onDone }: { meta: Meta; service: ServiceRow | null; onDone: () => void }) {
  const [d, setD] = useState<ServiceDraft>(() => toDraft(service, meta));
  const save = useSave<unknown>(
    (id) => (id ? `/api/services/${id}` : "/api/services"),
    (id) => (id ? "PATCH" : "POST"),
  );
  const submit = () =>
    save.mutate(
      {
        id: service?.id ?? null,
        body: {
          divisionId: d.divisionId,
          name: d.name,
          ccRef: d.ccRef.trim() || null,
          classification: d.classification || null,
          processingDays: d.processingDays ? Number(d.processingDays) : null,
          isExternal: d.isExternal,
          isPlaceholder: d.isPlaceholder,
          active: d.active,
          sortOrder: Number(d.sortOrder) || 0,
        },
      },
      { onSuccess: onDone },
    );
  return (
    <Card title={service ? "Edit service" : "New service"}>
      <div className="space-y-3">
        <Field label="Name, as in the Citizen’s Charter">
          <input className={inputClass} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Division">
          <select className={inputClass} value={d.divisionId} onChange={(e) => setD({ ...d, divisionId: Number(e.target.value) })}>
            {meta.divisions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} — {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Citizen’s Charter reference">
          <input className={inputClass} value={d.ccRef} onChange={(e) => setD({ ...d, ccRef: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Classification">
            <select className={inputClass} value={d.classification} onChange={(e) => setD({ ...d, classification: e.target.value })}>
              <option value="">Not set</option>
              <option value="simple">Simple</option>
              <option value="complex">Complex</option>
              <option value="highly_technical">Highly technical</option>
            </select>
          </Field>
          <Field label="Processing time (working days)">
            <input inputMode="numeric" className={inputClass} value={d.processingDays} onChange={(e) => setD({ ...d, processingDays: e.target.value.replace(/\D/g, "") })} />
          </Field>
        </div>
        <Field label="Sort order">
          <input inputMode="numeric" className={inputClass} value={d.sortOrder} onChange={(e) => setD({ ...d, sortOrder: e.target.value.replace(/\D/g, "") })} />
        </Field>
        {(
          [
            ["isExternal", "External service (for clients)"],
            ["isPlaceholder", "Placeholder, not yet confirmed against the Charter"],
            ["active", "Active (offered on the form)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d[key]} onChange={(e) => setD({ ...d, [key]: e.target.checked })} />
            {label}
          </label>
        ))}
        <ErrorBox error={save.error} />
        <div className="flex gap-2">
          <Button onClick={submit} disabled={!d.name.trim() || save.isPending}>
            Save
          </Button>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---- Service points (QR codes) ---------------------------------------------------------------

function ServicePoints({ meta }: { meta: Meta }) {
  const [label, setLabel] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [defaultServiceId, setDefaultServiceId] = useState("");
  const [mode, setMode] = useState<"onsite" | "online">("onsite");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const create = useSave<unknown>(() => "/api/service-points", () => "POST");
  const update = useSave<unknown>((id) => `/api/service-points/${id}`, () => "PATCH");
  const base = meta.settings.public_base_url ?? "";
  const status = (p: ServicePointRow) => (p.retired_at ? "Retired" : p.valid_to && p.valid_to < new Date().toISOString().slice(0, 10) ? "Ended" : "Open");

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2" title="QR codes">
        {!base && <Notice tone="warning">Set the public survey address in Staff &amp; settings before printing posters.</Notice>}
        <p className="mb-3 text-sm text-(--ink-2)">
          Each code opens the survey for one desk, counter or event. A code never changes once printed: retire it instead.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-(--ink-2)">
              <tr className="border-b border-(--hairline)">
                <th className="py-2 pr-3 font-medium">Where</th>
                <th className="py-2 pr-3 font-medium">Code</th>
                <th className="py-2 pr-3 font-medium">Offers</th>
                <th className="py-2 pr-3 font-medium">Form</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {meta.servicePoints.map((p) => (
                <tr key={p.id} className="border-b border-(--hairline)">
                  <td className="py-2 pr-3">
                    {p.label}
                    {(p.valid_from || p.valid_to) && (
                      <span className="block text-xs text-(--ink-2)">
                        {p.valid_from ?? "…"} to {p.valid_to ?? "…"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono">{p.code}</td>
                  <td className="py-2 pr-3">{p.division_id ? meta.divisions.find((d) => d.id === p.division_id)?.code : "All services"}</td>
                  <td className="py-2 pr-3">{p.mode === "onsite" ? "On-site" : "Online"}</td>
                  <td className="py-2 pr-3">{status(p)}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {!p.retired_at && (
                      <>
                        <Link to={`/poster/${p.id}`} className="mr-2 text-sm font-semibold text-emerald-800 underline">
                          Poster
                        </Link>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (window.confirm(`Retire “${p.label}”? Its printed QR code will stop opening the survey.`)) {
                              update.mutate({ id: p.id, body: { retired: true } });
                            }
                          }}
                        >
                          Retire
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ErrorBox error={update.error} />
      </Card>
      <Card title="New QR code">
        <div className="space-y-3">
          <Field label="Where it will be posted">
            <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mine Management Division counter" />
          </Field>
          <Field label="Services offered">
            <select className={inputClass} value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
              <option value="">All services (e.g. the PACD)</option>
              {meta.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} services only
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pre-selected service (optional)">
            <select className={inputClass} value={defaultServiceId} onChange={(e) => setDefaultServiceId(e.target.value)}>
              <option value="">None</option>
              {meta.services
                .filter((s) => s.active && (!divisionId || s.division_id === Number(divisionId)))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Transactions here are" hint="In-person service uses ARTA’s on-site form, even when filled in on a phone.">
            <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as "onsite" | "online")}>
              <option value="onsite">In person (on-site form)</option>
              <option value="online">Online (online form)</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Open from (optional)">
              <input type="date" className={inputClass} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </Field>
            <Field label="Open until (optional)">
              <input type="date" className={inputClass} value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </Field>
          </div>
          <ErrorBox error={create.error} />
          <Button
            disabled={!label.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  id: null,
                  body: {
                    label,
                    divisionId: divisionId ? Number(divisionId) : null,
                    defaultServiceId: defaultServiceId ? Number(defaultServiceId) : null,
                    mode,
                    validFrom,
                    validTo,
                  },
                },
                { onSuccess: () => setLabel("") },
              )
            }
          >
            Create QR code
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---- Transaction counts ------------------------------------------------------------------------

function TransactionCounts({ meta }: { meta: Meta }) {
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const q = useQuery({
    queryKey: ["counts", year],
    queryFn: () =>
      api<{ items: { service_id: number; month: string; count: number }[] }>(`/api/transaction-counts?from=${year}-01&to=${year}-12`),
  });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () =>
      api("/api/transaction-counts", {
        method: "PUT",
        body: {
          items: Object.entries(edits)
            .filter(([, v]) => v !== "")
            .map(([key, v]) => {
              const [serviceId, month] = key.split("|");
              return { serviceId: Number(serviceId), month, count: Number(v) };
            }),
        },
      }),
    onSuccess: () => {
      setEdits({});
      void qc.invalidateQueries({ queryKey: ["counts", year] });
    },
  });
  const stored = new Map(q.data?.items.map((i) => [`${i.service_id}|${i.month}`, String(i.count)]));
  const services = meta.services.filter((s) => s.active);

  return (
    <Card title="Transactions per service per month">
      <p className="mb-3 text-sm text-(--ink-2)">
        From the office logbooks. These are the denominator of the response rate; leave a month blank if it is not known.
      </p>
      <div className="mb-3 flex items-end gap-3">
        <Field label="Year">
          <input type="number" className={inputClass + " w-28"} value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </Field>
        <Button disabled={Object.keys(edits).length === 0 || save.isPending} onClick={() => save.mutate()}>
          Save changes
        </Button>
      </div>
      <ErrorBox error={q.error ?? save.error} />
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-(--ink-2)">
              <th className="py-2 pr-3 text-left font-medium">Service</th>
              {months.map((m) => (
                <th key={m} className="px-1 py-2 font-medium">
                  {new Date(`${m}-01T00:00:00Z`).toLocaleString("en-PH", { month: "short", timeZone: "UTC" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} className="border-t border-(--hairline)">
                <td className="py-1 pr-3">{s.name}</td>
                {months.map((m) => {
                  const key = `${s.id}|${m}`;
                  return (
                    <td key={m} className="px-1 py-1">
                      <input
                        inputMode="numeric"
                        aria-label={`${s.name}, ${m}`}
                        className="tabular w-16 rounded border border-slate-300 px-1 py-1 text-right"
                        value={edits[key] ?? stored.get(key) ?? ""}
                        onChange={(e) => setEdits({ ...edits, [key]: e.target.value.replace(/\D/g, "") })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---- Divisions ------------------------------------------------------------------------------------

function Divisions({ meta }: { meta: Meta }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const create = useSave<unknown>(() => "/api/divisions", () => "POST");
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2" title="Divisions">
        <table className="w-full text-left text-sm">
          <tbody>
            {meta.divisions.map((d) => (
              <tr key={d.id} className="border-b border-(--hairline)">
                <td className="py-2 pr-3 font-medium">{d.code}</td>
                <td className="py-2 pr-3">{d.name}</td>
                <td className="py-2">{d.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="New division">
        <div className="space-y-3">
          <Field label="Code">
            <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <ErrorBox error={create.error} />
          <Button
            disabled={!code.trim() || !name.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { id: null, body: { code, name } },
                {
                  onSuccess: () => {
                    setCode("");
                    setName("");
                  },
                },
              )
            }
          >
            Add division
          </Button>
        </div>
      </Card>
    </div>
  );
}
