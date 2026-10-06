// NCBI/ENA data access shared by the web page (which calls the archives directly from the
// browser, like the original SRA Explorer) and the server API/MCP. Only *how* requests are
// sent differs, so the caller supplies the fetcher.

import type { DownloadFile, RunFilesResponse, RunSummary, SearchCursor } from '../types';
import { decodeXml, parseAttributes } from './xml.ts';

export const BATCH_SIZE = 500;
export const MAX_LOOKUP_ACCESSIONS = 500;
export const MAX_LOOKUP_RUNS = 5000;

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const ENA_FILES = 'https://www.ebi.ac.uk/ena/portal/api/filereport';
const ACCESSION_PATTERN = /\b(?:[SED]R[RXSP]\d{5,}|PRJ[DEN][AB]\d+|SAM[NED][A-Z]?\d+|GS[EM]\d+)\b/gi;

export type Service = 'eutils' | 'ena';
export type Fetcher = (service: Service, url: URL, init: RequestInit, label: string) => Promise<Response>;

/** An upstream or input problem; `status` mirrors the HTTP status an API should answer with. */
export class SourceError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
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

export function extractAccessions(text: string) {
  return [...new Set((text.match(ACCESSION_PATTERN) || []).map((item) => item.toUpperCase()))];
}

function splitField(value: string | undefined) {
  return value ? value.split(';').filter(Boolean) : [];
}

export function parseEnaRows(rows: Array<Record<string, string>>, accession: string): DownloadFile[] {
  const files: DownloadFile[] = [];
  const toUrl = (path: string) => (path.startsWith('http') ? path : `https://${path}`);
  for (const row of rows) {
    const fastqSizes = splitField(row.fastq_bytes);
    const fastqMd5s = splitField(row.fastq_md5);
    splitField(row.fastq_ftp).forEach((path, index) => files.push({ accession, representation: 'fastq', filename: path.split('/').pop() || `${accession}.fastq.gz`, url: toUrl(path), size: Number(fastqSizes[index]) || null, md5: fastqMd5s[index] || null, format: 'fastq.gz' }));
    splitField(row.sra_ftp).forEach((path, index) => files.push({ accession, representation: 'sra', filename: path.split('/').pop() || `${accession}.sra`, url: toUrl(path), size: Number(splitField(row.sra_bytes)[index]) || null, md5: splitField(row.sra_md5)[index] || null, format: 'SRA Normalized' }));
  }
  return files;
}

/** NCBI's public cloud copy of the normalized run, used when ENA lists no .sra file. */
export function cloudSraFile(accession: string): DownloadFile {
  return { accession, representation: 'sra', filename: `${accession}.sra`, url: `https://sra-pub-run-odp.s3.amazonaws.com/sra/${accession}/${accession}`, size: null, md5: null, format: 'SRA Normalized' };
}

export type AccessionLookup = { runs: RunSummary[]; unmatched: string[]; truncated: boolean; total: number };

export function createSources(fetcher: Fetcher, { apiKey = '' }: { apiKey?: string } = {}) {
  async function eutils(path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'GET') {
    const url = new URL(path, EUTILS);
    const query = new URLSearchParams({ ...params, retmode: 'json', tool: 'sra_explorer_ng', ...(apiKey ? { api_key: apiKey } : {}) });
    // Long terms (accession lists) must be POSTed; E-utilities rejects very long URLs.
    if (method === 'GET') url.search = query.toString();
    const init: RequestInit = method === 'GET'
      ? { headers: { accept: 'application/json' } }
      : { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: query.toString() };
    let response: Response;
    try {
      response = await fetcher('eutils', url, init, 'NCBI E-utilities');
    } catch (error) {
      throw new SourceError(`${error instanceof Error ? error.message : 'NCBI request failed'}. NCBI may be busy; try again shortly.`);
    }
    if (!response.ok) throw new SourceError(`NCBI returned HTTP ${response.status}.`);
    const payload = await response.json() as any;
    const message = payload?.esearchresult?.ERROR || payload?.error;
    if (message) throw new SourceError(`NCBI: ${message}`);
    return payload;
  }

  async function startSearch(term: string): Promise<SearchCursor> {
    const clean = term.trim();
    if (!clean) throw new SourceError('Query is required.', 400);
    const data = (await eutils('esearch.fcgi', { db: 'sra', usehistory: 'y', retmax: '0', term: clean })).esearchresult;
    return { webEnv: data.webenv, queryKey: data.querykey, nextStart: 0, total: Number(data.count) || 0, query: data.querytranslation || clean };
  }

  /** Fetch the next batch of up to 500 SRA records for a search. */
  async function nextPage(cursor: SearchCursor) {
    if (cursor.nextStart >= cursor.total) return { results: [] as RunSummary[], cursor: null };
    const summary = await eutils('esummary.fcgi', { db: 'sra', query_key: cursor.queryKey, WebEnv: cursor.webEnv, retstart: String(cursor.nextStart), retmax: String(BATCH_SIZE) });
    const nextStart = Math.min(cursor.nextStart + BATCH_SIZE, cursor.total);
    return { results: parseSummaryResponse(summary), cursor: { ...cursor, nextStart } };
  }

  /** Resolve run, experiment, study, BioProject, BioSample, or GEO accessions to their SRA runs. */
  async function lookupAccessions(accessions: string[]): Promise<AccessionLookup> {
    const unique = [...new Set(accessions.map((item) => item.trim().toUpperCase()).filter(Boolean))];
    if (!unique.length) throw new SourceError('Provide at least one accession.', 400);
    if (unique.length > MAX_LOOKUP_ACCESSIONS) throw new SourceError(`Provide at most ${MAX_LOOKUP_ACCESSIONS} accessions per lookup.`, 400);
    const search = (await eutils('esearch.fcgi', { db: 'sra', usehistory: 'y', retmax: '0', term: unique.join(' OR ') }, 'POST')).esearchresult;
    const total = Number(search?.count) || 0;
    const runs: RunSummary[] = [];
    for (let start = 0; start < total && runs.length < MAX_LOOKUP_RUNS; start += BATCH_SIZE) {
      runs.push(...parseSummaryResponse(await eutils('esummary.fcgi', { db: 'sra', query_key: search.querykey, WebEnv: search.webenv, retstart: String(start), retmax: String(BATCH_SIZE) })));
    }
    const seen = new Map(runs.map((run) => [run.accession, run]));
    // GEO and BioSample accessions are not stored on SRA run summaries, so they cannot be checked individually.
    const known = new Set([...seen.values()].flatMap((run) => [run.accession, run.experiment, run.study, run.project, run.biosample]).filter(Boolean));
    const unmatched = unique.filter((item) => !item.startsWith('GS') && !item.startsWith('SAM') && !known.has(item));
    return { runs: [...seen.values()].slice(0, MAX_LOOKUP_RUNS), unmatched, truncated: runs.length >= MAX_LOOKUP_RUNS && total > BATCH_SIZE, total };
  }

  async function enaFiles(accession: string): Promise<DownloadFile[]> {
    const url = new URL(ENA_FILES);
    url.search = new URLSearchParams({ result: 'read_run', accession, format: 'json', fields: 'fastq_ftp,fastq_bytes,fastq_md5,sra_ftp,sra_bytes,sra_md5' }).toString();
    const response = await fetcher('ena', url, { headers: { accept: 'application/json' } }, 'ENA Portal API');
    // ENA answers 204/empty for runs it has not mirrored (e.g. some NCBI-only data).
    if (response.status === 204 || response.status === 404) return [];
    if (!response.ok) throw new Error(`ENA Portal API returned HTTP ${response.status}`);
    const text = await response.text();
    return text.trim() ? parseEnaRows(JSON.parse(text) as Array<Record<string, string>>, accession) : [];
  }

  /** FASTQ + SRA for one run; failures are reported in `errors` instead of looking like "no files". */
  async function enaRunFiles(accession: string): Promise<RunFilesResponse> {
    try {
      const files = await enaFiles(accession);
      return { accession, files: files.some((file) => file.representation === 'sra') ? files : [...files, cloudSraFile(accession)], sources: ['ENA Portal API', 'NCBI SRA Cloud'], checked: ['ena'], errors: [] };
    } catch (error) {
      return { accession, files: [cloudSraFile(accession)], sources: ['NCBI SRA Cloud'], checked: ['ena'], errors: [`FASTQ/SRA list unknown: ${error instanceof Error ? error.message : 'ENA lookup failed'}`] };
    }
  }

  return { startSearch, nextPage, lookupAccessions, enaFiles, enaRunFiles };
}
