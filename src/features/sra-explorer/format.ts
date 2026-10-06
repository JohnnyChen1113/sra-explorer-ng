import type { DownloadFile, RunSummary } from './types';

export function formatBases(value: number) {
  if (!value) return '—';
  if (value >= 1e9) return `${(value / 1e9).toFixed(value >= 1e11 ? 0 : 1)} Gb`;
  return `${Math.max(1, Math.round(value / 1e6)).toLocaleString()} Mb`;
}

export function formatBytes(value: number | null) {
  if (!value) return 'Size unavailable';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function formatDate(value: string) {
  if (!value) return '—';
  const date = new Date(value.replaceAll('/', '-'));
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

export function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function cleanTitle(title: string) {
  return title.replace(/[^a-z0-9._-]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 120);
}

export function niceFilename(file: DownloadFile, runs: RunSummary[] | Map<string, RunSummary>) {
  const run = runs instanceof Map ? runs.get(file.accession) : runs.find((item) => item.accession === file.accession);
  if (!run) return file.filename;
  const suffix = file.filename.startsWith(file.accession) ? file.filename.slice(file.accession.length) : `_${file.filename}`;
  const title = cleanTitle(run.title);
  return title ? `${file.accession}_${title}${suffix}` : `${file.accession}${suffix}`;
}

export function dedupeRuns(existing: RunSummary[], incoming: RunSummary[]) {
  const map = new Map(existing.map((run) => [run.accession, run]));
  incoming.forEach((run) => map.set(run.accession, { ...map.get(run.accession), ...run }));
  return [...map.values()];
}

export function layoutLabel(layout?: string) {
  return layout === 'PAIRED' ? 'Paired' : layout === 'SINGLE' ? 'Single' : layout ? layout[0] + layout.slice(1).toLowerCase() : '—';
}

export const ncbiRunUrl = (accession: string) => `https://www.ncbi.nlm.nih.gov/sra/${accession}`;
export const enaRunUrl = (accession: string) => `https://www.ebi.ac.uk/ena/browser/view/${accession}`;

/** "1 run", "2 runs"; numbers are locale-formatted. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}
