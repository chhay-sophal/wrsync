import { callRpc } from "./rpc";

export interface DataverseEnvironment {
  id: string;
  displayName: string;
  domainName: string;
  apiUrl: string;
  tenantId: string;
}

export interface Solution {
  solutionid: string;
  uniquename: string;
  friendlyname: string;
  ismanaged: boolean;
}

export function listEnvironments(): Promise<DataverseEnvironment[]> {
  return callRpc<DataverseEnvironment[]>("dataverse.listEnvironments");
}

export function listSolutions(orgApiUrl: string): Promise<Solution[]> {
  return callRpc<Solution[]>("dataverse.listSolutions", { orgApiUrl });
}
