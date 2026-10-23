import { FluentProvider, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import App from "./App";
import { LinkSuggestionsPage } from "./features/webresources/LinkSuggestionsPage";

/** Which page this webview shows: the extension sets data-view on #root for editor-tab
 * pages (see getHtml in src/sidebarView.ts); the sidebar app has none. */
const view = document.getElementById("root")?.dataset.view;

function prefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function Root() {
  const [isDark, setIsDark] = useState(prefersDark);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Tailwind's `dark:` variant (see index.css) reads this class, so it stays in sync
  // with the same isDark state driving Fluent's theme.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme}>
      {view === "linkSuggestions" ? (
        <LinkSuggestionsPage />
      ) : (
        <App isDark={isDark} onToggleTheme={() => setIsDark((d) => !d)} />
      )}
    </FluentProvider>
  );
}
