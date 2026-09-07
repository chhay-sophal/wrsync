import { callRpc } from "./rpc";

export interface LocalFile {
  path: string;
  mtimeMs: number;
}

export function listWorkspaceFiles(): Promise<{ root: string | null; files: LocalFile[] }> {
  return callRpc<{ root: string | null; files: LocalFile[] }>("workspace.listFiles");
}
