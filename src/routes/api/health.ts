import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          service: 'shipany-tanstack-slim',
          timestamp: new Date().toISOString(),
        }),
    },
  },
});
