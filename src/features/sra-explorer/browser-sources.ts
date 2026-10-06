// The web page talks to NCBI and ENA straight from the browser, like the original SRA
// Explorer: every visitor uses their own NCBI quota and the site needs no server for it.
// Only Original submitted files go through our server, because NCBI's Run Browser sends
// no CORS headers.

import { createLimiter, limitedFetch } from './core/limiter.ts';
import { createSources } from './core/sources.ts';

const limiters = {
  // NCBI allows 3 requests per second per IP without an API key.
  eutils: createLimiter(3, 2),
  ena: createLimiter(10, 6),
};

export const browserSources = createSources((service, url, init, label) => limitedFetch(limiters[service], url, init, label, { timeoutMs: 30_000 }));
