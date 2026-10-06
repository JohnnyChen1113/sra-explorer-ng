import { createFileRoute } from '@tanstack/react-router';

import { enforceAccess, optionsResponse, withAccessHeaders } from '@/features/sra-explorer/server/access';
import { getRunFiles } from '@/features/sra-explorer/server/files';
import { extractAccessions, lookupAccessions, searchSra } from '@/features/sra-explorer/server/ncbi';
import { shellQuote } from '@/features/sra-explorer/format';

const protocolVersion = '2025-06-18';

function rpc(id: unknown, result: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result });
}

function rpcError(id: unknown, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

const tools = [
  { name: 'search_sra', description: 'Search NCBI SRA and return the first batch of up to 500 records.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'load_more_results', description: 'Load the next batch from a search_sra cursor.', inputSchema: { type: 'object', properties: { cursor: { type: 'string' } }, required: ['cursor'] } },
  { name: 'lookup_accessions', description: 'Resolve a list (or free text) of SRR/ERR/DRR, SRX, SRP, PRJNA/PRJEB, SAMN, GSE or GSM accessions to their SRA runs with metadata. Up to 500 accessions; reports accessions that were not found.', inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'Accessions separated by any whitespace or punctuation.' } }, required: ['text'] } },
  { name: 'get_run_files', description: 'List Original submitted, FASTQ, and normalized SRA files for a run.', inputSchema: { type: 'object', properties: { accession: { type: 'string' } }, required: ['accession'] } },
  { name: 'create_download_manifest', description: 'Create direct URLs and shell commands for all representations of one run.', inputSchema: { type: 'object', properties: { accession: { type: 'string' } }, required: ['accession'] } },
];

async function callTool(name: string, args: Record<string, string>) {
  if (name === 'search_sra') return searchSra(args.query || '');
  if (name === 'load_more_results') return searchSra('', args.cursor);
  if (name === 'lookup_accessions') return lookupAccessions(extractAccessions(args.text || ''));
  if (name === 'get_run_files') return getRunFiles(args.accession || '');
  if (name === 'create_download_manifest') {
    const result = await getRunFiles(args.accession || '');
    return { ...result, commands: result.files.map((file) => `curl -L --fail --retry 5 ${shellQuote(file.url)} -o ${shellQuote(file.filename)}`) };
  }
  throw new Error(`Unknown tool: ${name}`);
}

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: async ({ request }) => Response.redirect(new URL('/docs#mcp', request.url), 302),
      POST: async ({ request }) => {
        try {
          const access = await enforceAccess(request);
          const message = (await request.json()) as any;
          let response: Response;
          if (message.method === 'initialize') {
            response = rpc(message.id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'sra-explorer-ng', version: '1.0.0' } });
          } else if (message.method === 'notifications/initialized') {
            response = new Response(null, { status: 204 });
          } else if (message.method === 'ping') {
            response = rpc(message.id, {});
          } else if (message.method === 'tools/list') {
            response = rpc(message.id, { tools });
          } else if (message.method === 'tools/call') {
            try {
              const output = await callTool(message.params?.name, message.params?.arguments || {});
              response = rpc(message.id, { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output, isError: false });
            } catch (error) {
              response = rpc(message.id, { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool call failed.' }], isError: true });
            }
          } else {
            response = rpcError(message.id, -32601, 'Method not found');
          }
          return withAccessHeaders(response, access);
        } catch (error) {
          return error instanceof Response ? error : rpcError(null, -32603, 'Internal error');
        }
      },
      OPTIONS: async () => optionsResponse(),
    },
  },
});
