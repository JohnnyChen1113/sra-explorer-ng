import { niceFilename, shellQuote } from './format.ts';
import type { DownloadFile, RunSummary } from './types';

export type DownloadMethod = 'curl' | 'axel' | 'aspera' | 'fastq-dl' | 'kingfisher';

export type ScriptOptions = {
  representation: DownloadFile['representation'];
  files: DownloadFile[];
  runs: RunSummary[];
  method: DownloadMethod;
  rename: boolean;
  verifyMd5: boolean;
};

export const representationLabels = {
  fastq: { title: 'FASTQ', stem: 'fastq-files', directory: 'fastq-files' },
  sra: { title: 'SRA', stem: 'sra-files', directory: 'sra-files' },
  original: { title: 'Original submitted', stem: 'original-files', directory: 'original-submitted-files' },
} as const;

export function methodsFor(representation: DownloadFile['representation']): DownloadMethod[] {
  return representation === 'fastq' ? ['curl', 'axel', 'aspera', 'fastq-dl', 'kingfisher'] : ['curl', 'axel'];
}

// md5sum ships with Linux; macOS only has `md5`. The helper keeps scripts portable.
const MD5_HELPER = [
  'md5_check() {',
  '  local expected="$1" file="$2" actual',
  '  if command -v md5sum >/dev/null 2>&1; then actual=$(md5sum "$file" | cut -d" " -f1)',
  '  else actual=$(md5 -q "$file"); fi',
  '  if [ "$actual" = "$expected" ]; then echo "$file: OK"; else echo "$file: MD5 MISMATCH (expected $expected, got $actual)" >&2; return 1; fi',
  '}',
  '',
];

const ASPERA_HEADER = [
  '# Aspera private key shipped with IBM Aspera Connect / ascp; override with ASPERA_KEY=/path/to/key',
  'ASPERA_KEY="${ASPERA_KEY:-$HOME/.aspera/connect/etc/asperaweb_id_dsa.openssh}"',
  '',
];

function enaAsperaPath(url: string) {
  const match = url.match(/^(?:https?:\/\/|ftp:\/\/)?ftp\.sra\.ebi\.ac\.uk(\/vol1\/.+)$/);
  return match?.[1] ?? null;
}

function md5Line(file: DownloadFile, path: string, verify: boolean) {
  return verify && file.md5 ? [`md5_check ${shellQuote(file.md5)} ${path}`] : [];
}

export function buildDownloadScript({ representation, files, runs, method, rename, verifyMd5 }: ScriptOptions) {
  const selected = files.filter((file) => file.representation === representation);
  const byAccession = new Map(runs.map((run) => [run.accession, run]));
  const outputName = (file: DownloadFile) => (rename ? niceFilename(file, byAccession) : file.filename);
  const usesMd5 = verifyMd5 && selected.some((file) => file.md5);
  const body: string[] = [];

  if (method === 'curl' || method === 'axel' || method === 'aspera') {
    selected.forEach((file, index) => {
      const output = outputName(file);
      const asperaPath = method === 'aspera' ? enaAsperaPath(file.url) : null;
      const command = file.url.startsWith('s3://')
        ? `aws s3 cp ${shellQuote(file.url)} ${shellQuote(output)}`
        : asperaPath
          ? `ascp -QT -l 300m -P 33001 -i "$ASPERA_KEY" ${shellQuote(`era-fasp@fasp.sra.ebi.ac.uk:${asperaPath}`)} ${shellQuote(output)}`
          : method === 'axel'
            ? `axel -n 8 -a -o ${shellQuote(output)} ${shellQuote(file.url)}`
            : `curl -L --fail --retry 5 --continue-at - ${shellQuote(file.url)} -o ${shellQuote(output)}`;
      body.push(`echo "[${index + 1}/${selected.length}] ${file.accession}: ${output.replaceAll('"', '')}"`, command, ...md5Line(file, shellQuote(output), verifyMd5), '');
    });
  } else {
    const accessions = [...new Set(selected.map((file) => file.accession))];
    accessions.forEach((accession, index) => {
      const accessionFiles = selected.filter((file) => file.accession === accession);
      if (method === 'fastq-dl') {
        body.push(`echo "[${index + 1}/${accessions.length}] ${accession} (fastq-dl)"`, `fastq-dl --accession ${accession} --provider ena --outdir .`);
        accessionFiles.forEach((file) => {
          body.push(...md5Line(file, shellQuote(file.filename), verifyMd5));
          if (rename && outputName(file) !== file.filename) body.push(`mv -- ${shellQuote(file.filename)} ${shellQuote(outputName(file))}`);
        });
      } else {
        const project = accessionFiles[0]?.project || byAccession.get(accession)?.project || 'unassigned-project';
        body.push(`echo "[${index + 1}/${accessions.length}] ${accession} into ${project} (Kingfisher)"`, `kingfisher get -r ${accession} --output-directory ${shellQuote(project)} -m ena-ascp ena-ftp aws-http prefetch`);
        accessionFiles.forEach((file) => {
          const needsRename = rename && outputName(file) !== file.filename;
          if (!(verifyMd5 && file.md5) && !needsRename) return;
          body.push(
            `downloaded_file=$(find ${shellQuote(project)} -type f -name ${shellQuote(file.filename)} -print -quit)`,
            `if [ -z "$downloaded_file" ]; then echo "Could not locate ${file.filename} after Kingfisher download" >&2; exit 1; fi`,
            ...md5Line(file, '"$downloaded_file"', verifyMd5),
            ...(needsRename ? [`mv -- "$downloaded_file" ${shellQuote(`${project}/${outputName(file)}`)}`] : []),
          );
        });
      }
      body.push('');
    });
  }

  const directory = representationLabels[representation].directory;
  return [
    '#!/usr/bin/env bash',
    `# Generated by SRA Explorer NG: ${selected.length} ${representationLabels[representation].title} files from ${new Set(selected.map((file) => file.accession)).size} runs`,
    'set -euo pipefail',
    '',
    ...(usesMd5 ? MD5_HELPER : []),
    ...(method === 'aspera' ? ASPERA_HEADER : []),
    `mkdir -p ${directory}`,
    `cd ${directory}`,
    '',
    ...body,
    'echo "Done."',
    '',
  ].join('\n');
}

export function buildUrlList(files: DownloadFile[]) {
  return files.map((file) => file.url).join('\n') + (files.length ? '\n' : '');
}

export function buildManifest(files: DownloadFile[], runs: RunSummary[]) {
  const byAccession = new Map(runs.map((run) => [run.accession, run]));
  const header = ['accession', 'representation', 'filename', 'nice_filename', 'size_bytes', 'md5', 'url', 's3_url'];
  return [header.join('\t'), ...files.map((file) => [file.accession, file.representation, file.filename, niceFilename(file, byAccession), file.size ?? '', file.md5 ?? '', file.url, file.s3Url ?? ''].join('\t'))].join('\n') + '\n';
}

export function buildMetadataRows(runs: RunSummary[], files: DownloadFile[]) {
  const byAccession = new Map(runs.map((run) => [run.accession, run]));
  return runs.flatMap((run) => {
    const runFiles = files.filter((file) => file.accession === run.accession);
    const fastq = runFiles.filter((file) => file.representation === 'fastq');
    const sra = runFiles.find((file) => file.representation === 'sra');
    const originals = runFiles.filter((file) => file.representation === 'original');
    return (fastq.length ? fastq : [null]).map((fastqFile) => ({
      accession: run.accession,
      experiment: run.experiment || '',
      study: run.study || '',
      bioproject: run.project || '',
      biosample: run.biosample || '',
      title: run.title,
      organism: run.organism || '',
      library_strategy: run.strategy || '',
      library_source: run.source || '',
      library_layout: run.layout || '',
      platform: run.platform,
      spots: run.spots || '',
      total_bases: run.totalBases || '',
      create_date: run.createdAt,
      sra_url: sra?.url || '',
      sra_filename: sra?.filename || '',
      fastq_url: fastqFile?.url || '',
      fastq_filename: fastqFile?.filename || '',
      fastq_nice_filename: fastqFile ? niceFilename(fastqFile, byAccession) : '',
      fastq_md5: fastqFile?.md5 || '',
      fastq_size_bytes: fastqFile?.size || '',
      original_urls: originals.map((file) => file.url).join(';'),
    }));
  });
}

export type MetadataFormat = 'tsv' | 'csv' | 'json' | 'yaml';

export function serializeMetadata(rows: ReturnType<typeof buildMetadataRows>, format: MetadataFormat) {
  if (format === 'json') return JSON.stringify(rows, null, 2) + '\n';
  const columns = Object.keys(rows[0] || { accession: '' }) as Array<keyof (typeof rows)[number]>;
  if (format === 'yaml') return rows.map((row) => columns.map((column, index) => `${index ? '  ' : '- '}${column}: ${JSON.stringify(row[column])}`).join('\n')).join('\n') + '\n';
  if (format === 'csv') {
    const cell = (value: unknown) => { const text = String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
    return [columns.join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\n') + '\n';
  }
  return [columns.join('\t'), ...rows.map((row) => columns.map((column) => String(row[column]).replace(/[\t\n]/g, ' ')).join('\t'))].join('\n') + '\n';
}

export const toolCommands = [
  { name: 'Kingfisher', href: 'https://github.com/wwood/kingfisher-download', capabilities: 'FASTQ · SRA · ENA/AWS/GCP', command: (acc: string) => `kingfisher get -r ${acc} -m ena-ascp ena-ftp aws-http prefetch` },
  { name: 'iSeq', href: 'https://github.com/BioOmics/iSeq', capabilities: 'FASTQ · SRA · GSA/SRA/ENA/DDBJ', command: (acc: string) => `iseq -i ${acc} -g -r https` },
  { name: 'fastq-dl', href: 'https://github.com/rpetit3/fastq-dl', capabilities: 'FASTQ · ENA/SRA fallback', command: (acc: string) => `fastq-dl --accession ${acc} --provider ena --outdir .` },
  { name: 'SRA Toolkit', href: 'https://github.com/ncbi/sra-tools', capabilities: 'SRA · FASTQ conversion', command: (acc: string) => `prefetch ${acc}\nfasterq-dump --split-files --include-technical ${acc}` },
  { name: 'enaBrowserTools', href: 'https://github.com/enasequence/enaBrowserTools', capabilities: 'ENA submitted · FASTQ · SRA', command: (acc: string) => `enaDataGet -f submitted ${acc}` },
];

/** nf-core/fetchngs input: one accession per line. */
export function buildFetchngsIds(runs: RunSummary[]) {
  return runs.map((run) => run.accession).join('\n') + (runs.length ? '\n' : '');
}

export const FETCHNGS_COMMAND = 'nextflow run nf-core/fetchngs -profile docker --input ids.csv --outdir fetchngs-results';

/**
 * nf-core samplesheet (rnaseq/sarek style) pointing straight at ENA FASTQ URLs.
 * ENA sometimes adds an unpaired `<run>.fastq.gz` next to `_1`/`_2`; only the pairs are used then.
 */
export function buildNfcoreSamplesheet(runs: RunSummary[], files: DownloadFile[]) {
  const rows = ['sample,fastq_1,fastq_2,strandedness'];
  const skipped: string[] = [];
  runs.forEach((run) => {
    const fastq = files.filter((file) => file.accession === run.accession && file.representation === 'fastq');
    const read1 = fastq.find((file) => /_1\.f(ast)?q(\.gz)?$/.test(file.filename));
    const read2 = fastq.find((file) => /_2\.f(ast)?q(\.gz)?$/.test(file.filename));
    if (read1 && read2) rows.push(`${run.accession},${read1.url},${read2.url},auto`);
    else if (fastq.length === 1) rows.push(`${run.accession},${fastq[0].url},,auto`);
    else skipped.push(run.accession);
  });
  return { csv: rows.join('\n') + '\n', skipped };
}
