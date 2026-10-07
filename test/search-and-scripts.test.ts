import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { parseSummaryResponse } from '../src/features/sra-explorer/server/ncbi.ts';
import { buildDownloadScript, buildMetadataRows, serializeMetadata } from '../src/features/sra-explorer/scripts.ts';
import { formatBases, niceFilename } from '../src/features/sra-explorer/format.ts';
import type { DownloadFile, RunSummary } from '../src/features/sra-explorer/types.ts';

const expxml = `<Summary><Title>Nanopore Direct-RNA Sequence rep1 raw fast5</Title><Platform instrument_model="GridION">OXFORD_NANOPORE</Platform><Statistics total_runs="1"/></Summary><Experiment acc="SRX9347134" ver="1"/><Study acc="SRP182578" name="x"/><Organism taxid="3694" ScientificName="Populus trichocarpa"/><Sample acc="SRS4295403" name=""/><Library_descriptor><LIBRARY_STRATEGY>RNA-Seq</LIBRARY_STRATEGY><LIBRARY_SOURCE>TRANSCRIPTOMIC</LIBRARY_SOURCE><LIBRARY_LAYOUT><SINGLE/></LIBRARY_LAYOUT></Library_descriptor><Bioproject>PRJNA517295</Bioproject><Biosample>SAMN10824325</Biosample>`;

test('parses run metadata from an esummary payload', () => {
  const runs = parseSummaryResponse({ result: { uids: ['1'], '1': { expxml, runs: '<Run acc="SRR12881185" total_spots="725156" total_bases="613276147"/>', createdate: '2020/10/23' } } });
  assert.deepEqual(runs, [{
    accession: 'SRR12881185', title: 'Nanopore Direct-RNA Sequence rep1 raw fast5', platform: 'GridION', totalBases: 613276147, createdAt: '2020/10/23',
    project: 'PRJNA517295', organism: 'Populus trichocarpa', strategy: 'RNA-Seq', source: 'TRANSCRIPTOMIC', layout: 'SINGLE',
    experiment: 'SRX9347134', study: 'SRP182578', biosample: 'SAMN10824325', sample: 'SRS4295403', spots: 725156,
  }]);
});

const runs: RunSummary[] = [{ accession: 'SRR1', title: "Liver rep1 (patient's)", platform: 'NovaSeq', totalBases: 2_500_000_000, createdAt: '2020/01/01', project: 'PRJNA1' }];
const files: DownloadFile[] = [
  { accession: 'SRR1', representation: 'fastq', filename: 'SRR1_1.fastq.gz', url: 'https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR1/SRR1_1.fastq.gz', size: 10, md5: 'aaa', format: 'fastq.gz' },
  { accession: 'SRR1', representation: 'fastq', filename: 'SRR1_2.fastq.gz', url: 'https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR1/SRR1_2.fastq.gz', size: 10, md5: null, format: 'fastq.gz' },
];

function assertValidBash(script: string) {
  execFileSync('bash', ['-n'], { input: script });
}

test('generated scripts are valid bash for every method', () => {
  for (const method of ['curl', 'axel', 'aspera', 'fastq-dl', 'kingfisher'] as const) {
    for (const rename of [true, false]) assertValidBash(buildDownloadScript({ representation: 'fastq', files, runs, method, rename, verifyMd5: true }));
  }
});

test('MD5 checks use a portable helper and skip files without checksums', () => {
  const script = buildDownloadScript({ representation: 'fastq', files, runs, method: 'curl', rename: false, verifyMd5: true });
  assert.match(script, /md5_check\(\) \{/);
  assert.match(script, /md5 -q/);
  assert.equal(script.match(/^md5_check '/gm)?.length, 1);
  assert.doesNotMatch(buildDownloadScript({ representation: 'fastq', files, runs, method: 'curl', rename: false, verifyMd5: false }), /md5_check/);
});

test('aspera converts ENA URLs to fasp paths', () => {
  const script = buildDownloadScript({ representation: 'fastq', files, runs, method: 'aspera', rename: false, verifyMd5: false });
  assert.match(script, /ascp -QT -l 300m -P 33001 -i "\$ASPERA_KEY" 'era-fasp@fasp\.sra\.ebi\.ac\.uk:\/vol1\/fastq\/SRR1\/SRR1_1\.fastq\.gz'/);
});

test('renamed files are shell-safe', () => {
  assert.equal(niceFilename(files[0], runs), 'SRR1_Liver_rep1_patient_s_1.fastq.gz');
});

test('metadata CSV quotes commas and keeps one row per FASTQ', () => {
  const rows = buildMetadataRows([{ ...runs[0], title: 'a, b' }], files);
  assert.equal(rows.length, 2);
  assert.match(serializeMetadata(rows, 'csv'), /"a, b"/);
});

test('formats bases in Mb and Gb', () => {
  assert.equal(formatBases(613_276_147), '613 Mb');
  assert.equal(formatBases(2_500_000_000), '2.5 Gb');
  assert.equal(formatBases(0), '—');
});

test('nf-core samplesheet pairs reads and ignores the unpaired ENA file', async () => {
  const { buildNfcoreSamplesheet, buildFetchngsIds } = await import('../src/features/sra-explorer/scripts.ts');
  const paired = [...files, { ...files[0], filename: 'SRR1.fastq.gz', url: 'https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR1/SRR1.fastq.gz' }];
  const single: DownloadFile = { ...files[0], accession: 'SRR2', filename: 'SRR2.fastq.gz', url: 'https://x/SRR2.fastq.gz' };
  const runs2 = [...runs, { ...runs[0], accession: 'SRR2' }, { ...runs[0], accession: 'SRR3' }];
  const { csv, skipped } = buildNfcoreSamplesheet(runs2, [...paired, single]);
  assert.equal(csv, 'sample,fastq_1,fastq_2,strandedness\nSRR1,https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR1/SRR1_1.fastq.gz,https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR1/SRR1_2.fastq.gz,auto\nSRR2,https://x/SRR2.fastq.gz,,auto\n');
  assert.deepEqual(skipped, ['SRR3']);
  assert.equal(buildFetchngsIds(runs2), 'SRR1\nSRR2\nSRR3\n');
});

test('extracts accessions from free text', async () => {
  const { extractAccessions } = await import('../src/features/sra-explorer/server/ncbi.ts');
  assert.deepEqual(extractAccessions('Data: PRJNA517295 (runs srr12881185, SRR12881185; GSE30567), SAMN10824325 and ERP009109.'), ['PRJNA517295', 'SRR12881185', 'GSE30567', 'SAMN10824325', 'ERP009109']);
});

test('bulk ENA rows are grouped per run and unknown runs get no files', async () => {
  const { parseEnaBulkRows } = await import('../src/features/sra-explorer/core/sources.ts');
  const byRun = parseEnaBulkRows([
    { run_accession: 'SRR2', fastq_ftp: 'ftp.sra.ebi.ac.uk/vol1/fastq/SRR2/SRR2_1.fastq.gz;ftp.sra.ebi.ac.uk/vol1/fastq/SRR2/SRR2_2.fastq.gz', fastq_md5: 'aaa;bbb', fastq_bytes: '10;20', sra_ftp: '' },
    { run_accession: 'SRR9', fastq_ftp: 'x/SRR9.fastq.gz', fastq_md5: 'zzz' },
  ], ['SRR1', 'SRR2']);
  assert.deepEqual([...byRun.keys()], ['SRR1', 'SRR2']);
  assert.deepEqual(byRun.get('SRR1'), []);
  assert.deepEqual(byRun.get('SRR2')!.map((file) => [file.filename, file.md5, file.size]), [['SRR2_1.fastq.gz', 'aaa', 10], ['SRR2_2.fastq.gz', 'bbb', 20]]);
});
