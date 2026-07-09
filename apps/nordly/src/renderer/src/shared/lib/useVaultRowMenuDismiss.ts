import { useEffect, type RefObject } from 'react';

/** Outside click / scroll / resize / Escape — matches whiteboard vault row menus. */
export function useVaultRowMenuDismiss(
  open: boolean,
  onClose: () => void,
  rowRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  updateMenuPos: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    updateMenuPos();

    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!rowRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = (e: Event) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };

    // click (not mousedown) so menu item clicks register before the menu closes
    window.addEventListener('click', onDoc);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updateMenuPos);
    return () => {
      window.removeEventListener('click', onDoc);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updateMenuPos);
    };
  }, [open, onClose, rowRef, menuRef, updateMenuPos]);
}
