import { createFileRoute } from '@tanstack/react-router';

import { normalizeLocale } from '@/config/site';
import { PrivacyPage } from '@/features/landing/site';
import { getLocale } from '@/paraglide/runtime.js';

export const Route = createFileRoute('/privacy')({
  component: () => <PrivacyPage locale={normalizeLocale(getLocale())} />,
});
