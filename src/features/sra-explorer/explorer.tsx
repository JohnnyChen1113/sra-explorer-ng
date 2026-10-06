"use client";

import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  Clipboard,
  ExternalLink,
  FileDown,
  FileArchive,
  Github,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Search,
  ShoppingBasket,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { DownloadFile, RunFilesResponse, RunSummary, SearchResponse } from './types';

const tools = [
  { name: 'Kingfisher', href: 'https://github.com/wwood/kingfisher-download', capabilities: 'FASTQ · SRA · ENA/AWS/GCP', command: (acc: string) => `kingfisher get -r ${acc} -m ena-ascp ena-ftp aws-http prefetch` },
  { name: 'iSeq', href: 'https://github.com/BioOmics/iSeq', capabilities: 'FASTQ · SRA · GSA/SRA/ENA/DDBJ', command: (acc: string) => `iseq -i ${acc} -g -r https` },
  { name: 'fastq-dl', href: 'https://github.com/rpetit3/fastq-dl', capabilities: 'FASTQ · ENA/SRA fallback', command: (acc: string) => `fastq-dl --accession ${acc} --provider ena --outdir .` },
  { name: 'SRA Toolkit', href: 'https://github.com/ncbi/sra-tools', capabilities: 'SRA · FASTQ conversion', command: (acc: string) => `prefetch ${acc}\nfasterq-dump --split-files --include-technical ${acc}` },
  { name: 'enaBrowserTools', href: 'https://github.com/enasequence/enaBrowserTools', capabilities: 'ENA submitted · FASTQ · SRA', command: (acc: string) => `enaDataGet -f submitted ${acc}` },
];

function formatBases(value: number) {
  return value ? `${Math.round(value / 1_000_000).toLocaleString()} Mb` : '—';
}

function formatBytes(value: number | null) {
  if (!value) return 'Size unavailable';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function dedupeRuns(existing: RunSummary[], incoming: RunSummary[]) {
  const map = new Map(existing.map((run) => [run.accession, run]));
  incoming.forEach((run) => map.set(run.accession, run));
  return [...map.values()];
}

export function ExplorerPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collection, setCollection] = useState<RunSummary[]>([]);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sra-explorer-collection') || '[]');
      if (Array.isArray(saved)) setCollection(saved);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('sra-explorer-collection', JSON.stringify(collection));
  }, [collection]);

  async function fetchBatch(nextCursor?: string | null) {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (nextCursor) params.set('cursor', nextCursor);
      else params.set('q', query.trim());
      const response = await fetch(`/api/v1/search?${params}`);
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as SearchResponse;
      setRuns((current) => (nextCursor ? dedupeRuns(current, data.results) : data.results));
      setTotal(data.total);
      setLoaded(data.loaded);
      setCursor(data.nextCursor);
      if (!nextCursor && data.query !== query) setQuery(data.query);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setRuns([]);
    setSelected(new Set());
    setCursor(null);
    void fetchBatch(null);
  }

  const filteredRuns = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter((run) => `${run.accession} ${run.title} ${run.platform}`.toLowerCase().includes(needle));
  }, [filter, runs]);

  function toggle(accession: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(accession)) next.delete(accession);
      else next.add(accession);
      return next;
    });
  }

  function toggleAllVisible() {
    const visible = filteredRuns.map((run) => run.accession);
    const allVisibleSelected = visible.length > 0 && visible.every((accession) => selected.has(accession));
    setSelected((current) => {
      const next = new Set(current);
      visible.forEach((accession) => allVisibleSelected ? next.delete(accession) : next.add(accession));
      return next;
    });
  }

  function addSelected() {
    const additions = runs.filter((run) => selected.has(run.accession));
    setCollection((current) => dedupeRuns(current, additions));
    setSelected(new Set());
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f2f6f8] text-[#0b1f33]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#071b2f]/96 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1540px] items-center px-6 lg:px-10">
          <a href="/" className="inline-flex items-center gap-2.5 text-lg font-extrabold tracking-[-0.03em]"><img src="/logo.svg" width="34" height="34" alt="" className="size-8 rounded-lg" />SRA Explorer NG</a>
          <nav className="ml-10 hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="/docs" className="hover:text-white">Docs</a>
            <a href="/api/v1/openapi.json" className="hover:text-white">API</a>
            <a href="/mcp" className="hover:text-white">MCP</a>
          </nav>
          <button onClick={() => setWorkspaceOpen(true)} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-[#c7f36b] px-4 py-2 text-sm font-bold text-[#071b2f] transition hover:bg-[#b5e45a]">
            <ShoppingBasket className="size-4" /> {collection.length} saved
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1540px] flex-1 px-6 py-8 lg:px-10">
        <section className="relative grid overflow-hidden rounded-[28px] bg-gradient-to-br from-[#071b2f] via-[#0b3b4c] to-[#087f8c] p-8 text-white shadow-[0_24px_70px_rgba(7,27,47,.16)] lg:grid-cols-[.8fr_1.2fr] lg:gap-16 lg:p-14">
          <div className="relative z-10">
            <div className="mb-5 inline-flex rounded-full border border-[#c7f36b]/30 bg-[#c7f36b]/10 px-3 py-1 text-xs font-bold uppercase tracking-[.15em] text-[#dfff9a]">Sequence data access</div>
            <h1 className="max-w-xl text-5xl font-black tracking-[-.06em] sm:text-6xl">Go back to the source.</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">Search SRA in deliberate batches of 500. Compare FASTQ, normalized SRA and instrument-native Original submissions without losing the distinction.</p>
          </div>
          <form onSubmit={submit} className="relative z-10 mt-8 rounded-2xl border border-white/15 bg-white/8 p-5 shadow-inner lg:mt-0 lg:p-7">
            <label htmlFor="query" className="text-xs font-bold uppercase tracking-[.14em] text-slate-300">Accession, project or search terms</label>
            <div className="mt-3 flex gap-2">
              <input id="query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try SRR12881185 or PRJNA517295" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white px-4 py-3 text-base text-[#0b1f33] outline-none ring-[#c7f36b] focus:ring-4" />
              <button disabled={loading || !query.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#c7f36b] px-5 font-bold text-[#071b2f] disabled:opacity-50"><Search className="size-5" /><span className="hidden sm:inline">Search</span></button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-300">Examples: {['SRR12881185', 'PRJNA517295', 'human liver miRNA'].map((item) => <button type="button" key={item} onClick={() => setQuery(item)} className="rounded-md bg-white/10 px-2 py-1 font-mono text-[#dfff9a] hover:bg-white/15">{item}</button>)}</div>
          </form>
        </section>

        <section aria-labelledby="about-sra-explorer" className="mt-6 grid gap-3 lg:grid-cols-3">
          <h2 id="about-sra-explorer" className="sr-only">NCBI SRA search and sequencing file downloads</h2>
          <article className="rounded-2xl border border-[#dce6eb] bg-white p-5"><h3 className="font-black">Find the correct representation</h3><p className="mt-2 text-sm leading-6 text-[#607286]">Search NCBI SRA, then distinguish ENA FASTQ, normalized SRA, and the submitter's Original files instead of treating them as equivalent.</p></article>
          <article className="rounded-2xl border border-[#dce6eb] bg-white p-5"><h3 className="font-black">Recover raw sequencing signal</h3><p className="mt-2 text-sm leading-6 text-[#607286]">Discover instrument-native FAST5, POD5, BAM, and other Original submitted files when NCBI makes them available for a run.</p></article>
          <article className="rounded-2xl border border-[#dce6eb] bg-white p-5"><h3 className="font-black">Batch download reproducibly</h3><p className="mt-2 text-sm leading-6 text-[#607286]">Build collection-level curl, axel, fastq-dl, Kingfisher, MD5, metadata, API, and MCP workflows without downloading runs one by one.</p></article>
        </section>

        {error ? <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        {runs.length > 0 || loading ? (
          <section className="mt-8">
            <div className="flex flex-col gap-4 border-b border-[#dce6eb] pb-5 lg:flex-row lg:items-end">
              <div>
                <div className="text-sm font-semibold text-[#607286]">NCBI search progress</div>
                <div className="mt-1 text-2xl font-black tracking-[-.04em]">{loaded.toLocaleString()} / {total.toLocaleString()} records loaded</div>
              </div>
              <div className="lg:ml-auto"><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter loaded results" className="w-full rounded-xl border border-[#dce6eb] bg-white px-4 py-2.5 outline-none focus:border-[#087f8c] lg:w-72" /></div>
              <button disabled={!selected.size} onClick={addSelected} className="rounded-xl bg-[#c7f36b] px-4 py-2.5 text-sm font-bold disabled:opacity-40">Add {selected.size || ''} to collection</button>
            </div>
            <RunTable runs={filteredRuns} selected={selected} onToggle={toggle} onToggleAll={toggleAllVisible} />
            <div className="flex items-center justify-center py-8">
              {cursor ? <button disabled={loading} onClick={() => void fetchBatch(cursor)} className="inline-flex items-center gap-2 rounded-xl border border-[#bdd0d8] bg-white px-5 py-3 font-bold shadow-sm hover:border-[#087f8c] disabled:opacity-50">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <ChevronDown className="size-4" />} Load next 500</button> : !loading ? <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#087f8c]"><Check className="size-4" /> All {total.toLocaleString()} records loaded</div> : null}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-[#dce6eb] px-6 py-4 text-xs text-[#607286] lg:px-10"><div className="mx-auto flex max-w-[1540px] flex-wrap items-center gap-x-5 gap-y-1"><span>Written by Phil Ewels · Modified and maintained by Junhao Chen (2026)</span><a href="https://github.com/ewels/sra-explorer" className="text-[#087f8c]">Original source</a><span>GNU GPL v2</span></div></footer>

      <CollectionWorkspace open={workspaceOpen} expanded={workspaceExpanded} runs={collection} onClose={() => setWorkspaceOpen(false)} onToggleSize={() => setWorkspaceExpanded((value) => !value)} onClear={() => setCollection([])} onRemove={(accession) => setCollection((current) => current.filter((run) => run.accession !== accession))} />
    </div>
  );
}

function RunTable({ runs, selected, onToggle, onToggleAll }: { runs: RunSummary[]; selected: Set<string>; onToggle: (accession: string) => void; onToggleAll: () => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: runs.length, getScrollElement: () => parentRef.current, estimateSize: () => 58, overscan: 12 });
  const selectedVisible = runs.reduce((count, run) => count + Number(selected.has(run.accession)), 0);
  const allSelected = runs.length > 0 && selectedVisible === runs.length;
  const partiallySelected = selectedVisible > 0 && !allSelected;
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-[#dce6eb] bg-white shadow-[0_10px_30px_rgba(7,27,47,.05)]">
      <div className="grid grid-cols-[42px_minmax(260px,1.6fr)_170px_180px_140px_130px] items-center border-b border-[#dce6eb] bg-[#f8fafb] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[.1em] text-[#087f8c]">
        <button type="button" onClick={onToggleAll} disabled={!runs.length} className={`grid size-4 place-items-center rounded border transition disabled:opacity-40 ${allSelected || partiallySelected ? 'border-[#087f8c] bg-[#087f8c] text-white' : 'border-[#9ab0bc] bg-white'}`} title={allSelected ? 'Clear all visible results' : 'Select all visible results'} aria-label={allSelected ? 'Clear all visible results' : 'Select all visible results'} aria-checked={partiallySelected ? 'mixed' : allSelected} role="checkbox">{allSelected ? <Check className="size-3" /> : partiallySelected ? <span className="h-0.5 w-2 rounded bg-white" /> : null}</button><span>Title</span><span>Accession</span><span>Instrument</span><span>Total bases</span><span>Created</span>
      </div>
      <div ref={parentRef} className="h-[560px] overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const run = runs[item.index];
            const active = selected.has(run.accession);
            return <button type="button" key={run.accession} onClick={() => onToggle(run.accession)} className={`absolute left-0 grid w-full grid-cols-[42px_minmax(260px,1.6fr)_170px_180px_140px_130px] items-center border-b border-[#edf2f4] px-4 text-left text-sm hover:bg-[#eef8f7] ${active ? 'bg-[#e4f4df]' : 'bg-white'}`} style={{ height: item.size, transform: `translateY(${item.start}px)` }}>
              <span><span className={`grid size-4 place-items-center rounded border ${active ? 'border-[#087f8c] bg-[#087f8c] text-white' : 'border-[#bdd0d8]'}`}>{active ? <Check className="size-3" /> : null}</span></span>
              <span className="truncate pr-5 font-medium">{run.title}</span><span className="font-mono text-[#087f8c]">{run.accession}</span><span className="truncate pr-4">{run.platform}</span><span>{formatBases(run.totalBases)}</span><span>{run.createdAt ? new Date(run.createdAt).toLocaleDateString() : '—'}</span>
            </button>;
          })}
        </div>
      </div>
    </div>
  );
}

function CollectionWorkspace({ open, expanded, runs, onClose, onToggleSize, onClear, onRemove }: { open: boolean; expanded: boolean; runs: RunSummary[]; onClose: () => void; onToggleSize: () => void; onClear: () => void; onRemove: (accession: string) => void }) {
  const [files, setFiles] = useState<DownloadFile[]>([]);
  const [checked, setChecked] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'fastq' | 'sra' | 'originals' | 'metadata' | 'tools'>('fastq');

  useEffect(() => {
    if (!open || !runs.length) return;
    let cancelled = false;
    async function loadCollection() {
      setLoading(true); setError(''); setFiles([]); setChecked(0);
      const all: DownloadFile[] = [];
      try {
        for (let offset = 0; offset < runs.length; offset += 20) {
          const accessions = runs.slice(offset, offset + 20).map((run) => run.accession);
          const response = await fetch('/api/v1/files/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessions }) });
          if (!response.ok) throw new Error(await response.text());
          const data = await response.json() as { results: RunFilesResponse[] };
          all.push(...data.results.flatMap((result) => result.files));
          if (cancelled) return;
          setFiles([...all]); setChecked(Math.min(offset + 20, runs.length));
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Collection lookup failed.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    void loadCollection();
    return () => { cancelled = true; };
  }, [open, runs]);
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;

  function exportCollection() {
    const blob = new Blob([JSON.stringify(runs, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'sra-explorer-collection.json'; link.click(); URL.revokeObjectURL(link.href);
  }

  return <div className="fixed inset-0 z-50 bg-[#04121f]/45 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className={`absolute inset-y-0 right-0 flex flex-col bg-[#f2f6f8] shadow-[-30px_0_80px_rgba(4,18,31,.25)] transition-[width] duration-200 ${expanded ? 'w-[80vw]' : 'w-[52vw]'} max-md:w-full`}>
      <header className="flex h-18 items-center gap-3 border-b border-[#dce6eb] bg-white px-5">
        <div><div className="text-xl font-black tracking-[-.04em]">Collection</div><div className="text-xs text-[#607286]">{runs.length} saved runs</div></div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportCollection} disabled={!runs.length} className="rounded-lg border border-[#dce6eb] p-2 hover:bg-[#f2f6f8] disabled:opacity-40" title="Export JSON"><ArrowDownToLine className="size-4" /></button>
          <button onClick={onToggleSize} className="rounded-lg border border-[#dce6eb] p-2 hover:bg-[#f2f6f8]" title={expanded ? 'Shrink to half width' : 'Expand to 80%'}>{expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>
          <button onClick={onClear} disabled={!runs.length} className="rounded-lg border border-[#dce6eb] px-3 py-2 text-xs font-bold hover:bg-[#f2f6f8] disabled:opacity-40">Clear</button>
          <button onClick={onClose} className="rounded-lg bg-[#c7f36b] p-2"><X className="size-4" /></button>
        </div>
      </header>
      {runs.length ? <div className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-7">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#dce6eb] pb-4">
          {([['fastq', 'FastQ Downloads'], ['sra', 'SRA Downloads'], ['originals', 'Original Submitted Files'], ['metadata', 'Full Metadata'], ['tools', 'Download Tools']] as const).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === value ? 'bg-[#071b2f] text-white' : 'text-[#607286] hover:bg-white'}`}>{label}</button>)}
        </div>
        {loading ? <div className="mt-5 flex items-center gap-2 text-sm text-[#607286]"><LoaderCircle className="size-4 animate-spin" /> Loading files for {checked} / {runs.length} runs…</div> : null}
        {error ? <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
        {tab === 'fastq' ? <BulkFileDownloads representation="fastq" files={files} runs={runs} checked={checked} /> : tab === 'sra' ? <BulkFileDownloads representation="sra" files={files} runs={runs} checked={checked} /> : tab === 'originals' ? <BulkFileDownloads representation="original" files={files} runs={runs} checked={checked} /> : tab === 'metadata' ? <FullMetadata runs={runs} files={files} /> : <BulkToolDetails runs={runs} />}
      </div> : <div className="grid flex-1 place-items-center text-center"><div><ShoppingBasket className="mx-auto size-10 text-[#9ab0bc]" /><div className="mt-4 font-bold">No saved runs yet</div><p className="mt-1 text-sm text-[#607286]">Select search results and add them to the collection.</p></div></div>}
    </aside>
  </div>;
}

function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function cleanTitle(title: string) {
  return title.replace(/[^a-z0-9._-]/gi, '_').replace(/_+/g, '_');
}

function niceFilename(file: DownloadFile, runs: RunSummary[]) {
  const run = runs.find((item) => item.accession === file.accession);
  if (!run) return file.filename;
  const suffix = file.filename.startsWith(file.accession) ? file.filename.slice(file.accession.length) : `_${file.filename}`;
  return `${file.accession}_${cleanTitle(run.title)}${suffix}`;
}

function BulkFileDownloads({ representation, files, runs, checked }: { representation: DownloadFile['representation']; files: DownloadFile[]; runs: RunSummary[]; checked: number }) {
  const [copied, setCopied] = useState('');
  const [rename, setRename] = useState(representation !== 'original');
  const [verifyMd5, setVerifyMd5] = useState(true);
  const [method, setMethod] = useState<'curl' | 'axel' | 'fastq-dl' | 'kingfisher'>('curl');
  const [showManifest, setShowManifest] = useState(false);
  const runCount = runs.length;
  const selectedFiles = files.filter((file) => file.representation === representation);
  const labels = representation === 'fastq' ? { title: 'FastQ Downloads', stem: 'fastq-files', directory: 'fastq-files' } : representation === 'sra' ? { title: 'SRA Downloads', stem: 'sra-files', directory: 'sra-files' } : { title: 'Original Submitted Files', stem: 'original-files', directory: 'original-submitted-files' };
  const urls = selectedFiles.map((file) => file.url).join('\n') + (selectedFiles.length ? '\n' : '');
  const directCommands = selectedFiles.flatMap((file) => {
    const output = rename ? niceFilename(file, runs) : file.filename;
    const command = file.url.startsWith('s3://') ? `aws s3 cp ${shellQuote(file.url)} ${shellQuote(output)}` : method === 'axel' ? `axel -n 8 -a -o ${shellQuote(output)} ${shellQuote(file.url)}` : `curl -L --fail --retry 5 --continue-at - ${shellQuote(file.url)} -o ${shellQuote(output)}`;
    return [`echo "Downloading ${file.accession}: ${output}"`, command, ...(verifyMd5 && file.md5 ? [`echo '${file.md5}  ${output}' | md5sum -c -`] : []), ''];
  });
  const accessions = [...new Set(selectedFiles.map((file) => file.accession))];
  const toolCommands = method === 'fastq-dl' ? accessions.flatMap((accession) => {
    const accessionFiles = selectedFiles.filter((file) => file.accession === accession);
    return [
      `echo "Downloading ${accession} with fastq-dl"`,
      `fastq-dl --accession ${accession} --provider ena --outdir .`,
      ...accessionFiles.flatMap((file) => [
        ...(verifyMd5 && file.md5 ? [`echo '${file.md5}  ${file.filename}' | md5sum -c -`] : []),
        ...(rename && niceFilename(file, runs) !== file.filename ? [`mv -- ${shellQuote(file.filename)} ${shellQuote(niceFilename(file, runs))}`] : []),
      ]),
      '',
    ];
  }) : accessions.flatMap((accession) => {
    const accessionFiles = selectedFiles.filter((file) => file.accession === accession);
    const project = accessionFiles[0]?.project || runs.find((run) => run.accession === accession)?.project || 'unassigned-project';
    return [
      `echo "Downloading ${accession} into ${project} with Kingfisher"`,
      `kingfisher get -r ${accession} --output-directory ${shellQuote(project)} -m ena-ascp ena-ftp aws-http prefetch`,
      ...accessionFiles.flatMap((file) => {
        if (!verifyMd5 && (!rename || niceFilename(file, runs) === file.filename)) return [];
        return [
          `downloaded_file=$(find . -type f -name ${shellQuote(file.filename)} -print -quit)`,
          `if [ -z "$downloaded_file" ]; then echo "Could not locate ${file.filename} after Kingfisher download" >&2; exit 1; fi`,
          ...(verifyMd5 && file.md5 ? [`printf '%s  %s\\n' ${shellQuote(file.md5)} "$downloaded_file" | md5sum -c -`] : []),
          ...(rename && niceFilename(file, runs) !== file.filename ? [`mv -- "$downloaded_file" ${shellQuote(`${project}/${niceFilename(file, runs)}`)}`] : []),
        ];
      }),
      '',
    ];
  });
  const script = ['#!/usr/bin/env bash', 'set -euo pipefail', '', `mkdir -p ${labels.directory}`, `cd ${labels.directory}`, '', ...(method === 'curl' || method === 'axel' ? directCommands : toolCommands)].join('\n');
  const manifest = ['accession\trepresentation\tfilename\tnice_filename\tsize_bytes\tmd5\turl\ts3_url', ...selectedFiles.map((file) => [file.accession, file.representation, file.filename, niceFilename(file, runs), file.size ?? '', file.md5 ?? '', file.url, file.s3Url ?? ''].join('\t'))].join('\n') + '\n';

  async function copy(label: string, content: string) {
    await navigator.clipboard.writeText(content); setCopied(label); window.setTimeout(() => setCopied(''), 1500);
  }

  return <div className="mt-6 space-y-5">
    <div><h2 className="text-2xl font-black tracking-[-.04em]">{labels.title}</h2><p className="mt-2 text-sm leading-6 text-[#607286]">All files for the saved collection are combined below. Download the ready-to-run script; no per-run selection is required.</p></div>
    <div className={`rounded-2xl border p-4 text-sm ${representation === 'original' ? 'border-[#efd998] bg-[#fff4cf] text-[#72530a]' : 'border-[#b9dddd] bg-[#e8f6f5] text-[#07535b]'}`}><strong>{selectedFiles.length} {representation === 'original' ? 'Original' : representation.toUpperCase()} files</strong> found across {checked} / {runCount} checked runs.{representation === 'original' ? ' Original files can be extremely large; review sizes and MD5 values before starting.' : ''}</div>
    {selectedFiles.length ? <>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#dce6eb] bg-white p-3">
        <span className="mr-1 text-xs font-bold uppercase tracking-wider text-[#607286]">Command</span>
        {(['curl', 'axel', ...(representation === 'fastq' ? ['fastq-dl', 'kingfisher'] : [])] as Array<'curl' | 'axel' | 'fastq-dl' | 'kingfisher'>).map((value) => <button key={value} onClick={() => setMethod(value)} className={`rounded-lg px-3 py-2 text-xs font-black ${method === value ? 'bg-[#071b2f] text-white' : 'bg-[#f2f6f8] text-[#405563]'}`}>{value}</button>)}
        <button onClick={() => setVerifyMd5((value) => !value)} className={`ml-auto rounded-lg px-3 py-2 text-xs font-black ${verifyMd5 ? 'bg-[#c7f36b] text-[#071b2f]' : 'bg-[#edf0f2] text-[#405563]'}`}>{verifyMd5 ? '✓ Verify MD5' : 'Skip MD5'}</button>
        <button onClick={() => setRename((value) => !value)} className={`rounded-lg px-3 py-2 text-xs font-black ${rename ? 'bg-[#c7f36b] text-[#071b2f]' : 'bg-[#edf0f2] text-[#405563]'}`}>{rename ? '✓ Rename with sample title' : 'Keep archive filenames'}</button>
      </div>
      {method === 'fastq-dl' ? <p className="text-xs text-[#607286]">fastq-dl downloads using archive filenames. The script optionally verifies each MD5 first, then renames the verified file with <code>mv</code>.</p> : method === 'kingfisher' ? <p className="text-xs text-[#607286]">Kingfisher uses each run's BioProject as <code>--output-directory</code>. The script then locates each archive file, optionally verifies MD5, and renames it inside that project folder.</p> : null}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void copy('urls', urls)} className="inline-flex items-center gap-2 rounded-lg border border-[#bdd0d8] bg-white px-3 py-2 text-xs font-black"><Clipboard className="size-4" /> {copied === 'urls' ? 'Copied' : 'Copy URLs'}</button>
        <button onClick={() => downloadText(`${labels.stem}.urls.txt`, urls)} className="inline-flex items-center gap-2 rounded-lg border border-[#bdd0d8] bg-white px-3 py-2 text-xs font-black"><FileDown className="size-4" /> URLs.txt</button>
        <button onClick={() => void copy('script', script)} className="inline-flex items-center gap-2 rounded-lg border border-[#bdd0d8] bg-white px-3 py-2 text-xs font-black"><Clipboard className="size-4" /> {copied === 'script' ? 'Copied' : 'Copy Bash script'}</button>
        <button onClick={() => downloadText(`download-${labels.stem}.sh`, script)} className="inline-flex items-center gap-2 rounded-lg bg-[#c7f36b] px-3 py-2 text-xs font-black"><ArrowDownToLine className="size-4" /> Download all script</button>
        <button onClick={() => setShowManifest((value) => !value)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black ${showManifest ? 'border-[#087f8c] bg-[#e0f4f4]' : 'border-[#bdd0d8] bg-white'}`}><FileDown className="size-4" /> Manifest TSV</button>
      </div>
      {showManifest ? <section className="overflow-hidden rounded-2xl border border-[#dce6eb] bg-white"><div className="flex flex-wrap items-center gap-2 border-b border-[#dce6eb] px-4 py-3"><strong className="text-sm">Manifest TSV</strong><button onClick={() => void copy('manifest', manifest)} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#bdd0d8] px-3 py-2 text-xs font-black"><Clipboard className="size-4" /> {copied === 'manifest' ? 'Copied' : 'Copy'}</button><button onClick={() => downloadText(`${labels.stem}.tsv`, manifest, 'text/tab-separated-values;charset=utf-8')} className="inline-flex items-center gap-2 rounded-lg bg-[#c7f36b] px-3 py-2 text-xs font-black"><ArrowDownToLine className="size-4" /> Download</button></div><pre className="max-h-[360px] overflow-auto bg-[#0c2538] p-4 text-xs leading-5 text-[#d9e8ef]"><code>{manifest}</code></pre></section> : null}
      <pre className="max-h-[360px] overflow-auto rounded-2xl bg-[#0c2538] p-4 text-xs leading-5 text-[#d9e8ef]"><code>{script}</code></pre>
      <div className="overflow-hidden rounded-2xl border border-[#dce6eb] bg-white">{selectedFiles.map((file) => <div key={`${file.accession}-${file.url}`} className="grid gap-1 border-b border-[#edf2f4] px-4 py-3 text-xs last:border-0 sm:grid-cols-[130px_1fr_auto]"><span className="font-mono font-bold text-[#087f8c]">{file.accession}</span><span className="min-w-0 break-all font-semibold">{rename ? niceFilename(file, runs) : file.filename}<span className="ml-2 font-normal text-[#607286]">{file.md5 ? `MD5 ${file.md5}` : 'No MD5'}</span></span><span className="text-[#607286]">{formatBytes(file.size)}</span></div>)}</div>
    </> : checked === runCount ? <div className="rounded-xl bg-[#e0f4f4] p-4 text-sm text-[#07535b]">No {representation === 'original' ? 'Original submitted' : representation.toUpperCase()} files were found in this collection.</div> : null}
  </div>;
}

function FullMetadata({ runs, files }: { runs: RunSummary[]; files: DownloadFile[] }) {
  const [format, setFormat] = useState<'tsv' | 'json' | 'yaml'>('tsv');
  const [copied, setCopied] = useState(false);
  const rows = runs.flatMap((run) => {
    const runFiles = files.filter((file) => file.accession === run.accession);
    const fastq = runFiles.filter((file) => file.representation === 'fastq');
    const sra = runFiles.find((file) => file.representation === 'sra');
    const originals = runFiles.filter((file) => file.representation === 'original');
    const rowFiles = fastq.length ? fastq : [null];
    return rowFiles.map((fastqFile) => ({
      accession: run.accession,
      title: run.title,
      platform: run.platform,
      total_bases_mb: Math.round(run.totalBases / 1_000_000),
      create_date: run.createdAt,
      sra_url: sra?.url || '',
      sra_filename: sra?.filename || '',
      sra_nice_filename: sra ? niceFilename(sra, runs) : '',
      fastq_url: fastqFile?.url || '',
      fastq_filename: fastqFile?.filename || '',
      fastq_nice_filename: fastqFile ? niceFilename(fastqFile, runs) : '',
      fastq_md5: fastqFile?.md5 || '',
      fastq_size_bytes: fastqFile?.size || '',
      original_urls: originals.map((file) => file.url).join(';'),
    }));
  });
  const columns = Object.keys(rows[0] || { accession: '' }) as Array<keyof (typeof rows)[number]>;
  const tsv = [columns.join('\t'), ...rows.map((row) => columns.map((column) => String(row[column]).replaceAll('\t', ' ')).join('\t'))].join('\n') + '\n';
  const json = JSON.stringify(rows, null, 2) + '\n';
  const yaml = rows.map((row) => columns.map((column, index) => `${index ? '  ' : '- '}${column}: ${JSON.stringify(row[column])}`).join('\n')).join('\n') + '\n';
  const content = format === 'tsv' ? tsv : format === 'json' ? json : yaml;
  const mime = format === 'tsv' ? 'text/tab-separated-values;charset=utf-8' : format === 'json' ? 'application/json;charset=utf-8' : 'application/yaml;charset=utf-8';
  async function copy() { await navigator.clipboard.writeText(content); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
  return <div className="mt-6 space-y-5"><div><h2 className="text-2xl font-black">Full Metadata</h2><p className="mt-2 text-sm text-[#607286]">One row per FastQ file, matching the original SRA Explorer behavior. Paired-end reads therefore have separate rows and separate MD5 values.</p></div><div className="flex flex-wrap gap-2">{(['tsv', 'json', 'yaml'] as const).map((value) => <button key={value} onClick={() => setFormat(value)} className={`rounded-lg px-4 py-2 text-xs font-black uppercase ${format === value ? 'bg-[#071b2f] text-white' : 'border border-[#bdd0d8] bg-white'}`}>{value}</button>)}<button onClick={() => void copy()} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#bdd0d8] bg-white px-4 py-2 text-xs font-black"><Clipboard className="size-4" /> {copied ? 'Copied' : 'Copy'}</button><button onClick={() => downloadText(`sra-explorer-full-metadata.${format}`, content, mime)} className="inline-flex items-center gap-2 rounded-lg bg-[#c7f36b] px-4 py-2 text-xs font-black"><FileDown className="size-4" /> Download {format.toUpperCase()}</button></div><pre className="max-h-[520px] overflow-auto rounded-2xl bg-[#0c2538] p-4 text-xs leading-5 text-[#d9e8ef]"><code>{content}</code></pre></div>;
}

function BulkToolDetails({ runs }: { runs: RunSummary[] }) {
  return <div className="mt-6 space-y-4"><div><h2 className="text-2xl font-black">Download Tools</h2><p className="mt-2 text-sm text-[#607286]">Commands below include every saved accession, ready to copy as one batch.</p></div>{tools.map((tool) => { const commands = runs.map((run) => tool.command(run.accession)).join('\n'); return <article key={tool.name} className="rounded-2xl border border-[#dce6eb] bg-white p-4 shadow-sm"><div className="flex items-center"><strong>{tool.name}</strong><a href={tool.href} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[#087f8c]"><Github className="size-3" /> GitHub</a></div><div className="mt-1 text-xs text-[#607286]">{tool.capabilities} · {runs.length} runs</div><pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-[#0c2538] p-3 text-xs text-[#d9e8ef]"><code>{commands}</code></pre></article>; })}</div>;
}

function FileDetails({ loading, files }: { loading: boolean; files: DownloadFile[] }) {
  if (loading) return <div className="mt-10 flex items-center gap-2 text-sm text-[#607286]"><LoaderCircle className="size-4 animate-spin" /> Querying NCBI and ENA…</div>;
  if (!files.length) return <div className="mt-8 rounded-xl bg-[#e0f4f4] p-4 text-sm text-[#07535b]">No public file representations were returned for this run.</div>;
  const order = { original: 0, fastq: 1, sra: 2 };
  return <div className="mt-5 space-y-4">{[...files].sort((a, b) => order[a.representation] - order[b.representation]).map((file) => <article key={`${file.representation}-${file.url}`} className="overflow-hidden rounded-2xl border border-[#dce6eb] bg-white shadow-sm">
    <div className="flex flex-wrap items-center gap-2 border-b border-[#edf2f4] px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${file.representation === 'original' ? 'bg-[#fff1c7] text-[#72530a]' : file.representation === 'fastq' ? 'bg-[#e0f4f4] text-[#07535b]' : 'bg-[#edf0f2] text-[#405563]'}`}>{file.representation}</span><strong className="break-all">{file.filename}</strong><span className="ml-auto text-xs text-[#607286]">{formatBytes(file.size)}</span></div>
    <div className="p-4"><div className="text-xs text-[#607286]">{file.format || 'Unknown format'}</div>{file.md5 ? <div className="mt-2 break-all font-mono text-xs">MD5 {file.md5}</div> : null}<a href={file.url} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#c7f36b] px-3 py-2 text-xs font-black text-[#071b2f]"><FileArchive className="size-4" /> Download <ExternalLink className="size-3" /></a><pre className="mt-4 overflow-x-auto rounded-xl bg-[#0c2538] p-3 text-xs text-[#d9e8ef]"><code>curl -L --retry 5 '{file.url}' -o '{file.filename}'</code></pre></div>
  </article>)}</div>;
}

function ToolDetails({ accession }: { accession: string }) {
  return <div className="mt-5 space-y-4"><div className="rounded-xl bg-[#fff4cf] p-4 text-sm text-[#72530a]"><strong>Representation matters.</strong> These tools primarily retrieve FASTQ or normalized SRA. Use an Original file URL for FAST5, POD5 or other instrument-native submissions.</div>{tools.map((tool) => <article key={tool.name} className="rounded-2xl border border-[#dce6eb] bg-white p-4 shadow-sm"><div className="flex items-center"><strong>{tool.name}</strong><a href={tool.href} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[#087f8c]"><Github className="size-3" /> GitHub</a></div><div className="mt-1 text-xs text-[#607286]">{tool.capabilities}</div><pre className="mt-3 overflow-x-auto rounded-xl bg-[#0c2538] p-3 text-xs text-[#d9e8ef]"><code>{tool.command(accession)}</code></pre></article>)}</div>;
}
