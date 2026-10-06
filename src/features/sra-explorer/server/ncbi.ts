import { Buffer } from 'node:buffer';

import { BATCH_SIZE, createSources, SourceError } from '../core/sources.ts';
import type { SearchCursor, SearchResponse } from '../types';
import { ncbiApiKey, upstreamFetch } from './upstream.ts';

export { extractAccessions, MAX_LOOKUP_ACCESSIONS, MAX_LOOKUP_RUNS, parseSummaryResponse } from '../core/sources.ts';

export const sources = createSources((service, url, init, label) => upstreamFetch(service, url, init, label), { apiKey: ncbiApiKey() });

/** Route handlers answer thrown Responses directly. */
async function asResponse<T>(work: Promise<T>) {
  try {
    return await work;
  } catch (error) {
    if (error instanceof SourceError) throw new Response(error.message, { status: error.status });
    throw error;
  }
}

function encodeCursor(cursor: SearchCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(value: string): SearchCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as SearchCursor;
    if (!parsed.webEnv || !parsed.queryKey || !Number.isFinite(parsed.nextStart)) throw new Error();
    return parsed;
  } catch {
    throw new Response('Invalid search cursor.', { status: 400 });
  }
}

export async function searchSra(query: string, cursorValue?: string | null): Promise<SearchResponse> {
  const cleanQuery = query.trim();
  if (!cleanQuery && !cursorValue) throw new Response('Query is required.', { status: 400 });
  let cursor: SearchCursor;
  if (cursorValue) {
    cursor = decodeCursor(cursorValue);
    if (cleanQuery && cleanQuery !== cursor.query) throw new Response('Cursor does not match query.', { status: 400 });
  } else {
    cursor = await asResponse(sources.startSearch(cleanQuery));
  }
  const page = await asResponse(sources.nextPage(cursor));
  const next = page.cursor && page.cursor.nextStart < page.cursor.total ? page.cursor : null;
  return {
    query: cursor.query,
    total: cursor.total,
    loaded: page.cursor?.nextStart ?? cursor.nextStart,
    batchSize: BATCH_SIZE,
    results: page.results,
    nextCursor: next ? encodeCursor(next) : null,
    source: 'NCBI E-utilities',
  };
}

export function lookupAccessions(accessions: string[]) {
  return asResponse(sources.lookupAccessions(accessions));
}
