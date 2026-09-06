import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatDate,
  getAdjacentPosts,
  getPostBySlug,
  getPostSlugs,
  tagSlug,
} from "@/lib/posts";
import { OG_SIZE } from "@/lib/og";
import { feedAlternates, postUrl, siteConfig, siteUrl } from "@/lib/site";
import JsonLd from "@/app/components/JsonLd";
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
  const image = `${url}/og.png`;

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: url, ...feedAlternates },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      url,
      publishedTime: post.date,
      tags: [...post.tags],
      authors: [siteConfig.name],
      images: [{ url: image, ...OG_SIZE, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [{ url: image, alt: post.title }],
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
  const url = postUrl(post.slug);
  const imageUrl = siteUrl(`/posts/${post.slug}/og.png`);

  const author = {
    "@type": "Person",
    name: siteConfig.name,
    url: siteConfig.github,
  };

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.excerpt,
          datePublished: post.date,
          dateModified: post.date,
          url,
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
          image: imageUrl,
          author,
          publisher: author,
          inLanguage: siteConfig.language,
          keywords: post.tags,
          isPartOf: {
            "@type": "Blog",
            name: siteConfig.title,
            url: siteUrl("/"),
          },
        }}
      />

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
                  <Link
                    key={tag}
                    href={`/tags/${tagSlug(tag)}`}
                    className={styles.tagBadge}
                  >
                    {tag}
                  </Link>
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
              href={siteConfig.github}
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

