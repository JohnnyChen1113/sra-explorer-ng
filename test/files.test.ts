import assert from 'node:assert/strict';
import test from 'node:test';

import { parseOriginalFiles } from '../src/features/sra-explorer/server/files.ts';

test('extracts only NCBI Original files and their cloud alternatives', () => {
  const xml = `<RunBundle><SRAFiles>
    <SRAFile filename="reads.tar.gz" url="https://example.org/fallback" size="96733748771" md5="abc123" semantic_name="nanopore" supertype="Original">
      <Alternatives url="s3://bucket/run/reads.tar.gz.1" org="AWS"/>
      <Alternatives url="https://bucket.s3.amazonaws.com/run/reads.tar.gz.1" org="AWS"/>
    </SRAFile>
    <SRAFile filename="SRR1" url="https://example.org/sra" supertype="Primary ETL"/>
  </SRAFiles></RunBundle>`;
  assert.deepEqual(parseOriginalFiles(xml, 'SRR000001'), [{
    accession: 'SRR000001',
    representation: 'original',
    filename: 'reads.tar.gz',
    url: 'https://bucket.s3.amazonaws.com/run/reads.tar.gz.1',
    size: 96733748771,
    md5: 'abc123',
    format: 'nanopore',
    s3Url: 's3://bucket/run/reads.tar.gz.1',
  }]);
});

test('returns an empty list when no original submission exists', () => {
  assert.deepEqual(parseOriginalFiles('<SRAFile supertype="Primary ETL"/>', 'SRR000001'), []);
});

test('keeps Original files that NCBI exposes only through an authenticated S3 URI', () => {
  const xml = `<SRAFile filename="reads_R1.fastq.gz" size="42" md5="def456" semantic_name="fastq" supertype="Original"><Alternatives url="s3://sra-pub-src-4/SRR000001/reads_R1.fastq.gz.1" org="AWS"/></SRAFile>`;
  assert.deepEqual(parseOriginalFiles(xml, 'SRR000001'), [{
    accession: 'SRR000001', representation: 'original', filename: 'reads_R1.fastq.gz',
    url: 's3://sra-pub-src-4/SRR000001/reads_R1.fastq.gz.1', size: 42, md5: 'def456',
    format: 'fastq', s3Url: 's3://sra-pub-src-4/SRR000001/reads_R1.fastq.gz.1',
  }]);
});
