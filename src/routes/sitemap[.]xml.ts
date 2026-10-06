import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
const paths = ['/', '/docs', '/terms', '/privacy'];

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const origin = envConfigs.app_url.replace(/\/$/, '');
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${paths
  .map((path) => {
    const loc = `${origin}${path === '/' ? '/' : path}`;
    return `  <url>
    <loc>${loc}</loc>
  </url>`;
  })
  .join('\n')}
</urlset>`;
        return new Response(body, {
          headers: {
            'content-type': 'application/xml; charset=utf-8',
          },
        });
      },
    },
  },
});
