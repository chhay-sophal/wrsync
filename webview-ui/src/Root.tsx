import { FluentProvider, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LinkSuggestionsPage } from "./features/webresources/LinkSuggestionsPage";

function prefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** The webview now hosts only the "Suggested Links" editor tab - the sidebar is a native tree
 * view (src/webResourceTree.ts). */
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
      {/* Inside the provider so the fallback screen is themed like the rest. */}
      <ErrorBoundary>
        <LinkSuggestionsPage />
      </ErrorBoundary>
    </FluentProvider>
  );
}
