import { Button, Text, tokens } from "@fluentui/react-components";
import { ArrowResetRegular, ArrowSyncRegular, ErrorCircleRegular } from "@fluentui/react-icons";
import { Component, type ErrorInfo, type ReactNode } from "react";
import vscodeApi from "../vscodeApi";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Asks the extension to reload this webview from scratch (re-sets its HTML), which also
 * clears any in-memory state - unlike "Try again", which only re-renders. */
function reloadWebview() {
  vscodeApi.postMessage({ type: "reload" });
}

/** Clears what this webview persists in localStorage (selected environment and solution,
 * filters) before reloading, for when bad saved state is what keeps crashing the render. */
function resetAndReload() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("wrsync.")) localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable - reload anyway.
  }
  reloadWebview();
}

/** Catches errors thrown while rendering, so a bug shows a recovery screen instead of
 * unmounting the whole app into a blank webview. (React only supports this as a class
 * component.) Errors in event handlers and promises aren't render errors and don't land
 * here - those are already shown inline where they happen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Visible via "Developer: Open Webview Developer Tools".
    console.error("wrsync webview crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen flex-col gap-3 overflow-auto p-4" style={{ background: tokens.colorNeutralBackground1 }}>
        <div className="flex items-center gap-2">
          <ErrorCircleRegular fontSize={24} style={{ color: tokens.colorPaletteRedForeground1 }} />
          <Text size={400} weight="semibold">
            Something went wrong
          </Text>
        </div>
        <Text>
          Web Resource Sync hit an unexpected error. Your links and local files aren't affected. Try again, or
          reload the view.
        </Text>
        <div className="flex flex-wrap gap-2">
          <Button appearance="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button icon={<ArrowSyncRegular />} onClick={reloadWebview}>
            Reload
          </Button>
          <Button
            appearance="subtle"
            icon={<ArrowResetRegular />}
            onClick={resetAndReload}
            title="Clears the selected environment, solution and filters, then reloads"
          >
            Reset &amp; reload
          </Button>
        </div>
        <details>
          <summary className="cursor-pointer">
            <Text size={200}>Error details</Text>
          </summary>
          <pre
            className="mt-2 overflow-auto whitespace-pre-wrap break-all rounded p-2 text-xs"
            style={{ background: tokens.colorNeutralBackground3 }}
          >
            {error.stack ?? error.message}
          </pre>
        </details>
      </div>
    );
  }
}
