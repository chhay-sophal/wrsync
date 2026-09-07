import { Dropdown, Option, Spinner, Text, tokens } from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { listSolutions, type Solution } from "../../api/dataverse";

interface Props {
  orgApiUrl: string;
  selected: Solution | null;
  onSelect: (solution: Solution) => void;
}

export function SolutionPicker({ orgApiUrl, selected, onSelect }: Props) {
  const [solutions, setSolutions] = useState<Solution[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSolutions(null);
    listSolutions(orgApiUrl)
      .then(setSolutions)
      .catch((err) => setError(err.message));
  }, [orgApiUrl]);

  if (error) return <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>;
  if (!solutions) return <Spinner label="Loading solutions..." />;

  return (
    <Dropdown
      className="w-full"
      placeholder="Choose a solution"
      value={selected?.friendlyname ?? ""}
      onOptionSelect={(_, data) => {
        const sol = solutions.find((s) => s.solutionid === data.optionValue);
        if (sol) onSelect(sol);
      }}
    >
      {solutions.map((sol) => (
        <Option key={sol.solutionid} value={sol.solutionid}>
          {sol.friendlyname}
        </Option>
      ))}
    </Dropdown>
  );
}
