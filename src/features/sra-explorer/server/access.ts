type Bucket = { count: number; resetAt: number };

const anonymousBuckets = new Map<string, Bucket>();
const ANONYMOUS_LIMIT = 30;
const WINDOW_MS = 60_000;

function configuredTokens() {
  return (process.env.SRA_API_TOKENS || '').split(',').map((value) => value.trim()).filter(Boolean);
}

type Access = { authenticated: boolean; remaining: number | null };

function clientIp(request: Request) {
  return request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
}

function rateLimited(resetAt: number, now: number): never {
  throw new Response('Anonymous rate limit exceeded. Try again in one minute or use an API token.', {
    status: 429,
    headers: { 'retry-after': String(Math.max(1, Math.ceil((resetAt - now) / 1000))) },
  });
}

function memoryCount(ip: string, now: number) {
  const bucket = anonymousBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + WINDOW_MS };
    anonymousBuckets.set(ip, fresh);
    return fresh;
  }
  bucket.count += 1;
  return bucket;
}

// Shared counter across serverless instances via Upstash Redis REST (Vercel's KV/Upstash
// integration sets these variables). Without it, each instance counts on its own.
function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function redisCount(ip: string, now: number) {
  const config = redisConfig();
  if (!config) return null;
  const window = Math.floor(now / WINDOW_MS);
  const key = `sra-explorer:rl:${ip}:${window}`;
  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(WINDOW_MS / 1000 + 5)]]),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const [incr] = await response.json() as Array<{ result?: number }>;
    return typeof incr?.result === 'number' ? { count: incr.result, resetAt: (window + 1) * WINDOW_MS } : null;
  } catch {
    return null;
  }
}

export async function enforceAccess(request: Request): Promise<Access> {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (token && configuredTokens().includes(token)) return { authenticated: true, remaining: null };

  const ip = clientIp(request);
  const now = Date.now();
  // Fall back to the per-instance counter if Redis is unconfigured or unreachable.
  const bucket = (await redisCount(ip, now)) ?? memoryCount(ip, now);
  if (bucket.count > ANONYMOUS_LIMIT) rateLimited(bucket.resetAt, now);
  return { authenticated: false, remaining: ANONYMOUS_LIMIT - bucket.count };
}

export function withAccessHeaders(response: Response, access: Access) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-headers', 'authorization, content-type');
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  headers.set('x-rate-limit-policy', access.authenticated ? 'token' : 'anonymous;w=60;q=30');
  if (access.remaining !== null) headers.set('x-rate-limit-remaining', String(access.remaining));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-max-age': '86400',
    },
  });
}
