import { createFileRoute } from '@tanstack/react-router';
import { BlogCard } from '@/components/blog-card';
import { envConfigs } from '@/config';
import { normalizeLocale } from '@/config/site';
import { formatPostDate, getLocalPosts } from '@/content/posts';
import { getLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
export const Route = createFileRoute('/blog/')({
  loader: async () => { const locale = normalizeLocale(getLocale()); return { locale, posts: getLocalPosts(locale) }; },
  head: ({ loaderData }) => {
    const locale = loaderData?.locale ?? 'zh';
    const appUrl = envConfigs.app_url.replace(/\/$/, '');
    const title = locale === 'zh' ? '博客' : 'Blog';
    const description = locale === 'zh' ? '项目文章、产品记录和授权转载。' : 'Project articles, product notes, and authorized reposts.';
    return { meta: [{ title: title + ' | ' + envConfigs.app_name }, { name: 'description', content: description }], links: [{ rel: 'canonical', href: localizeUrl(appUrl + '/blog/', { locale }).href }, ...locales.map((loc) => ({ rel: 'alternate', hrefLang: loc, href: localizeUrl(appUrl + '/blog/', { locale: loc }).href }))] };
  },
  component: BlogIndexPage,
});
function BlogIndexPage() {
  const { locale, posts } = Route.useLoaderData();
  const isZh = locale === 'zh';
  return <main className="mx-auto min-h-screen max-w-5xl px-5 py-16 text-foreground sm:py-24"><a href={isZh ? '/' : '/en'} className="font-serif text-2xl font-bold tracking-normal">{envConfigs.app_name}</a><div className="mt-14 mb-12"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{isZh ? '博客' : 'Blog'}</p><h1 className="mt-3 font-serif text-4xl font-normal tracking-normal sm:text-5xl">{isZh ? '文章与转载' : 'Articles and Reposts'}</h1><p className="mt-5 max-w-2xl text-muted-foreground">{isZh ? '这里收录项目文章、产品记录，以及获得授权后转载的文章。' : 'Project articles, product notes, and reposted articles with explicit permission.'}</p></div>{posts.length === 0 ? <p className="text-muted-foreground">{isZh ? '暂时还没有文章。' : 'No posts yet.'}</p> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{posts.map((post) => <BlogCard key={post.slug} href={'/blog/' + post.slug} title={post.title} description={post.description} image={post.image} date={formatPostDate(post.createdAt, locale)} authorName={post.authorName} authorImage={post.authorImage} />)}</div>}</main>;
}
