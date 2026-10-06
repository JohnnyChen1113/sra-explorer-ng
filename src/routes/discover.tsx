import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { DiscoverPage } from '@/features/sra-explorer/discover';

export const Route = createFileRoute('/discover')({
  head: () => ({
    meta: [
      { title: 'Discover sequencing datasets — SRA Explorer NG' },
      { name: 'description', content: 'Search GEO, SRA, ENA, ArrayExpress, DDBJ and GSA datasets with seqout, see sample annotations, and send runs straight to an SRA Explorer download collection.' },
    ],
    links: [{ rel: 'canonical', href: `${envConfigs.app_url.replace(/\/$/, '')}/discover` }],
  }),
  component: DiscoverPage,
});
