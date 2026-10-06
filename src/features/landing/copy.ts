import type { SupportedLocale } from '@/config/site';

export const landingCopy = {
  zh: {
    eyebrow: '轻量边缘站点模板',
    title: '把 landing 页面和小工具站快速上线',
    description:
      '一个无登录、无数据库、无后台的 TanStack Start 模板，适合产品介绍页、下载入口、AI 工具包装页和轻量业务前台。',
    primaryCta: '查看文档',
    secondaryCta: '开始改造',
    featuresTitle: '保留该保留的，去掉会拖慢起步的',
    features: [
      {
        title: 'Cloudflare 优先',
        description: '默认面向 Workers 部署，静态资源和 SSR 都走边缘网络。',
      },
      {
        title: '中英文路由',
        description: '中文默认 `/`，英文 `/en`，并内置 canonical 与 alternate links。',
      },
      {
        title: '业务占位清晰',
        description: '第三方 API、下载面板、定时同步等能力都用 recipe 说明接入位置。',
      },
    ],
    placeholdersTitle: '后续项目常用接入点',
    placeholders: [
      '第三方 API 包装页',
      '软件下载与版本元数据',
      'AI Key / Token / License 服务入口',
      'GitHub Actions 定时更新数据',
    ],
    docsTitle: '模板说明',
    docsDescription:
      '这里是文档占位页。正式项目中可以替换为产品文档、使用指南、配置教程或 FAQ。',
    blogTitle: '博客',
    blogDescription:
      '这里是博客占位页。后续可以接入 MDX、CMS 或直接维护静态文章列表。',
    termsTitle: '服务条款',
    termsDescription:
      '这里是服务条款占位页。上线前请根据实际业务补充服务范围、退款、发票、免责声明和联系方式。',
    privacyTitle: '隐私政策',
    privacyDescription:
      '这里是隐私政策占位页。默认模板不登录、不建库、不保存用户数据；接入第三方服务后需要更新本页。',
  },
  en: {
    eyebrow: 'Slim edge-site template',
    title: 'Launch landing pages and small tool sites quickly',
    description:
      'A stateless TanStack Start template with no login, no database, and no admin panel. Use it for product pages, download portals, AI tool wrappers, and lightweight public apps.',
    primaryCta: 'Read docs',
    secondaryCta: 'Start editing',
    featuresTitle: 'Keep the useful parts, remove startup drag',
    features: [
      {
        title: 'Cloudflare first',
        description: 'Built for Workers deployment with edge-served assets and SSR.',
      },
      {
        title: 'Bilingual routes',
        description: 'Chinese at `/`, English at `/en`, plus canonical and alternate links.',
      },
      {
        title: 'Clear business placeholders',
        description: 'Recipes document where to add third-party APIs, downloads, and scheduled sync.',
      },
    ],
    placeholdersTitle: 'Common integration points',
    placeholders: [
      'Third-party API wrapper pages',
      'Software downloads and version metadata',
      'AI key, token, or license service entry',
      'Scheduled data updates with GitHub Actions',
    ],
    docsTitle: 'Documentation',
    docsDescription:
      'This is a documentation placeholder. Replace it with product docs, usage guides, setup tutorials, or FAQs.',
    blogTitle: 'Blog',
    blogDescription:
      'This is a blog placeholder. Add MDX, a CMS, or a static article list when the project needs it.',
    termsTitle: 'Terms',
    termsDescription:
      'This is a terms placeholder. Add service scope, refund policy, invoice policy, disclaimers, and contact details before launch.',
    privacyTitle: 'Privacy',
    privacyDescription:
      'This is a privacy placeholder. The template does not log users in, create a database, or save user data by default.',
  },
} satisfies Record<SupportedLocale, Record<string, any>>;

export function getLandingCopy(locale: SupportedLocale) {
  return landingCopy[locale];
}
