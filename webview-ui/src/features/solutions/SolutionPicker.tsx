import { Combobox, Option, Spinner, Text, tokens } from "@fluentui/react-components";
import { useEffect, useMemo, useState } from "react";
import { listSolutions, type Solution } from "../../api/dataverse";

interface Props {
  orgApiUrl: string;
  selected: Solution | null;
  onSelect: (solution: Solution) => void;
}

export function SolutionPicker({ orgApiUrl, selected, onSelect }: Props) {
  const [solutions, setSolutions] = useState<Solution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(selected?.friendlyname ?? "");

  useEffect(() => {
    setSolutions(null);
    listSolutions(orgApiUrl)
      .then(setSolutions)
      .catch((err) => setError(err.message));
  }, [orgApiUrl]);

  useEffect(() => {
    setQuery(selected?.friendlyname ?? "");
  }, [selected]);

  const filtered = useMemo(() => {
    if (!solutions) return [];
    const q = query.trim().toLowerCase();
    if (!q || q === selected?.friendlyname?.toLowerCase()) return solutions;
    return solutions.filter((sol) => sol.friendlyname.toLowerCase().includes(q));
  }, [solutions, query, selected]);

  if (error) return <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>;
  if (!solutions) return <Spinner label="Loading solutions..." />;

  return (
    <Combobox
      className="w-full"
      placeholder="Choose a solution or type"
      value={query}
      selectedOptions={selected ? [selected.solutionid] : []}
      onOptionSelect={(_, data) => {
        const sol = solutions.find((s) => s.solutionid === data.optionValue);
        if (sol) onSelect(sol);
      }}
      onChange={(ev) => setQuery(ev.target.value)}
    >
      {filtered.map((sol) => (
        <Option key={sol.solutionid} value={sol.solutionid} text={sol.friendlyname}>
          {sol.friendlyname}
        </Option>
      ))}
    </Combobox>
  );
}
