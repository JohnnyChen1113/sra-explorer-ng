import { createFileRoute } from '@tanstack/react-router';

import { TermsPage } from '@/features/sra-explorer/legal';

export const Route = createFileRoute('/terms')({
  head: () => ({ meta: [{ title: 'Terms — SRA Explorer NG' }] }),
  component: TermsPage,
});
