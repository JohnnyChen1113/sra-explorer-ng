import { createFileRoute } from '@tanstack/react-router';

import { enforceAccess, optionsResponse, withAccessHeaders } from '@/features/sra-explorer/server/access';
import { mapWithConcurrency } from '@/features/sra-explorer/server/upstream';
import { getOriginalFiles } from '@/features/sra-explorer/server/files';

const MAX_BATCH = 40;

export const Route = createFileRoute('/api/v1/original-files/batch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const access = enforceAccess(request);
          const body = await request.json() as { accessions?: unknown };
          if (!Array.isArray(body.accessions) || !body.accessions.length || body.accessions.length > MAX_BATCH) {
            return withAccessHeaders(Response.json({ error: `Provide 1-${MAX_BATCH} run accessions.` }, { status: 400 }), access);
          }
          const accessions = [...new Set(body.accessions.map(String))];
          const results = await mapWithConcurrency(accessions, 16, async (accession) => {
            try { return await getOriginalFiles(accession); }
            catch (error) { return { accession, files: [], error: error instanceof Error ? error.message : 'Lookup failed.' }; }
          });
          return withAccessHeaders(Response.json({ results }), access);
        } catch (error) {
          return error instanceof Response ? error : Response.json({ error: 'Batch lookup failed.' }, { status: 500 });
        }
      },
      OPTIONS: async () => optionsResponse(),
    },
  },
});
