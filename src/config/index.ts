const metaEnv: Record<string, string | undefined> =
  (import.meta as any).env ?? {};
const procEnv: Record<string, string | undefined> =
  typeof process !== 'undefined' && process.env ? process.env : {};

const publicEnv = (key: string) => metaEnv[key] ?? procEnv[key];

export const envConfigs = {
  app_url: publicEnv('VITE_APP_URL') ?? 'https://sra.ai2paper.com',
  app_name: publicEnv('VITE_APP_NAME') ?? 'SRA Explorer NG',
  app_description:
    publicEnv('VITE_APP_DESCRIPTION') ??
    'Search NCBI SRA and batch-download FASTQ, normalized SRA, FAST5, POD5, and Original submitted files.',
  app_logo: publicEnv('VITE_APP_LOGO') ?? '/logo.svg',
  locale: publicEnv('VITE_DEFAULT_LOCALE') ?? 'en',
};
