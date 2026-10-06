import type { DownloadFile, RunFilesResponse } from '../types';
import { assertRunAccession, parseAttributes } from './common.ts';

const NCBI_RUN = 'https://trace.ncbi.nlm.nih.gov/Traces/sra-db-be/run_new';
const ENA_FILES = 'https://www.ebi.ac.uk/ena/portal/api/filereport';

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

function splitField(value: string | undefined) {
  return value ? value.split(';').filter(Boolean) : [];
}

async function getNcbiOriginal(accession: string) {
  const url = new URL(NCBI_RUN);
  url.searchParams.set('acc', accession);
  const response = await fetch(url, { headers: { accept: 'application/xml' } });
  if (!response.ok) return { files: [] as DownloadFile[], project: '' };
  const xml = await response.text();
  const project = xml.match(/\bPRJ[A-Z]+\d+\b/i)?.[0]?.toUpperCase() || parseAttributes(xml.match(/<STUDY_REF\b([^>]*)/i)?.[1] || '').accession || '';
  return { files: parseOriginalFiles(xml, accession), project };
}

export async function getOriginalFiles(rawAccession: string) {
  const accession = assertRunAccession(rawAccession);
  const result = await getNcbiOriginal(accession);
  return { accession, files: result.files.map((file) => ({ ...file, project: result.project })), project: result.project };
}

async function getEnaFiles(accession: string) {
  const url = new URL(ENA_FILES);
  url.searchParams.set('result', 'read_run');
  url.searchParams.set('accession', accession);
  url.searchParams.set('format', 'json');
  url.searchParams.set('fields', 'fastq_ftp,fastq_bytes,fastq_md5,sra_ftp,sra_bytes,sra_md5');
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) return [];
  const rows = (await response.json()) as Array<Record<string, string>>;
  const files: DownloadFile[] = [];
  for (const row of rows) {
    const fastqUrls = splitField(row.fastq_ftp);
    const fastqSizes = splitField(row.fastq_bytes);
    const fastqMd5s = splitField(row.fastq_md5);
    fastqUrls.forEach((path, index) => files.push({ accession, representation: 'fastq', filename: path.split('/').pop() || `${accession}.fastq.gz`, url: path.startsWith('http') ? path : `https://${path}`, size: Number(fastqSizes[index]) || null, md5: fastqMd5s[index] || null, format: 'fastq.gz' }));
    splitField(row.sra_ftp).forEach((path, index) => files.push({ accession, representation: 'sra', filename: path.split('/').pop() || `${accession}.sra`, url: path.startsWith('http') ? path : `https://${path}`, size: Number(splitField(row.sra_bytes)[index]) || null, md5: splitField(row.sra_md5)[index] || null, format: 'SRA Normalized' }));
  }
  return files;
}

export async function getRunFiles(rawAccession: string): Promise<RunFilesResponse> {
  const accession = assertRunAccession(rawAccession);
  const [original, ena] = await Promise.all([getNcbiOriginal(accession), getEnaFiles(accession)]);
  const normalized = ena.some((file) => file.representation === 'sra') ? [] : [{
    accession,
    representation: 'sra' as const,
    filename: `${accession}.sra`,
    url: `https://sra-pub-run-odp.s3.amazonaws.com/sra/${accession}/${accession}`,
    size: null,
    md5: null,
    format: 'SRA Normalized',
  }];
  return { accession, project: original.project, files: [...original.files, ...ena, ...normalized].map((file) => ({ ...file, project: original.project })), sources: ['NCBI Run Browser', 'ENA Portal API', 'NCBI SRA Cloud'] };
}
