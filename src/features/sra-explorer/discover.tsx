"use client";

import { BookOpen, Check, ChevronDown, ChevronUp, ExternalLink, FlaskConical, LoaderCircle, Search, ShoppingBasket, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { browserSources } from './browser-sources';
import { ClearSavedButton, CollectionWorkspace } from './collection';
import { extractAccessions } from './core/sources';
import { formatBases, layoutLabel, ncbiRunUrl } from './format';
import { projectOf, projectsForPaper, sampleAnnotations, searchProjects, seqoutProjectUrl, sraStudiesFor, type SeqoutCursor, type SeqoutFilters, type SeqoutProject } from './seqout';
import type { RunAnnotations, RunSummary } from './types';
import { useCollection } from './use-collection';

const EXAMPLES = ['liver cancer scRNA', 'nanopore direct RNA', 'PMID 35670753', 'GSE30567'];
const STRATEGIES = ['RNA-Seq', 'WGS', 'WXS', 'ChIP-Seq', 'ATAC-seq', 'Bisulfite-Seq', 'AMPLICON', 'miRNA-Seq', 'Hi-C', 'Targeted-Capture', 'OTHER'];
const DATABASES: Array<[string, string]> = [['', 'All archives'], ['geo', 'GEO'], ['sra', 'SRA'], ['ena', 'ENA'], ['arrayexpress', 'ArrayExpress'], ['dra', 'DDBJ DRA'], ['gsa', 'GSA (China)']];
const MAX_RUNS_PER_PROJECT = 3000;

type Query =
  | { kind: 'keyword'; text: string }
  | { kind: 'paper'; pmid: string }
  | { kind: 'accessions'; accessions: string[] };

export function classifyQuery(input: string): Query | null {
  const text = input.trim();
  if (!text) return null;
  const pmid = text.match(/^(?:pmid[:\s]*)?(\d{6,9})$/i);
  if (pmid) return { kind: 'paper', pmid: pmid[1] };
  const accessions = extractAccessions(text);
  const leftover = text.replace(/\b(?:[SED]R[RXSP]\d{5,}|PRJ[DEN][AB]\d+|SAM[NED][A-Z]?\d+|GS[EM]\d+)\b/gi, '').replace(/[\s,;]+/g, '');
  if (accessions.length && !leftover) return { kind: 'accessions', accessions: accessions.slice(0, 20) };
  return { kind: 'keyword', text };
}

type Paper = { pmid: string; title: string; journal: string; year: string; ncbiRuns: RunSummary[] };

function readUrl() {
  if (typeof window === 'undefined') return { q: '', filters: {} as SeqoutFilters };
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get('q') || '',
    filters: { organism: params.get('organism') || '', library_strategy: params.get('strategy') || '', db: params.get('db') || '', long_read: params.get('longread') === '1', sortby: (params.get('sort') || '') as SeqoutFilters['sortby'] },
  };
}

function writeUrl(q: string, filters: SeqoutFilters) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (filters.organism) params.set('organism', filters.organism);
  if (filters.library_strategy) params.set('strategy', filters.library_strategy);
  if (filters.db) params.set('db', filters.db);
  if (filters.long_read) params.set('longread', '1');
  if (filters.sortby) params.set('sort', filters.sortby);
  const next = `/discover${params.size ? `?${params}` : ''}`;
  if (next !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, '', next);
}

export function DiscoverPage() {
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState<SeqoutFilters>({});
  const [active, setActive] = useState<Query | null>(null);
  const [projects, setProjects] = useState<SeqoutProject[]>([]);
  const [cursor, setCursor] = useState<SeqoutCursor | null>(null);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);
  const collection = useCollection(() => setWorkspaceOpen(true));
  const requestId = useRef(0);

  const run = useCallback(async (text: string, nextFilters: SeqoutFilters, more: SeqoutCursor | null = null) => {
    const query = classifyQuery(text);
    if (!query) return;
    const id = ++requestId.current;
    setLoading(true); setError('');
    if (!more) { setProjects([]); setCursor(null); setPaper(null); setActive(query); }
    try {
      if (query.kind === 'keyword') {
        const page = await searchProjects(query.text, nextFilters, more);
        if (id !== requestId.current) return;
        setProjects((current) => (more ? [...current, ...page.results] : page.results));
        setCursor(page.nextCursor);
      } else if (query.kind === 'paper') {
        const links = await browserSources.pubmedLinks(query.pmid);
        const found = await projectsForPaper(query.pmid, links.title).catch(() => [] as SeqoutProject[]);
        const known = new Set(found.map((project) => project.accession));
        const fromNcbi = links.projects.filter((accession) => !known.has(accession)).map((accession) => ({ accession, title: `BioProject ${accession} (linked by NCBI)` }));
        if (id !== requestId.current) return;
        setPaper({ pmid: query.pmid, title: links.title, journal: links.journal, year: links.year, ncbiRuns: links.runs });
        setProjects([...found, ...fromNcbi]);
      } else {
        const resolved = await Promise.all(query.accessions.map(async (accession) => {
          const project = /^(GS[EM]|[SED]RP|PRJ)/i.test(accession) && !/^GSM/i.test(accession) ? accession : await projectOf(accession).catch(() => null);
          const target = project || accession;
          const { results } = await searchProjects(target).catch(() => ({ results: [] as SeqoutProject[] }));
          return results.find((item) => item.accession.toUpperCase() === target.toUpperCase()) || { accession: target, title: project ? target : `${accession} (not indexed by seqout)` };
        }));
        if (id !== requestId.current) return;
        setProjects([...new Map(resolved.map((project) => [project.accession, project])).values()]);
      }
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : 'Search failed.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const submit = useCallback((text: string, nextFilters: SeqoutFilters, push = true) => {
    setInput(text);
    setFilters(nextFilters);
    if (push) writeUrl(text.trim(), nextFilters);
    void run(text, nextFilters);
  }, [run]);

  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
    const restore = () => {
      const { q, filters: urlFilters } = readUrl();
      setInput(q); setFilters(urlFilters);
      if (q) void run(q, urlFilters);
      else { requestId.current += 1; setActive(null); setProjects([]); setPaper(null); setLoading(false); }
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [run]);

  const keywordMode = !active || active.kind === 'keyword';

  return (
    <div className="flex min-h-screen flex-col bg-[#f2f6f8] text-[#0b1f33]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#071b2f]/96 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1540px] items-center gap-4 px-4 lg:px-10">
          <a href="/" className="inline-flex shrink-0 items-center gap-2.5 text-base font-extrabold tracking-[-0.03em]"><img src="/logo.svg" width="30" height="30" alt="" className="size-7 rounded-lg" /><span className="max-sm:hidden">SRA Explorer NG</span></a>
          <span className="rounded-full bg-[#c7f36b]/15 px-2.5 py-1 text-xs font-bold text-[#dfff9a]">Discover · beta</span>
          <nav className="ml-auto hidden items-center gap-5 text-sm text-slate-300 md:flex">
            <a href="/" className="hover:text-white">Explorer</a>
            <a href="/docs" className="hover:text-white">Docs</a>
          </nav>
          <button onClick={() => setWorkspaceOpen(true)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#c7f36b] px-3.5 py-2 text-sm font-bold text-[#071b2f] transition hover:bg-[#b5e45a] max-md:ml-auto">
            <ShoppingBasket className="size-4" /> {collection.collection.length}<span className="max-sm:hidden">saved</span>
          </button>
          <ClearSavedButton count={collection.collection.length} onClear={collection.clear} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1540px] flex-1 px-4 py-6 lg:px-10">
        <section className="rounded-[24px] bg-gradient-to-br from-[#071b2f] via-[#0b3b4c] to-[#087f8c] px-6 py-7 text-white lg:px-10">
          <h1 className="text-2xl font-black tracking-[-.03em] sm:text-3xl">Discover datasets, then download them</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Relevance-ranked search across GEO, SRA, ENA, ArrayExpress, DDBJ and GSA by <a href="https://seqout.org" target="_blank" rel="noopener" className="font-semibold text-[#dfff9a] hover:underline">seqout</a>, with sample annotations. Runs and download files always come live from NCBI and ENA.</p>
          <form role="search" onSubmit={(event) => { event.preventDefault(); submit(input, filters); }} className="mt-5 flex max-w-4xl gap-2">
            <div className="relative min-w-0 flex-1">
              <input value={input} onChange={(event) => setInput(event.target.value)} aria-label="Search datasets" placeholder="Keywords, a PubMed ID, or accessions (GSE, SRP, PRJNA, SRR…)" className="w-full rounded-xl bg-white px-4 py-3 pr-9 text-base text-[#0b1f33] outline-none ring-[#c7f36b] focus:ring-4" />
              {input ? <button type="button" onClick={() => setInput('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9ab0bc]"><X className="size-4" /></button> : null}
            </div>
            <button disabled={loading || !input.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#c7f36b] px-5 font-bold text-[#071b2f] disabled:opacity-50">{loading ? <LoaderCircle className="size-5 animate-spin" /> : <Search className="size-5" />}<span className="hidden sm:inline">Search</span></button>
          </form>
          <div className="mt-3 flex max-w-4xl flex-wrap items-center gap-2 text-sm">
            <input value={filters.organism || ''} onChange={(event) => setFilters((current) => ({ ...current, organism: event.target.value }))} placeholder="Organism, e.g. Homo sapiens" aria-label="Organism filter" className="w-52 rounded-lg bg-white/10 px-3 py-1.5 text-white placeholder:text-slate-400 outline-none focus:bg-white/15" />
            <select value={filters.library_strategy || ''} onChange={(event) => setFilters((current) => ({ ...current, library_strategy: event.target.value }))} aria-label="Library strategy filter" className="rounded-lg bg-white/10 px-3 py-1.5 text-white outline-none [&>option]:text-[#0b1f33]"><option value="">Any strategy</option>{STRATEGIES.map((item) => <option key={item}>{item}</option>)}</select>
            <select value={filters.db || ''} onChange={(event) => setFilters((current) => ({ ...current, db: event.target.value }))} aria-label="Archive filter" className="rounded-lg bg-white/10 px-3 py-1.5 text-white outline-none [&>option]:text-[#0b1f33]">{DATABASES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={filters.sortby || ''} onChange={(event) => setFilters((current) => ({ ...current, sortby: event.target.value as SeqoutFilters['sortby'] }))} aria-label="Sort order" className="rounded-lg bg-white/10 px-3 py-1.5 text-white outline-none [&>option]:text-[#0b1f33]"><option value="">Most relevant</option><option value="citations">Most cited</option><option value="year">Newest</option></select>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-slate-200"><input type="checkbox" checked={Boolean(filters.long_read)} onChange={(event) => setFilters((current) => ({ ...current, long_read: event.target.checked }))} className="accent-[#c7f36b]" /> Long-read only</label>
            {!keywordMode ? <span className="text-xs text-slate-400">Filters apply to keyword searches.</span> : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-300">Try: {EXAMPLES.map((item) => <button key={item} type="button" onClick={() => submit(item, filters)} className="rounded-md bg-white/10 px-2 py-1 font-mono text-[#dfff9a] hover:bg-white/20">{item}</button>)}</div>
        </section>

        <p className="mt-3 flex items-start gap-2 text-xs text-[#607286]"><Sparkles className="mt-0.5 size-3.5 shrink-0" /><span>Dataset search and sample annotations (tissue, cell type, disease…) come from <a href="https://seqout.org" target="_blank" rel="noopener" className="font-semibold text-[#087f8c]">seqout</a> by Saket Lab, IIT Bombay. Annotations are extracted by a language model from free-text sample descriptions and can be wrong; check the sample record before relying on them.</span></p>

        {error ? <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} <button onClick={() => void run(input, filters)} className="ml-2 font-bold underline">Retry</button></div> : null}

        {paper ? <PaperHeader paper={paper} found={projects.length} /> : null}
        {paper?.ncbiRuns.length ? <section className="mt-4 rounded-2xl border border-[#dce6eb] bg-white p-4"><h2 className="font-black">Runs NCBI links to this paper</h2><RunsTable runs={paper.ncbiRuns} saved={collection.saved} onAdd={collection.add} /></section> : null}

        <section aria-label="Datasets" className="mt-5 space-y-3">
          {projects.map((project) => <ProjectCard key={project.accession} project={project} saved={collection.saved} onAdd={collection.add} defaultOpen={active?.kind === 'accessions' && projects.length === 1} />)}
          {loading ? <div className="flex items-center gap-2 py-6 text-sm text-[#607286]"><LoaderCircle className="size-4 animate-spin" /> {active?.kind === 'paper' ? 'Looking up the paper in PubMed and seqout…' : 'Searching seqout…'}</div> : null}
          {!loading && active && !projects.length && !paper?.ncbiRuns.length && !error ? <div className="rounded-2xl border border-[#dce6eb] bg-white p-8 text-center text-sm text-[#607286]">No datasets found. {active.kind === 'keyword' ? 'Try fewer or broader keywords, or remove filters.' : active.kind === 'paper' ? 'Neither NCBI nor seqout links sequencing data to this paper.' : ''}</div> : null}
          {cursor && !loading && active?.kind === 'keyword' ? <div className="flex justify-center py-4"><button onClick={() => void run(input, filters, cursor)} className="inline-flex items-center gap-2 rounded-xl border border-[#bdd0d8] bg-white px-5 py-3 font-bold shadow-sm hover:border-[#087f8c]"><ChevronDown className="size-4" /> More datasets</button></div> : null}
        </section>
      </main>

      <footer className="border-t border-[#dce6eb] px-4 py-4 text-xs text-[#607286] lg:px-10"><div className="mx-auto flex max-w-[1540px] flex-wrap items-center gap-x-5 gap-y-1"><span>SRA Explorer NG · Discover (beta)</span><span>Search and annotations: <a href="https://seqout.org" className="text-[#087f8c]">seqout.org</a> (Saket Lab, IIT Bombay)</span><span>Runs and files: NCBI SRA and EMBL-EBI ENA</span><a href="/" className="text-[#087f8c]">Back to Explorer</a></div></footer>

      <CollectionWorkspace open={workspaceOpen} expanded={workspaceExpanded} runs={collection.collection} onClose={() => setWorkspaceOpen(false)} onToggleSize={() => setWorkspaceExpanded((value) => !value)} onReplace={collection.replace} onRemove={collection.remove} />
    </div>
  );
}

function PaperHeader({ paper, found }: { paper: Paper; found: number }) {
  return <section className="mt-5 rounded-2xl border border-[#b9dddd] bg-[#e8f6f5] p-4 text-sm text-[#07535b]">
    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><BookOpen className="size-4" /> PubMed {paper.pmid}</div>
    <a href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`} target="_blank" rel="noopener" className="mt-1 block text-base font-black text-[#071b2f] hover:underline">{paper.title}</a>
    <div className="mt-0.5">{[paper.journal, paper.year].filter(Boolean).join(' · ')} — {found} dataset{found === 1 ? '' : 's'}{paper.ncbiRuns.length ? ` and ${paper.ncbiRuns.length} runs linked by NCBI` : ''}</div>
  </section>;
}

function ProjectCard({ project, saved, onAdd, defaultOpen }: { project: SeqoutProject; saved: Set<string>; onAdd: (runs: RunSummary[]) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [expandedSummary, setExpandedSummary] = useState(false);
  const paper = project.publications?.[0];
  const year = (project.updated_at || '').slice(0, 4);
  return <article className="overflow-hidden rounded-2xl border border-[#dce6eb] bg-white shadow-[0_6px_20px_rgba(7,27,47,.04)]">
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {project.source ? <span className="rounded-full bg-[#071b2f] px-2 py-0.5 font-black uppercase tracking-wider text-white">{project.source}</span> : null}
        <span className="font-mono font-bold text-[#087f8c]">{project.accession}</span>
        {year ? <span className="text-[#607286]">updated {year}</span> : null}
        <a href={seqoutProjectUrl(project.accession)} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 font-bold text-[#087f8c] hover:underline">seqout <ExternalLink className="size-3" /></a>
      </div>
      <h2 className="mt-1.5 text-base font-black leading-6">{project.title}</h2>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#405563]">
        {project.organisms?.length ? <span className="italic">{project.organisms.slice(0, 3).join(', ')}</span> : null}
        {project.library_strategies?.length ? <span>{project.library_strategies.slice(0, 3).join(', ')}</span> : null}
        {project.instrument_models?.length ? <span>{project.instrument_models.slice(0, 2).join(', ')}{project.instrument_models.length > 2 ? '…' : ''}</span> : null}
      </div>
      {project.summary ? <p className={`mt-2 text-sm leading-6 text-[#405563] ${expandedSummary ? '' : 'line-clamp-2'}`}>{project.summary} {project.summary.length > 220 ? <button onClick={() => setExpandedSummary((value) => !value)} className="font-bold text-[#087f8c]">{expandedSummary ? 'less' : 'more'}</button> : null}</p> : null}
      {paper?.title ? <div className="mt-2 flex items-start gap-2 rounded-xl bg-[#f2f6f8] px-3 py-2 text-xs text-[#405563]"><BookOpen className="mt-0.5 size-3.5 shrink-0 text-[#087f8c]" /><span><a href={paper.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/` : paper.doi ? `https://doi.org/${paper.doi}` : '#'} target="_blank" rel="noopener" className="font-semibold text-[#071b2f] hover:underline">{paper.title}</a> {[paper.journal, paper.pub_date?.slice(0, 4)].filter(Boolean).join(' · ')}{typeof paper.citation_count === 'number' ? ` · ${paper.citation_count} citations` : ''} <span className="text-[#9ab0bc]" title="Paper-to-dataset links come from seqout and are occasionally wrong">· linked by seqout</span></span></div> : null}
      <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#c7f36b] px-3 py-2 text-xs font-black text-[#071b2f] hover:bg-[#b5e45a]">{open ? <ChevronUp className="size-4" /> : <FlaskConical className="size-4" />} {open ? 'Hide runs' : 'Show runs & sample annotations'}</button>
    </div>
    {open ? <ProjectRuns accession={project.accession} saved={saved} onAdd={onAdd} /> : null}
  </article>;
}

type LoadState = { phase: 'studies' | 'runs' | 'done'; studies: string[]; runs: RunSummary[]; truncated: boolean; error: string; annotationNote: string };

function ProjectRuns({ accession, saved, onAdd }: { accession: string; saved: Set<string>; onAdd: (runs: RunSummary[]) => void }) {
  const [state, setState] = useState<LoadState>({ phase: 'studies', studies: [], runs: [], truncated: false, error: '', annotationNote: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const studies = await sraStudiesFor(accession).catch(() => [] as string[]);
        if (cancelled) return;
        setState((current) => ({ ...current, phase: 'runs', studies }));
        if (!studies.length) { setState((current) => ({ ...current, phase: 'done' })); return; }
        const runs: RunSummary[] = [];
        let truncated = false;
        for (const study of studies) {
          let cursor = await browserSources.startSearch(study);
          while (true) {
            const page = await browserSources.nextPage(cursor);
            runs.push(...page.results);
            if (cancelled) return;
            setState((current) => ({ ...current, runs: [...runs] }));
            if (!page.cursor || page.cursor.nextStart >= page.cursor.total) break;
            if (runs.length >= MAX_RUNS_PER_PROJECT) { truncated = true; break; }
            cursor = page.cursor;
          }
        }
        // Attach seqout annotations by SRA sample accession; their absence is not an error.
        const runStudies = [...new Set(runs.map((run) => run.study).filter((item): item is string => Boolean(item)))];
        const annotations = await Promise.all(runStudies.map((study) => sampleAnnotations(study).catch(() => null)));
        const bySample = new Map(annotations.flatMap((map) => (map ? [...map.entries()] : [])));
        const annotated = runs.map((run) => {
          const found = run.sample ? bySample.get(run.sample) : undefined;
          if (!found) return run;
          const { sample: _sample, title, ...fields } = found;
          const clean = Object.fromEntries(Object.entries({ sample_title: title, ...fields }).filter(([, value]) => value)) as RunAnnotations;
          return { ...run, annotations: clean };
        });
        const missing = annotations.some((map) => map === null);
        const matched = annotated.filter((run) => run.annotations).length;
        if (!cancelled) setState((current) => ({ ...current, phase: 'done', runs: annotated, truncated, annotationNote: missing ? 'seqout annotations could not be loaded for some studies.' : !matched ? 'seqout has no sample annotations for these runs.' : '' }));
      } catch (cause) {
        if (!cancelled) setState((current) => ({ ...current, phase: 'done', error: cause instanceof Error ? cause.message : 'Could not load runs from NCBI.' }));
      }
    })();
    return () => { cancelled = true; };
  }, [accession]);

  return <div className="border-t border-[#edf2f4] bg-[#f8fafb] p-4">
    {state.phase !== 'done' ? <div className="flex items-center gap-2 text-sm text-[#607286]"><LoaderCircle className="size-4 animate-spin" /> {state.phase === 'studies' ? 'Finding the SRA study…' : `Loading runs from NCBI (${state.runs.length.toLocaleString()} so far)…`}</div> : null}
    {state.error ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</div> : null}
    {state.phase === 'done' && !state.studies.length ? <div className="text-sm text-[#607286]">No SRA/ENA/DDBJ reads are linked to {accession}. It may be microarray or processed-only data, or stored only in GSA. <a href={seqoutProjectUrl(accession)} target="_blank" rel="noopener" className="font-bold text-[#087f8c]">Open on seqout</a>.</div> : null}
    {state.runs.length ? <>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#607286]">
        <span>SRA {state.studies.join(', ')} · {state.runs.length.toLocaleString()} runs{state.truncated ? ` (first ${MAX_RUNS_PER_PROJECT.toLocaleString()} shown)` : ''}</span>
        {state.studies.map((study) => <a key={study} href={`/?q=${encodeURIComponent(study)}`} className="font-bold text-[#087f8c] hover:underline">Open {study} in Explorer</a>)}
      </div>
      {state.annotationNote ? <div className="mb-2 text-xs text-[#9a5b00]">{state.annotationNote}</div> : null}
      <RunsTable runs={state.runs} saved={saved} onAdd={onAdd} />
    </> : null}
  </div>;
}

const ANNOTATION_FACETS: Array<{ key: keyof RunAnnotations; label: string }> = [
  { key: 'tissue', label: 'Tissue' },
  { key: 'cell_type', label: 'Cell type' },
  { key: 'disease', label: 'Disease' },
  { key: 'treatment', label: 'Treatment' },
];

function RunsTable({ runs, saved, onAdd }: { runs: RunSummary[]; saved: Set<string>; onAdd: (runs: RunSummary[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [facets, setFacets] = useState<Partial<Record<keyof RunAnnotations, string>>>({});
  const anchor = useRef<number | null>(null);

  const facetOptions = useMemo(() => ANNOTATION_FACETS.map(({ key, label }) => {
    const counts = new Map<string, number>();
    runs.forEach((run) => { const value = run.annotations?.[key]; if (value) counts.set(value, (counts.get(value) || 0) + 1); });
    return { key, label, options: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
  }).filter((facet) => facet.options.length), [runs]);
  const columns = facetOptions.map((facet) => facet.key);
  const showSexAge = runs.some((run) => run.annotations?.sex || run.annotations?.age);
  const visible = useMemo(() => runs.filter((run) => Object.entries(facets).every(([key, value]) => !value || run.annotations?.[key as keyof RunAnnotations] === value)), [runs, facets]);

  function toggle(accession: string, index: number, range: boolean) {
    const start = anchor.current;
    setSelected((current) => {
      const next = new Set(current);
      if (range && start !== null) {
        const shouldSelect = !current.has(accession);
        visible.slice(Math.min(start, index), Math.max(start, index) + 1).forEach((run) => (shouldSelect ? next.add(run.accession) : next.delete(run.accession)));
      } else if (next.has(accession)) next.delete(accession);
      else next.add(accession);
      return next;
    });
    anchor.current = index;
  }

  const allSelected = visible.length > 0 && visible.every((run) => selected.has(run.accession));
  return <div>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {facetOptions.map(({ key, label, options }) => <select key={key} value={facets[key] || ''} onChange={(event) => { setFacets((current) => ({ ...current, [key]: event.target.value })); anchor.current = null; }} aria-label={`Filter by ${label}`} className={`max-w-[220px] rounded-lg border bg-white px-2 py-1.5 text-xs outline-none ${facets[key] ? 'border-[#087f8c] font-bold' : 'border-[#dce6eb]'}`}><option value="">{label}: all</option>{options.map(([value, count]) => <option key={value} value={value}>{value} ({count})</option>)}</select>)}
      {Object.values(facets).some(Boolean) ? <button onClick={() => setFacets({})} className="text-xs font-bold text-[#087f8c]">Reset</button> : null}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-[#607286]">{visible.length.toLocaleString()} shown</span>
        <button onClick={() => { onAdd(visible); setSelected(new Set()); }} className="rounded-lg border border-[#bdd0d8] bg-white px-3 py-1.5 text-xs font-black hover:border-[#087f8c]">Add all {visible.length.toLocaleString()} shown</button>
        <button disabled={!selected.size} onClick={() => { onAdd(runs.filter((run) => selected.has(run.accession))); setSelected(new Set()); }} className="rounded-lg bg-[#c7f36b] px-3 py-1.5 text-xs font-black disabled:opacity-40">Add {selected.size || ''} selected</button>
      </div>
    </div>
    <div className="max-h-[480px] overflow-auto rounded-xl border border-[#dce6eb] bg-white">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="sticky top-0 bg-[#f8fafb] text-[10px] font-extrabold uppercase tracking-[.08em] text-[#087f8c]">
          <tr>
            <th className="w-9 px-3 py-2"><input type="checkbox" aria-label="Select all shown runs" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((run) => run.accession)))} className="accent-[#087f8c]" /></th>
            <th className="px-2 py-2">Run</th><th className="px-2 py-2">Sample</th>
            {columns.map((key) => <th key={key} className="px-2 py-2">{ANNOTATION_FACETS.find((facet) => facet.key === key)?.label}<AiTag /></th>)}
            {showSexAge ? <th className="px-2 py-2">Sex / age<AiTag /></th> : null}
            <th className="px-2 py-2">Layout</th><th className="px-2 py-2">Bases</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((run, index) => {
            const active = selected.has(run.accession);
            return <tr key={run.accession} aria-selected={active} onMouseDown={(event) => { if (event.shiftKey) event.preventDefault(); }} onClick={(event) => { if ((event.target as HTMLElement).closest('a,input')) return; toggle(run.accession, index, event.shiftKey); }} className={`cursor-pointer border-t border-[#edf2f4] ${active ? 'bg-[#e4f4df]' : 'hover:bg-[#eef8f7]'}`}>
              <td className="px-3 py-1.5"><input type="checkbox" checked={active} aria-label={`Select ${run.accession}`} onChange={(event) => toggle(run.accession, index, (event.nativeEvent as MouseEvent).shiftKey)} className="accent-[#087f8c]" /></td>
              <td className="whitespace-nowrap px-2 py-1.5 font-mono"><a href={ncbiRunUrl(run.accession)} target="_blank" rel="noopener" className="text-[#087f8c] hover:underline">{run.accession}</a>{saved.has(run.accession) ? <Check className="ml-1 inline size-3 text-[#4d7c0f]" aria-label="In collection" /> : null}</td>
              <td className="max-w-[320px] truncate px-2 py-1.5" title={run.annotations?.sample_title || run.title}>{run.annotations?.sample_title || run.title}</td>
              {columns.map((key) => <td key={key} className="max-w-[180px] truncate px-2 py-1.5" title={run.annotations?.[key]}>{run.annotations?.[key] || <span className="text-[#c2ced5]">—</span>}</td>)}
              {showSexAge ? <td className="whitespace-nowrap px-2 py-1.5">{[run.annotations?.sex, run.annotations?.age].filter(Boolean).join(' · ') || <span className="text-[#c2ced5]">—</span>}</td> : null}
              <td className="px-2 py-1.5">{layoutLabel(run.layout)}</td>
              <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{formatBases(run.totalBases)}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>;
}

function AiTag() {
  return <span title="Extracted by a language model (seqout); may be wrong" className="ml-1 rounded bg-[#fff1c7] px-1 py-px text-[9px] font-black tracking-normal text-[#72530a]">AI</span>;
}
