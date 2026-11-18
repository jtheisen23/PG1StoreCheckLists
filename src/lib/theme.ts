/**
 * Light, dark, or whatever the device is set to.
 *
 * The choice is kept per device, in localStorage, rather than on the account.
 * The page has to be painted in the right colours before anything has loaded —
 * including offline, when the service worker serves its cached shell — so it
 * cannot wait on a request or on a cookie baked into HTML that may be days old.
 *
 * "system" is the default and needs no JavaScript at all: globals.css follows
 * `prefers-color-scheme` unless `<html data-theme>` says otherwise.
 */

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_STORAGE_KEY = "theme";

/**
 * The page surface in each theme. The browser chrome (address bar, status bar)
 * is tinted to match, so these must equal `--surface` in globals.css —
 * tests/theme.test.ts holds them together.
 */
export const THEME_COLORS = { light: "#f6f7f9", dark: "#0d1017" } as const;

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * Points the document at a theme, and tints the browser chrome to match.
 *
 * This function is serialised into an inline script in the root layout so it
 * runs before first paint. It must stay self-contained — nothing from module
 * scope, no imports, everything passed in — or the inline copy throws.
 * tests/theme.test.ts runs that copy in an empty sandbox to prove it.
 */
export function applyTheme(
  preference: string | null,
  colors: { light: string; dark: string },
  doc: Document,
): void {
  const forced = preference === "light" || preference === "dark" ? preference : null;
  const root = doc.documentElement;
  if (forced) root.setAttribute("data-theme", forced);
  else root.removeAttribute("data-theme");

  // Next renders one theme-color per scheme, each behind a media query, and
  // React matches those tags by their content when it hydrates — edit one and
  // React inserts a fresh copy. So they are left alone: a forced theme puts
  // its own tag first in <head>, and the browser takes the first that applies.
  let override = doc.querySelector('meta[name="theme-color"][data-theme-override]');
  if (forced) {
    if (!override) {
      override = doc.createElement("meta");
      override.setAttribute("name", "theme-color");
      override.setAttribute("data-theme-override", "");
      doc.head.insertBefore(override, doc.head.firstChild);
    }
    override.setAttribute("content", colors[forced]);
  } else if (override && override.parentNode) {
    override.parentNode.removeChild(override);
  }
}

/**
 * The inline script for the root layout. localStorage throws outright in some
 * private modes and locked-down browsers; then the page simply follows the
 * device, exactly as it would with no choice saved.
 */
export function themeScript(): string {
  return `try{(${applyTheme.toString()})(localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY,
  )}),${JSON.stringify(THEME_COLORS)},document)}catch(e){}`;
}

/** Browser only. */
export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** Browser only. Saves the choice for this device and applies it at once. */
export function saveThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Not persisted, but still applied for as long as the page is open.
  }
  applyTheme(preference, THEME_COLORS, document);
}
