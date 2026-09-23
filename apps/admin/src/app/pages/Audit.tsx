import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Button, Card, ErrorBox, PageTitle } from "../ui";

interface AuditRow {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  detail: string | null;
}

export function AuditPage() {
  const q = useInfiniteQuery({
    queryKey: ["audit"],
    queryFn: ({ pageParam }) => api<{ items: AuditRow[]; nextBefore: number | null }>(`/api/audit${pageParam ? `?before=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <PageTitle>Audit log</PageTitle>
      <p className="-mt-4 mb-4 text-sm text-(--ink-2)">
        Every change, export, contact reveal and automatic purge, newest first. The log cannot be edited or deleted.
      </p>
      <ErrorBox error={q.error} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-(--ink-2)">
              <tr className="border-b border-(--hairline)">
                <th className="py-2 pr-3 font-medium">When (UTC)</th>
                <th className="py-2 pr-3 font-medium">Who</th>
                <th className="py-2 pr-3 font-medium">What</th>
                <th className="py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-(--hairline) align-top">
                  <td className="tabular py-2 pr-3 whitespace-nowrap">{r.at.slice(0, 19).replace("T", " ")}</td>
                  <td className="py-2 pr-3">{r.actor}</td>
                  <td className="py-2 pr-3">
                    {r.action}
                    {r.entity && (
                      <span className="block text-xs text-(--ink-2)">
                        {r.entity} {r.entity_id}
                      </span>
                    )}
                  </td>
                  <td className="py-2 font-mono text-xs break-all">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {q.hasNextPage && (
          <Button variant="secondary" className="mt-3" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            Load older entries
          </Button>
        )}
      </Card>
    </>
  );
}
