import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, getAdjacentPosts, getPostBySlug, getPostSlugs } from "@/lib/posts";
import { siteConfig } from "@/lib/site";
import TableOfContents from "@/app/components/TableOfContents";
import styles from "./page.module.css";

type PostPageProps = {
  params: Promise<{ slug: string }>;
};

// Every post URL is known at build time, so nothing is generated on demand.
export const dynamicParams = false;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return {};
  }

  const url = `/posts/${post.slug}`;

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      url,
      publishedTime: post.date,
    },
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const { prev, next } = getAdjacentPosts(slug);

  return (
    <>
      <article>
        <header className={styles.header}>
          <h1 className={styles.title}>{post.title}</h1>
          <div className={styles.metaRow}>
            <p className={styles.meta}>
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              {" · "}
              {post.readingMinutes} min read
            </p>
            {post.tags.length > 0 && (
              <div className={styles.tags}>
                {post.tags.map((tag) => (
                  <span key={tag} className={styles.tagBadge}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        <TableOfContents toc={post.toc} />

        <div
          className={styles.prose}
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>

      {/* Author Bio */}
      <section className={styles.authorSection} aria-label="Author biography">
        <div className={styles.authorAvatar} aria-hidden="true">
          {siteConfig.name.slice(0, 2).toUpperCase()}
        </div>
        <div className={styles.authorContent}>
          <h2 className={styles.authorName}>Written by {siteConfig.name}</h2>
          <p className={styles.authorBio}>{siteConfig.description}</p>
          <div className={styles.authorLinks}>
            <a
              href="https://github.com/greentea524"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.authorLink}
            >
              GitHub Profile ↗
            </a>
          </div>
        </div>
      </section>

      {/* Post-to-Post Navigation */}
      {(prev || next) && (
        <nav className={styles.postNav} aria-label="Adjacent articles">
          {prev ? (
            <Link
              href={`/posts/${prev.slug}`}
              className={`${styles.navCard} ${styles.navPrev}`}
            >
              <span className={styles.navDirection}>← Newer note</span>
              <span className={styles.navTitle}>{prev.title}</span>
              <span className={styles.navMeta}>{formatDate(prev.date)}</span>
            </Link>
          ) : (
            <div className={styles.navPlaceholder} />
          )}

          {next ? (
            <Link
              href={`/posts/${next.slug}`}
              className={`${styles.navCard} ${styles.navNext}`}
            >
              <span className={styles.navDirection}>Older note →</span>
              <span className={styles.navTitle}>{next.title}</span>
              <span className={styles.navMeta}>{formatDate(next.date)}</span>
            </Link>
          ) : (
            <div className={styles.navPlaceholder} />
          )}
        </nav>
      )}

      <nav className={styles.backNav}>
        <Link href="/" className={styles.backLink}>
          ← Back to all notes
        </Link>
      </nav>
    </>
  );
}

