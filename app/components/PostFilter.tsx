"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { PostMeta } from "@/lib/posts";
import { sitePath } from "@/lib/site";
import { tagSlug } from "@/lib/tags";
import styles from "./PostFilter.module.css";

/** Built by app/search-index.json/route.ts: post body text, keyed by slug. */
const SEARCH_INDEX_URL = sitePath("/search-index.json");

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
  const [bodyText, setBodyText] = useState<Record<string, string> | null>(null);
  const indexRequested = useRef(false);

  /**
   * Fetched on the reader's first keystroke rather than with the page, so the
   * home page costs nothing extra for everyone who never searches.
   */
  function loadSearchIndex(): void {
    if (indexRequested.current) {
      return;
    }

    indexRequested.current = true;

    fetch(SEARCH_INDEX_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`search index: ${response.status}`);
        }
        return response.json() as Promise<Record<string, string>>;
      })
      .then((index) => {
        // Lowercased once here instead of on every keystroke.
        const lowered: Record<string, string> = {};

        for (const [slug, text] of Object.entries(index)) {
          lowered[slug] = text.toLowerCase();
        }

        setBodyText(lowered);
      })
      .catch(() => {
        // Body search is an enhancement. Title, excerpt and tag matching carry
        // on working without it, so a failed fetch is not worth reporting.
      });
  }

  function handleSearchChange(value: string): void {
    setSearchQuery(value);

    if (value.trim() !== "") {
      loadSearchIndex();
    }
  }

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const visible = posts.filter(
      (post) => selectedTag === "all" || post.tags.includes(selectedTag),
    );

    if (!q) {
      return visible;
    }

    const ranked: Array<{ post: PostMeta; rank: number }> = [];

    for (const post of visible) {
      const inTitle = post.title.toLowerCase().includes(q);
      const inExcerpt = post.excerpt.toLowerCase().includes(q);
      const inTags = post.tags.some((t) => t.toLowerCase().includes(q));

      if (inTitle || inExcerpt || inTags) {
        ranked.push({ post, rank: 0 });
      } else if (bodyText?.[post.slug]?.includes(q)) {
        // A body match still counts, but below the matches a reader can see on
        // the card itself.
        ranked.push({ post, rank: 1 });
      }
    }

    // Stable, so posts keep their date order within a rank.
    return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.post);
  }, [posts, searchQuery, selectedTag, bodyText]);

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
            placeholder="Search notes by title, topic, or anything in the text..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
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
        {/* The filter above is instant but has no URL; this is the shareable,
            crawlable version of the same view. */}
        {selectedTag !== "all" && (
          <Link
            href={`/tags/${tagSlug(selectedTag)}`}
            className={styles.archiveLink}
          >
            View the {selectedTag} archive →
          </Link>
        )}
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
