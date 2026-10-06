import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, Bookmark, Check, Copy, ExternalLink } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';

import { enaRunUrl, formatBases, formatDate, layoutLabel, ncbiRunUrl } from './format';
import type { RunSummary } from './types';

export type SortKey = 'title' | 'accession' | 'organism' | 'strategy' | 'layout' | 'platform' | 'totalBases' | 'createdAt';
export type SortState = { key: SortKey; direction: 'asc' | 'desc' } | null;

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'accession', label: 'Run' },
  { key: 'organism', label: 'Organism' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'layout', label: 'Layout' },
  { key: 'platform', label: 'Instrument' },
  { key: 'totalBases', label: 'Bases' },
  { key: 'createdAt', label: 'Created' },
];

const GRID = 'grid grid-cols-[40px_minmax(240px,1fr)_150px_170px_110px_80px_150px_90px_100px] items-center gap-x-3';

export function sortRuns(runs: RunSummary[], sort: SortState) {
  if (!sort) return runs;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...runs].sort((a, b) => {
    const left = a[sort.key] ?? '';
    const right = b[sort.key] ?? '';
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
    if (sort.key === 'createdAt') return (Date.parse(String(left).replaceAll('/', '-')) - Date.parse(String(right).replaceAll('/', '-'))) * factor;
    return String(left).localeCompare(String(right), undefined, { numeric: true }) * factor;
  });
}

type Props = {
  runs: RunSummary[];
  selected: Set<string>;
  saved: Set<string>;
  sort: SortState;
  onSort: (key: SortKey) => void;
  onToggle: (accession: string, index: number, range: boolean) => void;
  onToggleAll: () => void;
};

export function RunTable({ runs, selected, saved, sort, onSort, onToggle, onToggleAll }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: runs.length, getScrollElement: () => parentRef.current, estimateSize: () => 52, overscan: 12 });
  const selectedVisible = runs.reduce((count, run) => count + Number(selected.has(run.accession)), 0);
  const allSelected = runs.length > 0 && selectedVisible === runs.length;
  const partiallySelected = selectedVisible > 0 && !allSelected;

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-[#dce6eb] bg-white shadow-[0_10px_30px_rgba(7,27,47,.05)]">
      <div className="min-w-[1180px]">
        <div role="row" className={`${GRID} border-b border-[#dce6eb] bg-[#f8fafb] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[.08em] text-[#087f8c]`}>
          <button type="button" onClick={onToggleAll} disabled={!runs.length} className={`grid size-4 place-items-center rounded border transition disabled:opacity-40 ${allSelected || partiallySelected ? 'border-[#087f8c] bg-[#087f8c] text-white' : 'border-[#9ab0bc] bg-white'}`} title={allSelected ? 'Clear all visible results' : 'Select all visible results'} aria-label={allSelected ? 'Clear all visible results' : 'Select all visible results'} aria-checked={partiallySelected ? 'mixed' : allSelected} role="checkbox">{allSelected ? <Check className="size-3" /> : partiallySelected ? <span className="h-0.5 w-2 rounded bg-white" /> : null}</button>
          {COLUMNS.map((column) => {
            const active = sort?.key === column.key;
            const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
            return <button key={column.key} type="button" onClick={() => onSort(column.key)} className={`inline-flex items-center gap-1 text-left uppercase hover:text-[#071b2f] ${active ? 'text-[#071b2f]' : ''}`} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>{column.label}<Icon className={`size-3 ${active ? '' : 'opacity-40'}`} /></button>;
          })}
        </div>
        <div ref={parentRef} className="max-h-[70vh] overflow-y-auto" style={{ height: Math.min(Math.max(runs.length, 3) * 52, 620) }}>
          {runs.length ? <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const run = runs[item.index];
              const active = selected.has(run.accession);
              const isSaved = saved.has(run.accession);
              return <div
                key={run.accession}
                role="row"
                aria-selected={active}
                onMouseDown={(event) => { if (event.shiftKey) event.preventDefault(); }}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a,button')) return;
                  if (!event.shiftKey && window.getSelection()?.toString()) return;
                  onToggle(run.accession, item.index, event.shiftKey);
                }}
                className={`group absolute left-0 ${GRID} w-full cursor-pointer select-text border-b border-[#edf2f4] px-4 text-left text-sm hover:bg-[#eef8f7] ${active ? 'bg-[#e4f4df]' : 'bg-white'}`}
                style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              >
                <button type="button" role="checkbox" aria-checked={active} aria-label={`Select ${run.accession}`} onClick={(event) => onToggle(run.accession, item.index, event.shiftKey)} className={`grid size-4 place-items-center rounded border ${active ? 'border-[#087f8c] bg-[#087f8c] text-white' : 'border-[#bdd0d8] bg-white'}`}>{active ? <Check className="size-3" /> : null}</button>
                <span className="flex min-w-0 items-center gap-2">
                  {isSaved ? <span title="Already in collection" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#c7f36b]/60 px-1.5 py-0.5 text-[10px] font-black uppercase text-[#2d4a00]"><Bookmark className="size-3" />Saved</span> : null}
                  <span className="truncate font-medium" title={run.title}>{run.title}</span>
                </span>
                <span className="flex items-center gap-1 font-mono text-[#087f8c]">
                  <span>{run.accession}</span>
                  <span className="flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                    <button type="button" title="Copy accession" aria-label={`Copy ${run.accession}`} onClick={() => void navigator.clipboard.writeText(run.accession).then(() => toast.success(`Copied ${run.accession}`))} className="rounded p-1 hover:bg-white"><Copy className="size-3" /></button>
                    <a href={ncbiRunUrl(run.accession)} target="_blank" rel="noopener" title="Open in NCBI SRA" className="rounded p-1 text-[10px] font-bold hover:bg-white">NCBI</a>
                    <a href={enaRunUrl(run.accession)} target="_blank" rel="noopener" title="Open in ENA" className="inline-flex items-center rounded p-1 text-[10px] font-bold hover:bg-white">ENA<ExternalLink className="ml-0.5 size-2.5" /></a>
                  </span>
                </span>
                <span className="truncate italic" title={run.organism}>{run.organism || '—'}</span>
                <span className="truncate" title={[run.strategy, run.source].filter(Boolean).join(' · ')}>{run.strategy || '—'}</span>
                <span>{layoutLabel(run.layout)}</span>
                <span className="truncate" title={run.platform}>{run.platform}</span>
                <span className="tabular-nums">{formatBases(run.totalBases)}</span>
                <span className="tabular-nums text-[#607286]">{formatDate(run.createdAt)}</span>
              </div>;
            })}
          </div> : <div className="grid h-full place-items-center text-sm text-[#607286]">No loaded runs match the current filters.</div>}
        </div>
      </div>
    </div>
  );
}
