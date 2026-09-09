import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  THEME_LABELS,
  THEME_ORDER,
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
} from "../lib/theme.ts";

const globalsCss = fs.readFileSync(
  path.join(fileURLToPath(new URL("..", import.meta.url)), "app/globals.css"),
  "utf8",
);

/**
 * The declarations of one rule. None of these blocks nest, so finding the
 * closing brace is a matter of finding the next one.
 */
function ruleBody(selector: string): string {
  const start = globalsCss.indexOf(selector);
  assert.ok(start >= 0, `expected globals.css to contain ${selector}`);

  const open = globalsCss.indexOf("{", start);
  const close = globalsCss.indexOf("}", open);

  return globalsCss.slice(open + 1, close);
}

/** Every `--color-x: var(--palette-y)` in a rule, as x -> y. */
function paletteMapping(body: string): Map<string, string> {
  const mapping = new Map<string, string>();

  for (const [, token, source] of body.matchAll(
    /--(color-[\w-]+):\s*var\(--([\w-]+)\)/g,
  )) {
    mapping.set(token, source);
  }

  return mapping;
}

const DARK_BY_SYSTEM = ':root:not([data-theme="light"])';
const DARK_BY_CHOICE = ':root[data-theme="dark"]';

describe("the palette", () => {
  // The dark palette is applied by two rules — one for the system preference,
  // one for an explicit choice — and CSS gives no way to share a declaration
  // block between them. These are the guard against the two drifting apart.
  // They read the file inside each test so a missing rule fails a test rather
  // than quietly taking its suite down with it.

  test("lets an explicit light choice override a dark system", () => {
    // Without the :not(), a reader whose system is dark could never choose
    // light: the media query would keep winning.
    assert.match(
      globalsCss,
      /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/,
      "the system dark rule must step aside for an explicit light choice",
    );
  });

  test("maps every token it defines", () => {
    const light = paletteMapping(ruleBody(":root {"));

    assert.ok(light.size > 0, "expected the light mapping to be found");
    assert.deepEqual(
      [...paletteMapping(ruleBody(DARK_BY_SYSTEM)).keys()].sort(),
      [...light.keys()].sort(),
    );
    assert.deepEqual(
      [...paletteMapping(ruleBody(DARK_BY_CHOICE)).keys()].sort(),
      [...light.keys()].sort(),
    );
  });

  test("applies the same dark values whether by system or by choice", () => {
    assert.deepEqual(
      [...paletteMapping(ruleBody(DARK_BY_CHOICE)).entries()].sort(),
      [...paletteMapping(ruleBody(DARK_BY_SYSTEM)).entries()].sort(),
    );
  });

  test("points each token at its own light and dark colour", () => {
    const byChoice = paletteMapping(ruleBody(DARK_BY_CHOICE));

    for (const [token, source] of paletteMapping(ruleBody(":root {"))) {
      const suffix = token.replace(/^color-/, "");

      assert.equal(source, `light-${suffix}`, `${token} in the light palette`);
      assert.equal(
        byChoice.get(token),
        `dark-${suffix}`,
        `${token} in the dark palette`,
      );
    }
  });

  test("defines every colour it points at", () => {
    const defined = new Set(
      [...globalsCss.matchAll(/--((?:light|dark)-[\w-]+):\s*[^v]/g)].map(
        ([, name]) => name,
      ),
    );
    const used = [
      ...paletteMapping(ruleBody(":root {")).values(),
      ...paletteMapping(ruleBody(DARK_BY_CHOICE)).values(),
    ];

    for (const source of used) {
      assert.ok(defined.has(source), `--${source} is used but never defined`);
    }
  });
});

describe("the pre-paint script", () => {
  test("reads the key the toggle writes", () => {
    assert.ok(
      THEME_SCRIPT.includes(`localStorage.getItem("${THEME_STORAGE_KEY}")`),
      "expected the script to read the shared storage key",
    );
  });

  test("survives storage being unavailable", () => {
    // localStorage throws outright in some privacy modes, and this script runs
    // before anything else on the page.
    assert.match(THEME_SCRIPT, /try\{/);
    assert.match(THEME_SCRIPT, /catch\(e\)\{\}/);
  });

  test("only ever applies a theme it recognises", () => {
    assert.match(
      THEME_SCRIPT,
      /t==="dark"\|\|t==="light"/,
      "a stored value should not reach setAttribute unchecked",
    );
  });

  test("leaves the attribute off for system, so the media query decides", () => {
    assert.ok(
      !THEME_SCRIPT.includes('"system"'),
      "system is the absence of the attribute, not a value to write",
    );
  });

  test("cycles through every theme, starting from system", () => {
    assert.deepEqual([...THEME_ORDER], ["system", "light", "dark"]);
    assert.deepEqual(Object.keys(THEME_LABELS).sort(), [
      "dark",
      "light",
      "system",
    ]);
  });
});
