import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, getPostBySlug, getPostSlugs } from "@/lib/posts";
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
  const post = getPostBySlug(slug);

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
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <article>
        <header className={styles.header}>
          <h1 className={styles.title}>{post.title}</h1>
          <p className={styles.meta}>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            {" · "}
            {post.readingMinutes} min read
          </p>
        </header>

        <div
          className={styles.prose}
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>

      <nav className={styles.backNav}>
        <Link href="/">← Back to home</Link>
      </nav>
    </>
  );
}
