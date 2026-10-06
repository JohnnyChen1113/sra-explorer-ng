import type { DownloadFile, RunFilesResponse } from '../types';
import { assertRunAccession, parseAttributes } from './common.ts';
import { sources } from './ncbi.ts';
import { upstreamFetch } from './upstream.ts';

const NCBI_RUN = 'https://trace.ncbi.nlm.nih.gov/Traces/sra-db-be/run_new';

export function parseOriginalFiles(xml: string, accession: string): DownloadFile[] {
  const files: DownloadFile[] = [];
  const pattern = /<SRAFile\b([^>]*)>([\s\S]*?)<\/SRAFile>|<SRAFile\b([^>]*)\/>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const attrs = parseAttributes(match[1] || match[3]);
    if ((attrs.supertype || '').toLowerCase() !== 'original') continue;
    const body = match[2] || '';
    const alternatives = [...body.matchAll(/<Alternatives\b([^>]*)\/?\s*>/g)].map((item) => parseAttributes(item[1]));
    const https = alternatives.find((item) => item.url?.startsWith('https://'))?.url || attrs.url;
    const s3 = alternatives.find((item) => item.url?.startsWith('s3://'))?.url || null;
    const downloadable = https || s3;
    if (!downloadable) continue;
    files.push({ accession, representation: 'original', filename: attrs.filename || `${accession}.original`, url: downloadable, size: Number(attrs.size) || null, md5: attrs.md5 || null, format: attrs.semantic_name || 'Original', s3Url: s3 });
  }
  return files;
}

async function getNcbiOriginal(accession: string) {
  const url = new URL(NCBI_RUN);
  url.searchParams.set('acc', accession);
  const response = await upstreamFetch('trace', url, { headers: { accept: 'application/xml' } }, 'NCBI Run Browser');
  if (response.status === 404) return { files: [] as DownloadFile[], project: '' };
  if (!response.ok) throw new Error(`NCBI Run Browser returned HTTP ${response.status}`);
  const xml = await response.text();
  const project = xml.match(/\bPRJ[A-Z]+\d+\b/i)?.[0]?.toUpperCase() || parseAttributes(xml.match(/<STUDY_REF\b([^>]*)/i)?.[1] || '').accession || '';
  return { files: parseOriginalFiles(xml, accession), project };
}

export async function getOriginalFiles(rawAccession: string) {
  const accession = assertRunAccession(rawAccession);
  const result = await getNcbiOriginal(accession);
  return { accession, files: result.files.map((file) => ({ ...file, project: result.project })), project: result.project };
}

export type FileSource = 'ena' | 'original';

export async function getRunFiles(rawAccession: string, include: FileSource[] = ['ena', 'original']): Promise<RunFilesResponse> {
  const accession = assertRunAccession(rawAccession);
  const [ena, original] = await Promise.all([
    include.includes('ena') ? sources.enaRunFiles(accession) : null,
    include.includes('original') ? getNcbiOriginal(accession).then(
      (result) => ({ ...result, errors: [] as string[] }),
      (error) => ({ files: [] as DownloadFile[], project: '', errors: [`Original files unknown: ${error instanceof Error ? error.message : 'NCBI lookup failed'}`] }),
    ) : null,
  ]);
  const project = original?.project || '';
  const files = [...(original?.files || []), ...(ena?.files || [])].map((file) => (project ? { ...file, project } : file));
  const sourcesUsed = [...(original ? ['NCBI Run Browser'] : []), ...(ena?.sources || [])];
  return { accession, project: project || undefined, files, sources: sourcesUsed, checked: include, errors: [...(original?.errors || []), ...(ena?.errors || [])] };
}
