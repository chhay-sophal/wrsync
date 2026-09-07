import { Button, Card, Checkbox, Text, tokens } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import { memo } from "react";
import type { WebResource } from "../../api/dataverse";
import type { LocalFile, ResourceLink } from "../../api/local";
import { LocalFileLink } from "./LocalFileLink";
import { TYPE_LABELS } from "./webResourceTypes";

interface Props {
  resource: WebResource;
  isSelected: boolean;
  onToggleSelected: (id: string) => void;
  onShowDetails: (id: string) => void;
  orgApiUrl: string;
  environmentId: string;
  solutionUniqueName: string;
  localFiles: LocalFile[];
  link: ResourceLink | undefined;
  isModified: boolean;
  onLinksChanged: () => void;
  onPublished: (webresourceId: string, localPath: string) => void;
}

/** Memoized so that editing one card (selection, linking, publishing) doesn't force every
 * other card in the list to re-render too. */
function WebResourceCardImpl({
  resource: r,
  isSelected,
  onToggleSelected,
  onShowDetails,
  orgApiUrl,
  environmentId,
  solutionUniqueName,
  localFiles,
  link,
  isModified,
  onLinksChanged,
  onPublished,
}: Props) {
  return (
    <Card
      className="shrink-0 p-2"
      style={isSelected ? { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: -1 } : undefined}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Checkbox
          checked={isSelected}
          onChange={() => onToggleSelected(r.webresourceid)}
          aria-label={`Select ${r.name}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-1">
            <Text weight="semibold" size={300} truncate wrap={false} title={r.name} className="min-w-0 flex-1">
              {r.name}
            </Text>
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
          <Text
            block
            truncate
            wrap={false}
            size={200}
            title={r.displayname}
            style={{ color: tokens.colorNeutralForeground3 }}
          >
            {r.displayname}
          </Text>
          <Text block size={100} style={{ color: tokens.colorNeutralForeground3 }}>
            {TYPE_LABELS[r.webresourcetype] ?? r.webresourcetype} · {r.ismanaged ? "Managed" : "Unmanaged"}
          </Text>
        </div>
      </div>

      <div className="mt-2 border-t pt-2" style={{ borderColor: tokens.colorNeutralStroke2 }}>
        <LocalFileLink
          orgApiUrl={orgApiUrl}
          environmentId={environmentId}
          solutionUniqueName={solutionUniqueName}
          webresourceId={r.webresourceid}
          webresourceName={r.name}
          localFiles={localFiles}
          link={link}
          isModified={isModified}
          onLinksChanged={onLinksChanged}
          onPublished={onPublished}
        />
      </div>
    </Card>
  );
}

export const WebResourceCard = memo(WebResourceCardImpl);
