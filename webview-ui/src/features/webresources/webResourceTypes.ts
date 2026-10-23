export const TYPE_LABELS: Record<number, string> = {
  1: "HTML",
  2: "CSS",
  3: "JavaScript",
  4: "XML",
  5: "PNG",
  6: "JPG",
  7: "GIF",
  8: "XAP",
  9: "XSL",
  10: "ICO",
  11: "SVG",
  12: "RESX",
};

/** Local file extensions that can be linked to each text web resource type. Binary types
 * (PNG, JPG, GIF, ICO, and the retired Silverlight XAP) are absent: content is read and
 * uploaded as UTF-8 text, which would corrupt them. Keep the extensions here within the
 * workspace scan's INCLUDE_GLOB in src/workspaceFiles.ts, or they'll never be offered. */
const LINKABLE_EXTENSIONS: Record<number, string[]> = {
  1: ["html", "htm"],
  2: ["css"],
  3: ["js"],
  4: ["xml"],
  9: ["xsl", "xslt"],
  11: ["svg"],
  12: ["resx"],
};

/** Extensions a local file may have to be linked to this web resource type, or null if the
 * type can't be linked at all. */
export function linkableExtensions(webresourcetype: number): string[] | null {
  return LINKABLE_EXTENSIONS[webresourcetype] ?? null;
}

/** Whether a local file's extension matches the web resource's type - false for binary
 * types, and for links made before linking was restricted by type. */
export function isLinkableFile(webresourcetype: number, localPath: string): boolean {
  const extension = localPath.slice(localPath.lastIndexOf(".") + 1).toLowerCase();
  return linkableExtensions(webresourcetype)?.includes(extension) ?? false;
}
