export { BATCH_SIZE } from '../core/sources.ts';

export { decodeXml, parseAttributes } from '../core/xml.ts';

export function assertRunAccession(accession: string) {
  const normalized = accession.trim().toUpperCase();
  if (!/^[SED]RR\d{6,12}$/.test(normalized)) {
    throw new Response('A valid SRR, ERR, or DRR accession is required.', { status: 400 });
  }
  return normalized;
}

export function apiHeaders(cache = false) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    'cache-control': cache ? 'public, max-age=300, s-maxage=3600' : 'no-store',
    'x-content-type-options': 'nosniff',
  };
}
