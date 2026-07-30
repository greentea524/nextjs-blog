import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, getSortedPosts } from "@/lib/posts";
import { siteConfig } from "@/lib/site";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

export default function Home() {
  const posts = getSortedPosts();

  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.title}>Notes</h1>
        <p className={styles.subtitle}>{siteConfig.description}</p>
      </div>

      <ul className={styles.list}>
        {posts.map((post) => (
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
    </>
  );
}
