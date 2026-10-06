import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const origin = envConfigs.app_url.replace(/\/$/, '');
        return new Response(`User-agent: *\nAllow: /\nAllow: /api/v1/openapi.json\nDisallow: /api/\nDisallow: /mcp\n\nSitemap: ${origin}/sitemap.xml\n`, {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
          },
        });
      },
    },
  },
});
