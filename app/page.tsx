import type { Metadata } from "next";
import { getAllTags, getSortedPosts } from "@/lib/posts";
import { siteConfig } from "@/lib/site";
import PostFilter from "./components/PostFilter";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

export default function Home() {
  const posts = getSortedPosts();
  const allTags = getAllTags();

  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.title}>Notes</h1>
        <p className={styles.subtitle}>{siteConfig.description}</p>
      </div>

      <PostFilter posts={posts} allTags={allTags} />
    </>
  );
}

