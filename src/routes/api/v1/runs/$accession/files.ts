import { createFileRoute } from '@tanstack/react-router';

import { enforceAccess, optionsResponse, withAccessHeaders } from '@/features/sra-explorer/server/access';
import { getRunFiles } from '@/features/sra-explorer/server/files';

export const Route = createFileRoute('/api/v1/runs/$accession/files')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const access = enforceAccess(request);
          const result = await getRunFiles(params.accession);
          return withAccessHeaders(Response.json(result, { headers: { 'cache-control': 'public, max-age=300, s-maxage=86400' } }), access);
        } catch (error) {
          return error instanceof Response ? error : Response.json({ error: 'File lookup failed.' }, { status: 500 });
        }
      },
      OPTIONS: async () => optionsResponse(),
    },
  },
});
