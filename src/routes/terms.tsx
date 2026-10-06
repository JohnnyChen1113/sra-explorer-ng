import { createFileRoute } from '@tanstack/react-router';

import { normalizeLocale } from '@/config/site';
import { TermsPage } from '@/features/landing/site';
import { getLocale } from '@/paraglide/runtime.js';

export const Route = createFileRoute('/terms')({
  component: () => <TermsPage locale={normalizeLocale(getLocale())} />,
});
