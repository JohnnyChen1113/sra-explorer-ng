import { MDXProvider } from '@mdx-js/react';
import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import { ArrowLeft, Calendar } from 'lucide-react';
import { mdxComponents } from '@/components/mdx-components';
import { envConfigs } from '@/config';
import { normalizeLocale } from '@/config/site';
import { formatPostDate, getLocalPost, loadLocalPost } from '@/content/posts';
import { getLocale, localizeUrl } from '@/paraglide/runtime.js';
export const Route = createFileRoute('/blog/$slug')({
  loader: async ({ params }) => { const locale = normalizeLocale(getLocale()); const post = getLocalPost(params.slug, locale); if (!post) throw notFound(); return { locale, post }; },
  head: ({ loaderData }) => { if (!loaderData) return {}; const { locale, post } = loaderData; const appUrl = envConfigs.app_url.replace(/\/$/, ''); const ownUrl = localizeUrl(appUrl + '/blog/' + post.slug, { locale }).href; return { meta: [{ title: post.title + ' | ' + envConfigs.app_name }, { name: 'description', content: post.description }], links: [{ rel: 'canonical', href: post.canonicalUrl || ownUrl }] }; },
  component: BlogPostPage,
});
function BlogPostPage() {
  const { locale, post } = Route.useLoaderData();
  const Content = loadLocalPost(post.slug, locale)?.default;
  const isZh = locale === 'zh';
  return <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-foreground md:px-8 md:py-16"><Link to="/blog" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" />{isZh ? '返回博客' : 'Back to blog'}</Link><article><header className="mt-8 mb-6 border-b border-border pb-6"><h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{post.title}</h1>{post.description && <p className="mt-3 text-muted-foreground">{post.description}</p>}<div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Calendar className="size-4" />{formatPostDate(post.createdAt, locale)}</span>{(post.authorName || post.authorImage) && <span className="inline-flex items-center gap-2">{post.authorImage && <img src={post.authorImage} alt={post.authorName || ''} width={20} height={20} className="size-5 rounded-full object-cover" />}{post.authorName}</span>}</div></header>{(post.sourceUrl || post.sourceAuthor || post.permissionNote) && <div className="mb-8 rounded-lg border border-border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">{post.sourceAuthor && <p><strong className="text-foreground">{isZh ? '原作者：' : 'Original author: '}</strong>{post.sourceAuthor}</p>}{post.sourceUrl && <p><strong className="text-foreground">{isZh ? '原文链接：' : 'Source: '}</strong><a href={post.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">{post.sourceUrl}</a></p>}{post.permissionNote && <p>{post.permissionNote}</p>}</div>}<div className="text-[15px] leading-7 text-foreground/90">{Content ? <MDXProvider components={mdxComponents}><Content /></MDXProvider> : null}</div></article></main>;
}
