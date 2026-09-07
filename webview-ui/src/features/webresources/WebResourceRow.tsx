import { Button, TableCell, TableCellLayout, TableRow } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import { memo } from "react";
import type { LocalFile, ResourceLink } from "../../api/local";
import type { WebResource } from "../../api/dataverse";
import { LocalFileLink } from "./LocalFileLink";
import { TYPE_LABELS } from "./webResourceTypes";

interface Props {
  resource: WebResource;
  onShowDetails: (id: string) => void;
  environmentId: string;
  solutionUniqueName: string;
  localFiles: LocalFile[];
  link: ResourceLink | undefined;
  onLinksChanged: () => void;
}

/** Memoized so that editing filters/sort doesn't force every row to re-render too. */
function WebResourceRowImpl({
  resource: r,
  onShowDetails,
  environmentId,
  solutionUniqueName,
  localFiles,
  link,
  onLinksChanged,
}: Props) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex min-w-0 items-center justify-between gap-1">
          <TableCellLayout truncate title={r.name} className="min-w-0 flex-1">
            {r.name}
          </TableCellLayout>
          <Button
            shape="circular"
            appearance="subtle"
            size="small"
            icon={<InfoRegular />}
            onClick={() => onShowDetails(r.webresourceid)}
            aria-label={`View details for ${r.name}`}
            className="shrink-0"
          />
        </div>
      </TableCell>
      <TableCell>
        <TableCellLayout truncate title={r.displayname}>
          {r.displayname}
        </TableCellLayout>
      </TableCell>
      <TableCell>
        <TableCellLayout truncate>{TYPE_LABELS[r.webresourcetype] ?? r.webresourcetype}</TableCellLayout>
      </TableCell>
      <TableCell>
        <TableCellLayout truncate>{r.ismanaged ? "Yes" : "No"}</TableCellLayout>
      </TableCell>
      <TableCell>
        <LocalFileLink
          environmentId={environmentId}
          solutionUniqueName={solutionUniqueName}
          webresourceId={r.webresourceid}
          webresourceName={r.name}
          localFiles={localFiles}
          link={link}
          onLinksChanged={onLinksChanged}
        />
      </TableCell>
    </TableRow>
  );
}

export const WebResourceRow = memo(WebResourceRowImpl);
