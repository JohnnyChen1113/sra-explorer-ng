import { useEffect, useMemo, useRef, useState } from 'react';

import { browserSources } from './browser-sources';
import { mapWithConcurrency } from './core/limiter';
import type { DownloadFile, RunFilesResponse, RunSummary } from './types';

// ENA (FASTQ + SRA) is queried straight from the browser and answers in ~1 s per run.
// Original submitted files come from NCBI's Run Browser through our server (no CORS there)
// and take 2-5 s per run, so they are cached separately and only looked up on demand.
export type LookupKind = 'ena' | 'original';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH: Record<LookupKind, number> = { ena: 10, original: 20 };
const PARALLEL_BATCHES = 3;

type CacheEntry = RunFilesResponse & { fetchedAt: number };

const caches: Record<LookupKind, Map<string, CacheEntry>> = { ena: new Map(), original: new Map() };
let hydrated = false;
const storageKey = (kind: LookupKind) => `sra-explorer-files-v2-${kind}`;
const hasProblem = (entry: RunFilesResponse) => Boolean(entry.errors?.length || entry.error);

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  const now = Date.now();
  (['ena', 'original'] as const).forEach((kind) => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey(kind)) || '{}') as Record<string, CacheEntry>;
      Object.values(stored).forEach((entry) => { if (now - entry.fetchedAt < TTL_MS) caches[kind].set(entry.accession, entry); });
    } catch {}
  });
  try { localStorage.removeItem('sra-explorer-files-v1'); } catch {}
}

function persist(kind: LookupKind) {
  try {
    // Only complete lookups are worth keeping; failed ones must be retried. Empty ENA answers
    // are also re-checked next session because ENA occasionally returns rows without files.
    const entries = [...caches[kind].values()].filter((entry) => !hasProblem(entry) && (kind !== 'ena' || entry.files.some((file) => file.representation === 'fastq')));
    localStorage.setItem(storageKey(kind), JSON.stringify(Object.fromEntries(entries.map((entry) => [entry.accession, entry]))));
  } catch {}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function readError(response: Response) {
  const text = await response.text();
  try { return (JSON.parse(text) as { error?: string }).error || text; } catch { return text || `HTTP ${response.status}`; }
}

async function fetchBatch(kind: LookupKind, accessions: string[], signal: AbortSignal): Promise<RunFilesResponse[]> {
  if (kind === 'ena') return mapWithConcurrency(accessions, 6, (accession) => browserSources.enaRunFiles(accession));
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch('/api/v1/files/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessions, include: [kind] }), signal });
    if (response.status === 429 && attempt < 5) {
      await sleep((Number(response.headers.get('retry-after')) || 10) * 1000);
      continue;
    }
    if (!response.ok) throw new Error(await readError(response));
    return ((await response.json()) as { results: RunFilesResponse[] }).results;
  }
}

function useLookup(kind: LookupKind, runs: RunSummary[], enabled: boolean, retryToken: number, onUpdate: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastRetry = useRef(retryToken);

  useEffect(() => {
    hydrate();
    if (!enabled || !runs.length) { setLoading(false); return; }
    if (retryToken !== lastRetry.current) {
      lastRetry.current = retryToken;
      runs.forEach((run) => { const entry = caches[kind].get(run.accession); if (entry && hasProblem(entry)) caches[kind].delete(run.accession); });
    }
    const missing = runs.map((run) => run.accession).filter((accession) => !caches[kind].has(accession));
    onUpdate();
    if (!missing.length) { setLoading(false); return; }
    const controller = new AbortController();
    const batches: string[][] = [];
    for (let offset = 0; offset < missing.length; offset += BATCH[kind]) batches.push(missing.slice(offset, offset + BATCH[kind]));
    setLoading(true); setError('');
    let next = 0;
    const worker = async () => {
      while (next < batches.length && !controller.signal.aborted) {
        const results = await fetchBatch(kind, batches[next++], controller.signal);
        const now = Date.now();
        results.forEach((result) => caches[kind].set(result.accession, { ...result, fetchedAt: now }));
        persist(kind);
        onUpdate();
      }
    };
    Promise.all(Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, worker))
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'File lookup failed.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // onUpdate is a stable state setter wrapper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, runs, enabled, retryToken]);

  return { loading, error };
}

export type LookupState = { loading: boolean; error: string; done: number; requested: boolean };

export type CollectionFilesState = {
  /** Per-run lookup results, keyed by accession then lookup kind. */
  results: Map<string, Partial<Record<LookupKind, RunFilesResponse>>>;
  files: DownloadFile[];
  lookups: Record<LookupKind, LookupState>;
  failed: RunFilesResponse[];
  retryFailed: () => void;
  /** Drop cached lookups for these runs and query them again. */
  recheck: (kind: LookupKind, accessions: string[]) => void;
};

export function useCollectionFiles(runs: RunSummary[], active: boolean, wantOriginal: boolean): CollectionFilesState {
  const [version, setVersion] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const bump = useRef(() => setVersion((value) => value + 1)).current;
  const ena = useLookup('ena', runs, active, retryToken, bump);
  const original = useLookup('original', runs, active && wantOriginal, retryToken, bump);

  return useMemo(() => {
    const results = new Map<string, Partial<Record<LookupKind, RunFilesResponse>>>();
    const done = { ena: 0, original: 0 };
    runs.forEach((run) => {
      const entry: Partial<Record<LookupKind, RunFilesResponse>> = {};
      (['ena', 'original'] as const).forEach((kind) => {
        const cached = caches[kind].get(run.accession);
        if (cached) { entry[kind] = cached; done[kind] += 1; }
      });
      results.set(run.accession, entry);
    });
    const all = [...results.values()].flatMap((entry) => [entry.ena, entry.original].filter((item): item is RunFilesResponse => Boolean(item)));
    return {
      results,
      files: all.flatMap((result) => result.files),
      lookups: {
        ena: { loading: ena.loading, error: ena.error, done: done.ena, requested: active },
        original: { loading: original.loading, error: original.error, done: done.original, requested: wantOriginal },
      },
      failed: all.filter(hasProblem),
      retryFailed: () => setRetryToken((value) => value + 1),
      recheck: (kind: LookupKind, accessions: string[]) => {
        accessions.forEach((accession) => caches[kind].delete(accession));
        persist(kind);
        setRetryToken((value) => value + 1);
      },
    };
    // version forces recomputation when the module-level caches change.
  }, [runs, ena.loading, ena.error, original.loading, original.error, active, wantOriginal, version]);
}
