/**
 * Theme choice, shared between the pre-paint script in the layout and the
 * toggle in the header. Both have to agree on the storage key and on the
 * spelling of a choice, so both come from here.
 */
export type Theme = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/** The order the toggle cycles through. */
export const THEME_ORDER: readonly Theme[] = ["system", "light", "dark"];

export const THEME_LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * Runs synchronously in the document head, before anything is painted, so a
 * reader who chose a theme never sees the other one first. An explicit choice
 * becomes a `data-theme` attribute on `<html>`; "system" stores nothing and
 * leaves the attribute off, which is what lets the `prefers-color-scheme`
 * rules in globals.css decide.
 *
 * Kept to one line of ES5 with no dependencies: it is inlined into every page,
 * and it blocks the first paint while it runs.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
