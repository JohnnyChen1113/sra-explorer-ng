import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/v1/openapi.json')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        return Response.json({
          openapi: '3.1.0',
          info: { title: 'SRA Explorer API', version: '1.0.0', description: 'Read-only access to NCBI SRA search and downloadable representations.' },
          servers: [{ url: origin }],
          paths: {
            '/api/v1/search': { get: { summary: 'Search SRA in manual batches of 500', parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'cursor', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'A search batch' } } } },
            '/api/v1/runs/{accession}/files': { get: { summary: 'List Original, FASTQ, and normalized SRA files', parameters: [{ name: 'accession', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Run files' } } } },
            '/api/v1/original-files/batch': { post: { summary: 'Look up Original submitted files for up to 40 runs', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { accessions: { type: 'array', minItems: 1, maxItems: 40, items: { type: 'string' } } }, required: ['accessions'] } } } }, responses: { '200': { description: 'Original files grouped by run' } } } },
            '/api/v1/files/batch': { post: { summary: 'List FASTQ, SRA, and Original files for up to 20 runs', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { accessions: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' } } }, required: ['accessions'] } } } }, responses: { '200': { description: 'All file representations grouped by run' } } } },
          },
        });
      },
    },
  },
});
