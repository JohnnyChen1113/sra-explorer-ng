import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Cloud,
  Code2,
  FileText,
  Github,
  Languages,
  Mail,
  Moon,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { LocaleSelector } from '@/components/locale-selector';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { siteConfig, type SupportedLocale } from '@/config/site';
import { getLandingCopy } from '@/features/landing/copy';

function label(item: { label: Record<SupportedLocale, string> }, locale: SupportedLocale) {
  return item.label[locale];
}

export function SiteShell({
  locale,
  children,
}: {
  locale: SupportedLocale;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f7f1e7] text-[#241f1a] dark:bg-[#151718] dark:text-[#f4efe8]">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[#f7f1e7]/90 backdrop-blur dark:border-white/10 dark:bg-[#151718]/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-3 font-serif text-xl font-bold">
            <img src={siteConfig.logo} alt="" className="h-9 w-9" />
            {siteConfig.name}
          </a>
          <nav className="hidden items-center gap-6 text-sm font-medium text-[#5c5146] md:flex dark:text-[#c9c0b5]">
            {siteConfig.nav.map((item) => (
              <a key={item.href} href={item.href} className="hover:text-[#1f6f5b]">
                {label(item, locale)}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LocaleSelector />
            <ThemeToggle />
          </div>
        </div>
      </header>
      {children}
      <Footer locale={locale} />
    </div>
  );
}

export function HomePage({ locale }: { locale: SupportedLocale }) {
  const copy = getLandingCopy(locale);

  return (
    <SiteShell locale={locale}>
      <main>
        <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Badge className="mb-6 border-[#1f6f5b]/30 bg-[#1f6f5b]/10 text-[#1f6f5b]">
              <Sparkles className="mr-2 h-4 w-4" />
              {copy.eyebrow}
            </Badge>
            <h1 className="max-w-3xl font-serif text-5xl font-bold leading-tight tracking-normal md:text-7xl">
              {copy.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#5c5146] dark:text-[#c9c0b5]">
              {copy.description}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button render={<a href="/docs" />} size="lg" className="bg-[#1f6f5b] text-white hover:bg-[#185948]">
                <>
                  <BookOpen className="h-5 w-5" />
                  {copy.primaryCta}
                </>
              </Button>
              <Button render={<a href="#placeholders" />} size="lg" variant="outline">
                <>
                  <ArrowRight className="h-5 w-5" />
                  {copy.secondaryCta}
                </>
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-black/10 bg-white/60 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="grid gap-3">
              {[
                [Cloud, 'Cloudflare Workers'],
                [Languages, 'zh / en routes'],
                [Code2, 'API placeholders'],
                [Moon, 'Theme ready'],
              ].map(([Icon, text]) => (
                <div
                  key={text as string}
                  className="flex items-center justify-between rounded-md border border-black/10 bg-[#fffaf1] px-4 py-4 dark:border-white/10 dark:bg-[#1d2021]"
                >
                  <span className="font-medium">{text as string}</span>
                  <Icon className="h-5 w-5 text-[#1f6f5b]" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-black/10 bg-[#efe4d2] py-16 dark:border-white/10 dark:bg-[#1b1e1f]">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="font-serif text-3xl font-bold md:text-4xl">{copy.featuresTitle}</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {copy.features.map((feature: { title: string; description: string }) => (
                <Card key={feature.title} className="bg-[#fffaf1]/85">
                  <CardHeader>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="placeholders" className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-serif text-3xl font-bold md:text-4xl">{copy.placeholdersTitle}</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {copy.placeholders.map((item: string) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-md border border-black/10 bg-white/50 px-4 py-4 dark:border-white/10 dark:bg-white/5"
              >
                <CheckCircle2 className="h-5 w-5 text-[#1f6f5b]" />
                <span className="font-medium">{item}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </SiteShell>
  );
}

export function PlaceholderPage({
  locale,
  title,
  description,
  icon,
}: {
  locale: SupportedLocale;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <SiteShell locale={locale}>
      <main className="mx-auto min-h-[70vh] max-w-4xl px-5 py-20">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md bg-[#1f6f5b]/10 text-[#1f6f5b]">
          {icon}
        </div>
        <h1 className="font-serif text-5xl font-bold tracking-normal">{title}</h1>
        <p className="mt-6 text-lg leading-8 text-[#5c5146] dark:text-[#c9c0b5]">
          {description}
        </p>
      </main>
    </SiteShell>
  );
}

export function DocsPage({ locale }: { locale: SupportedLocale }) {
  const copy = getLandingCopy(locale);
  return (
    <PlaceholderPage
      locale={locale}
      title={copy.docsTitle}
      description={copy.docsDescription}
      icon={<BookOpen className="h-6 w-6" />}
    />
  );
}

export function BlogPage({ locale }: { locale: SupportedLocale }) {
  const copy = getLandingCopy(locale);
  return (
    <PlaceholderPage
      locale={locale}
      title={copy.blogTitle}
      description={copy.blogDescription}
      icon={<FileText className="h-6 w-6" />}
    />
  );
}

export function TermsPage({ locale }: { locale: SupportedLocale }) {
  const copy = getLandingCopy(locale);
  return (
    <PlaceholderPage
      locale={locale}
      title={copy.termsTitle}
      description={copy.termsDescription}
      icon={<FileText className="h-6 w-6" />}
    />
  );
}

export function PrivacyPage({ locale }: { locale: SupportedLocale }) {
  const copy = getLandingCopy(locale);
  return (
    <PlaceholderPage
      locale={locale}
      title={copy.privacyTitle}
      description={copy.privacyDescription}
      icon={<FileText className="h-6 w-6" />}
    />
  );
}

function Footer({ locale }: { locale: SupportedLocale }) {
  return (
    <footer className="border-t border-black/10 bg-[#1b1714] text-[#f7f1e7]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-serif text-xl font-bold">{siteConfig.name}</div>
          <div className="mt-1 text-sm text-[#d6cabb]">{siteConfig.description}</div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-[#d6cabb]">
          <a href={`mailto:${siteConfig.email}`} className="inline-flex items-center gap-2 hover:text-white">
            <Mail className="h-4 w-4" />
            {siteConfig.email}
          </a>
          {siteConfig.githubUrl ? (
            <a href={siteConfig.githubUrl} className="inline-flex items-center gap-2 hover:text-white">
              <Github className="h-4 w-4" />
              GitHub
            </a>
          ) : null}
          {siteConfig.footerLinks.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-white">
              {label(item, locale)}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
