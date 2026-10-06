type Bucket = { count: number; resetAt: number };

const anonymousBuckets = new Map<string, Bucket>();
const ANONYMOUS_LIMIT = 30;
const WINDOW_MS = 60_000;

function configuredTokens() {
  return (process.env.SRA_API_TOKENS || '').split(',').map((value) => value.trim()).filter(Boolean);
}

export function enforceAccess(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (token && configuredTokens().includes(token)) return { authenticated: true, remaining: null };

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  const now = Date.now();
  const bucket = anonymousBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    anonymousBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { authenticated: false, remaining: ANONYMOUS_LIMIT - 1 };
  }
  bucket.count += 1;
  if (bucket.count > ANONYMOUS_LIMIT) {
    throw new Response('Anonymous rate limit exceeded. Try again in one minute or use an API token.', {
      status: 429,
      headers: { 'retry-after': String(Math.ceil((bucket.resetAt - now) / 1000)) },
    });
  }
  return { authenticated: false, remaining: ANONYMOUS_LIMIT - bucket.count };
}

export function withAccessHeaders(response: Response, access: ReturnType<typeof enforceAccess>) {
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
