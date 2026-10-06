import { Buffer } from 'node:buffer';

import type { RunSummary, SearchCursor, SearchResponse } from '../types';
import { BATCH_SIZE, decodeXml, parseAttributes } from './common';

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';

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

async function ncbiJson(path: string, params: Record<string, string>) {
  const url = new URL(path, EUTILS);
  Object.entries({ ...params, retmode: 'json', tool: 'sra_explorer_ng' }).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Response(`NCBI returned ${response.status}.`, { status: 502 });
  return response.json() as Promise<any>;
}

function textBetween(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeXml((match?.[1] || '').replace(/<[^>]+>/g, '')).trim();
}

export function parseSummaryResponse(payload: any): RunSummary[] {
  const results: RunSummary[] = [];
  const root = payload?.result || {};
  for (const [key, value] of Object.entries<any>(root)) {
    if (key === 'uids' || !value?.runs) continue;
    const title = textBetween(value.expxml || '', 'Title') || 'Untitled SRA run';
    const platformMatch = String(value.expxml || '').match(/<Platform\b([^>]*)\/?\s*>/i);
    const platform = parseAttributes(platformMatch?.[1] || '').instrument_model || 'Unknown';
    const project = textBetween(value.expxml || '', 'Bioproject') || parseAttributes(String(value.expxml || '').match(/<Study\b([^>]*)/i)?.[1] || '').acc || '';
    const runPattern = /<Run\b([^>]*)\/?\s*>/gi;
    let runMatch: RegExpExecArray | null;
    while ((runMatch = runPattern.exec(value.runs)) !== null) {
      const attrs = parseAttributes(runMatch[1]);
      if (!attrs.acc) continue;
      results.push({
        accession: attrs.acc,
        title,
        platform,
        totalBases: Number(attrs.total_bases) || 0,
        createdAt: value.createdate || '',
        project,
      });
    }
  }
  return results;
}

export async function searchSra(query: string, cursorValue?: string | null): Promise<SearchResponse> {
  const cleanQuery = query.trim();
  if (!cleanQuery && !cursorValue) throw new Response('Query is required.', { status: 400 });

  let cursor: SearchCursor;
  if (cursorValue) {
    cursor = decodeCursor(cursorValue);
    if (cleanQuery && cleanQuery !== cursor.query) throw new Response('Cursor does not match query.', { status: 400 });
  } else {
    const search = await ncbiJson('esearch.fcgi', { db: 'sra', usehistory: 'y', retmax: '0', term: cleanQuery });
    const data = search.esearchresult;
    cursor = {
      webEnv: data.webenv,
      queryKey: data.querykey,
      nextStart: 0,
      total: Number(data.count) || 0,
      query: data.querytranslation || cleanQuery,
    };
  }

  if (cursor.nextStart >= cursor.total) {
    return { query: cursor.query, total: cursor.total, loaded: cursor.nextStart, batchSize: BATCH_SIZE, results: [], nextCursor: null, source: 'NCBI E-utilities' };
  }

  const summary = await ncbiJson('esummary.fcgi', {
    db: 'sra',
    query_key: cursor.queryKey,
    WebEnv: cursor.webEnv,
    retstart: String(cursor.nextStart),
    retmax: String(BATCH_SIZE),
  });
  const results = parseSummaryResponse(summary);
  const nextStart = Math.min(cursor.nextStart + BATCH_SIZE, cursor.total);
  return {
    query: cursor.query,
    total: cursor.total,
    loaded: nextStart,
    batchSize: BATCH_SIZE,
    results,
    nextCursor: nextStart < cursor.total ? encodeCursor({ ...cursor, nextStart }) : null,
    source: 'NCBI E-utilities',
  };
}
