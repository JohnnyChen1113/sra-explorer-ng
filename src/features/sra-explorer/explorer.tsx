"use client";

import { Check, ChevronDown, LoaderCircle, Search, ShoppingBasket, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ClearSavedButton, CollectionWorkspace } from './collection';
import { useCollection } from './use-collection';
import { browserSources } from './browser-sources';
import { dedupeRuns, layoutLabel, plural } from './format';
import { RunTable, sortRuns, type SortKey, type SortState } from './run-table';
import type { RunSummary, SearchCursor } from './types';

const EXAMPLES = ['SRR12881185', 'PRJNA517295', 'GSE30567', 'human liver miRNA'];

// Sidebar filters: tick any number of values; values within a facet are OR-ed, facets AND-ed.
type Facet = 'organism' | 'strategy' | 'layout' | 'platform';
const FACETS: Array<{ key: Facet; label: string; italic?: boolean; format?: (value: string) => string }> = [
  { key: 'organism', label: 'Organism', italic: true },
  { key: 'strategy', label: 'Library strategy' },
  { key: 'layout', label: 'Layout', format: layoutLabel },
  { key: 'platform', label: 'Instrument' },
];
const noFacets = (): Record<Facet, Set<string>> => ({ organism: new Set(), strategy: new Set(), layout: new Set(), platform: new Set() });

function readQueryFromUrl() {
  return typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q') || '';
}

export function ExplorerPage() {
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [translatedQuery, setTranslatedQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [facets, setFacets] = useState<Record<Facet, Set<string>>>(noFacets);
  const [sort, setSort] = useState<SortState>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [cursor, setCursor] = useState<SearchCursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);
  const { collection, saved, add: addRuns, clear: clearRuns, replace: setCollection, remove: removeRun } = useCollection(() => setWorkspaceOpen(true));
  const resultsRef = useRef<HTMLElement>(null);
  const lastToggled = useRef<number | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    // Lets end-to-end tests wait until React handles clicks.
    document.documentElement.dataset.hydrated = 'true';
  }, []);


  const runSearch = useCallback(async (term: string, nextCursor: SearchCursor | null = null) => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    if (!nextCursor) {
      setRuns([]); setSelected(new Set()); setCursor(null); setTotal(0); setLoaded(0); setTranslatedQuery('');
      setFacets(noFacets()); setFilter(''); lastToggled.current = null;
    }
    try {
      const start = nextCursor ?? await browserSources.startSearch(term);
      const page = await browserSources.nextPage(start);
      if (id !== requestId.current) return;
      setRuns((current) => (nextCursor ? dedupeRuns(current, page.results) : page.results));
      setTotal(start.total);
      setLoaded(page.cursor?.nextStart ?? start.total);
      setCursor(page.cursor && page.cursor.nextStart < page.cursor.total ? page.cursor : null);
      setTranslatedQuery(start.query);
      if (!nextCursor) requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : 'Search failed.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const startSearch = useCallback((term: string, pushHistory = true) => {
    const clean = term.trim();
    if (!clean) return;
    setQuery(clean);
    setActiveQuery(clean);
    if (pushHistory && readQueryFromUrl() !== clean) window.history.pushState(null, '', `?q=${encodeURIComponent(clean)}`);
    void runSearch(clean);
  }, [runSearch]);

  useEffect(() => {
    const initial = readQueryFromUrl();
    if (initial) startSearch(initial, false);
    const onPop = () => {
      const term = readQueryFromUrl();
      if (term) startSearch(term, false);
      else { requestId.current += 1; setQuery(''); setActiveQuery(''); setRuns([]); setTotal(0); setLoaded(0); setCursor(null); setError(''); setLoading(false); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [startSearch]);

  const textFiltered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter((run) => [run.accession, run.title, run.platform, run.organism, run.strategy, run.source, run.layout, run.project, run.study, run.experiment, run.biosample].join(' ').toLowerCase().includes(needle));
  }, [filter, runs]);

  const matchesFacets = useCallback((run: RunSummary, except?: Facet) => FACETS.every(({ key }) => key === except || !facets[key].size || facets[key].has(run[key] || '')), [facets]);

  const visibleRuns = useMemo(() => sortRuns(textFiltered.filter((run) => matchesFacets(run)), sort), [textFiltered, matchesFacets, sort]);

  // Each facet counts the runs that match every *other* filter, so the numbers show what ticking a value would give.
  const facetSections = useMemo(() => FACETS.map((facet) => {
    const counts = new Map<string, number>();
    runs.forEach((run) => counts.set(run[facet.key] || '', 0));
    textFiltered.forEach((run) => { if (matchesFacets(run, facet.key)) counts.set(run[facet.key] || '', (counts.get(run[facet.key] || '') || 0) + 1); });
    return { ...facet, counts: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
  }).filter((section) => section.counts.length > 1 || facets[section.key].size > 0), [runs, textFiltered, matchesFacets, facets]);

  function changeFacet(key: Facet, next: Set<string>) {
    setFacets((current) => ({ ...current, [key]: next }));
    lastToggled.current = null;
  }

  const facetCount = FACETS.reduce((sum, { key }) => sum + facets[key].size, 0);
  const filtersActive = Boolean(filter.trim()) || facetCount > 0;

  function toggle(accession: string, index: number, range: boolean) {
    // Read the anchor now: React may run the updater after lastToggled is reassigned below.
    const anchor = lastToggled.current;
    setSelected((current) => {
      const next = new Set(current);
      if (range && anchor !== null) {
        const [start, end] = [Math.min(anchor, index), Math.max(anchor, index)];
        const shouldSelect = !current.has(accession);
        visibleRuns.slice(start, end + 1).forEach((run) => (shouldSelect ? next.add(run.accession) : next.delete(run.accession)));
      } else if (next.has(accession)) next.delete(accession);
      else next.add(accession);
      return next;
    });
    lastToggled.current = index;
  }

  function toggleAllVisible() {
    const visible = visibleRuns.map((run) => run.accession);
    const allVisibleSelected = visible.length > 0 && visible.every((accession) => selected.has(accession));
    setSelected((current) => {
      const next = new Set(current);
      visible.forEach((accession) => (allVisibleSelected ? next.delete(accession) : next.add(accession)));
      return next;
    });
  }

  function addToCollection(additions: RunSummary[]) {
    addRuns(additions);
    setSelected(new Set());
  }

  function onSort(key: SortKey) {
    setSort((current) => (current?.key !== key ? { key, direction: key === 'totalBases' || key === 'createdAt' ? 'desc' : 'asc' } : current.direction === 'asc' ? { key, direction: 'desc' } : current.direction === 'desc' && (key === 'totalBases' || key === 'createdAt') ? { key, direction: 'asc' } : null));
  }

  const hasResults = runs.length > 0 || loading || Boolean(activeQuery);
  const closeWorkspace = useCallback(() => setWorkspaceOpen(false), []);

  return (
    <div className="flex min-h-screen flex-col bg-[#f2f6f8] text-[#0b1f33]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#071b2f]/96 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1540px] items-center gap-4 px-4 lg:px-10">
          <a href="/" onClick={(event) => { event.preventDefault(); window.history.pushState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }} className="inline-flex shrink-0 items-center gap-2.5 text-base font-extrabold tracking-[-0.03em]"><img src="/logo.svg" width="30" height="30" alt="" className="size-7 rounded-lg" /><span className="max-sm:hidden">SRA Explorer NG</span></a>
          {hasResults ? <SearchForm compact query={query} loading={loading} onChange={setQuery} onSubmit={() => startSearch(query)} /> : <div className="flex-1" />}
          <nav className="hidden items-center gap-5 text-sm text-slate-300 xl:flex">
            <a href="/docs" className="hover:text-white">Docs</a>
            <a href="/api/v1/openapi.json" className="hover:text-white">API</a>
            <a href="/docs#mcp" className="hover:text-white">MCP</a>
          </nav>
          <button onClick={() => setWorkspaceOpen(true)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#c7f36b] px-3.5 py-2 text-sm font-bold text-[#071b2f] transition hover:bg-[#b5e45a]">
            <ShoppingBasket className="size-4" /> {collection.length}<span className="max-sm:hidden">saved</span>
          </button>
          <ClearSavedButton count={collection.length} onClear={clearRuns} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1540px] flex-1 px-4 py-6 lg:px-10">
        {!hasResults ? <Intro query={query} onChange={setQuery} onSubmit={(term) => startSearch(term)} onOpenCollection={() => setWorkspaceOpen(true)} /> : null}

        {error ? <div role="alert" className="mt-2 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span className="flex-1">{error}</span><button onClick={() => (cursor && runs.length ? void runSearch(activeQuery, cursor) : startSearch(activeQuery || query, false))} className="rounded-md bg-white px-2 py-1 text-xs font-bold">Retry</button></div> : null}

        {hasResults ? (
          <section ref={resultsRef} className="scroll-mt-20" aria-label="Search results">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div className="min-w-0">
                <div className="text-xl font-black tracking-[-.03em]">
                  {loading && !runs.length ? <span className="inline-flex items-center gap-2"><LoaderCircle className="size-5 animate-spin text-[#087f8c]" /> Searching NCBI SRA…</span>
                    : <>{plural(runs.length, 'run')} <span className="font-semibold text-[#607286]">from {loaded.toLocaleString()} of {plural(total, 'SRA record')}</span></>}
                </div>
                {translatedQuery && translatedQuery !== activeQuery ? <div className="mt-0.5 truncate text-xs text-[#607286]" title={translatedQuery}>NCBI query: <code>{translatedQuery}</code></div> : null}
              </div>
            </div>

            {runs.length ? <div className={facetSections.length ? 'lg:grid lg:grid-cols-[270px_minmax(0,1fr)] lg:items-start lg:gap-6' : ''}>
              {facetSections.length ? <FilterSidebar sections={facetSections} selected={facets} active={facetCount} onChange={changeFacet} onReset={() => setFacets(noFacets())} /> : null}
              <div className="min-w-0">
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
                  <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter loaded runs (any field)" className="w-full rounded-xl border border-[#dce6eb] bg-white px-4 py-2 pr-8 text-sm outline-none focus:border-[#087f8c]" />
                  {filter ? <button onClick={() => setFilter('')} aria-label="Clear filter" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#607286]"><X className="size-4" /></button> : null}
                </div>
                {filtersActive ? <button onClick={() => { setFilter(''); setFacets(noFacets()); lastToggled.current = null; }} className="text-xs font-bold text-[#087f8c] hover:underline">Reset filters</button> : null}
                <div className="ml-auto flex items-center gap-2">
                  {filtersActive ? <span className="text-xs text-[#607286]">{visibleRuns.length.toLocaleString()} shown</span> : null}
                  <button disabled={!selected.size} onClick={() => setSelected(new Set())} className="rounded-xl px-3 py-2 text-sm font-bold text-[#607286] hover:bg-white disabled:invisible">Clear selection</button>
                  <button disabled={!selected.size} onClick={() => addToCollection(runs.filter((run) => selected.has(run.accession)))} className="rounded-xl bg-[#c7f36b] px-4 py-2 text-sm font-bold disabled:opacity-40">Add {selected.size ? selected.size.toLocaleString() : ''} to collection</button>
                </div>
              </div>
              <p className="mt-2 text-xs text-[#607286]">Click rows to select; Shift-click selects a range. Hover a run accession to copy it or open it in NCBI/ENA.</p>
              <RunTable runs={visibleRuns} selected={selected} saved={saved} sort={sort} onSort={onSort} onToggle={toggle} onToggleAll={toggleAllVisible} />
              </div>
            </div> : !loading && !error ? <div className="mt-6 rounded-2xl border border-[#dce6eb] bg-white p-8 text-center">
              <div className="font-bold">No SRA records matched “{activeQuery}”.</div>
              <p className="mt-1 text-sm text-[#607286]">Check the accession, or try broader terms. Examples: {EXAMPLES.map((item, index) => <span key={item}>{index ? ', ' : ''}<button onClick={() => startSearch(item)} className="font-mono text-[#087f8c] hover:underline">{item}</button></span>)}</p>
            </div> : null}

            {runs.length ? <div className="flex items-center justify-center py-6">
              {cursor ? <button disabled={loading} onClick={() => void runSearch(activeQuery, cursor)} className="inline-flex items-center gap-2 rounded-xl border border-[#bdd0d8] bg-white px-5 py-3 font-bold shadow-sm hover:border-[#087f8c] disabled:opacity-50">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <ChevronDown className="size-4" />} Load next {Math.min(500, total - loaded).toLocaleString()} records <span className="font-normal text-[#607286]">({(total - loaded).toLocaleString()} remaining)</span></button>
                : <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#087f8c]"><Check className="size-4" /> {total === 1 ? 'The only record is loaded' : `All ${total.toLocaleString()} records loaded`}</div>}
            </div> : null}
          </section>
        ) : null}
      </main>

      <footer className="border-t border-[#dce6eb] px-4 py-4 text-xs text-[#607286] lg:px-10"><div className="mx-auto flex max-w-[1540px] flex-wrap items-center gap-x-5 gap-y-1"><span>Written by Phil Ewels · Modified and maintained by Junhao Chen (2026)</span><a href="https://github.com/ewels/sra-explorer" className="text-[#087f8c]">Original source</a><span>GNU GPL v2</span><a href="/docs" className="text-[#087f8c]">API &amp; MCP docs</a><a href="/privacy" className="text-[#087f8c]">Privacy</a><a href="/terms" className="text-[#087f8c]">Terms</a></div></footer>

      <CollectionWorkspace
        open={workspaceOpen}
        expanded={workspaceExpanded}
        runs={collection}
        onClose={closeWorkspace}
        onToggleSize={() => setWorkspaceExpanded((value) => !value)}
        onReplace={setCollection}
        onRemove={removeRun}
      />
    </div>
  );
}

function SearchForm({ query, loading, compact, onChange, onSubmit }: { query: string; loading: boolean; compact?: boolean; onChange: (value: string) => void; onSubmit: () => void }) {
  return <form role="search" onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className={compact ? 'flex min-w-0 max-w-2xl flex-1 gap-2' : 'mt-3 flex gap-2'}>
    <div className="relative min-w-0 flex-1">
      <input id={compact ? 'query-compact' : 'query'} value={query} onChange={(event) => onChange(event.target.value)} placeholder="Accession (SRR, SRP, PRJNA, GSE…) or search terms" aria-label="Search SRA" className={`w-full rounded-xl border bg-white text-[#0b1f33] outline-none ring-[#c7f36b] focus:ring-4 ${compact ? 'border-transparent px-3 py-1.5 pr-8 text-sm' : 'border-white/15 px-4 py-3 pr-9 text-base'}`} />
      {query ? <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ab0bc] hover:text-[#405563]"><X className="size-4" /></button> : null}
    </div>
    <button disabled={loading || !query.trim()} className={`inline-flex items-center gap-2 rounded-xl bg-[#c7f36b] font-bold text-[#071b2f] disabled:opacity-50 ${compact ? 'px-3 text-sm' : 'px-5'}`}>{loading ? <LoaderCircle className="size-4 animate-spin" /> : <Search className={compact ? 'size-4' : 'size-5'} />}<span className="hidden sm:inline">Search</span></button>
  </form>;
}

function Intro({ query, onChange, onSubmit, onOpenCollection }: { query: string; onChange: (value: string) => void; onSubmit: (term: string) => void; onOpenCollection: () => void }) {
  return <>
    <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#071b2f] via-[#0b3b4c] to-[#087f8c] px-6 py-8 text-white shadow-[0_24px_70px_rgba(7,27,47,.16)] lg:px-12 lg:py-10">
      <h1 className="max-w-3xl text-3xl font-black tracking-[-.04em] sm:text-4xl">Find SRA runs and download FASTQ, SRA, or the original submitted files.</h1>
      <div className="mt-6 max-w-3xl">
        <SearchForm query={query} loading={false} onChange={onChange} onSubmit={() => onSubmit(query)} />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-300">Try: {EXAMPLES.map((item) => <button type="button" key={item} onClick={() => onSubmit(item)} className="rounded-md bg-white/10 px-2 py-1 font-mono text-[#dfff9a] hover:bg-white/20">{item}</button>)}</div>
        <button type="button" onClick={onOpenCollection} className="mt-3 text-sm font-semibold text-slate-200 underline decoration-white/30 underline-offset-4 hover:text-white">Have a list of accessions from a paper? Paste them into a collection →</button>
      </div>
    </section>
    <section aria-labelledby="about-sra-explorer" className="mt-5 grid gap-3 lg:grid-cols-3">
      <h2 id="about-sra-explorer" className="sr-only">NCBI SRA search and sequencing file downloads</h2>
      <article className="rounded-2xl border border-[#dce6eb] bg-white p-5"><h3 className="font-black">1. Search and filter</h3><p className="mt-2 text-sm leading-6 text-[#607286]">Search NCBI SRA by accession or keywords, then tick organisms, library strategies, layouts, or instruments in the sidebar to narrow the loaded runs.</p></article>
      <article className="rounded-2xl border border-[#dce6eb] bg-white p-5"><h3 className="font-black">2. Collect runs</h3><p className="mt-2 text-sm leading-6 text-[#607286]">Add runs to a collection that stays in this browser. Export or import it as JSON to continue elsewhere.</p></article>
      <article className="rounded-2xl border border-[#dce6eb] bg-white p-5"><h3 className="font-black">3. Download reproducibly</h3><p className="mt-2 text-sm leading-6 text-[#607286]">Generate one script for ENA FASTQ, normalized SRA, or Original submitted files (FAST5, POD5, BAM) with MD5 checks, plus metadata tables.</p></article>
    </section>
  </>;
}

const VALUES_SHOWN = 8;

type FacetSection = { key: Facet; label: string; italic?: boolean; format?: (value: string) => string; counts: Array<[string, number]> };

/** All result filters as tick boxes: a sticky sidebar on wide screens, a collapsible panel on phones. */
function FilterSidebar({ sections, selected, active, onChange, onReset }: { sections: FacetSection[]; selected: Record<Facet, Set<string>>; active: number; onChange: (key: Facet, next: Set<string>) => void; onReset: () => void }) {
  const lists = sections.map((section) => <FacetList key={section.key} section={section} selected={selected[section.key]} onChange={(next) => onChange(section.key, next)} />);
  const header = <div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-[#087f8c]" /><span className="text-sm font-black">Filters</span>{active ? <span className="rounded-full bg-[#087f8c] px-1.5 text-[11px] font-bold text-white">{active}</span> : null}{active ? <button onClick={onReset} className="ml-auto text-xs font-bold text-[#087f8c] hover:underline">Reset all</button> : null}</div>;
  return <aside aria-label="Filters" className="mt-4 lg:sticky lg:top-20">
    <div className="hidden lg:block">
      <div className="mb-2">{header}</div>
      <div className="space-y-3 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">{lists}</div>
    </div>
    <details className="rounded-2xl border border-[#dce6eb] bg-white lg:hidden">
      <summary className="cursor-pointer list-none px-4 py-3">{header}</summary>
      <div className="space-y-3 border-t border-[#edf2f4] p-3">{lists}</div>
    </details>
  </aside>;
}

function FacetList({ section, selected, onChange }: { section: FacetSection; selected: Set<string>; onChange: (next: Set<string>) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const show = (value: string) => (value ? section.format?.(value) ?? value : 'Unknown');
  const matching = needle ? section.counts.filter(([value]) => show(value).toLowerCase().includes(needle)) : section.counts;
  // Ticked values stay visible even when they fall outside the first few.
  const listed = expanded || needle ? matching : matching.filter(([value], index) => index < VALUES_SHOWN || selected.has(value));
  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange(next);
  };

  return <section role="group" aria-label={`Filter by ${section.label}`} className="overflow-hidden rounded-2xl border border-[#dce6eb] bg-white">
    <div className="flex items-center gap-2 border-b border-[#edf2f4] px-3 py-2">
      <span className="text-[11px] font-extrabold uppercase tracking-[.1em] text-[#087f8c]">{section.label}</span>
      {selected.size ? <button onClick={() => onChange(new Set())} className="ml-auto text-[11px] font-bold text-[#087f8c] hover:underline">Clear</button> : null}
    </div>
    {section.counts.length > VALUES_SHOWN ? <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Find ${section.label.toLowerCase()}`} aria-label={`Find ${section.label.toLowerCase()}`} className="w-full border-b border-[#edf2f4] px-3 py-1.5 text-sm outline-none" /> : null}
    <ul className="py-1">
      {listed.map(([value, count]) => {
        const active = selected.has(value);
        return <li key={value} className={`group flex items-center gap-2 px-3 py-1 text-sm ${active ? 'bg-[#e8f6f5]' : 'hover:bg-[#f2f6f8]'}`}>
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
            <input type="checkbox" checked={active} onChange={() => toggle(value)} className="accent-[#087f8c]" />
            <span className={`truncate ${section.italic && value ? 'italic' : ''} ${count ? '' : 'text-[#9ab0bc]'}`} title={show(value)}>{show(value)}</span>
          </label>
          <button onClick={() => onChange(new Set([value]))} title={`Show only ${show(value)}`} className="hidden text-[11px] font-bold text-[#087f8c] hover:underline group-hover:inline">only</button>
          <span className="text-xs tabular-nums text-[#607286]">{count.toLocaleString()}</span>
        </li>;
      })}
      {!listed.length ? <li className="px-3 py-1.5 text-xs text-[#9ab0bc]">Nothing matches “{query}”.</li> : null}
    </ul>
    {!needle && matching.length > VALUES_SHOWN ? <button onClick={() => setExpanded((value) => !value)} className="w-full border-t border-[#edf2f4] px-3 py-1.5 text-left text-xs font-bold text-[#087f8c] hover:bg-[#f2f6f8]">{expanded ? 'Show fewer' : `Show all ${matching.length}`}</button> : null}
  </section>;
}
