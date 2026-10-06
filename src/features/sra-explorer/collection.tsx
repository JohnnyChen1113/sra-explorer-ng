import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Clipboard, ClipboardPaste, FileDown, Github, LoaderCircle, Maximize2, Minimize2, RotateCw, ShoppingBasket, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { browserSources } from './browser-sources';
import { extractAccessions } from './core/sources';
import { useCollectionFiles, type CollectionFilesState } from './file-cache';
import { dedupeRuns, formatBases, formatBytes, layoutLabel, ncbiRunUrl, niceFilename } from './format';
import { buildDownloadScript, buildFetchngsIds, buildManifest, buildMetadataRows, buildNfcoreSamplesheet, buildUrlList, FETCHNGS_COMMAND, methodsFor, representationLabels, serializeMetadata, toolCommands, type DownloadMethod, type MetadataFormat } from './scripts';
import type { DownloadFile, RunSummary } from './types';

type Tab = 'runs' | 'fastq' | 'sra' | 'original' | 'metadata' | 'tools';

type Props = {
  open: boolean;
  expanded: boolean;
  runs: RunSummary[];
  onClose: () => void;
  onToggleSize: () => void;
  onReplace: (runs: RunSummary[]) => void;
  onRemove: (accession: string) => void;
};

function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(label: string, content: string) {
  try { await navigator.clipboard.writeText(content); toast.success(`${label} copied`); }
  catch { toast.error('Clipboard is unavailable; use the download button instead.'); }
}

const button = 'inline-flex items-center gap-2 rounded-lg border border-[#bdd0d8] bg-white px-3 py-2 text-xs font-black hover:border-[#087f8c] disabled:opacity-40';
const primaryButton = 'inline-flex items-center gap-2 rounded-lg bg-[#c7f36b] px-3 py-2 text-xs font-black text-[#071b2f] hover:bg-[#b5e45a] disabled:opacity-40';
const codeBlock = 'overflow-auto rounded-2xl bg-[#0c2538] p-4 text-xs leading-5 text-[#d9e8ef]';

export function CollectionWorkspace({ open, expanded, runs, onClose, onToggleSize, onReplace, onRemove }: Props) {
  const [tab, setTab] = useState<Tab>('runs');
  const [wantOriginal, setWantOriginal] = useState(false);
  // Lives here so the paste form keeps its text and result when the panel switches from empty to populated.
  const paste = useState<PasteState>({ text: '', message: null });
  const state = useCollectionFiles(runs, open, wantOriginal);

  useEffect(() => { if (tab === 'original') setWantOriginal(true); }, [tab]);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = overflow; };
  }, [open, onClose]);

  if (!open) return null;

  const counts = { fastq: 0, sra: 0, original: 0 } as Record<DownloadFile['representation'], number>;
  state.files.forEach((file) => { counts[file.representation] += 1; });

  function clearAll() {
    const previous = runs;
    onReplace([]);
    toast(`Removed ${previous.length} runs from the collection`, { action: { label: 'Undo', onClick: () => onReplace(previous) } });
  }

  async function importCollection(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const items = Array.isArray(parsed) ? parsed : [];
      const valid = items.filter((item): item is RunSummary => typeof item === 'object' && item !== null && typeof (item as RunSummary).accession === 'string');
      if (!valid.length) throw new Error('No runs found in this file.');
      const merged = new Map(runs.map((run) => [run.accession, run]));
      valid.forEach((run) => merged.set(run.accession, { ...run, title: run.title || '', platform: run.platform || 'Unknown', totalBases: Number(run.totalBases) || 0, createdAt: run.createdAt || '' }));
      onReplace([...merged.values()]);
      toast.success(`Imported ${valid.length} runs`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not read collection file.');
    }
  }

  const tabs: Array<[Tab, string, number | null]> = [
    ['runs', 'Runs', runs.length],
    ['fastq', 'FASTQ', counts.fastq],
    ['sra', 'SRA', counts.sra],
    ['original', 'Original files', wantOriginal ? counts.original : null],
    ['metadata', 'Metadata', null],
    ['tools', 'Download tools', null],
  ];

  return <div className="fixed inset-0 z-50 bg-[#04121f]/45 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside role="dialog" aria-modal="true" aria-label="Collection" className={`absolute inset-y-0 right-0 flex flex-col bg-[#f2f6f8] shadow-[-30px_0_80px_rgba(4,18,31,.25)] transition-[width] duration-200 ${expanded ? 'w-[80vw]' : 'w-[52vw]'} max-lg:w-full`}>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-[#dce6eb] bg-white px-5">
        <div><div className="text-lg font-black tracking-[-.03em]">Collection</div><div className="text-xs text-[#607286]">{runs.length} runs · {formatBases(runs.reduce((sum, run) => sum + (run.totalBases || 0), 0))}</div></div>
        <div className="ml-auto flex items-center gap-1.5">
          <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCollection(file); event.target.value = ''; }} />
          <button onClick={() => importRef.current?.click()} className="rounded-lg border border-[#dce6eb] p-2 hover:bg-[#f2f6f8]" title="Import collection JSON" aria-label="Import collection JSON"><ArrowUpFromLine className="size-4" /></button>
          <button onClick={() => downloadText('sra-explorer-collection.json', JSON.stringify(runs, null, 2), 'application/json')} disabled={!runs.length} className="rounded-lg border border-[#dce6eb] p-2 hover:bg-[#f2f6f8] disabled:opacity-40" title="Export collection JSON" aria-label="Export collection JSON"><ArrowDownToLine className="size-4" /></button>
          <button onClick={onToggleSize} className="rounded-lg border border-[#dce6eb] p-2 hover:bg-[#f2f6f8] max-lg:hidden" title={expanded ? 'Shrink panel' : 'Expand panel'} aria-label={expanded ? 'Shrink panel' : 'Expand panel'}>{expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>
          <button onClick={clearAll} disabled={!runs.length} className="rounded-lg border border-[#dce6eb] px-3 py-2 text-xs font-bold hover:bg-[#f2f6f8] disabled:opacity-40">Clear</button>
          <button onClick={onClose} className="rounded-lg bg-[#c7f36b] p-2" title="Close (Esc)" aria-label="Close collection"><X className="size-4" /></button>
        </div>
      </header>
      {runs.length ? <>
        <nav className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[#dce6eb] bg-[#f8fafb] px-5 py-2">
          {tabs.map(([value, label, count]) => <button key={value} onClick={() => setTab(value)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === value ? 'bg-[#071b2f] text-white' : 'text-[#405563] hover:bg-white'}`}>{label}{count !== null ? <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${tab === value ? 'bg-white/20' : 'bg-[#e3eaee]'}`}>{count}</span> : null}</button>)}
        </nav>
        <LookupStatus state={state} total={runs.length} showErrors={tab === 'runs' || tab === 'metadata' || tab === 'tools'} />
        <div className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-7">
          {tab === 'runs' ? <AddAccessions collapsible state={paste} onAdd={(added) => onReplace(dedupeRuns(runs, added))} /> : null}
          {tab === 'runs' ? <CollectionRuns runs={runs} state={state} onCheckOriginal={() => setWantOriginal(true)} onRemove={(accession) => {
            const run = runs.find((item) => item.accession === accession);
            onRemove(accession);
            if (run) toast(`Removed ${accession}`, { action: { label: 'Undo', onClick: () => onReplace([...runs]) } });
          }} />
            : tab === 'metadata' ? <FullMetadata runs={runs} files={state.files} originalsChecked={wantOriginal && state.lookups.original.done === runs.length} onCheckOriginal={() => setWantOriginal(true)} />
            : tab === 'tools' ? <BulkToolDetails runs={runs} />
            : <BulkFileDownloads key={tab} representation={tab} files={state.files} runs={runs} failed={new Set(state.failed.filter((result) => result.checked?.includes(tab === 'original' ? 'original' : 'ena')).map((result) => result.accession))} onRetry={state.retryFailed} onRecheck={(accessions) => state.recheck(tab === 'original' ? 'original' : 'ena', accessions)} complete={(() => { const lookup = state.lookups[tab === 'original' ? 'original' : 'ena']; return lookup.done === runs.length && !lookup.loading; })()} />}
        </div>
      </> : <div className="flex-1 overflow-y-auto p-5 lg:p-7"><div className="py-6 text-center"><ShoppingBasket className="mx-auto size-10 text-[#9ab0bc]" /><div className="mt-4 font-bold">No saved runs yet</div><p className="mx-auto mt-1 max-w-sm text-sm text-[#607286]">Select search results and add them here, paste a list of accessions below, or import a previously exported collection JSON.</p></div><AddAccessions state={paste} onAdd={(added) => onReplace(dedupeRuns(runs, added))} /></div>}
    </aside>
  </div>;
}

function LookupStatus({ state, total, showErrors }: { state: CollectionFilesState; total: number; showErrors: boolean }) {
  const active = (['ena', 'original'] as const).filter((kind) => state.lookups[kind].requested && (state.lookups[kind].loading || state.lookups[kind].done < total) && !state.lookups[kind].error);
  const errors = (['ena', 'original'] as const).map((kind) => state.lookups[kind].error).filter(Boolean);
  return <>
    {active.map((kind) => {
      const { done } = state.lookups[kind];
      return <div key={kind} className="flex shrink-0 items-center gap-3 border-b border-[#dce6eb] bg-white px-5 py-2 text-xs text-[#405563]">
        <LoaderCircle className="size-4 animate-spin text-[#087f8c]" />
        <span className="w-64">{kind === 'ena' ? 'FASTQ/SRA lookup (ENA)' : 'Original files lookup (NCBI, slower)'}: {done} / {total}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e3eaee]"><div className="h-full rounded-full bg-[#087f8c] transition-[width]" style={{ width: `${(done / total) * 100}%` }} /></div>
      </div>;
    })}
    {showErrors && (errors.length || state.failed.length) ? <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#efd998] bg-[#fff4cf] px-5 py-2 text-xs text-[#72530a]">
      <AlertTriangle className="size-4" />
      <span>{errors[0] || `${state.failed.length} lookups did not complete (NCBI or ENA did not answer). Affected runs may be missing files.`}</span>
      <button onClick={state.retryFailed} className="ml-auto inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-bold"><RotateCw className="size-3" /> Retry</button>
    </div> : null}
  </>;
}

function CollectionRuns({ runs, state, onRemove, onCheckOriginal }: { runs: RunSummary[]; state: CollectionFilesState; onRemove: (accession: string) => void; onCheckOriginal: () => void }) {
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? runs.filter((run) => [run.accession, run.title, run.organism, run.project].join(' ').toLowerCase().includes(needle)) : runs;
  }, [filter, runs]);
  const originalLookup = state.lookups.original;
  return <div className="space-y-3">
    {!originalLookup.requested ? <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#dce6eb] bg-white px-4 py-3 text-sm text-[#405563]">
      <span className="flex-1">FASTQ and SRA files are listed from ENA. Original submitted files (FAST5, POD5, BAM…) need a slower NCBI lookup and are checked on demand.</span>
      <button onClick={onCheckOriginal} className={button}>Check Original files</button>
    </div> : null}
    <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={`Filter ${runs.length} saved runs`} className="w-full rounded-xl border border-[#dce6eb] bg-white px-4 py-2 text-sm outline-none focus:border-[#087f8c]" />
    <div className="overflow-hidden rounded-2xl border border-[#dce6eb] bg-white">
      {visible.map((run) => {
        const entry = state.results.get(run.accession) || {};
        const lookups = [entry.ena, entry.original].filter((item): item is NonNullable<typeof item> => Boolean(item));
        const problems = lookups.flatMap((result) => [...(result.errors || []), ...(result.error ? [result.error] : [])]);
        const tally = { fastq: 0, sra: 0, original: 0 } as Record<DownloadFile['representation'], number>;
        lookups.forEach((result) => result.files.forEach((file) => { tally[file.representation] += 1; }));
        const originalLabel = entry.original ? `${tally.original} Original` : originalLookup.requested ? 'Original: checking…' : 'Original: not checked';
        return <div key={run.accession} className="flex items-start gap-3 border-b border-[#edf2f4] px-4 py-2.5 text-sm last:border-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2"><a href={ncbiRunUrl(run.accession)} target="_blank" rel="noopener" className="font-mono font-bold text-[#087f8c] hover:underline">{run.accession}</a><span className="truncate font-medium" title={run.title}>{run.title}</span></div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[#607286]">
              {run.organism ? <span className="italic">{run.organism}</span> : null}
              {run.strategy ? <span>{run.strategy}</span> : null}
              {run.layout ? <span>{layoutLabel(run.layout)}</span> : null}
              <span>{formatBases(run.totalBases)}</span>
              <span>{entry.ena ? `${tally.fastq} FASTQ` : 'FASTQ: checking…'} · {originalLabel}</span>
            </div>
            {problems.length ? <div className="mt-1 flex items-center gap-1 text-xs text-[#9a5b00]" title={problems.join('\n')}><AlertTriangle className="size-3" />{problems[0]}</div> : null}
          </div>
          <button onClick={() => onRemove(run.accession)} className="rounded-lg p-1.5 text-[#607286] hover:bg-red-50 hover:text-red-700" title={`Remove ${run.accession}`} aria-label={`Remove ${run.accession}`}><Trash2 className="size-4" /></button>
        </div>;
      })}
      {!visible.length ? <div className="px-4 py-6 text-center text-sm text-[#607286]">No saved runs match “{filter}”.</div> : null}
    </div>
  </div>;
}

function BulkFileDownloads({ representation, files, runs, complete, failed, onRecheck, onRetry }: { representation: DownloadFile['representation']; files: DownloadFile[]; runs: RunSummary[]; complete: boolean; failed: Set<string>; onRecheck: (accessions: string[]) => void; onRetry: () => void }) {
  const methods = methodsFor(representation);
  const [rename, setRename] = useState(representation !== 'original');
  const [verifyMd5, setVerifyMd5] = useState(true);
  const [method, setMethod] = useState<DownloadMethod>('curl');
  const [showManifest, setShowManifest] = useState(false);
  const labels = representationLabels[representation];
  const selectedFiles = useMemo(() => files.filter((file) => file.representation === representation), [files, representation]);
  const byAccession = useMemo(() => new Map(runs.map((run) => [run.accession, run])), [runs]);
  const script = useMemo(() => buildDownloadScript({ representation, files: selectedFiles, runs, method, rename, verifyMd5 }), [representation, selectedFiles, runs, method, rename, verifyMd5]);
  const urls = buildUrlList(selectedFiles);
  const manifest = useMemo(() => buildManifest(selectedFiles, runs), [selectedFiles, runs]);
  const totalSize = selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
  const runsWithFiles = new Set(selectedFiles.map((file) => file.accession)).size;
  const missingSizes = selectedFiles.filter((file) => !file.size).length;
  const withoutFiles = complete && representation === 'fastq' ? runs.filter((run) => !failed.has(run.accession) && !selectedFiles.some((file) => file.accession === run.accession)).map((run) => run.accession) : [];

  const methodNote: Partial<Record<DownloadMethod, string>> = {
    aspera: 'Aspera (ascp) is usually much faster than HTTPS for ENA FASTQ. Install IBM Aspera Connect or the ascp CLI; set ASPERA_KEY if your key lives elsewhere.',
    'fastq-dl': 'fastq-dl downloads with archive filenames; the script verifies MD5 and then renames each file.',
    kingfisher: "Kingfisher downloads into each run's BioProject folder; the script then locates, verifies, and renames each file.",
  };

  return <div className="space-y-4">
    <div className={`rounded-2xl border p-4 text-sm ${representation === 'original' ? 'border-[#efd998] bg-[#fff4cf] text-[#72530a]' : 'border-[#b9dddd] bg-[#e8f6f5] text-[#07535b]'}`}>
      <strong>{selectedFiles.length} {labels.title} files</strong> from {runsWithFiles} of {runs.length} runs · {totalSize ? formatBytes(totalSize) : 'size unknown'}{missingSizes && totalSize ? ` (+${missingSizes} without size)` : ''}.
      {representation === 'original' ? ' Original files are whatever the submitter uploaded (FAST5, POD5, BAM, …) and can be very large.' : ''}
      {!complete ? ' Lookups still running; this list will grow.' : ''}
    </div>
    {failed.size ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
      <AlertTriangle className="size-4" />
      <span className="min-w-0 flex-1"><strong>{failed.size} runs could not be checked</strong> because {representation === 'original' ? 'NCBI' : 'ENA'} did not answer, so their files are missing from this list: {[...failed].slice(0, 12).join(', ')}{failed.size > 12 ? ` and ${failed.size - 12} more` : ''}.</span>
      <button onClick={onRetry} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-bold"><RotateCw className="size-3" /> Retry</button>
    </div> : null}
    {withoutFiles.length ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#efd998] bg-[#fff4cf] px-4 py-2 text-xs text-[#72530a]">
      <span className="min-w-0 flex-1"><strong>{withoutFiles.length} runs have no FASTQ in ENA</strong> and are not in this script: {withoutFiles.slice(0, 12).join(', ')}{withoutFiles.length > 12 ? ` and ${withoutFiles.length - 12} more` : ''}. They may not be mirrored yet (use the SRA tab), or ENA answered incompletely.</span>
      <button onClick={() => onRecheck(withoutFiles)} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-bold"><RotateCw className="size-3" /> Re-check</button>
    </div> : null}
    {selectedFiles.length ? <>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#dce6eb] bg-white p-3">
        <span className="mr-1 text-xs font-bold uppercase tracking-wider text-[#607286]">Tool</span>
        {methods.map((value) => <button key={value} onClick={() => setMethod(value)} className={`rounded-lg px-3 py-1.5 text-xs font-black ${method === value ? 'bg-[#071b2f] text-white' : 'bg-[#f2f6f8] text-[#405563] hover:bg-[#e3eaee]'}`}>{value}</button>)}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#405563]"><input type="checkbox" checked={verifyMd5} onChange={(event) => setVerifyMd5(event.target.checked)} className="accent-[#087f8c]" /> Verify MD5</label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#405563]"><input type="checkbox" checked={rename} onChange={(event) => setRename(event.target.checked)} className="accent-[#087f8c]" /> Rename with sample title</label>
      </div>
      {methodNote[method] ? <p className="text-xs text-[#607286]">{methodNote[method]}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => downloadText(`download-${labels.stem}.sh`, script)} className={primaryButton}><ArrowDownToLine className="size-4" /> Download script</button>
        <button onClick={() => void copyText('Script', script)} className={button}><Clipboard className="size-4" /> Copy script</button>
        <button onClick={() => void copyText('URLs', urls)} className={button}><Clipboard className="size-4" /> Copy URLs</button>
        <button onClick={() => downloadText(`${labels.stem}.urls.txt`, urls)} className={button}><FileDown className="size-4" /> URLs.txt</button>
        <button onClick={() => setShowManifest((value) => !value)} className={`${button} ${showManifest ? 'border-[#087f8c] bg-[#e0f4f4]' : ''}`}><FileDown className="size-4" /> Manifest TSV</button>
        {representation === 'fastq' ? <button onClick={() => {
          const { csv, skipped } = buildNfcoreSamplesheet(runs, files);
          downloadText('samplesheet.csv', csv, 'text/csv;charset=utf-8');
          if (skipped.length) toast.warning(`${skipped.length} runs without a usable FASTQ pair were left out`, { description: skipped.slice(0, 8).join(', ') + (skipped.length > 8 ? '…' : '') });
        }} className={button} title="sample,fastq_1,fastq_2,strandedness with ENA URLs, for nf-core/rnaseq and similar pipelines"><FileDown className="size-4" /> nf-core samplesheet</button> : null}
      </div>
      <p className="text-xs text-[#607286]">Run with <code className="rounded bg-white px-1">bash download-{labels.stem}.sh</code>. Works on Linux and macOS.</p>
      {showManifest ? <section className="overflow-hidden rounded-2xl border border-[#dce6eb] bg-white"><div className="flex flex-wrap items-center gap-2 border-b border-[#dce6eb] px-4 py-3"><strong className="text-sm">Manifest TSV</strong><button onClick={() => void copyText('Manifest', manifest)} className={`ml-auto ${button}`}><Clipboard className="size-4" /> Copy</button><button onClick={() => downloadText(`${labels.stem}.tsv`, manifest, 'text/tab-separated-values;charset=utf-8')} className={primaryButton}><ArrowDownToLine className="size-4" /> Download</button></div><pre className={`max-h-[300px] rounded-none ${codeBlock}`}><code>{manifest}</code></pre></section> : null}
      <pre className={`max-h-[360px] ${codeBlock}`}><code>{script}</code></pre>
      <details className="overflow-hidden rounded-2xl border border-[#dce6eb] bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold">File list ({selectedFiles.length})</summary>
        {selectedFiles.slice(0, 2000).map((file) => <div key={`${file.accession}-${file.url}`} className="grid gap-1 border-t border-[#edf2f4] px-4 py-2.5 text-xs sm:grid-cols-[120px_1fr_auto]"><span className="font-mono font-bold text-[#087f8c]">{file.accession}</span><span className="min-w-0 break-all font-semibold">{rename ? niceFilename(file, byAccession) : file.filename}<span className="ml-2 font-normal text-[#607286]">{file.md5 ? `MD5 ${file.md5}` : 'No MD5'}</span></span><span className="text-[#607286]">{formatBytes(file.size)}</span></div>)}
        {selectedFiles.length > 2000 ? <div className="border-t border-[#edf2f4] px-4 py-2.5 text-xs text-[#607286]">Showing the first 2,000 files; the script and manifest include all {selectedFiles.length}.</div> : null}
      </details>
    </> : complete && !failed.size ? <div className="rounded-xl bg-[#e0f4f4] p-4 text-sm text-[#07535b]">No {labels.title} files were found for this collection.{representation === 'fastq' ? ' Runs that ENA has not mirrored only offer normalized SRA; see the SRA tab.' : ''}</div> : null}
  </div>;
}

function FullMetadata({ runs, files, originalsChecked, onCheckOriginal }: { runs: RunSummary[]; files: DownloadFile[]; originalsChecked: boolean; onCheckOriginal: () => void }) {
  const [format, setFormat] = useState<MetadataFormat>('tsv');
  const rows = useMemo(() => buildMetadataRows(runs, files), [runs, files]);
  const content = useMemo(() => serializeMetadata(rows, format), [rows, format]);
  const mime = { tsv: 'text/tab-separated-values', csv: 'text/csv', json: 'application/json', yaml: 'application/yaml' }[format] + ';charset=utf-8';
  return <div className="space-y-4">
    <p className="text-sm text-[#607286]">One row per FASTQ file (paired-end runs get one row per read file), with run, sample, and library metadata.</p>
    {!originalsChecked ? <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#fff4cf] px-4 py-2 text-xs text-[#72530a]"><span className="flex-1">The <code>original_urls</code> column is filled only after Original files have been checked.</span><button onClick={onCheckOriginal} className={button}>Check Original files</button></div> : null}
    <div className="flex flex-wrap gap-2">
      {(['tsv', 'csv', 'json', 'yaml'] as const).map((value) => <button key={value} onClick={() => setFormat(value)} className={`rounded-lg px-4 py-2 text-xs font-black uppercase ${format === value ? 'bg-[#071b2f] text-white' : 'border border-[#bdd0d8] bg-white'}`}>{value}</button>)}
      <button onClick={() => void copyText('Metadata', content)} className={`ml-auto ${button}`}><Clipboard className="size-4" /> Copy</button>
      <button onClick={() => downloadText(`sra-explorer-metadata.${format}`, content, mime)} className={primaryButton}><FileDown className="size-4" /> Download {format.toUpperCase()}</button>
    </div>
    <pre className={`max-h-[520px] ${codeBlock}`}><code>{content}</code></pre>
  </div>;
}

function BulkToolDetails({ runs }: { runs: RunSummary[] }) {
  return <div className="space-y-4">
    <p className="text-sm text-[#607286]">One command per saved run for popular download tools. These fetch FASTQ or normalized SRA; use the Original files tab for FAST5/POD5 and other submitter files.</p>
    <article className="rounded-2xl border border-[#b9dddd] bg-[#e8f6f5] p-4">
      <div className="flex flex-wrap items-center gap-2"><strong>nf-core/fetchngs</strong><span className="text-xs text-[#405563]">Nextflow pipeline: FASTQ + metadata + samplesheets for nf-core/rnaseq, taxprofiler, …</span><a href="https://nf-co.re/fetchngs" target="_blank" rel="noopener" className="ml-auto text-xs font-bold text-[#087f8c]">nf-co.re</a></div>
      <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => downloadText('ids.csv', buildFetchngsIds(runs), 'text/csv;charset=utf-8')} className={primaryButton}><FileDown className="size-4" /> ids.csv ({runs.length} runs)</button><button onClick={() => void copyText('Command', FETCHNGS_COMMAND)} className={button}><Clipboard className="size-3" /> Copy command</button></div>
      <pre className={`mt-3 ${codeBlock} rounded-xl p-3`}><code>{FETCHNGS_COMMAND}</code></pre>
    </article>
    {toolCommands.map((tool) => {
      const commands = runs.map((run) => tool.command(run.accession)).join('\n') + '\n';
      return <article key={tool.name} className="rounded-2xl border border-[#dce6eb] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2"><strong>{tool.name}</strong><span className="text-xs text-[#607286]">{tool.capabilities}</span><a href={tool.href} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[#087f8c]"><Github className="size-3" /> GitHub</a><button onClick={() => void copyText(`${tool.name} commands`, commands)} className={button}><Clipboard className="size-3" /> Copy</button></div>
        <pre className={`mt-3 max-h-60 ${codeBlock} rounded-xl p-3`}><code>{commands}</code></pre>
      </article>;
    })}
  </div>;
}

type PasteState = { text: string; message: { tone: 'ok' | 'warn' | 'error'; text: string } | null };

function AddAccessions({ onAdd, collapsible, state: [paste, setPaste] }: { onAdd: (runs: RunSummary[]) => void; collapsible?: boolean; state: [PasteState, React.Dispatch<React.SetStateAction<PasteState>>] }) {
  const [open, setOpen] = useState(!collapsible || Boolean(paste.message));
  const [busy, setBusy] = useState(false);
  const { text, message } = paste;
  const setText = (value: string) => setPaste((current) => ({ ...current, text: value }));
  const setMessage = (value: PasteState['message']) => setPaste((current) => ({ ...current, message: value }));
  const detected = useMemo(() => extractAccessions(text).length, [text]);

  async function submit() {
    setBusy(true); setMessage(null);
    try {
      const data = await browserSources.lookupAccessions(extractAccessions(text));
      onAdd(data.runs);
      const parts = [`Added ${data.runs.length.toLocaleString()} runs.`];
      if (data.unmatched.length) parts.push(`Not found: ${data.unmatched.slice(0, 10).join(', ')}${data.unmatched.length > 10 ? ` and ${data.unmatched.length - 10} more` : ''}.`);
      if (data.truncated) parts.push(`Stopped at ${data.runs.length.toLocaleString()} runs; split the list to add more.`);
      setMessage({ tone: data.unmatched.length || data.truncated || !data.runs.length ? 'warn' : 'ok', text: parts.join(' ') });
      if (data.runs.length) { toast.success(`Added ${data.runs.length} runs to the collection`); if (!data.unmatched.length) setText(''); }
    } catch (cause) {
      setMessage({ tone: 'error', text: cause instanceof Error ? cause.message : 'Lookup failed.' });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button onClick={() => setOpen(true)} className={`mb-3 ${button}`}><ClipboardPaste className="size-4" /> Paste accession list</button>;
  return <section className="mb-4 rounded-2xl border border-[#dce6eb] bg-white p-4">
    <div className="flex items-center"><strong className="text-sm">Add runs from an accession list</strong>{collapsible ? <button onClick={() => setOpen(false)} className="ml-auto text-[#607286]" aria-label="Close"><X className="size-4" /></button> : null}</div>
    <p className="mt-1 text-xs text-[#607286]">Paste anything containing SRR/ERR/DRR, SRX, SRP, PRJNA/PRJEB, SAMN, GSE or GSM accessions — a column from a spreadsheet, a paper's data availability statement, etc. Projects and experiments expand to all their runs.</p>
    <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} placeholder={'SRR12881185\nPRJNA517295\nGSM1234567'} className="mt-3 w-full rounded-xl border border-[#dce6eb] px-3 py-2 font-mono text-xs outline-none focus:border-[#087f8c]" />
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <button onClick={() => void submit()} disabled={busy || !detected} className={primaryButton}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <ClipboardPaste className="size-4" />} Add {detected ? `${detected} accession${detected === 1 ? '' : 's'}` : 'runs'}</button>
      {detected > 500 ? <span className="text-xs text-red-700">At most 500 accessions per lookup.</span> : null}
      {message ? <span className={`text-xs ${message.tone === 'error' ? 'text-red-700' : message.tone === 'warn' ? 'text-[#9a5b00]' : 'text-[#07535b]'}`}>{message.text}</span> : null}
    </div>
  </section>;
}
