import { useEffect, useRef, useState } from 'react';

import type { DownloadFile, RunFilesResponse, RunSummary } from './types';

const STORAGE_KEY = 'sra-explorer-files-v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH = 20;
const PARALLEL_BATCHES = 3;

type CacheEntry = RunFilesResponse & { fetchedAt: number };

const memory = new Map<string, CacheEntry>();
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, CacheEntry>;
    const now = Date.now();
    Object.values(stored).forEach((entry) => { if (now - entry.fetchedAt < TTL_MS) memory.set(entry.accession, entry); });
  } catch {}
}

function persist() {
  try {
    // Only complete lookups are worth keeping; failed ones must be retried.
    const entries = [...memory.values()].filter((entry) => !entry.errors?.length && !entry.error);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries.map((entry) => [entry.accession, entry]))));
  } catch {}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBatch(accessions: string[], signal: AbortSignal): Promise<RunFilesResponse[]> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch('/api/v1/files/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessions }), signal });
    if (response.status === 429 && attempt < 5) {
      await sleep((Number(response.headers.get('retry-after')) || 10) * 1000);
      continue;
    }
    if (!response.ok) throw new Error(await readError(response));
    return ((await response.json()) as { results: RunFilesResponse[] }).results;
  }
}

export async function readError(response: Response) {
  const text = await response.text();
  try { return (JSON.parse(text) as { error?: string }).error || text; } catch { return text || `HTTP ${response.status}`; }
}

export type CollectionFilesState = {
  results: Map<string, RunFilesResponse>;
  files: DownloadFile[];
  pending: number;
  failed: RunFilesResponse[];
  loading: boolean;
  error: string;
  retryFailed: () => void;
};

export function useCollectionFiles(runs: RunSummary[], active: boolean): CollectionFilesState {
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const lastRetry = useRef(0);

  useEffect(() => {
    hydrate();
    if (!active || !runs.length) return;
    if (retryToken !== lastRetry.current) {
      lastRetry.current = retryToken;
      runs.forEach((run) => { const entry = memory.get(run.accession); if (entry && (entry.errors?.length || entry.error)) memory.delete(run.accession); });
    }
    const missing = runs.map((run) => run.accession).filter((accession) => !memory.has(accession));
    if (!missing.length) { setLoading(false); setVersion((value) => value + 1); return; }
    const controller = new AbortController();
    const batches: string[][] = [];
    for (let offset = 0; offset < missing.length; offset += BATCH) batches.push(missing.slice(offset, offset + BATCH));
    setLoading(true); setError('');
    let next = 0;
    const worker = async () => {
      while (next < batches.length && !controller.signal.aborted) {
        const batch = batches[next++];
        const results = await fetchBatch(batch, controller.signal);
        const now = Date.now();
        results.forEach((result) => memory.set(result.accession, { ...result, fetchedAt: now }));
        persist();
        setVersion((value) => value + 1);
      }
    };
    Promise.all(Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, worker))
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Collection lookup failed.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, runs, retryToken]);

  void version;
  const results = new Map<string, RunFilesResponse>();
  runs.forEach((run) => { const entry = memory.get(run.accession); if (entry) results.set(run.accession, entry); });
  return {
    results,
    files: [...results.values()].flatMap((result) => result.files),
    pending: runs.length - results.size,
    failed: [...results.values()].filter((result) => result.errors?.length || result.error),
    loading,
    error,
    retryFailed: () => setRetryToken((value) => value + 1),
  };
}
