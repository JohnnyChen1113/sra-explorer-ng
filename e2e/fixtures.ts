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
  sample: `SRS50000${index}`,
  spots: 1_000_000,
}));

function enaRow(accession: string) {
  const index = Number(accession.slice(-1));
  const base = `ftp.sra.ebi.ac.uk/vol1/fastq/${accession.slice(0, 6)}/${accession}`;
  const suffixes = index < 4 ? ['_1', '_2'] : [''];
  return {
    run_accession: accession,
    fastq_ftp: suffixes.map((suffix) => `${base}/${accession}${suffix}.fastq.gz`).join(';'),
    fastq_bytes: suffixes.map(() => '1000000').join(';'),
    fastq_md5: suffixes.map((suffix) => `md5${index}${suffix}`).join(';'),
    sra_ftp: '', sra_bytes: '', sra_md5: '',
  };
}

type Run = (typeof runs)[number];

function esummaryItem(run: Run) {
  const expxml = `<Summary><Title>${run.title}</Title><Platform instrument_model="${run.platform}">ILLUMINA</Platform></Summary><Experiment acc="${run.experiment}"/><Study acc="${run.study}"/><Organism ScientificName="${run.organism}"/><Sample acc="${run.sample}" name=""/><Library_descriptor><LIBRARY_STRATEGY>${run.strategy}</LIBRARY_STRATEGY><LIBRARY_SOURCE>${run.source}</LIBRARY_SOURCE><LIBRARY_LAYOUT><${run.layout}/></LIBRARY_LAYOUT></Library_descriptor><Bioproject>${run.project}</Bioproject><Biosample>${run.biosample}</Biosample>`;
  return { expxml, runs: `<Run acc="${run.accession}" total_spots="${run.spots}" total_bases="${run.totalBases}"/>`, createdate: run.createdAt };
}

function originalFiles(accession: string) {
  return Number(accession.slice(-1)) >= 4 ? [{ accession, representation: 'original', filename: 'reads.pod5', url: `https://sra-pub-src-1.s3.amazonaws.com/${accession}/reads.pod5`, size: 50_000_000_000, md5: 'pod5md5', format: 'nanopore' }] : [];
}

export type MockOptions = { failOriginalFor?: string[]; emptyEnaFor?: string[]; failEnaFor?: string[] };

/**
 * Mock NCBI E-utilities and ENA (called directly by the browser) plus our Original-file
 * endpoint, so tests never depend on the real archives.
 */
export async function mockApi(page: Page, options: MockOptions = {}) {
  const fileRequests: Array<{ accessions: string[]; include: string[] }> = [];
  const enaRequests: string[] = [];
  let failOriginal = new Set(options.failOriginalFor || []);
  let emptyEna = new Set(options.emptyEnaFor || []);
  let failEna = new Set(options.failEnaFor || []);

  await page.route('https://eutils.ncbi.nlm.nih.gov/**', async (route: Route) => {
    const request = route.request();
    const params = new URLSearchParams(request.method() === 'POST' ? request.postData() || '' : new URL(request.url()).search);
    if (request.url().includes('elink.fcgi')) {
      await route.fulfill({ json: { linksets: [{ dbfrom: 'pubmed', ids: [params.get('id')] }] } });
      return;
    }
    if (params.get('db') === 'pubmed') {
      const id = params.get('id') || '';
      await route.fulfill({ json: { result: { uids: [id], [id]: { title: 'Liver tumour transcriptomes.', fulljournalname: 'Journal of Tests', pubdate: '2022 Jun' } } } });
      return;
    }
    if (request.url().includes('esearch.fcgi')) {
      const term = params.get('term') || '';
      const matched = term === 'nothing' ? [] : request.method() === 'POST' ? runs.filter((run) => term.includes(run.accession)) : runs;
      await route.fulfill({ json: { esearchresult: { count: String(matched.length), webenv: 'WEBENV', querykey: matched.map((run) => run.accession).join(',') || 'none', querytranslation: `${term}[All Fields]` } } });
      return;
    }
    const wanted = (params.get('query_key') || '').split(',');
    const items = runs.filter((run) => wanted.includes(run.accession));
    await route.fulfill({ json: { result: { uids: items.map((_, index) => String(index)), ...Object.fromEntries(items.map((run, index) => [String(index), esummaryItem(run)])) } } });
  });

  await page.route('https://www.ebi.ac.uk/ena/portal/api/**', async (route) => {
    const request = route.request();
    // Single-run filereport (GET ?accession=) or bulk search (POST includeAccessions=a,b,c).
    const accessions = request.method() === 'POST'
      ? (new URLSearchParams(request.postData() || '').get('includeAccessions') || '').split(',').filter(Boolean)
      : [new URL(request.url()).searchParams.get('accession') || ''];
    enaRequests.push(...accessions);
    if (accessions.some((accession) => failEna.has(accession))) return route.fulfill({ status: 500, body: 'ENA error' });
    // ENA omits runs it has no files for.
    await route.fulfill({ json: accessions.filter((accession) => !emptyEna.has(accession)).map(enaRow) });
  });

  await page.route('**/api/v1/files/batch', async (route) => {
    const body = route.request().postDataJSON() as { accessions: string[]; include: string[] };
    fileRequests.push(body);
    const results = body.accessions.map((accession) => {
      if (failOriginal.has(accession)) return { accession, files: [], sources: [], checked: ['original'], errors: ['Original files unknown: NCBI Run Browser returned HTTP 503'] };
      return { accession, files: originalFiles(accession), sources: [], checked: ['original'], errors: [] };
    });
    await route.fulfill({ json: { results } });
  });

  return { fileRequests, enaRequests, healOriginal: () => { failOriginal = new Set(); }, healEna: () => { emptyEna = new Set(); failEna = new Set(); } };
}

export const seqoutProjects = [
  { accession: 'GSE100000', title: 'Liver tumour and normal tissue RNA-seq', summary: 'Bulk RNA-seq of matched liver samples.', updated_at: '2022-01-01', organisms: ['Homo sapiens'], source: 'geo', library_strategies: ['RNA-Seq'], instrument_models: ['Illumina NovaSeq 6000'], publications: [{ pmid: '30000001', title: 'Liver tumour transcriptomes.', journal: 'Journal of Tests', pub_date: '2022 Jun', citation_count: 12 }], pmid: '30000001' },
  // Loosely typed fields as seqout really returns them sometimes.
  { accession: 'SRP999999', title: 'Unrelated mouse study', organisms: ['Mus musculus'], source: 'sra', instrument_models: null, library_strategies: null, publications: [{ pmid: '30000002', title: 'Mouse paper', pub_date: 2020, journal: 'Mouse J' }] },
];

/** Mock seqout.org. With `down`, every seqout call fails so pages must degrade gracefully. */
export async function mockSeqout(page: Page, { down = false } = {}) {
  const calls: string[] = [];
  await page.route('https://seqout.org/api/**', async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname + url.search);
    if (down) return route.fulfill({ status: 503, body: 'down' });
    const path = url.pathname.replace('/api', '');
    if (path === '/search') {
      const q = url.searchParams.get('q') || '';
      const results = q === 'GSE100000' ? [seqoutProjects[0]] : q.startsWith('Liver tumour transcriptomes') ? [seqoutProjects[0]] : q === 'nothing' ? [] : seqoutProjects;
      return route.fulfill({ json: { results, total: null, next_cursor: null } });
    }
    if (path === '/project/GSE100000/xref') return route.fulfill({ json: { accession: 'GSE100000', xref: [{ accession: 'SRP300000', link_type: 'SRA' }, { accession: 'GSE1', link_type: 'SuperSeries of' }] } });
    if (path === '/project/SRP300000/enriched') {
      return route.fulfill({ json: { accession: 'SRP300000', n_samples: runs.length, samples: runs.map((run, index) => ({ sample: run.sample, title: `${run.title} sample`, tissue: 'Liver', disease: index % 2 ? 'Hepatocellular carcinoma' : 'Healthy', sex: 'Female', age: '50 years', cell_type: null })) } });
    }
    if (path.startsWith('/accession/')) return route.fulfill({ json: { project_accession: 'GSE100000' } });
    return route.fulfill({ status: 404, json: { detail: 'not found' } });
  });
  return { calls };
}
