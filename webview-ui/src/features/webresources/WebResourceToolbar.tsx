import {
  Button,
  Checkbox,
  Dropdown,
  Input,
  Menu,
  MenuPopover,
  MenuTrigger,
  Option,
  Radio,
  RadioGroup,
  Text,
} from "@fluentui/react-components";
import { FilterRegular, SearchRegular } from "@fluentui/react-icons";
import type { Filters, ManagedFilter, SortState } from "./filterUtils";

const SORT_OPTIONS: { key: string; label: string; state: SortState }[] = [
  { key: "none", label: "Default order", state: null },
  { key: "name-asc", label: "Name (A–Z)", state: { column: "name", direction: "asc" } },
  { key: "name-desc", label: "Name (Z–A)", state: { column: "name", direction: "desc" } },
  { key: "displayname-asc", label: "Display Name (A–Z)", state: { column: "displayname", direction: "asc" } },
  { key: "displayname-desc", label: "Display Name (Z–A)", state: { column: "displayname", direction: "desc" } },
  { key: "type-asc", label: "Type (A–Z)", state: { column: "type", direction: "asc" } },
  { key: "type-desc", label: "Type (Z–A)", state: { column: "type", direction: "desc" } },
  { key: "managed-asc", label: "Managed (No first)", state: { column: "managed", direction: "asc" } },
  { key: "managed-desc", label: "Managed (Yes first)", state: { column: "managed", direction: "desc" } },
];

function sortKeyFor(sort: SortState): string {
  return sort ? `${sort.column}-${sort.direction}` : "none";
}

interface Props {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  availableTypes: [number, string][];
}

/** Replaces the original desktop app's per-column filter/sort menus (which need a wide table
 * to have a "column" at all) with a single combined toolbar: a search box, a Type/Managed
 * filter popover, and a sort dropdown. */
export function WebResourceToolbar({ filters, onFiltersChange, sort, onSortChange, availableTypes }: Props) {
  const filtersActive = filters.types.size > 0 || filters.managed !== "all";
  const selectedSortOption = SORT_OPTIONS.find((o) => o.key === sortKeyFor(sort)) ?? SORT_OPTIONS[0];

  function toggleType(code: number) {
    const types = new Set(filters.types);
    if (types.has(code)) types.delete(code);
    else types.add(code);
    onFiltersChange({ ...filters, types });
  }

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <Input
        size="small"
        contentBefore={<SearchRegular />}
        value={filters.search}
        onChange={(_, data) => onFiltersChange({ ...filters, search: data.value })}
        placeholder="Search name or display name..."
      />
      <div className="flex items-center gap-1">
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button
              size="small"
              appearance={filtersActive ? "primary" : "secondary"}
              icon={<FilterRegular />}
              aria-label="Filter"
            />
          </MenuTrigger>
          <MenuPopover>
            <div className="flex min-w-[200px] flex-col gap-2 p-2">
              <Text size={200} weight="semibold">
                Type
              </Text>
              <div className="flex flex-col gap-1">
                {availableTypes.length === 0 && <Text size={200}>No types loaded yet.</Text>}
                {availableTypes.map(([code, label]) => (
                  <Checkbox
                    key={code}
                    label={label}
                    checked={filters.types.has(code)}
                    onChange={() => toggleType(code)}
                  />
                ))}
              </div>
              <Text size={200} weight="semibold">
                Managed
              </Text>
              <RadioGroup
                value={filters.managed}
                onChange={(_, data) => onFiltersChange({ ...filters, managed: data.value as ManagedFilter })}
              >
                <Radio value="all" label="All" />
                <Radio value="managed" label="Managed" />
                <Radio value="unmanaged" label="Unmanaged" />
              </RadioGroup>
              <Button
                size="small"
                appearance="subtle"
                onClick={() => onFiltersChange({ ...filters, types: new Set(), managed: "all" })}
              >
                Clear
              </Button>
            </div>
          </MenuPopover>
        </Menu>

        <Dropdown
          size="small"
          className="min-w-0 flex-1"
          value={selectedSortOption.label}
          selectedOptions={[selectedSortOption.key]}
          onOptionSelect={(_, data) => {
            const option = SORT_OPTIONS.find((o) => o.key === data.optionValue);
            if (option) onSortChange(option.state);
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <Option key={o.key} value={o.key}>
              {o.label}
            </Option>
          ))}
        </Dropdown>
      </div>
    </div>
  );
}
