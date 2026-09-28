"use client";
import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/**
 * Klein ⓘ-icoon met uitleg. Op een telefoon is er geen hover, dus openen gaat met tikken;
 * met een muis ook bij hover. De ballon staat `fixed` zodat tabellen met overflow hem niet afknippen.
 * Het is een span (geen button) zodat hij ook binnen links, labels en <summary> mag staan;
 * de klik wordt daar tegengehouden zodat de link, het invoerveld of de inklapkaart niet reageert.
 */
export default function Tip({ k, text, label }: { k?: GlossaryKey; text?: string; label?: string }) {
  const body = text ?? (k ? GLOSSARY[k] : "");
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  /** Geopend door hover (muis): sluit bij weggaan, tenzij er intussen geklikt is */
  const viaHover = useRef(false);
  const id = useId();

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(300, vw - 32);
    const left = Math.max(16, Math.min(r.left + r.width / 2 - width / 2, vw - 16 - width));
    const below = window.innerHeight - r.bottom > 200 || r.top < 200;
    setPos(below ? { left, top: r.bottom + 6, width } : { left, bottom: window.innerHeight - r.top + 6, width });
  };
  const hide = () => {
    viaHover.current = false;
    setPos(null);
  };

  useEffect(() => {
    if (!pos) return;
    const onDown = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) hide();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("resize", hide);
    };
  }, [pos]);

  if (!body) return null;
  const toggle = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (viaHover.current) viaHover.current = false;
    else if (pos) hide();
    else show();
  };

  return (
    <span
      ref={ref}
      className="tip"
      role="button"
      tabIndex={0}
      aria-label={`Uitleg${label ? `: ${label}` : ""}`}
      aria-expanded={pos != null}
      aria-describedby={pos ? id : undefined}
      onClick={toggle}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(e)}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse" && !pos) {
          viaHover.current = true;
          show();
        }
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && viaHover.current) {
          viaHover.current = false;
          hide();
        }
      }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="4.9" r="1" fill="currentColor" />
        <path d="M8 7.2v4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {pos && (
        <span id={id} role="tooltip" className="tip-pop" style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}>
          {body}
        </span>
      )}
    </span>
  );
}

/** Label met uitleg erachter: <Term k="girPct">GIR %</Term> */
export function Term({ k, text, children }: { k?: GlossaryKey; text?: string; children: React.ReactNode }) {
  return (
    <span className="term">
      {children}
      <Tip k={k} text={text} label={typeof children === "string" ? children : undefined} />
    </span>
  );
}
