import type { Page, Route } from '@playwright/test';

export const runs = Array.from({ length: 6 }, (_, index) => ({
  accession: `SRR10000${index}`,
  title: index % 2 ? `Liver tumour rep${index}` : `Liver normal rep${index}`,
  platform: index < 4 ? 'Illumina NovaSeq 6000' : 'MinION',
  totalBases: (index + 1) * 1_000_000_000,
  createdAt: `2021/0${index + 1}/15`,
  project: 'PRJNA100000',
  organism: index < 5 ? 'Homo sapiens' : 'Mus musculus',
  strategy: 'RNA-Seq',
  source: 'TRANSCRIPTOMIC',
  layout: index < 4 ? 'PAIRED' : 'SINGLE',
  experiment: `SRX20000${index}`,
  study: 'SRP300000',
  biosample: `SAMN4000000${index}`,
  spots: 1_000_000,
}));

function enaFiles(accession: string) {
  const index = Number(accession.slice(-1));
  const base = `https://ftp.sra.ebi.ac.uk/vol1/fastq/${accession.slice(0, 6)}/${accession}`;
  const fastq = index < 4 ? ['_1', '_2'] : [''];
  return [
    ...fastq.map((suffix) => ({ accession, representation: 'fastq', filename: `${accession}${suffix}.fastq.gz`, url: `${base}/${accession}${suffix}.fastq.gz`, size: 1_000_000, md5: `md5${index}${suffix}`, format: 'fastq.gz' })),
    { accession, representation: 'sra', filename: `${accession}.sra`, url: `https://sra-pub-run-odp.s3.amazonaws.com/sra/${accession}/${accession}`, size: null, md5: null, format: 'SRA Normalized' },
  ];
}

function originalFiles(accession: string) {
  return Number(accession.slice(-1)) >= 4 ? [{ accession, representation: 'original', filename: 'reads.pod5', url: `https://sra-pub-src-1.s3.amazonaws.com/${accession}/reads.pod5`, size: 50_000_000_000, md5: 'pod5md5', format: 'nanopore' }] : [];
}

export type MockOptions = { failOriginalFor?: string[]; emptyEnaFor?: string[] };

/** Mock every API the UI calls so tests never depend on NCBI or ENA. Returns a log of file-batch requests. */
export async function mockApi(page: Page, options: MockOptions = {}) {
  const fileRequests: Array<{ accessions: string[]; include: string[] }> = [];
  let failOriginal = new Set(options.failOriginalFor || []);
  let emptyEna = new Set(options.emptyEnaFor || []);
  await page.route('**/api/v1/search?*', async (route: Route) => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    const results = q === 'nothing' ? [] : runs;
    await route.fulfill({ json: { query: `${q}[All Fields]`, total: results.length, loaded: results.length, batchSize: 500, results, nextCursor: null, source: 'NCBI E-utilities' } });
  });
  await page.route('**/api/v1/files/batch', async (route) => {
    const body = route.request().postDataJSON() as { accessions: string[]; include: string[] };
    fileRequests.push(body);
    const results = body.accessions.map((accession) => {
      if (body.include.includes('original') && failOriginal.has(accession)) return { accession, files: [], sources: [], checked: ['original'], errors: ['Original files unknown: NCBI Run Browser returned HTTP 503'] };
      const files = body.include.includes('original') ? originalFiles(accession) : emptyEna.has(accession) ? [] : enaFiles(accession);
      return { accession, files, sources: [], checked: body.include, errors: [] };
    });
    await route.fulfill({ json: { results } });
  });
  await page.route('**/api/v1/runs/lookup', async (route) => {
    const { text } = route.request().postDataJSON() as { text: string };
    const found = runs.filter((run) => text.includes(run.accession));
    await route.fulfill({ json: { accessions: [], runs: found, unmatched: text.includes('SRR999999') ? ['SRR999999'] : [], truncated: false, total: found.length } });
  });
  return { fileRequests, healOriginal: () => { failOriginal = new Set(); }, healEna: () => { emptyEna = new Set(); } };
}
