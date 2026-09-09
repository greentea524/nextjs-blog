"use client";

import { useState } from "react";
import {
  THEME_LABELS,
  THEME_ORDER,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";
import styles from "./ThemeToggle.module.css";

/**
 * The `<html>` attribute is the single source of truth: the script in the
 * layout sets it before first paint, this reads it back, and the stylesheet
 * switches on it. Nothing needs to be mirrored in React state.
 */
function currentTheme(): Theme {
  const attribute = document.documentElement.dataset.theme;

  return attribute === "light" || attribute === "dark" ? attribute : "system";
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.dataset.theme = theme;
  }

  try {
    if (theme === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Storage is unavailable in some privacy modes. The choice still applies
    // to this page; it just will not outlive it.
  }
}

/**
 * Cycles system → light → dark.
 *
 * Every label is rendered and the stylesheet shows the one matching
 * `data-theme`, so the server and the browser render the same markup — no
 * hydration mismatch, and the right label is on screen at first paint rather
 * than after React catches up.
 */
export default function ThemeToggle() {
  const [announcement, setAnnouncement] = useState("");

  function cycle(): void {
    const next =
      THEME_ORDER[
        (THEME_ORDER.indexOf(currentTheme()) + 1) % THEME_ORDER.length
      ];

    applyTheme(next);
    setAnnouncement(`Theme set to ${THEME_LABELS[next]}`);
  }

  return (
    <>
      <button type="button" className={styles.button} onClick={cycle}>
        <span className={styles.srOnly}>Theme: </span>
        {THEME_ORDER.map((theme) => (
          <span key={theme} className={styles.option} data-theme-option={theme}>
            <span className={styles.icon} aria-hidden="true">
              {theme === "system" ? "◐" : theme === "light" ? "☀" : "☾"}
            </span>
            {THEME_LABELS[theme]}
          </span>
        ))}
      </button>
      {/* Outside the button: inside, the announcement would become part of the
          button's accessible name. */}
      <span className={styles.srOnly} role="status">
        {announcement}
      </span>
    </>
  );
}
