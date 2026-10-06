import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Clipboard, FileDown, Github, LoaderCircle, Maximize2, Minimize2, RotateCw, ShoppingBasket, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useCollectionFiles, type CollectionFilesState } from './file-cache';
import { formatBases, formatBytes, layoutLabel, ncbiRunUrl, niceFilename } from './format';
import { buildDownloadScript, buildManifest, buildMetadataRows, buildUrlList, methodsFor, representationLabels, serializeMetadata, toolCommands, type DownloadMethod, type MetadataFormat } from './scripts';
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
  const state = useCollectionFiles(runs, open);
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
    ['original', 'Original files', counts.original],
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
        <LookupStatus state={state} total={runs.length} />
        <div className="min-h-0 flex-1 overflow-y-auto p-5 lg:p-7">
          {tab === 'runs' ? <CollectionRuns runs={runs} state={state} onRemove={(accession) => {
            const run = runs.find((item) => item.accession === accession);
            onRemove(accession);
            if (run) toast(`Removed ${accession}`, { action: { label: 'Undo', onClick: () => onReplace([...runs]) } });
          }} />
            : tab === 'metadata' ? <FullMetadata runs={runs} files={state.files} />
            : tab === 'tools' ? <BulkToolDetails runs={runs} />
            : <BulkFileDownloads key={tab} representation={tab} files={state.files} runs={runs} complete={!state.pending && !state.loading} />}
        </div>
      </> : <div className="grid flex-1 place-items-center text-center"><div><ShoppingBasket className="mx-auto size-10 text-[#9ab0bc]" /><div className="mt-4 font-bold">No saved runs yet</div><p className="mt-1 max-w-xs text-sm text-[#607286]">Select search results and add them to the collection, or import a previously exported collection JSON.</p></div></div>}
    </aside>
  </div>;
}

function LookupStatus({ state, total }: { state: CollectionFilesState; total: number }) {
  if (state.loading || state.pending) {
    const done = total - state.pending;
    return <div className="flex shrink-0 items-center gap-3 border-b border-[#dce6eb] bg-white px-5 py-2 text-xs text-[#405563]">
      <LoaderCircle className="size-4 animate-spin text-[#087f8c]" />
      <span>Looking up files: {done} / {total} runs</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e3eaee]"><div className="h-full rounded-full bg-[#087f8c] transition-[width]" style={{ width: `${(done / total) * 100}%` }} /></div>
    </div>;
  }
  if (state.error || state.failed.length) {
    return <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#efd998] bg-[#fff4cf] px-5 py-2 text-xs text-[#72530a]">
      <AlertTriangle className="size-4" />
      <span>{state.error || `${state.failed.length} runs could not be fully checked (NCBI or ENA did not answer). Their file lists may be incomplete.`}</span>
      <button onClick={state.retryFailed} className="ml-auto inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-bold"><RotateCw className="size-3" /> Retry</button>
    </div>;
  }
  return null;
}

function CollectionRuns({ runs, state, onRemove }: { runs: RunSummary[]; state: CollectionFilesState; onRemove: (accession: string) => void }) {
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? runs.filter((run) => [run.accession, run.title, run.organism, run.project].join(' ').toLowerCase().includes(needle)) : runs;
  }, [filter, runs]);
  return <div className="space-y-3">
    <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={`Filter ${runs.length} saved runs`} className="w-full rounded-xl border border-[#dce6eb] bg-white px-4 py-2 text-sm outline-none focus:border-[#087f8c]" />
    <div className="overflow-hidden rounded-2xl border border-[#dce6eb] bg-white">
      {visible.map((run) => {
        const result = state.results.get(run.accession);
        const problems = [...(result?.errors || []), ...(result?.error ? [result.error] : [])];
        const tally = { fastq: 0, sra: 0, original: 0 } as Record<DownloadFile['representation'], number>;
        result?.files.forEach((file) => { tally[file.representation] += 1; });
        return <div key={run.accession} className="flex items-start gap-3 border-b border-[#edf2f4] px-4 py-2.5 text-sm last:border-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2"><a href={ncbiRunUrl(run.accession)} target="_blank" rel="noopener" className="font-mono font-bold text-[#087f8c] hover:underline">{run.accession}</a><span className="truncate font-medium" title={run.title}>{run.title}</span></div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[#607286]">
              {run.organism ? <span className="italic">{run.organism}</span> : null}
              {run.strategy ? <span>{run.strategy}</span> : null}
              {run.layout ? <span>{layoutLabel(run.layout)}</span> : null}
              <span>{formatBases(run.totalBases)}</span>
              {result ? <span>{tally.fastq} FASTQ · {tally.original} Original</span> : <span>checking…</span>}
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

function BulkFileDownloads({ representation, files, runs, complete }: { representation: DownloadFile['representation']; files: DownloadFile[]; runs: RunSummary[]; complete: boolean }) {
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
      </div>
      <p className="text-xs text-[#607286]">Run with <code className="rounded bg-white px-1">bash download-{labels.stem}.sh</code>. Works on Linux and macOS.</p>
      {showManifest ? <section className="overflow-hidden rounded-2xl border border-[#dce6eb] bg-white"><div className="flex flex-wrap items-center gap-2 border-b border-[#dce6eb] px-4 py-3"><strong className="text-sm">Manifest TSV</strong><button onClick={() => void copyText('Manifest', manifest)} className={`ml-auto ${button}`}><Clipboard className="size-4" /> Copy</button><button onClick={() => downloadText(`${labels.stem}.tsv`, manifest, 'text/tab-separated-values;charset=utf-8')} className={primaryButton}><ArrowDownToLine className="size-4" /> Download</button></div><pre className={`max-h-[300px] rounded-none ${codeBlock}`}><code>{manifest}</code></pre></section> : null}
      <pre className={`max-h-[360px] ${codeBlock}`}><code>{script}</code></pre>
      <details className="overflow-hidden rounded-2xl border border-[#dce6eb] bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold">File list ({selectedFiles.length})</summary>
        {selectedFiles.slice(0, 2000).map((file) => <div key={`${file.accession}-${file.url}`} className="grid gap-1 border-t border-[#edf2f4] px-4 py-2.5 text-xs sm:grid-cols-[120px_1fr_auto]"><span className="font-mono font-bold text-[#087f8c]">{file.accession}</span><span className="min-w-0 break-all font-semibold">{rename ? niceFilename(file, byAccession) : file.filename}<span className="ml-2 font-normal text-[#607286]">{file.md5 ? `MD5 ${file.md5}` : 'No MD5'}</span></span><span className="text-[#607286]">{formatBytes(file.size)}</span></div>)}
        {selectedFiles.length > 2000 ? <div className="border-t border-[#edf2f4] px-4 py-2.5 text-xs text-[#607286]">Showing the first 2,000 files; the script and manifest include all {selectedFiles.length}.</div> : null}
      </details>
    </> : complete ? <div className="rounded-xl bg-[#e0f4f4] p-4 text-sm text-[#07535b]">No {labels.title} files were found for this collection.{representation === 'fastq' ? ' Runs that ENA has not mirrored only offer normalized SRA; see the SRA tab.' : ''}</div> : null}
  </div>;
}

function FullMetadata({ runs, files }: { runs: RunSummary[]; files: DownloadFile[] }) {
  const [format, setFormat] = useState<MetadataFormat>('tsv');
  const rows = useMemo(() => buildMetadataRows(runs, files), [runs, files]);
  const content = useMemo(() => serializeMetadata(rows, format), [rows, format]);
  const mime = { tsv: 'text/tab-separated-values', csv: 'text/csv', json: 'application/json', yaml: 'application/yaml' }[format] + ';charset=utf-8';
  return <div className="space-y-4">
    <p className="text-sm text-[#607286]">One row per FASTQ file (paired-end runs get one row per read file), with run, sample, and library metadata.</p>
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
    {toolCommands.map((tool) => {
      const commands = runs.map((run) => tool.command(run.accession)).join('\n') + '\n';
      return <article key={tool.name} className="rounded-2xl border border-[#dce6eb] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2"><strong>{tool.name}</strong><span className="text-xs text-[#607286]">{tool.capabilities}</span><a href={tool.href} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[#087f8c]"><Github className="size-3" /> GitHub</a><button onClick={() => void copyText(`${tool.name} commands`, commands)} className={button}><Clipboard className="size-3" /> Copy</button></div>
        <pre className={`mt-3 max-h-60 ${codeBlock} rounded-xl p-3`}><code>{commands}</code></pre>
      </article>;
    })}
  </div>;
}
