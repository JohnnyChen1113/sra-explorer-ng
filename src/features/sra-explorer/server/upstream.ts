// Per-instance throttling for server-side NCBI/ENA calls. E-utilities allow 3 req/s
// anonymously and 10 req/s with NCBI_API_KEY; exceeding that returns 429.

import { createLimiter, limitedFetch } from '../core/limiter.ts';

export { mapWithConcurrency, UpstreamError } from '../core/limiter.ts';

export function ncbiApiKey() {
  return (process.env.NCBI_API_KEY || '').trim();
}

const limiters = {
  eutils: createLimiter(ncbiApiKey() ? 9 : 3, 4),
  trace: createLimiter(10, 16),
  ena: createLimiter(15, 12),
};

export function upstreamFetch(service: keyof typeof limiters, url: URL | string, init: RequestInit = {}, label: string = service) {
  return limitedFetch(limiters[service], url, init, label, { timeoutMs: 12_000 });
}
