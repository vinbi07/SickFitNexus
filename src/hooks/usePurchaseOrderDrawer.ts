import { useCallback, useRef, useState } from "react";

export type PurchaseOrderDrawerMode = "view" | "edit";

export function usePurchaseOrderDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [poId, setPoId] = useState<string | null>(null);
  const [mode, setMode] = useState<PurchaseOrderDrawerMode>("view");
  const triggerRef = useRef<HTMLElement | null>(null);

  const openDrawer = useCallback((id: string, nextMode: PurchaseOrderDrawerMode = "view") => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPoId(id);
    setMode(nextMode);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    const trigger = triggerRef.current;
    if (trigger) {
      window.setTimeout(() => trigger.focus(), 0);
    }
  }, []);

  return { isOpen, poId, mode, openDrawer, closeDrawer, triggerRef };
}
