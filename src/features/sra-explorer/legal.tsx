import type { ReactNode } from 'react';

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return <main className="min-h-screen bg-[#f4f8f9] px-6 py-12 text-[#10263a]"><article className="mx-auto max-w-3xl space-y-6 leading-7">
    <header><a href="/" className="text-sm font-bold text-[#087f8c]">← SRA Explorer NG</a><h1 className="mt-5 text-4xl font-black tracking-tight">{title}</h1></header>
    {children}
  </article></main>;
}

export function PrivacyPage() {
  return <LegalShell title="Privacy">
    <p>SRA Explorer NG has no user accounts and no database. Your saved collection and cached file lookups are stored only in your browser's local storage; clearing site data removes them.</p>
    <p>Search terms and run accessions you submit are forwarded to public NCBI (E-utilities, SRA Run Browser) and EMBL-EBI ENA services to retrieve results. Those services apply their own privacy policies.</p>
    <p>The hosting provider may keep standard request logs (such as IP address and URL) for security and operations. IP addresses are also used transiently in memory for API rate limiting.</p>
  </LegalShell>;
}

export function TermsPage() {
  return <LegalShell title="Terms">
    <p>SRA Explorer NG is free software released under the GNU General Public License v2, derived from SRA-Explorer by Phil Ewels. It is provided as is, without warranty of any kind.</p>
    <p>Metadata and files come from NCBI SRA and EMBL-EBI ENA. Their availability, accuracy, and terms of use are governed by those archives and by the original data submitters. Verify checksums and data use conditions before relying on downloaded data.</p>
    <p>The public API and MCP endpoint are rate limited. Please avoid automated bulk traffic beyond the documented limits; contact the maintainer for an API token if you need more.</p>
  </LegalShell>;
}
