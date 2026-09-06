// The reader's theme, stamped on <html> as data-theme — which is what the
// `dark:` variant keys off (see app/globals.css).

export type Theme = "light" | "dark";

export const THEME_KEY = "p2c:theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

// The stored theme, falling back to whatever the OS prefers the first time
// someone visits. Storage can throw (private mode, blocked cookies), in which
// case the choice just won't outlive the tab.
export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Fall through to the OS preference.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Nothing to do.
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

// The same read, inlined into <head> so it runs before the first paint and the
// page never flashes the wrong theme. It can't import anything, hence the
// duplication — keep it in step with the functions above.
export const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)})}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t})()`;
