# SRA Explorer NG

Production URL: <https://sra.ai2paper.com>

A modern SRA search and download workspace rebuilt with TanStack Start and deployed on Vercel. Modified and maintained by Junhao Chen.

Like the original SRA Explorer, the web page queries NCBI E-utilities and ENA directly from the visitor's browser, so each visitor uses their own NCBI quota. The only thing the page asks this site's server for is **Original submitted files**, because NCBI's Run Browser does not allow cross-origin browser requests. The same NCBI/ENA code (`src/features/sra-explorer/core/`) also powers the server-side public API and MCP endpoint.

It searches NCBI SRA in explicit batches of 500, keeps accumulated results in a virtualized table, and discovers NCBI **Original submitted files**, ENA FASTQ, and normalized `.sra` files. Instrument-native FAST5/POD5 or PacBio files appear when the submitter deposited them.

Searches are shareable (`/?q=PRJNA517295`). Loaded runs can be filtered by organism, library strategy, layout, and instrument, sorted by any column, and range-selected with Shift-click. The collection workspace lists saved runs (removable, with undo), caches file lookups in the browser, flags runs whose NCBI/ENA lookup failed instead of reporting them as having no files, and generates portable Linux/macOS download scripts (curl, axel, Aspera, fastq-dl, Kingfisher) with MD5 checks.

FASTQ/SRA files come from ENA and load quickly; Original submitted files need NCBI's slower Run Browser and are only looked up when the Original files tab is opened. A collection can also be filled by pasting a list of accessions (runs, projects, BioSamples, GEO), and exported as an nf-core samplesheet or nf-core/fetchngs `ids.csv`.

## Server configuration

| Variable | Purpose |
| --- | --- |
| `NCBI_API_KEY` | Raises the NCBI E-utilities limit from 3 to 10 requests per second. |
| `SRA_API_TOKENS` | Comma-separated bearer tokens exempt from the anonymous rate limit. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) | Shares the anonymous rate limit across serverless instances through Upstash Redis. Without them each instance counts separately. |

## Development

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm test:e2e   # Playwright; API calls are mocked, no NCBI/ENA access needed
pnpm build
pnpm cf:build
```

## Public read-only API

```bash
curl 'http://localhost:3000/api/v1/search?q=SRP043510'
curl 'http://localhost:3000/api/v1/search?cursor=NEXT_CURSOR'
curl 'http://localhost:3000/api/v1/runs/SRR12881185/files'
```

Responses contain a `nextCursor`; callers explicitly request every additional batch. OpenAPI is served at `/api/v1/openapi.json`.

Anonymous requests are limited to 30 requests per minute per IP, shared across instances when Upstash Redis is configured and per instance otherwise. Optional bearer tokens are configured with the comma-separated `SRA_API_TOKENS` secret. The first release deliberately avoids a user database and token-management UI.

## Remote MCP

The Streamable HTTP endpoint is `/mcp`. It exposes `search_sra`, `load_more_results`, `lookup_accessions`, `get_run_files`, and `create_download_manifest`. The site does not host an LLM or pay model inference costs; external agents call this read-only service.

```json
{ "mcpServers": { "sra-explorer": { "url": "https://sra.ai2paper.com/mcp" } } }
```

Opening <https://sra.ai2paper.com/mcp> in a browser redirects to the MCP usage guide; agents send JSON-RPC POST requests to that same URL.

## Vercel

```bash
pnpm vercel:build
vercel deploy --prebuilt --prod
```

`vercel.json` builds the Nitro Vercel output. No NCBI or ENA credentials are required.

## Optional Cloudflare Workers build

```bash
pnpm cf:build
pnpm wrangler secret put SRA_API_TOKENS
pnpm cf:deploy
```

`wrangler.jsonc` remains available for self-hosters who prefer Cloudflare Workers; the official deployment uses Vercel.

## Download tools

The workspace links to [Kingfisher](https://github.com/wwood/kingfisher-download), [iSeq](https://github.com/BioOmics/iSeq), [fastq-dl](https://github.com/rpetit3/fastq-dl), [NCBI SRA Toolkit](https://github.com/ncbi/sra-tools), and [enaBrowserTools](https://github.com/enasequence/enaBrowserTools).

## License

The original SRA-Explorer was written by Phil Ewels. This derivative is free software under the repository's **GNU GPL v2** license. GPL v2 permits modification and open-source redistribution when its requirements and notices are preserved. It must not be relabeled GPLv3-only without confirming all copyright holders' licensing permissions.
