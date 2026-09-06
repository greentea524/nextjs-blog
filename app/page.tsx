import type { Metadata } from "next";
import { getAllTags, getSortedPosts } from "@/lib/posts";
import { feedAlternates, postUrl, siteConfig, siteUrl } from "@/lib/site";
import JsonLd from "./components/JsonLd";
import PostFilter from "./components/PostFilter";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.description,
  alternates: { canonical: "/", ...feedAlternates },
};

export default function Home() {
  const posts = getSortedPosts();
  const allTags = getAllTags();

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: siteConfig.title,
          description: siteConfig.description,
          url: siteUrl("/"),
          inLanguage: siteConfig.language,
          author: {
            "@type": "Person",
            name: siteConfig.name,
            url: siteConfig.github,
          },
          blogPost: posts.map((post) => ({
            "@type": "BlogPosting",
            headline: post.title,
            description: post.excerpt,
            datePublished: post.date,
            url: postUrl(post.slug),
          })),
        }}
      />

      <div className={styles.intro}>
        <h1 className={styles.title}>Notes</h1>
        <p className={styles.subtitle}>{siteConfig.description}</p>
      </div>

      <PostFilter posts={posts} allTags={allTags} />
    </>
  );
}

