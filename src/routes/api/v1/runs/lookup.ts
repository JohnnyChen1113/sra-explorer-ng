import { createFileRoute } from '@tanstack/react-router';

import { enforceAccess, optionsResponse, withAccessHeaders } from '@/features/sra-explorer/server/access';
import { extractAccessions, lookupAccessions } from '@/features/sra-explorer/server/ncbi';

export const Route = createFileRoute('/api/v1/runs/lookup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const access = await enforceAccess(request);
          const body = await request.json() as { accessions?: unknown; text?: unknown };
          const accessions = Array.isArray(body.accessions) ? extractAccessions(body.accessions.map(String).join('\n')) : typeof body.text === 'string' ? extractAccessions(body.text) : [];
          if (!accessions.length) return withAccessHeaders(Response.json({ error: 'No SRA, ENA, DDBJ, BioProject, BioSample, or GEO accessions found.' }, { status: 400 }), access);
          return withAccessHeaders(Response.json({ accessions, ...(await lookupAccessions(accessions)) }), access);
        } catch (error) {
          return error instanceof Response ? error : Response.json({ error: 'Accession lookup failed.' }, { status: 500 });
        }
      },
      OPTIONS: async () => optionsResponse(),
    },
  },
});
