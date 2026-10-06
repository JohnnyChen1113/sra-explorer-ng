import { Link } from '@tanstack/react-router';
import { Calendar } from 'lucide-react';

export type BlogCardProps = { href: string; title: string; description?: string; image?: string; date?: string; authorName?: string; authorImage?: string };

export function BlogCard({ href, title, description, image, date, authorName, authorImage }: BlogCardProps) {
  return (
    <Link to={href} className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all hover:border-foreground/20 hover:shadow-sm">
      {image && <img src={image} alt={title} width={640} height={360} loading="lazy" className="aspect-video w-full object-cover object-center" />}
      <div className="flex flex-1 flex-col gap-3 p-6">
        <h3 className="font-medium leading-snug group-hover:underline group-hover:underline-offset-4">{title}</h3>
        {description && <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{description}</p>}
        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          {date && <span className="inline-flex items-center gap-1.5"><Calendar className="size-3.5" />{date}</span>}
          <span className="flex-1" />
          {(authorName || authorImage) && <span className="inline-flex items-center gap-2">{authorImage && <img src={authorImage} alt={authorName || ''} width={20} height={20} loading="lazy" className="size-5 rounded-full object-cover" />}{authorName}</span>}
        </div>
      </div>
    </Link>
  );
}
