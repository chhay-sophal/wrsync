import type { MouseEvent } from "react";

/** Whether a click on a clickable row should trigger the row's own action. Not when it hits
 * a control with its own behaviour (button, input, dropdown), nor when it comes from content
 * rendered in a portal - dialogs, popovers, dropdown options - which sits outside the row's
 * DOM but whose clicks React still bubbles up to the row, nor when it ends a text selection
 * (copying a name or path). */
export function isRowClick(e: MouseEvent<HTMLElement>): boolean {
  const target = e.target as HTMLElement;
  if (!e.currentTarget.contains(target)) return false;
  if (target.closest('input, button, [role="combobox"]')) return false;
  return !window.getSelection()?.toString();
}
