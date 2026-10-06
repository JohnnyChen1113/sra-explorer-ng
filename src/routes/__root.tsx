/// <reference types="vite/client" />
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { envConfigs } from '@/config';
import { getLocale } from '@/paraglide/runtime.js';

import '@fontsource-variable/inter';
import '@fontsource/libre-baskerville/400.css';
import '@fontsource/libre-baskerville/700.css';
import '@fontsource/libre-baskerville/400-italic.css';
import '@/styles/globals.css';

export const Route = createRootRoute({
  head: () => {
    const appUrl = envConfigs.app_url.replace(/\/$/, '');
    const title = 'SRA Explorer NG — FASTQ, SRA & Original File Downloads';
    const description = 'Search NCBI Sequence Read Archive data and generate batch downloads for ENA FASTQ, normalized SRA, and Original submitted FAST5, POD5, BAM, or instrument-native files.';
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title },
        { name: 'description', content: description },
        { name: 'keywords', content: 'SRA download, FASTQ download, NCBI SRA, ENA FASTQ, FAST5 download, POD5 download, Original submitted files, sequencing data, bioinformatics' },
        { name: 'author', content: 'Junhao Chen' },
        { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' },
        { name: 'theme-color', content: '#071b2f' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'SRA Explorer NG' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: `${appUrl}/` },
        { property: 'og:image', content: `${appUrl}/og-image.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: `${appUrl}/og-image.png` },
      ],
      links: [
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
      scripts: [{
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'WebSite', '@id': `${appUrl}/#website`, url: `${appUrl}/`, name: 'SRA Explorer NG', alternateName: ['SRA Explorer', 'sra-explorer-ng'], description },
            { '@type': 'WebApplication', '@id': `${appUrl}/#application`, name: 'SRA Explorer NG', url: `${appUrl}/`, description, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', isAccessibleForFree: true, license: 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@type': 'Person', name: 'Junhao Chen' }, featureList: ['NCBI SRA search', 'ENA FASTQ batch downloads', 'Original submitted file discovery', 'FAST5 and POD5 access', 'Read-only API', 'Remote MCP server'] },
          ],
        }),
      }],
    };
  },
  component: RootComponent,
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <Outlet />
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <a href="/" className="text-sm underline underline-offset-4">
        Back to home
      </a>
    </main>
  );
}
