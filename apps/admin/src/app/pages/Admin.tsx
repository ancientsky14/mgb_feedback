import { ROLES, type Role } from "@feedback/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { useMeta } from "../hooks";
import type { Me } from "../types";
import { Button, Card, ErrorBox, Field, inputClass, PageTitle } from "../ui";

interface StaffRow {
  email: string;
  display_name: string;
  role: Role;
  division_id: number | null;
  active: number;
}

const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator — everything, including staff and settings",
  cart: "CART — responses, contact details, paper forms, imports, setup",
  division_focal: "Division focal person — own division, small groups hidden",
  management: "Management — dashboards, reports and responses (read-only)",
};

const SETTING_HELP: Record<string, string> = {
  public_base_url: "The address QR posters point to, e.g. https://feedback.example.gov.ph (no path).",
  contact_retention_days: "Days an email address is kept before it is deleted automatically (30–3650). Set with the DPO.",
  online_max_transaction_age_days: "How far back a client may date a transaction on the QR form (1–366 days).",
  office_overall_method: "pooled (all answers together) or mean_of_services. Confirm against last year’s filed report.",
};

export function AdminPage({ me }: { me: Me }) {
  return (
    <>
      <PageTitle>Staff &amp; settings</PageTitle>
      <div className="grid gap-6 xl:grid-cols-2">
        <StaffSection me={me} />
        <SettingsSection />
      </div>
    </>
  );
}

function StaffSection({ me }: { me: Me }) {
  const qc = useQueryClient();
  const meta = useMeta();
  const list = useQuery({ queryKey: ["staff"], queryFn: () => api<{ items: StaffRow[] }>("/api/staff") });
  const empty = { email: "", displayName: "", role: "cart" as Role, divisionId: "", active: true };
  const [draft, setDraft] = useState(empty);
  const save = useMutation({
    mutationFn: () =>
      api("/api/staff", {
        method: "PUT",
        body: {
          email: draft.email.trim(),
          displayName: draft.displayName.trim(),
          role: draft.role,
          divisionId: draft.divisionId ? Number(draft.divisionId) : null,
          active: draft.active,
        },
      }),
    onSuccess: () => {
      setDraft(empty);
      void qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });

  return (
    <Card title="Who can sign in">
      <p className="mb-3 text-sm text-(--ink-2)">
        Sign-in is Cloudflare Access; this list decides what each email may do. Add the same email to the Access policy.
      </p>
      <ErrorBox error={list.error} />
      <table className="w-full text-left text-sm">
        <tbody>
          {list.data?.items.map((s) => (
            <tr key={s.email} className={`border-b border-(--hairline) ${s.active ? "" : "text-(--muted)"}`}>
              <td className="py-2 pr-3">
                {s.display_name}
                <br />
                <span className="text-xs">{s.email}</span>
              </td>
              <td className="py-2 pr-3">
                {s.role.replace("_", " ")}
                {s.division_id ? ` · ${meta.data?.divisions.find((d) => d.id === s.division_id)?.code ?? ""}` : ""}
              </td>
              <td className="py-2 pr-3">{s.active ? "Active" : "Inactive"}</td>
              <td className="py-2 text-right">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setDraft({
                      email: s.email,
                      displayName: s.display_name,
                      role: s.role,
                      divisionId: s.division_id ? String(s.division_id) : "",
                      active: s.active === 1,
                    })
                  }
                >
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 space-y-3 rounded-lg bg-slate-50 p-4">
        <h3 className="font-semibold">{list.data?.items.some((s) => s.email === draft.email) ? "Edit staff" : "Add staff"}</h3>
        <Field label="Email (the one they sign in with)">
          <input type="email" className={inputClass} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </Field>
        <Field label="Name">
          <input className={inputClass} value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
        </Field>
        <Field label="Role">
          <select className={inputClass} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        {draft.role === "division_focal" && (
          <Field label="Division">
            <select className={inputClass} value={draft.divisionId} onChange={(e) => setDraft({ ...draft, divisionId: e.target.value })}>
              <option value="">Choose…</option>
              {meta.data?.divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
          Active
        </label>
        {draft.email.trim().toLowerCase() === me.email && <p className="text-sm text-amber-900">This is your own account.</p>}
        <ErrorBox error={save.error} />
        <Button disabled={!draft.email.trim() || !draft.displayName.trim() || save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </Card>
  );
}

function SettingsSection() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ items: { key: string; value: string; updated_by: string; updated_at: string }[] }>("/api/settings"),
  });
  const [values, setValues] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => api(`/api/settings/${key}`, { method: "PUT", body: { value } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["settings"] });
      void qc.invalidateQueries({ queryKey: ["meta"] });
    },
  });
  const current = new Map(list.data?.items.map((s) => [s.key, s]));

  return (
    <Card title="Settings">
      <ErrorBox error={list.error ?? save.error} />
      <div className="space-y-4">
        {Object.keys(SETTING_HELP).map((key) => {
          const row = current.get(key);
          const value = values[key] ?? row?.value ?? "";
          return (
            <div key={key} className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <Field label={key} hint={SETTING_HELP[key]}>
                  <input className={inputClass} value={value} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
                </Field>
                {row && <p className="mt-1 text-xs text-(--muted)">Last changed by {row.updated_by}</p>}
              </div>
              <Button variant="secondary" disabled={save.isPending || value === (row?.value ?? "")} onClick={() => save.mutate({ key, value })}>
                Save
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
