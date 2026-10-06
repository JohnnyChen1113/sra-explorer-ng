import { createFileRoute } from '@tanstack/react-router';

import { ExplorerPage } from '@/features/sra-explorer/explorer';
import { envConfigs } from '@/config';

export const Route = createFileRoute('/')({
  head: () => ({ links: [{ rel: 'canonical', href: `${envConfigs.app_url.replace(/\/$/, '')}/` }] }),
  component: ExplorerPage,
});
