import { createFileRoute } from '@tanstack/react-router';
import { envConfigs } from '@/config';

const code = 'overflow-x-auto rounded-xl bg-[#0b2235] p-4 font-mono text-sm text-cyan-50';

function DocsPage() {
  const baseUrl = envConfigs.app_url.replace(/\/$/, '');
  return <main className="min-h-screen bg-[#f4f8f9] px-6 py-12 text-[#10263a]"><article className="mx-auto max-w-4xl space-y-10">
    <header><a href="/" className="text-sm font-bold text-[#087f8c]">← SRA Explorer</a><h1 className="mt-5 text-4xl font-black tracking-tight">API & MCP</h1><p className="mt-3 max-w-2xl text-lg text-slate-600">A public, read-only interface to NCBI SRA and ENA. The website, the JSON API, and the MCP server share the same data adapters.</p></header>
    <section className="space-y-4"><h2 className="text-2xl font-black">Paginated search</h2><p>Each request processes up to 500 NCBI SRA records. One record (experiment) can contain several runs, so a batch may return slightly more than 500 runs. Pass the query on the first request and only the returned <code>nextCursor</code> afterwards; nothing is fetched in the background. Each run includes title, organism, library strategy/source/layout, instrument, bases, spots, and its experiment, study, BioProject, and BioSample accessions.</p><pre className={code}>{`curl '${baseUrl}/api/v1/search?q=SRP043510'`}</pre><pre className={code}>{`curl '${baseUrl}/api/v1/search?cursor=NEXT_CURSOR'`}</pre></section>
    <section className="space-y-4"><h2 className="text-2xl font-black">Run files</h2><p>Returns NCBI Original submitted files, ENA FASTQ, and normalized SRA for a run. Original files exist only when the submitter uploaded them. If NCBI or ENA does not answer, the response lists the failed lookup in <code>errors</code>; an empty file list is only conclusive when <code>errors</code> is empty. The batch endpoint accepts up to 50 runs. The collection workspace builds URL lists, Bash scripts with portable MD5 checks, and TSV manifests; files only available on S3 use the AWS CLI.</p><pre className={code}>{`curl '${baseUrl}/api/v1/runs/SRR12881185/files'`}</pre><pre className={code}>{`curl '${baseUrl}/api/v1/original-files/batch' \\
  -H 'content-type: application/json' \\
  -d '{"accessions":["SRR12881185","SRR14488774"]}'`}</pre><p>Resolve a pasted list of accessions (runs, experiments, studies, BioProjects, BioSamples, GEO series/samples; up to 500) to runs in one call. Unmatched accessions are reported back.</p><pre className={code}>{`curl '${baseUrl}/api/v1/runs/lookup' \\
  -H 'content-type: application/json' \\
  -d '{"text":"PRJNA517295 SRR12881185 GSM1234567"}'`}</pre><p>File batches accept <code>{'"include": ["ena"]'}</code> or <code>{'["original"]'}</code> to run only the fast ENA (FASTQ + SRA) lookup or only the slower NCBI Original-file lookup.</p><p>The OpenAPI description lives at <a className="font-bold text-[#087f8c]" href="/api/v1/openapi.json">/api/v1/openapi.json</a>.</p></section>
    <section id="mcp" className="scroll-mt-8 space-y-4"><h2 className="text-2xl font-black">Remote MCP</h2><p>Point a Streamable HTTP MCP client at <code>{baseUrl}/mcp</code>. Opening that URL in a browser redirects here; agents send JSON-RPC POST requests to the same URL. The server runs no model and stores no conversations; it only exposes read-only tools.</p><p>Tools: <code>search_sra</code>, <code>load_more_results</code>, <code>lookup_accessions</code>, <code>get_run_files</code>, and <code>create_download_manifest</code>.</p><pre className={code}>{`{
  "mcpServers": {
    "sra-explorer": { "url": "${baseUrl}/mcp" }
  }
}`}</pre></section>
    <section className="space-y-4"><h2 className="text-2xl font-black">Access policy</h2><p>Anonymous clients get 30 requests per minute per IP (best effort, per server instance); a 429 response carries <code>retry-after</code>. Deployers can set <code>SRA_API_TOKENS</code> (comma-separated) and clients send <code>Authorization: Bearer TOKEN</code> for unthrottled access. Setting <code>NCBI_API_KEY</code> on the server raises the NCBI E-utilities limit from 3 to 10 requests per second.</p></section>
  </article></main>;
}

export const Route = createFileRoute('/docs')({
  head: () => ({ meta: [{ title: 'SRA Explorer NG API & MCP Documentation' }, { name: 'description', content: 'Use the SRA Explorer NG read-only JSON API and remote MCP server to search NCBI SRA and retrieve FASTQ, SRA, and Original submitted files.' }], links: [{ rel: 'canonical', href: `${envConfigs.app_url.replace(/\/$/, '')}/docs` }] }),
  component: DocsPage,
});
