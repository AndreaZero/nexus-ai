/** Native dialogs also target themselves for clicks on their inner padding. */
export function isDialogBackdropClick(event: { target: EventTarget | null; currentTarget: HTMLDialogElement; clientX: number; clientY: number }): boolean {
  if (event.target !== event.currentTarget) return false;
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
}
