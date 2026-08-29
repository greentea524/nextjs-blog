"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/posts";
import styles from "./TableOfContents.module.css";

type TableOfContentsProps = {
  toc: TocItem[];
};

export default function TableOfContents({ toc }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");
  const [isOpen, setIsOpen] = useState<boolean>(true);

  useEffect(() => {
    if (toc.length === 0) return;

    const headingElements = toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    if (headingElements.length === 0) return;

    // Observe headings as they cross into view
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible heading in view
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          setActiveId(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-20% 0px -70% 0px",
        threshold: 0,
      }
    );

    headingElements.forEach((el) => observer.observe(el));

    // Also check initial hash
    if (window.location.hash) {
      const hashId = window.location.hash.replace(/^#/, "");
      if (toc.some((item) => item.id === hashId)) {
        setActiveId(hashId);
      }
    }

    return () => observer.disconnect();
  }, [toc]);

  if (toc.length < 2) {
    return null;
  }

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
      setActiveId(id);
      window.history.pushState(null, "", `#${id}`);
    }
  };

  return (
    <nav className={styles.tocContainer} aria-label="Table of contents">
      <button
        type="button"
        className={styles.tocHeader}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <span className={styles.headerTitle}>
          <span>📑 On this page</span>
          <span className={styles.sectionCount}>({toc.length} sections)</span>
        </span>
        <span
          className={`${styles.toggleIcon} ${isOpen ? styles.iconOpen : ""}`}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <ul className={styles.tocList}>
          {toc.map((item) => {
            const isActive = activeId === item.id;
            return (
              <li
                key={item.id}
                className={`${styles.tocItem} ${
                  item.level === 3 ? styles.level3 : styles.level2
                }`}
              >
                <a
                  href={`#${item.id}`}
                  className={`${styles.tocLink} ${
                    isActive ? styles.activeLink : ""
                  }`}
                  onClick={(e) => handleClick(e, item.id)}
                  aria-current={isActive ? "location" : undefined}
                >
                  {item.text}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
