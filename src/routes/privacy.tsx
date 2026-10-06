import { createFileRoute } from '@tanstack/react-router';

import { PrivacyPage } from '@/features/sra-explorer/legal';

export const Route = createFileRoute('/privacy')({
  head: () => ({ meta: [{ title: 'Privacy — SRA Explorer NG' }] }),
  component: PrivacyPage,
});
