"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { PostMeta } from "@/lib/posts";
import styles from "./PostFilter.module.css";

type TagCount = {
  tag: string;
  count: number;
};

type PostFilterProps = {
  posts: PostMeta[];
  allTags: TagCount[];
};

export default function PostFilter({ posts, allTags }: PostFilterProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return posts.filter((post) => {
      const matchesTag =
        selectedTag === "all" || post.tags.includes(selectedTag);

      if (!matchesTag) return false;
      if (!q) return true;

      const inTitle = post.title.toLowerCase().includes(q);
      const inExcerpt = post.excerpt.toLowerCase().includes(q);
      const inTags = post.tags.some((t) => t.toLowerCase().includes(q));

      return inTitle || inExcerpt || inTags;
    });
  }, [posts, searchQuery, selectedTag]);

  const handleReset = () => {
    setSearchQuery("");
    setSelectedTag("all");
  };

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <div className={styles.searchWrapper}>
          <svg
            className={styles.searchIcon}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 4 4" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search notes by title, topic, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search articles"
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className={styles.tagBar} role="tablist" aria-label="Filter by topic">
          <button
            type="button"
            className={`${styles.tagPill} ${
              selectedTag === "all" ? styles.activeTagPill : ""
            }`}
            onClick={() => setSelectedTag("all")}
          >
            All <span className={styles.tagCount}>({posts.length})</span>
          </button>
          {allTags.map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              className={`${styles.tagPill} ${
                selectedTag === tag ? styles.activeTagPill : ""
              }`}
              onClick={() => setSelectedTag(selectedTag === tag ? "all" : tag)}
            >
              {tag} <span className={styles.tagCount}>({count})</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.statusRow}>
        <span>
          Showing {filteredPosts.length} of {posts.length}{" "}
          {posts.length === 1 ? "note" : "notes"}
        </span>
        {(searchQuery || selectedTag !== "all") && (
          <button
            type="button"
            onClick={handleReset}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-accent)",
              cursor: "pointer",
              fontSize: "0.8125rem",
              padding: 0,
            }}
          >
            Reset filter
          </button>
        )}
      </div>

      {filteredPosts.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No notes found</p>
          <p className={styles.emptyText}>
            No articles match your current search and tag filters.
          </p>
          <button type="button" className={styles.resetBtn} onClick={handleReset}>
            Clear search & filters
          </button>
        </div>
      ) : (
        <ul className={styles.postList}>
          {filteredPosts.map((post) => (
            <li key={post.slug}>
              <article className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>
                    <Link
                      href={`/posts/${post.slug}`}
                      className={styles.cardLink}
                    >
                      {post.title}
                    </Link>
                  </h2>
                  <span className={styles.cardArrow} aria-hidden="true">
                    →
                  </span>
                </div>

                <div className={styles.metaRow}>
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                  <span>·</span>
                  <span>{post.readingMinutes} min read</span>
                </div>

                {post.tags.length > 0 && (
                  <div className={styles.tagsWrapper}>
                    {post.tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={styles.cardTag}
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedTag(t);
                        }}
                        title={`Filter by ${t}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                <p className={styles.excerpt}>{post.excerpt}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
