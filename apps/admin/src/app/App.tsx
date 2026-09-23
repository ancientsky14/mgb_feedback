import type { Role } from "@feedback/shared";
import type { ReactNode } from "react";
import { describeError, SessionEnded } from "./api";
import { useMe } from "./hooks";
import { AdminPage } from "./pages/Admin";
import { AuditPage } from "./pages/Audit";
import { Dashboard } from "./pages/Dashboard";
import { ImportsPage } from "./pages/Imports";
import { PaperEntry } from "./pages/PaperEntry";
import { PosterPage } from "./pages/Poster";
import { ReportPage } from "./pages/Report";
import { ResponsesPage } from "./pages/Responses";
import { SetupPage } from "./pages/Setup";
import { Link, usePath } from "./router";
import { Button } from "./ui";

const NAV: { to: string; label: string; roles: readonly Role[] }[] = [
  { to: "/", label: "Dashboard", roles: ["admin", "cart", "division_focal", "management"] },
  { to: "/report", label: "ARTA report", roles: ["admin", "cart", "division_focal", "management"] },
  { to: "/responses", label: "Responses", roles: ["admin", "cart", "division_focal", "management"] },
  { to: "/paper", label: "Paper forms", roles: ["admin", "cart"] },
  { to: "/imports", label: "Imports", roles: ["admin", "cart"] },
  { to: "/setup", label: "Services & QR codes", roles: ["admin", "cart"] },
  { to: "/admin", label: "Staff & settings", roles: ["admin"] },
  { to: "/audit", label: "Audit log", roles: ["admin"] },
];

export function App() {
  const path = usePath();
  const me = useMe();

  if (me.isPending) return <Shell>Loading…</Shell>;
  if (me.error) {
    return (
      <Shell>
        <div role="alert" className="mx-auto mt-16 max-w-lg rounded-xl border border-slate-300 bg-white p-6">
          <p>{describeError(me.error)}</p>
          {me.error instanceof SessionEnded && (
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Reload
            </Button>
          )}
        </div>
      </Shell>
    );
  }

  const user = me.data;
  const allowed = NAV.filter((n) => n.roles.includes(user.role));
  const posterMatch = /^\/poster\/(\d+)$/.exec(path);
  if (posterMatch) return <PosterPage id={Number(posterMatch[1])} />;

  let page: ReactNode;
  const can = (to: string) => allowed.some((n) => n.to === to);
  if (path === "/" && can("/")) page = <Dashboard me={user} />;
  else if (path === "/report" && can("/report")) page = <ReportPage me={user} />;
  else if (path === "/responses" && can("/responses")) page = <ResponsesPage me={user} />;
  else if (path === "/paper" && can("/paper")) page = <PaperEntry />;
  else if (path === "/imports" && can("/imports")) page = <ImportsPage />;
  else if (path === "/setup" && can("/setup")) page = <SetupPage />;
  else if (path === "/admin" && can("/admin")) page = <AdminPage me={user} />;
  else if (path === "/audit" && can("/audit")) page = <AuditPage />;
  else page = <p>That page does not exist, or your role cannot open it.</p>;

  return (
    <div className="min-h-screen lg:flex">
      <nav className="no-print border-b border-(--hairline) bg-white p-4 lg:min-h-screen lg:w-60 lg:border-b-0 lg:border-r">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">MGB Region I</p>
        <p className="font-bold">Client Feedback</p>
        <ul className="mt-4 flex flex-wrap gap-1 lg:flex-col">
          {allowed.map((n) => (
            <li key={n.to}>
              <Link
                to={n.to}
                className={`block rounded-lg px-3 py-2 text-sm ${
                  path === n.to ? "bg-emerald-50 font-semibold text-emerald-900" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-(--ink-2)">
          {user.displayName}
          <br />
          {user.email} · {user.role.replace("_", " ")}
        </p>
      </nav>
      <main className="flex-1 p-4 lg:p-8">{page}</main>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="p-8">{children}</div>;
}
