"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  POSTS_PER_PAGE,
  clampPage,
  groupByYear,
  pageCount,
  pageSlice,
} from "@/lib/archive";
import { formatDate } from "@/lib/format";
import type { PostMeta } from "@/lib/posts";
import { sitePath } from "@/lib/site";
import { tagSlug } from "@/lib/tags";
import styles from "./PostFilter.module.css";

const PAGE_PARAM = "page";
/** Fired after a pushState, which does not raise popstate on its own. */
const PAGE_EVENT = "postfilter:page";

function readPageFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get(PAGE_PARAM);

  return raw === null ? 1 : Number.parseInt(raw, 10);
}

function subscribeToPage(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(PAGE_EVENT, onChange);

  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(PAGE_EVENT, onChange);
  };
}

/**
 * Writes the page into the query string.
 *
 * The URL is the source of truth for which page is showing, which is what
 * makes Back and Forward work and a link to page 2 shareable. `useSearchParams`
 * would read it for us, but in an exported site it forces everything up to the
 * nearest Suspense boundary to be client-rendered — the post list would leave
 * the static HTML entirely. The History API costs nothing and keeps it there.
 */
function writePageToUrl(page: number, replace: boolean): void {
  const url = new URL(window.location.href);

  if (page <= 1) {
    url.searchParams.delete(PAGE_PARAM);
  } else {
    url.searchParams.set(PAGE_PARAM, String(page));
  }

  const next = `${url.pathname}${url.search}${url.hash}`;

  if (replace) {
    window.history.replaceState(null, "", next);
  } else {
    window.history.pushState(null, "", next);
  }

  window.dispatchEvent(new Event(PAGE_EVENT));
}

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
  // Server-rendered pages always show the first one: an exported page is the
  // same HTML whatever the query string says, so page 1 is the only honest
  // starting point. React swaps in the URL's page after hydration.
  const requestedPage = useSyncExternalStore(
    subscribeToPage,
    readPageFromUrl,
    () => 1,
  );

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

  /**
   * Any change to the filters puts the reader back on the first page: page 3 of
   * a list that just shrank to four posts is a dead end. It replaces rather
   * than pushes, so Back still leaves the page rather than walking through
   * every keystroke.
   */
  function resetToFirstPage(): void {
    if (readPageFromUrl() > 1) {
      writePageToUrl(1, true);
    }
  }

  function handleSearchChange(value: string): void {
    setSearchQuery(value);
    resetToFirstPage();

    if (value.trim() !== "") {
      loadSearchIndex();
    }
  }

  function handleTagChange(tag: string): void {
    setSelectedTag(tag);
    resetToFirstPage();
  }

  function goToPage(page: number): void {
    writePageToUrl(page, false);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  const totalPages = pageCount(filteredPosts.length);
  const currentPage = clampPage(requestedPage, filteredPosts.length);
  const visiblePosts = pageSlice(filteredPosts, currentPage);
  const years = groupByYear(visiblePosts);

  const handleReset = () => {
    setSearchQuery("");
    setSelectedTag("all");
    resetToFirstPage();
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
              onClick={() => handleSearchChange("")}
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
            onClick={() => handleTagChange("all")}
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
              onClick={() =>
                handleTagChange(selectedTag === tag ? "all" : tag)
              }
            >
              {tag} <span className={styles.tagCount}>({count})</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.statusRow}>
        <span>
          {totalPages > 1
            ? `Showing ${(currentPage - 1) * POSTS_PER_PAGE + 1}–${
                (currentPage - 1) * POSTS_PER_PAGE + visiblePosts.length
              } of ${filteredPosts.length}`
            : `Showing ${filteredPosts.length} of ${posts.length}`}{" "}
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
        <>
          {years.map((group) => (
            <section
              key={group.year}
              className={styles.yearGroup}
              aria-labelledby={`year-${group.year}`}
            >
              <h2 id={`year-${group.year}`} className={styles.yearHeading}>
                {group.year}
              </h2>
              <ul className={styles.postList}>
                  {group.posts.map((post) => (
                <li key={post.slug}>
                  <article className={styles.card}>
                    <div className={styles.cardHeader}>
                      {/* h3: the year heading above this group is the h2. */}
                      <h3 className={styles.cardTitle}>
                        <Link
                          href={`/posts/${post.slug}`}
                          className={styles.cardLink}
                        >
                          {post.title}
                        </Link>
                      </h3>
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
                              handleTagChange(t);
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
            </section>
          ))}

          {totalPages > 1 && (
            <nav className={styles.pagination} aria-label="Pagination">
              <button
                type="button"
                className={styles.pageStep}
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                ← Previous
              </button>

              <ul className={styles.pageList}>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                  (page) => (
                    <li key={page}>
                      {/* A real link, so it can be opened in a new tab or
                          shared; the handler keeps the click on this page. */}
                      <a
                        href={page === 1 ? "./" : `./?page=${page}`}
                        className={`${styles.pageLink} ${
                          page === currentPage ? styles.pageCurrent : ""
                        }`}
                        aria-current={page === currentPage ? "page" : undefined}
                        aria-label={`Page ${page}`}
                        onClick={(event) => {
                          event.preventDefault();
                          goToPage(page);
                        }}
                      >
                        {page}
                      </a>
                    </li>
                  ),
                )}
              </ul>

              <button
                type="button"
                className={styles.pageStep}
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next →
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
