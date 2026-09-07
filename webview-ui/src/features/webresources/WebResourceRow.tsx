import { Button, TableCell, TableCellLayout, TableRow } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import { memo } from "react";
import type { WebResource } from "../../api/dataverse";
import { TYPE_LABELS } from "./webResourceTypes";

interface Props {
  resource: WebResource;
  onShowDetails: (id: string) => void;
}

/** Memoized so that editing filters/sort doesn't force every row to re-render too. */
function WebResourceRowImpl({ resource: r, onShowDetails }: Props) {
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
    </TableRow>
  );
}

export const WebResourceRow = memo(WebResourceRowImpl);
