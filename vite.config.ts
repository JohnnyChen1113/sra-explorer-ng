import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

import { loadEnvFiles } from './src/lib/env';

loadEnvFiles();

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      cookieName: 'PARAGLIDE_LOCALE',
      strategy: ['url', 'cookie', 'baseLocale'],
      urlPatterns: [
        {
          pattern: '/api/:path(.*)?',
          localized: [
            ['zh', '/api/:path(.*)?'],
            ['en', '/api/:path(.*)?'],
          ],
        },
        {
          pattern: '/',
          localized: [
            ['zh', '/'],
            ['en', '/en'],
          ],
        },
        {
          pattern: '/:path(.*)?',
          localized: [
            ['zh', '/:path(.*)?'],
            ['en', '/en/:path(.*)?'],
          ],
        },
      ],
    }),
    tanstackStart({
      srcDirectory: 'src',
    }),
    viteReact(),
    // Original-file lookups wait on NCBI's Run Browser (2-5 s per run, rate limited),
    // so a 20-run batch can need ~30 s.
    nitro({ vercel: { functions: { maxDuration: 60 } } }),
  ],
});
