// Per-instance throttling and retries for NCBI/ENA. E-utilities allow 3 req/s
// anonymously and 10 req/s with NCBI_API_KEY; exceeding that returns 429.

type Limiter = { interval: number; maxConcurrent: number; active: number; nextSlot: number; queue: Array<() => void> };

function createLimiter(perSecond: number, maxConcurrent: number): Limiter {
  return { interval: Math.ceil(1000 / perSecond), maxConcurrent, active: 0, nextSlot: 0, queue: [] };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquire(limiter: Limiter) {
  if (limiter.active >= limiter.maxConcurrent) await new Promise<void>((resolve) => limiter.queue.push(resolve));
  limiter.active += 1;
  const now = Date.now();
  const slot = Math.max(now, limiter.nextSlot);
  limiter.nextSlot = slot + limiter.interval;
  if (slot > now) await sleep(slot - now);
}

function release(limiter: Limiter) {
  limiter.active -= 1;
  limiter.queue.shift()?.();
}

export function ncbiApiKey() {
  return (process.env.NCBI_API_KEY || '').trim();
}

const limiters = {
  eutils: createLimiter(ncbiApiKey() ? 9 : 3, 4),
  trace: createLimiter(10, 16),
  ena: createLimiter(15, 12),
};

export class UpstreamError extends Error {
  service: string;
  status: number | null;
  constructor(service: string, status: number | null, message: string) {
    super(message);
    this.service = service;
    this.status = status;
  }
}

export async function upstreamFetch(service: keyof typeof limiters, url: URL | string, init: RequestInit = {}, label: string = service) {
  const limiter = limiters[service];
  let lastError: UpstreamError | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(400 * 2 ** (attempt - 1) + Math.random() * 200);
    await acquire(limiter);
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) return response;
      lastError = new UpstreamError(label, response.status, `${label} returned HTTP ${response.status}`);
    } catch (cause) {
      lastError = new UpstreamError(label, null, `${label} request failed: ${cause instanceof Error ? cause.message : 'network error'}`);
    } finally {
      release(limiter);
    }
  }
  throw lastError;
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}
