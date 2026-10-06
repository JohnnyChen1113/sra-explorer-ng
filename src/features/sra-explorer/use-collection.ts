import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { dedupeRuns } from './format';
import type { RunSummary } from './types';

const COLLECTION_KEY = 'sra-explorer-collection';

/** The saved-run collection, persisted in this browser and shared by every page. */
export function useCollection(onOpen: () => void) {
  const [collection, setCollection] = useState<RunSummary[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLECTION_KEY) || '[]');
      if (Array.isArray(saved)) setCollection(saved);
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection)); } catch {}
  }, [collection, ready]);

  const saved = useMemo(() => new Set(collection.map((run) => run.accession)), [collection]);

  function add(additions: RunSummary[]) {
    if (!additions.length) return;
    const fresh = additions.filter((run) => !saved.has(run.accession)).length;
    setCollection((current) => dedupeRuns(current, additions));
    toast.success(fresh ? `Added ${fresh} run${fresh === 1 ? '' : 's'} to the collection` : 'Already in the collection', {
      description: fresh < additions.length && fresh ? `${additions.length - fresh} were already saved.` : undefined,
      action: { label: 'Open', onClick: onOpen },
    });
  }

  return {
    collection,
    saved,
    ready,
    add,
    replace: setCollection,
    remove: (accession: string) => setCollection((current) => current.filter((run) => run.accession !== accession)),
  };
}
