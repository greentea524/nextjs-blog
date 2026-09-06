import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, getTagBySlug, getTagSlugs } from "@/lib/posts";
import { feedAlternates, siteUrl, tagUrl } from "@/lib/site";
import JsonLd from "@/app/components/JsonLd";
import styles from "./page.module.css";

type TagPageProps = {
  params: Promise<{ tag: string }>;
};

// Every tag is known at build time, matching how post URLs are generated.
export const dynamicParams = false;

export function generateStaticParams() {
  return getTagSlugs().map((tag) => ({ tag }));
}

function noteCount(count: number): string {
  return `${count} ${count === 1 ? "note" : "notes"}`;
}

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { tag: slug } = await params;
  const archive = getTagBySlug(slug);

  if (!archive) {
    return {};
  }

  const description = `${noteCount(archive.posts.length)} tagged ${archive.tag}.`;

  return {
    title: archive.tag,
    description,
    alternates: { canonical: `/tags/${archive.slug}`, ...feedAlternates },
    openGraph: {
      type: "website",
      title: archive.tag,
      description,
      url: `/tags/${archive.slug}`,
    },
  };
}

export default async function TagPage({ params }: TagPageProps) {
  const { tag: slug } = await params;
  const archive = getTagBySlug(slug);

  if (!archive) {
    notFound();
  }

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `Notes tagged ${archive.tag}`,
          url: tagUrl(archive.slug),
          isPartOf: { "@type": "Blog", url: siteUrl("/") },
          hasPart: archive.posts.map((post) => ({
            "@type": "BlogPosting",
            headline: post.title,
            datePublished: post.date,
            url: siteUrl(`/posts/${post.slug}/`),
          })),
        }}
      />

      <div className={styles.intro}>
        <p className={styles.eyebrow}>Tag</p>
        <h1 className={styles.title}>{archive.tag}</h1>
        <p className={styles.subtitle}>
          {noteCount(archive.posts.length)} tagged {archive.tag}.
        </p>
      </div>

      <ul className={styles.list}>
        {archive.posts.map((post) => (
          <li key={post.slug}>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>
                <Link href={`/posts/${post.slug}`} className={styles.cardLink}>
                  {post.title}
                </Link>
              </h2>
              <p className={styles.meta}>
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                {" · "}
                {post.readingMinutes} min read
              </p>
              <p className={styles.excerpt}>{post.excerpt}</p>
            </article>
          </li>
        ))}
      </ul>

      <nav className={styles.backNav}>
        <Link href="/" className={styles.backLink}>
          ← Back to all notes
        </Link>
      </nav>
    </>
  );
}
