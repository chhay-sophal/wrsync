import { Button, Popover, PopoverSurface, PopoverTrigger, Text, tokens } from "@fluentui/react-components";
import type { ReactElement, ReactNode } from "react";

interface Props {
  icon: ReactElement;
  label: string;
  value: string;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function SettingsBarItem({ icon, label, value, disabled, open, onOpenChange, children }: Props) {
  return (
    <Popover
      open={open}
      onOpenChange={(_, data) => onOpenChange(data.open)}
      positioning="below-start"
      withArrow
    >
      <PopoverTrigger disableButtonEnhancement>
        <Button className="flex-1" appearance="subtle" disabled={disabled} icon={icon}>
          <div className="min-w-0 flex flex-1 flex-col items-start leading-tight">
            <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
              {label}
            </Text>
            <Text size={300} truncate wrap={false} className="w-full text-left truncate">
              {value}
            </Text>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverSurface className="min-w-[340px] max-w-[740px]">{children}</PopoverSurface>
    </Popover>
  );
}
