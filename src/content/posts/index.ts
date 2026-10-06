import type { ComponentType } from 'react';

import { baseLocale } from '@/paraglide/runtime.js';

export const BLOG_POST_SLUGS = ['welcome-to-blog'] as const;

export type BlogPostMeta = {
  title: string;
  description: string;
  created_at: string;
  author_name?: string;
  author_image?: string;
  image?: string;
  source_url?: string;
  source_author?: string;
  permission_note?: string;
  canonical_url?: string;
  tags?: string[];
};

type PostModule = { default: ComponentType; meta: BlogPostMeta };

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  image?: string;
  createdAt: string;
  authorName?: string;
  authorImage?: string;
  sourceUrl?: string;
  sourceAuthor?: string;
  permissionNote?: string;
  canonicalUrl?: string;
  tags: string[];
};

const postModules = import.meta.glob<PostModule>('/src/content/posts/*.mdx', { eager: true });

export function loadLocalPost(slug: string, locale: string): PostModule | null {
  if (!BLOG_POST_SLUGS.includes(slug as (typeof BLOG_POST_SLUGS)[number])) return null;
  return (
    postModules['/src/content/posts/' + slug + '.' + locale + '.mdx'] ??
    postModules['/src/content/posts/' + slug + '.' + baseLocale + '.mdx'] ??
    null
  );
}

function localPostToItem(slug: string, meta: BlogPostMeta): BlogPost {
  return { slug, title: meta.title, description: meta.description, image: meta.image, createdAt: new Date(meta.created_at).toISOString(), authorName: meta.author_name, authorImage: meta.author_image, sourceUrl: meta.source_url, sourceAuthor: meta.source_author, permissionNote: meta.permission_note, canonicalUrl: meta.canonical_url, tags: meta.tags ?? [] };
}

export function getLocalPosts(locale: string): BlogPost[] {
  return BLOG_POST_SLUGS.map((slug) => ({ slug: slug as string, mod: loadLocalPost(slug, locale) }))
    .filter((item): item is { slug: string; mod: PostModule } => item.mod !== null)
    .map(({ slug, mod }) => localPostToItem(slug, mod.meta))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getLocalPost(slug: string, locale: string): BlogPost | null {
  const mod = loadLocalPost(slug, locale);
  return mod ? localPostToItem(slug, mod.meta) : null;
}

export function formatPostDate(dateIso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: locale === 'zh' ? 'long' : 'short', day: 'numeric' }).format(new Date(dateIso));
}
