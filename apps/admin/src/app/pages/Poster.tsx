import QRCode from "qrcode";
import { useMemo } from "react";
import { useMeta } from "../hooks";
import { Link } from "../router";
import { Button, ErrorBox, Notice } from "../ui";

/** The QR as SVG squares drawn from the encoder's module grid (quiet zone of 4 modules). */
function QrSvg({ text }: { text: string }) {
  const { size, path } = useMemo(() => {
    const qr = QRCode.create(text, { errorCorrectionLevel: "Q" });
    const n = qr.modules.size;
    let d = "";
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) if (qr.modules.get(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
    return { size: n + 8, path: d };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-[12cm] max-w-full" role="img" aria-label={`QR code for ${text}`} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

export function PosterPage({ id }: { id: number }) {
  const meta = useMeta();
  if (meta.isPending) return <p className="p-8">Loading…</p>;
  if (meta.error) return <ErrorBox error={meta.error} />;
  const point = meta.data.servicePoints.find((p) => p.id === id);
  const base = (meta.data.settings.public_base_url ?? "").replace(/\/$/, "");
  if (!point) return <p className="p-8">That QR code does not exist.</p>;
  const url = `${base}/q/${point.code}`;
  const shown = url.replace(/^https:\/\//, "");
  const temporary = /\.workers\.dev$/i.test(new URL(base || "https://x.invalid").hostname);

  return (
    <div className="min-h-screen bg-white">
      <div className="no-print flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
        <Link to="/setup" className="text-sm underline">
          Back
        </Link>
        <Button onClick={() => window.print()} disabled={!base || Boolean(point.retired_at)}>
          Print poster
        </Button>
        <div className="w-full">
          {!base && <Notice tone="warning">Set the public survey address in Staff &amp; settings first.</Notice>}
          {temporary && (
            <Notice tone="warning">
              This is a workers.dev address: use it for the pilot only, on temporary signage. Print permanent posters once the
              office’s own web address is set.
            </Notice>
          )}
          {point.retired_at && <Notice tone="warning">This QR code is retired and no longer opens the survey.</Notice>}
        </div>
      </div>

      {base && (
        <article className="mx-auto flex max-w-[19cm] flex-col items-center px-6 py-10 text-center text-black">
          <p className="text-lg font-semibold uppercase tracking-wide">Mines and Geosciences Bureau Regional Office No. I</p>
          <h1 className="mt-6 text-5xl font-extrabold leading-tight">HELP US SERVE YOU BETTER!</h1>
          <p className="mt-4 text-2xl">Scan to rate the service you received today.</p>
          <div className="mt-8">
            <QrSvg text={url} />
          </div>
          <p className="mt-4 font-mono text-2xl font-bold">{shown}</p>
          <p className="mt-6 text-xl font-semibold">{point.label}</p>
          <p className="mt-6 text-xl">Anonymous · No account needed · About 3 minutes</p>
          <p className="mt-2 text-lg">No phone? Ask the Public Assistance and Complaints Desk for a paper form.</p>
          <p className="mt-8 text-sm text-slate-700">
            Before answering, check that your phone opened the address printed above. If this sticker looks tampered with,
            please tell the desk.
          </p>
        </article>
      )}
    </div>
  );
}
