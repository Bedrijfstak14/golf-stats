"use client";
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Gedrag voor een modaal paneel (menu, bottom sheet): focus naar binnen, Tab blijft
 * binnen het paneel, Escape sluit, body scrollt niet mee, en bij sluiten gaat de focus
 * terug naar het element dat het paneel opende.
 */
export function useModal(open: boolean, onClose: () => void, panel: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    items()[0]?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const f = items();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (!el.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    const html = document.documentElement;
    const prev = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      html.style.overflow = prev[0];
      document.body.style.overflow = prev[1];
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open, panel]);
}
