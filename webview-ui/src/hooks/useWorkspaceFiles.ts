import { useCallback, useEffect, useState } from "react";
import { listWorkspaceFiles, type LocalFile } from "../api/local";

/** No live file watching yet (that's a later step) - refresh() re-lists the workspace on
 * demand, and callers can wire it to a Refresh button in the meantime. */
export function useWorkspaceFiles() {
  const [root, setRoot] = useState<string | null>(null);
  const [files, setFiles] = useState<LocalFile[]>([]);

  const refresh = useCallback(async () => {
    const result = await listWorkspaceFiles();
    setRoot(result.root);
    setFiles(result.files);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { root, files, refresh };
}
