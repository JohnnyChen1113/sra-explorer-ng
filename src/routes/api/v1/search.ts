import { createFileRoute } from '@tanstack/react-router';

import { enforceAccess, optionsResponse, withAccessHeaders } from '@/features/sra-explorer/server/access';
import { searchSra } from '@/features/sra-explorer/server/ncbi';

export const Route = createFileRoute('/api/v1/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const access = await enforceAccess(request);
          const url = new URL(request.url);
          const result = await searchSra(url.searchParams.get('q') || '', url.searchParams.get('cursor'));
          return withAccessHeaders(Response.json(result, { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } }), access);
        } catch (error) {
          return error instanceof Response ? error : Response.json({ error: 'Search failed.' }, { status: 500 });
        }
      },
      OPTIONS: async () => optionsResponse(),
    },
  },
});
