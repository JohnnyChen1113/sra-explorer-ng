// Browser client for the seqout.org API (Saket Lab, IIT Bombay): relevance-ranked dataset
// search across GEO/SRA/ENA/ArrayExpress/DDBJ/GSA and AI-extracted sample annotations.
// seqout allows cross-origin calls and limits each visitor's IP to 60 requests/min
// (30/min for search), so requests are paced and cached here. Everything that seqout
// provides is optional: runs and files always come live from NCBI/ENA.

import { createLimiter, limitedFetch } from './core/limiter.ts';

const API = 'https://seqout.org/api';
export const seqoutProjectUrl = (accession: string) => `https://seqout.org/p/${encodeURIComponent(accession)}`;

const limiter = createLimiter(0.8, 2);

export type SeqoutPublication = { pmid?: string; title?: string; journal?: string; doi?: string; pub_date?: string; authors?: string; citation_count?: number };

export type SeqoutProject = {
  accession: string;
  title: string;
  summary?: string;
  updated_at?: string;
  organisms?: string[];
  countries?: string[];
  source?: string;
  instrument_models?: string[];
  library_strategies?: string[];
  publications?: SeqoutPublication[] | null;
  pmid?: string | null;
};

export type SeqoutCursor = { rank?: number; sort_value?: string | number; accession: string };

export type SeqoutFilters = { organism?: string; library_strategy?: string; db?: string; long_read?: boolean; sortby?: '' | 'citations' | 'year' };

export type SampleAnnotation = {
  sample: string;
  title?: string | null;
  tissue?: string | null;
  cell_type?: string | null;
  disease?: string | null;
  treatment?: string | null;
  sex?: string | null;
  age?: string | null;
  cell_line?: string | null;
  development_stage?: string | null;
};

const ANNOTATION_KEYS = ['title', 'tissue', 'cell_type', 'disease', 'treatment', 'sex', 'age', 'cell_line', 'development_stage'] as const;

export class SeqoutError extends Error {}

// seqout's fields are not strictly typed (e.g. pub_date is sometimes a number, lists are
// sometimes null), so every project is coerced before it reaches the UI.
const str = (value: unknown) => (value === null || value === undefined || value === '' ? undefined : String(value));
const strList = (value: unknown) => (Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined && item !== '').map(String) : []);

export function normalizeProject(raw: Record<string, unknown>): SeqoutProject {
  const publications = Array.isArray(raw.publications) ? raw.publications.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null).map((item) => ({
    pmid: str(item.pmid),
    title: str(item.title),
    journal: str(item.journal),
    doi: str(item.doi),
    pub_date: str(item.pub_date),
    authors: str(item.authors),
    citation_count: typeof item.citation_count === 'number' ? item.citation_count : undefined,
  })) : [];
  return {
    accession: String(raw.accession || ''),
    title: str(raw.title) || String(raw.accession || 'Untitled dataset'),
    summary: str(raw.summary),
    updated_at: str(raw.updated_at),
    organisms: strList(raw.organisms),
    countries: strList(raw.countries),
    source: str(raw.source),
    instrument_models: strList(raw.instrument_models),
    library_strategies: strList(raw.library_strategies),
    publications,
    pmid: str(raw.pmid) || null,
  };
}

async function getJson<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T | null> {
  const url = new URL(`${API}${path}`);
  Object.entries(params).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  let response: Response;
  try {
    response = await limitedFetch(limiter, url, { headers: { accept: 'application/json' } }, 'seqout', { attempts: 2, timeoutMs: 30_000 });
  } catch (error) {
    throw new SeqoutError(error instanceof Error ? error.message : 'seqout is unreachable');
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new SeqoutError(`seqout returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function searchProjects(q: string, filters: SeqoutFilters = {}, cursor: SeqoutCursor | null = null) {
  const data = await getJson<{ results: Array<Record<string, unknown>>; next_cursor: SeqoutCursor | null }>('/search', {
    q,
    organism: filters.organism,
    library_strategy: filters.library_strategy,
    db: filters.db,
    long_read: filters.long_read ? 'true' : undefined,
    sortby: filters.sortby || undefined,
    cursor_rank: cursor?.rank !== undefined ? String(cursor.rank) : undefined,
    cursor_sort: cursor?.sort_value !== undefined ? String(cursor.sort_value) : undefined,
    cursor_acc: cursor?.accession,
  });
  const results = (data?.results || []).filter((item) => item && typeof item === 'object' && item.accession).map(normalizeProject);
  return { results, nextCursor: data?.next_cursor || null };
}

const projectCache = new Map<string, Promise<string | null>>();

/** Parent project of a run/experiment/sample accession, e.g. SRR… → SRP…. */
export function projectOf(accession: string) {
  if (!projectCache.has(accession)) {
    projectCache.set(accession, getJson<{ project_accession?: string }>(`/accession/${encodeURIComponent(accession)}/project`).then((data) => data?.project_accession || null));
  }
  return projectCache.get(accession)!;
}

const studyCache = new Map<string, Promise<string[]>>();

/** SRA/ENA/DDBJ study accessions holding the reads of a GEO, ArrayExpress, SRA, or BioProject accession. */
export function sraStudiesFor(accession: string): Promise<string[]> {
  if (/^([SED]RP|PRJ[DEN][AB])\d+$/i.test(accession)) return Promise.resolve([accession.toUpperCase()]);
  if (!studyCache.has(accession)) {
    studyCache.set(accession, getJson<{ xref: Array<{ accession: string; link_type?: string }> }>(`/project/${encodeURIComponent(accession)}/xref`).then((data) => {
      const linked = (data?.xref || []).map((item) => item.accession.toUpperCase()).filter((item) => /^([SED]RP|PRJ[DEN][AB])\d+$/.test(item));
      return [...new Set(linked)];
    }));
  }
  return studyCache.get(accession)!;
}

const annotationCache = new Map<string, Promise<Map<string, SampleAnnotation>>>();
const PAGE = 500;
const MAX_PAGES = 6;

/** AI-extracted sample annotations for one SRA study, keyed by SRS/ERS/DRS sample accession. */
export function sampleAnnotations(study: string) {
  if (!annotationCache.has(study)) {
    annotationCache.set(study, (async () => {
      const bySample = new Map<string, SampleAnnotation>();
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const data = await getJson<{ n_samples?: number; samples?: Array<Record<string, unknown>> }>(`/project/${encodeURIComponent(study)}/enriched`, { limit: String(PAGE), offset: String(page * PAGE), human_readable_age: 'true' });
        const samples = data?.samples || [];
        samples.forEach((raw) => {
          const annotation: SampleAnnotation = { sample: String(raw.sample) };
          ANNOTATION_KEYS.forEach((key) => { const value = raw[key]; if (value !== null && value !== undefined && value !== '') annotation[key] = String(value); });
          bySample.set(annotation.sample, annotation);
        });
        if (samples.length < PAGE || bySample.size >= (data?.n_samples ?? 0)) break;
      }
      return bySample;
    })().catch((error) => { annotationCache.delete(study); throw error; }));
  }
  return annotationCache.get(study)!;
}

/** Projects whose linked publication is this PubMed ID, found by searching the paper's title. */
export async function projectsForPaper(pmid: string, title: string) {
  if (!title) return [];
  const { results } = await searchProjects(title.replace(/[.]$/, ''));
  return results.filter((project) => project.pmid === pmid || (project.publications || []).some((publication) => publication.pmid === pmid));
}
