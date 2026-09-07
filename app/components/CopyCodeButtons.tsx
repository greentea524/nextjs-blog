"use client";

import { useEffect } from "react";
import styles from "./CopyCodeButtons.module.css";

type CopyCodeButtonsProps = {
  /** id of the element holding the rendered post body. */
  targetId: string;
};

const RESET_AFTER_MS = 2000;

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    // Only present in a secure context — https, or localhost during development.
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied or unavailable; the textarea below is the remaining route.
  }

  // `execCommand` is deprecated, and still the only way to reach the clipboard
  // when the page is not served from a secure context.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/** Leaves the block selected, so a reader can still copy it by hand. */
function selectContents(element: HTMLElement): void {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Builds one button, wires it up, and returns the undo for it.
 *
 * The button is appended to the figure rather than inside `pre`, so the label
 * is not part of what gets copied.
 */
function attachCopyButton(figure: HTMLElement, code: HTMLElement): () => void {
  const language = figure.querySelector("pre")?.dataset.language;

  const host = document.createElement("div");
  host.className = styles.host;

  const button = document.createElement("button");
  button.type = "button";
  button.className = styles.button;
  button.dataset.state = "idle";
  button.setAttribute(
    "aria-label",
    language && language !== "plaintext"
      ? `Copy ${language} code`
      : "Copy code",
  );

  // The label is decoration: the button already has an accessible name, and
  // the outcome is announced by the live region beside it.
  const label = document.createElement("span");
  label.setAttribute("aria-hidden", "true");
  label.textContent = "Copy";

  const status = document.createElement("span");
  status.className = styles.srOnly;
  status.setAttribute("role", "status");

  button.append(label, status);
  host.append(button);
  figure.append(host);

  let timer = 0;

  async function copy(): Promise<void> {
    // `textContent` is the source without any of the highlighting markup.
    const copied = await writeToClipboard(code.textContent ?? "");

    if (!copied) {
      selectContents(code);
    }

    button.dataset.state = copied ? "copied" : "failed";
    label.textContent = copied ? "Copied" : "Select + copy";
    status.textContent = copied
      ? "Copied to clipboard"
      : "Could not copy; the code is selected instead";

    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      button.dataset.state = "idle";
      label.textContent = "Copy";
      status.textContent = "";
    }, RESET_AFTER_MS);
  }

  button.addEventListener("click", copy);

  return () => {
    window.clearTimeout(timer);
    button.removeEventListener("click", copy);
    host.remove();
  };
}

/**
 * Adds a copy button to every code block in the rendered post body.
 *
 * The body is server-rendered from a markdown string through
 * `dangerouslySetInnerHTML`, so there is no JSX to hang a button off, and the
 * buttons are built here instead. Doing it after mount also keeps them out of
 * `contentHtml` itself, which the RSS feed embeds verbatim — a copy button
 * would be dead weight in a feed reader.
 */
export default function CopyCodeButtons({ targetId }: CopyCodeButtonsProps) {
  useEffect(() => {
    const root = document.getElementById(targetId);

    if (!root) {
      return;
    }

    const undos: Array<() => void> = [];

    for (const figure of root.querySelectorAll<HTMLElement>(
      "figure[data-rehype-pretty-code-figure]",
    )) {
      const code = figure.querySelector<HTMLElement>("pre code");

      if (code) {
        undos.push(attachCopyButton(figure, code));
      }
    }

    return () => {
      for (const undo of undos) {
        undo();
      }
    };
  }, [targetId]);

  return null;
}
