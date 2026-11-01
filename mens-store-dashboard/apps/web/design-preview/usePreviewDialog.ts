import { useEffect, type RefObject } from 'react';

/** Preserve keyboard position when a preview dialog is removed by React. */
export function usePreviewDialog(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const element = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      if (element?.open) element.close?.();
      const target = opener?.isConnected && opener !== document.body
        ? opener
        : document.getElementById('workspace');
      target?.focus({ preventScroll: true });
    };
  }, [ref]);
}
