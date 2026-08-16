import { createFileRoute, notFound } from "@tanstack/react-router";
import { pdf } from "@react-pdf/renderer";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { ProposalPdfDocument } from "@/components/proposal-pdf";
import { buttonClass } from "@/components/admin-ui";
import { getPublicProposal } from "@/lib/proposals.functions";

export const Route = createFileRoute("/proposal/$token/pdf")({
  ssr: false,
  loader: async ({ params }) => {
    const result = await getPublicProposal({ data: { token: params.token } });
    if (!result) throw notFound();
    return result;
  },
  component: ProposalPdfDownloadPage,
});

function ProposalPdfDownloadPage() {
  const data = Route.useLoaderData();
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void pdf(<ProposalPdfDocument data={data} />)
      .toBlob()
      .then((blob) => {
        if (!active) return;
        const next = URL.createObjectURL(blob);
        setUrl(next);
      })
      .catch(() => setError(true));
    return () => {
      active = false;
    };
  }, [data]);
  const filename = `${data.recipientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-proposal-v${data.versionNumber}.pdf`;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#061b13] px-5 text-[#f4f7e9]">
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#dfff1f]">GO TEAM GO</p>
        <h1 className="mt-4 font-display text-4xl font-semibold">
          {error ? "Could not generate the PDF" : url ? "PDF ready" : "Preparing your proposal"}
        </h1>
        <p className="mt-3 text-sm text-white/55">
          Version {data.versionNumber} · {data.recipientName}
        </p>
        {url && (
          <a href={url} download={filename} className={buttonClass + " mt-8"}>
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </a>
        )}
      </div>
    </main>
  );
}
