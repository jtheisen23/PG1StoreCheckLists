import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import {
  THEME_COLORS,
  THEME_STORAGE_KEY,
  parseThemePreference,
  themeScript,
} from "../src/lib/theme";

// --- A just-big-enough CSS reader ------------------------------------------

interface Block {
  prelude: string;
  body: string;
}

/** Top-level `prelude { body }` blocks, with comments stripped. */
function blocks(css: string): Block[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Block[] = [];
  let depth = 0;
  let start = 0;
  let open = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) open = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        out.push({ prelude: text.slice(start, open).trim(), body: text.slice(open + 1, i) });
        start = i + 1;
      }
    } else if (ch === ";" && depth === 0) {
      start = i + 1; // an at-rule like @import
    }
  }
  return out;
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    out[part.slice(0, colon).trim()] = part.slice(colon + 1).trim().replace(/\s+/g, " ");
  }
  return out;
}

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const top = blocks(css);

const FOLLOW_DEVICE = ':root:not([data-theme="light"])';
const CHOSEN = ':root[data-theme="dark"]';

/** Every dark rule, keyed by what it targets beneath the root selector. */
function darkRules(): { followDevice: Map<string, Record<string, string>>; chosen: Map<string, Record<string, string>> } {
  const followDevice = new Map<string, Record<string, string>>();
  const chosen = new Map<string, Record<string, string>>();
  for (const block of top) {
    if (/^@media\s*\(prefers-color-scheme:\s*dark\)$/.test(block.prelude)) {
      for (const rule of blocks(block.body)) {
        assert.ok(
          rule.prelude.startsWith(FOLLOW_DEVICE),
          `a dark media rule must yield to an explicit Light choice: ${rule.prelude}`,
        );
        followDevice.set(rule.prelude.slice(FOLLOW_DEVICE.length).trim(), declarations(rule.body));
      }
    } else if (block.prelude.startsWith(CHOSEN)) {
      chosen.set(block.prelude.slice(CHOSEN.length).trim(), declarations(block.body));
    }
  }
  return { followDevice, chosen };
}

// --- The stylesheet -----------------------------------------------------------

test("choosing Dark looks exactly like a device that prefers dark", () => {
  const { followDevice, chosen } = darkRules();
  assert.ok(followDevice.has(""), "no dark palette found under the media query");
  assert.deepEqual(
    Object.fromEntries(chosen),
    Object.fromEntries(followDevice),
    "the two copies of the dark palette in globals.css have drifted apart",
  );
});

test("the dark palette redefines every colour token the light one sets", () => {
  const root = top.find((block) => block.prelude === ":root");
  assert.ok(root, "no :root block in globals.css");
  const light = Object.keys(declarations(root.body)).filter((name) => name.startsWith("--"));
  const dark = darkRules().chosen.get("") ?? {};
  for (const name of light) {
    assert.ok(name in dark, `${name} has no dark value, so Dark mode would show its light one`);
  }
});

test("choosing Light pins the native controls light too", () => {
  const rule = top.find((block) => block.prelude === ':root[data-theme="light"]');
  assert.ok(rule, 'no :root[data-theme="light"] rule');
  assert.equal(declarations(rule.body)["color-scheme"], "light");
});

test("the browser chrome is tinted the colour of the page", () => {
  const root = top.find((block) => block.prelude === ":root");
  assert.equal(declarations(root!.body)["--surface"], THEME_COLORS.light);
  assert.equal(darkRules().chosen.get("")?.["--surface"], THEME_COLORS.dark);
});

// --- The preference -----------------------------------------------------------

test("anything but an explicit light or dark means follow the device", () => {
  assert.equal(parseThemePreference("light"), "light");
  assert.equal(parseThemePreference("dark"), "dark");
  for (const value of ["system", "", "Dark", null, undefined, 1, {}]) {
    assert.equal(parseThemePreference(value), "system");
  }
});

// --- The inline script ----------------------------------------------------------

/** Just enough DOM for applyTheme: <html>, a <head> holding Next's two tags. */
function fakeDocument() {
  class FakeElement {
    attrs = new Map<string, string>();
    parentNode: FakeHead | null = null;
    constructor(attrs: Record<string, string> = {}) {
      for (const [name, value] of Object.entries(attrs)) this.attrs.set(name, value);
    }
    getAttribute(name: string) {
      return this.attrs.get(name) ?? null;
    }
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value);
    }
    removeAttribute(name: string) {
      this.attrs.delete(name);
    }
  }
  class FakeHead {
    children: FakeElement[] = [];
    get firstChild() {
      return this.children[0] ?? null;
    }
    insertBefore(node: FakeElement, before: FakeElement | null) {
      const at = before ? this.children.indexOf(before) : this.children.length;
      this.children.splice(at, 0, node);
      node.parentNode = this;
    }
    removeChild(node: FakeElement) {
      this.children = this.children.filter((child) => child !== node);
      node.parentNode = null;
    }
  }

  const html = new FakeElement();
  const head = new FakeHead();
  for (const [scheme, color] of Object.entries(THEME_COLORS)) {
    head.insertBefore(
      new FakeElement({
        name: "theme-color",
        media: `(prefers-color-scheme: ${scheme})`,
        content: color,
      }),
      null,
    );
  }

  return {
    theme: () => html.getAttribute("data-theme"),
    /** The colour a browser would tint its chrome, per device scheme. */
    chromeColor(scheme: "light" | "dark") {
      const match = head.children.find((meta) => {
        const media = meta.getAttribute("media");
        return !media || media.includes(scheme);
      });
      return match?.getAttribute("content");
    },
    tags: () => head.children.map((meta) => Object.fromEntries(meta.attrs)),
    document: {
      documentElement: html,
      head,
      createElement: () => new FakeElement(),
      querySelector: (selector: string) =>
        selector.includes("data-theme-override")
          ? (head.children.find((meta) => meta.attrs.has("data-theme-override")) ?? null)
          : null,
    },
  };
}

const NEXT_TAGS = [
  { name: "theme-color", media: "(prefers-color-scheme: light)", content: THEME_COLORS.light },
  { name: "theme-color", media: "(prefers-color-scheme: dark)", content: THEME_COLORS.dark },
];

/**
 * Runs the script in a sandbox holding nothing but a document and storage —
 * the same position it is in inside the page, before any bundle has loaded. A
 * reference to anything from the module it was written in fails here.
 */
function runScript(stored: string | null, storage?: object, page = fakeDocument()) {
  runInNewContext(themeScript(), {
    document: page.document,
    localStorage: storage ?? {
      getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null),
    },
  });
  return page;
}

test("a saved Dark is applied before the page paints", () => {
  const page = runScript("dark");
  assert.equal(page.theme(), "dark");
  assert.equal(page.chromeColor("light"), THEME_COLORS.dark);
  assert.equal(page.chromeColor("dark"), THEME_COLORS.dark);
});

test("a saved Light is applied before the page paints", () => {
  const page = runScript("light");
  assert.equal(page.theme(), "light");
  assert.equal(page.chromeColor("light"), THEME_COLORS.light);
  assert.equal(page.chromeColor("dark"), THEME_COLORS.light);
});

test("with nothing saved, the page follows the device", () => {
  for (const stored of [null, "system", "purple"]) {
    const page = runScript(stored);
    assert.equal(page.theme(), null);
    assert.equal(page.chromeColor("light"), THEME_COLORS.light);
    assert.equal(page.chromeColor("dark"), THEME_COLORS.dark);
  }
});

test("Next's own theme-color tags are never edited, or React re-adds them on hydration", () => {
  for (const stored of ["light", "dark", null]) {
    const page = runScript(stored);
    const tags = page.tags().filter((tag) => !("data-theme-override" in tag));
    assert.deepEqual(tags, NEXT_TAGS);
  }
});

test("going back to Auto removes the override, and switching never stacks a second", () => {
  const page = fakeDocument();
  runScript("dark", undefined, page);
  runScript("light", undefined, page);
  assert.equal(page.tags().length, NEXT_TAGS.length + 1);
  assert.equal(page.chromeColor("dark"), THEME_COLORS.light);
  runScript(null, undefined, page);
  assert.deepEqual(page.tags(), NEXT_TAGS);
  assert.equal(page.theme(), null);
});

test("storage that refuses to be read leaves the page following the device", () => {
  const page = runScript(null, {
    getItem() {
      throw new Error("SecurityError");
    },
  });
  assert.equal(page.theme(), null);
});

test("no palette block declares a token twice", () => {
  const blocksToCheck = [
    ...top.filter((block) => block.prelude.startsWith(":root")),
    ...top
      .filter((block) => block.prelude.startsWith("@media"))
      .flatMap((block) => blocks(block.body)),
  ];
  for (const block of blocksToCheck) {
    const names = block.body
      .split(";")
      .map((part) => part.slice(0, part.indexOf(":")).trim())
      .filter((name) => name.startsWith("--"));
    const repeated = names.filter((name, index) => names.indexOf(name) !== index);
    assert.deepEqual(repeated, [], `${block.prelude} declares ${repeated.join(", ")} more than once`);
  }
});
