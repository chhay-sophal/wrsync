import { Button, Tooltip, type ButtonProps } from "@fluentui/react-components";
import type { MouseEventHandler, ReactNode } from "react";

interface Props {
  /** Shown as the tooltip and used as the button's accessible name. */
  label: string;
  icon: ButtonProps["icon"];
  appearance?: ButtonProps["appearance"];
  shape?: ButtonProps["shape"];
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  /** Optional short text next to the icon, e.g. a count. */
  children?: ReactNode;
  /** Defaults to "above". Use "below" for buttons at the top edge of an overflow-hidden
   * container (e.g. the toolbar in <main>): Fluent hides a tooltip that would be clipped by
   * that container rather than flipping it, so "above" would never be seen there. */
  tooltipPosition?: "above" | "below";
}

/** An icon button with a Fluent tooltip instead of a native `title`: it appears promptly on
 * hover and on keyboard focus, and doubles as the accessible name (relationship="label").
 * `disabled` maps to Fluent's `disabledFocusable`, which still blocks clicks but keeps the
 * button hoverable/focusable - a natively disabled button would never show its tooltip. */
export function IconButton({
  label,
  icon,
  appearance,
  shape,
  disabled,
  onClick,
  className,
  children,
  tooltipPosition = "above",
}: Props) {
  return (
    <Tooltip content={label} relationship="label" withArrow positioning={tooltipPosition}>
      <Button
        size="small"
        icon={icon}
        appearance={appearance}
        shape={shape}
        disabledFocusable={disabled}
        onClick={onClick}
        className={className}
      >
        {children}
      </Button>
    </Tooltip>
  );
}
