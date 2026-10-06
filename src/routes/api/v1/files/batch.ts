import { createFileRoute } from '@tanstack/react-router';

import { enforceAccess, optionsResponse, withAccessHeaders } from '@/features/sra-explorer/server/access';
import { mapWithConcurrency } from '@/features/sra-explorer/server/upstream';
import { getRunFiles, type FileSource } from '@/features/sra-explorer/server/files';

const MAX_BATCH = 50;

export const Route = createFileRoute('/api/v1/files/batch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const access = await enforceAccess(request);
          const body = await request.json() as { accessions?: unknown; include?: unknown };
          const include = (Array.isArray(body.include) ? body.include : ['ena', 'original']).filter((item): item is FileSource => item === 'ena' || item === 'original');
          if (!include.length) return withAccessHeaders(Response.json({ error: 'include must list "ena" and/or "original".' }, { status: 400 }), access);
          if (!Array.isArray(body.accessions) || !body.accessions.length || body.accessions.length > MAX_BATCH) {
            return withAccessHeaders(Response.json({ error: `Provide 1-${MAX_BATCH} run accessions.` }, { status: 400 }), access);
          }
          const accessions = [...new Set(body.accessions.map(String))];
          const results = await mapWithConcurrency(accessions, 16, async (accession) => {
            try { return await getRunFiles(accession, include); }
            catch (error) { return { accession, files: [], sources: [], error: error instanceof Error ? error.message : 'Lookup failed.' }; }
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
