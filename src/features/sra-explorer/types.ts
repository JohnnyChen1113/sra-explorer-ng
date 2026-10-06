export type RunSummary = {
  accession: string;
  title: string;
  platform: string;
  totalBases: number;
  createdAt: string;
  project?: string;
};

export type SearchCursor = {
  webEnv: string;
  queryKey: string;
  nextStart: number;
  total: number;
  query: string;
};

export type SearchResponse = {
  query: string;
  total: number;
  loaded: number;
  batchSize: number;
  results: RunSummary[];
  nextCursor: string | null;
  source: 'NCBI E-utilities';
};

export type DownloadFile = {
  accession: string;
  representation: 'original' | 'fastq' | 'sra';
  filename: string;
  url: string;
  size: number | null;
  md5: string | null;
  format: string | null;
  s3Url?: string | null;
  project?: string;
};

export type RunFilesResponse = {
  accession: string;
  files: DownloadFile[];
  sources: string[];
  project?: string;
};
