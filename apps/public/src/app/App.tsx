import { isServicePointCode } from "@feedback/shared";
import { Privacy } from "./Privacy";
import { Page, Survey } from "./survey/Survey";

/** Three routes, no router library: /q/<code> (the QR target), /privacy, and a landing page. */
export function App() {
  const path = window.location.pathname;
  const match = /^\/q\/([^/]+)\/?$/.exec(path);
  if (match) {
    const code = decodeURIComponent(match[1] ?? "").toUpperCase();
    return isServicePointCode(code) ? <Survey code={code} /> : <NotFound />;
  }
  if (path === "/privacy" || path === "/privacy/") return <Privacy />;
  if (path === "/" || path === "") return <Home />;
  return <NotFound />;
}

function Home() {
  return (
    <Page>
      <h1 className="mt-10 text-2xl font-bold text-slate-900">Client Satisfaction Survey</h1>
      <p className="mt-4 text-slate-800">
        To rate a service you received from the Mines and Geosciences Bureau Regional Office No. I, scan the QR code at
        the counter or desk where you were served. Each code opens the survey for that office.
      </p>
      <p className="mt-4 text-slate-800">
        No QR code? Ask the Public Assistance and Complaints Desk for a paper form.
      </p>
      <p className="mt-6">
        <a className="font-medium text-emerald-800 underline" href="/privacy">
          Privacy notice
        </a>
      </p>
    </Page>
  );
}

function NotFound() {
  return (
    <Page>
      <h1 className="mt-10 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-4 text-slate-800">
        Please scan the QR code again, or ask the Public Assistance and Complaints Desk for a paper form.
      </p>
    </Page>
  );
}
