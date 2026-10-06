import { createFileRoute } from '@tanstack/react-router';

import { siteConfig } from '@/config/site';

export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          site: {
            name: siteConfig.name,
            url: siteConfig.url,
            description: siteConfig.description,
            email: siteConfig.email,
          },
        }),
    },
  },
});
