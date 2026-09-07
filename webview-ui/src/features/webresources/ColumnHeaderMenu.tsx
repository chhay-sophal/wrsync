import {
  Button,
  Divider,
  Menu,
  MenuPopover,
  MenuTrigger,
  Text,
} from "@fluentui/react-components";
import { ChevronDownRegular } from "@fluentui/react-icons";
import { useState, type ReactNode } from "react";

export type SortDirection = "asc" | "desc" | null;

interface Props {
  active: boolean;
  sortDirection: SortDirection;
  onSort: (direction: SortDirection) => void;
  /** Commits whatever the filter controls (children) currently hold as the active filter. */
  onApply: () => void;
  onClear: () => void;
  /** Fires whenever the dropdown opens or closes — use the `open` case to reset draft filter
   * state from whatever's currently applied, so re-opening continues from the live filter
   * instead of a stale in-progress edit. */
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

export function ColumnHeaderMenu({
  active,
  sortDirection,
  onSort,
  onApply,
  onClear,
  onOpenChange,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  function handleOpenChange(_: unknown, data: { open: boolean }) {
    setOpen(data.open);
    onOpenChange?.(data.open);
  }

  function handleApply() {
    onApply();
    setOpen(false);
  }

  function handleClear() {
    onClear();
    setOpen(false);
  }

  return (
    <Menu open={open} onOpenChange={handleOpenChange} positioning="below-end">
      <MenuTrigger disableButtonEnhancement>
        <Button
          appearance={active ? "primary" : "subtle"}
          size="small"
          icon={<ChevronDownRegular />}
        />
      </MenuTrigger>
      <MenuPopover>
        <div className="flex min-w-[220px] flex-col gap-2 p-1">
          <Text size={200} weight="semibold">
            Sort
          </Text>
          <div className="flex gap-1">
            <Button
              size="small"
              appearance={sortDirection === "asc" ? "primary" : "secondary"}
              onClick={() => onSort(sortDirection === "asc" ? null : "asc")}
            >
              A → Z
            </Button>
            <Button
              size="small"
              appearance={sortDirection === "desc" ? "primary" : "secondary"}
              onClick={() => onSort(sortDirection === "desc" ? null : "desc")}
            >
              Z → A
            </Button>
          </div>

          {children && (
            <>
              <Divider />
              <Text size={200} weight="semibold">
                Filter
              </Text>
              {children}
              <Button size="small" appearance="primary" className="w-full" onClick={handleApply}>
                Apply
              </Button>
            </>
          )}

          <Divider />
          <Button size="small" appearance="subtle" className="w-full" onClick={handleClear}>
            Clear
          </Button>
        </div>
      </MenuPopover>
    </Menu>
  );
}
