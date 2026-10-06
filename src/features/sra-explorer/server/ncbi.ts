import { Buffer } from 'node:buffer';

import type { RunSummary, SearchCursor, SearchResponse } from '../types';
import { BATCH_SIZE, decodeXml, parseAttributes } from './common.ts';
import { ncbiApiKey, upstreamFetch, UpstreamError } from './upstream.ts';

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

async function ncbiJson(path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'GET') {
  const url = new URL(path, EUTILS);
  const apiKey = ncbiApiKey();
  const query = new URLSearchParams({ ...params, retmode: 'json', tool: 'sra_explorer_ng', ...(apiKey ? { api_key: apiKey } : {}) });
  // Long terms (accession lists) must be POSTed; E-utilities rejects very long URLs.
  if (method === 'GET') url.search = query.toString();
  const init: RequestInit = method === 'GET'
    ? { headers: { accept: 'application/json' } }
    : { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: query.toString() };
  let response: Response;
  try {
    response = await upstreamFetch('eutils', url, init, 'NCBI E-utilities');
  } catch (error) {
    throw new Response(error instanceof UpstreamError ? `${error.message}. NCBI may be busy; try again shortly.` : 'NCBI request failed.', { status: 502 });
  }
  if (!response.ok) throw new Response(`NCBI returned ${response.status}.`, { status: 502 });
  const payload = await response.json() as any;
  const message = payload?.esearchresult?.ERROR || payload?.error;
  if (message) throw new Response(`NCBI: ${message}`, { status: 502 });
  return payload;
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
    const expxml = String(value.expxml || '');
    const tagAttrs = (tag: string) => parseAttributes(expxml.match(new RegExp(`<${tag}\\b([^>]*)`, 'i'))?.[1] || '');
    const title = textBetween(expxml, 'Title') || 'Untitled SRA run';
    const platform = tagAttrs('Platform').instrument_model || 'Unknown';
    const study = tagAttrs('Study').acc || '';
    const project = textBetween(expxml, 'Bioproject') || study;
    const layout = expxml.match(/<LIBRARY_LAYOUT>\s*<(\w+)/i)?.[1]?.toUpperCase() || '';
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
        organism: tagAttrs('Organism').ScientificName || '',
        strategy: textBetween(expxml, 'LIBRARY_STRATEGY'),
        source: textBetween(expxml, 'LIBRARY_SOURCE'),
        layout,
        experiment: tagAttrs('Experiment').acc || '',
        study,
        biosample: textBetween(expxml, 'Biosample'),
        spots: Number(attrs.total_spots) || 0,
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

export const MAX_LOOKUP_ACCESSIONS = 500;
export const MAX_LOOKUP_RUNS = 5000;
const ACCESSION_PATTERN = /\b(?:[SED]R[RXSP]\d{5,}|PRJ[DEN][AB]\d+|SAM[NED][A-Z]?\d+|GS[EM]\d+)\b/gi;

export function extractAccessions(text: string) {
  return [...new Set((text.match(ACCESSION_PATTERN) || []).map((item) => item.toUpperCase()))];
}

export type AccessionLookup = { runs: RunSummary[]; unmatched: string[]; truncated: boolean; total: number };

/** Resolve run, experiment, study, BioProject, BioSample, or GEO accessions to their SRA runs. */
export async function lookupAccessions(accessions: string[]): Promise<AccessionLookup> {
  const unique = [...new Set(accessions.map((item) => item.trim().toUpperCase()).filter(Boolean))];
  if (!unique.length) throw new Response('Provide at least one accession.', { status: 400 });
  if (unique.length > MAX_LOOKUP_ACCESSIONS) throw new Response(`Provide at most ${MAX_LOOKUP_ACCESSIONS} accessions per request.`, { status: 400 });

  const search = await ncbiJson('esearch.fcgi', { db: 'sra', usehistory: 'y', retmax: '0', term: unique.join(' OR ') }, 'POST');
  const total = Number(search.esearchresult?.count) || 0;
  const runs: RunSummary[] = [];
  for (let start = 0; start < total && runs.length < MAX_LOOKUP_RUNS; start += BATCH_SIZE) {
    const summary = await ncbiJson('esummary.fcgi', { db: 'sra', query_key: search.esearchresult.querykey, WebEnv: search.esearchresult.webenv, retstart: String(start), retmax: String(BATCH_SIZE) });
    runs.push(...parseSummaryResponse(summary));
  }
  const seen = new Map(runs.map((run) => [run.accession, run]));
  // GEO accessions are not stored on SRA records, so they cannot be checked individually.
  const known = new Set([...seen.values()].flatMap((run) => [run.accession, run.experiment, run.study, run.project, run.biosample]).filter(Boolean));
  const unmatched = unique.filter((item) => !item.startsWith('GS') && !item.startsWith('SAM') && !known.has(item));
  return { runs: [...seen.values()].slice(0, MAX_LOOKUP_RUNS), unmatched, truncated: runs.length >= MAX_LOOKUP_RUNS && total > BATCH_SIZE, total };
}
