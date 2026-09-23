import { Page } from "./survey/Survey";

// DRAFT. The Data Protection Officer finalizes this notice as part of the Privacy Impact
// Assessment (NPC Circular 2023-06) before go-live. Keep the banner until then.
export function Privacy() {
  return (
    <Page>
      <p role="note" className="mt-6 rounded-lg border-2 border-amber-600 bg-amber-50 p-3 text-sm font-medium text-amber-950">
        Draft privacy notice, pending review by the office’s Data Protection Officer.
      </p>
      <h1 className="mt-6 text-2xl font-bold text-slate-900">Privacy notice</h1>
      <div className="mt-4 space-y-4 text-slate-800">
        <p>
          The Mines and Geosciences Bureau Regional Office No. I collects the answers you give in this survey to measure
          client satisfaction, as required by the Anti-Red Tape Authority, and to improve its services.
        </p>
        <h2 className="text-lg font-semibold text-slate-900">What we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your answers to the survey questions and any suggestion you write.</li>
          <li>Client type, date of transaction, and the service you availed.</li>
          <li>Only if you give them: sex, age, region of residence, and email address.</li>
        </ul>
        <h2 className="text-lg font-semibold text-slate-900">What we do not collect</h2>
        <p>
          We do not ask for your name. We do not store your IP address. A security check (Cloudflare Turnstile) runs when
          you submit, to keep automated submissions out.
        </p>
        <h2 className="text-lg font-semibold text-slate-900">Who sees it</h2>
        <p>
          Authorized staff of the office’s Committee on Anti-Red Tape. Divisions see summary results for their own services.
          Results reported to the Anti-Red Tape Authority are totals, never individual answers.
        </p>
        <h2 className="text-lg font-semibold text-slate-900">How long we keep it</h2>
        <p>
          An email address is kept apart from your answers and deleted after the retention period shown on the form. Survey
          answers are kept as official records for the period set by the office’s records disposition schedule.
        </p>
        <h2 className="text-lg font-semibold text-slate-900">Your rights</h2>
        <p>
          Under the Data Privacy Act of 2012 you may ask to access, correct or delete your personal information. Contact the
          office’s Data Protection Officer at the Public Assistance and Complaints Desk.
        </p>
      </div>
    </Page>
  );
}
