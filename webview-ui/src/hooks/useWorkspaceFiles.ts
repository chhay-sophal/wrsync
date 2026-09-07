import { useCallback, useEffect, useState } from "react";
import { listWorkspaceFiles, type LocalFile } from "../api/local";

interface FileEvent {
  type: "added" | "changed" | "removed";
  path: string;
}

export function useWorkspaceFiles() {
  const [root, setRoot] = useState<string | null>(null);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [modifiedPaths, setModifiedPaths] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const result = await listWorkspaceFiles();
    setRoot(result.root);
    setFiles(result.files);
  }, []);

  useEffect(() => {
    refresh();

    function handleMessage(ev: MessageEvent) {
      const message = ev.data as { type?: string; event?: FileEvent };
      if (message?.type !== "fileEvent" || !message.event) return;
      const event = message.event;
      if (event.type === "removed") {
        setFiles((f) => f.filter((x) => x.path !== event.path));
        return;
      }
      setFiles((f) => {
        const entry: LocalFile = { path: event.path, mtimeMs: Date.now() };
        const idx = f.findIndex((x) => x.path === event.path);
        if (idx === -1) return [...f, entry];
        const copy = [...f];
        copy[idx] = entry;
        return copy;
      });
      if (event.type === "changed") {
        setModifiedPaths((m) => new Set(m).add(event.path));
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [refresh]);

  const clearModified = useCallback((path: string) => {
    setModifiedPaths((m) => {
      const copy = new Set(m);
      copy.delete(path);
      return copy;
    });
  }, []);

  return { root, files, modifiedPaths, clearModified, refresh };
}
