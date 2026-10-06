import { envConfigs } from '@/config';

export const siteConfig = {
  name: envConfigs.app_name,
  url: envConfigs.app_url,
  description: envConfigs.app_description,
  logo: envConfigs.app_logo,
  email: 'hello@example.com',
  githubUrl: '',
  nav: [
    { href: '/', label: { zh: '首页', en: 'Home' } },
    { href: '/docs', label: { zh: '文档', en: 'Docs' } },
    { href: '/blog', label: { zh: '博客', en: 'Blog' } },
  ],
  footerLinks: [
    { href: '/terms', label: { zh: '服务条款', en: 'Terms' } },
    { href: '/privacy', label: { zh: '隐私政策', en: 'Privacy' } },
  ],
};

export type SupportedLocale = 'zh' | 'en';

export function normalizeLocale(locale: string): SupportedLocale {
  return locale === 'en' ? 'en' : 'zh';
}
