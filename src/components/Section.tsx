"use client";
import { useEffect, useRef } from "react";
import Tip from "@/components/Tip";
import type { GlossaryKey } from "@/lib/glossary";

/**
 * Inklapbare kaart. De kop is de klikbare samenvatting; de open/dicht-stand wordt per
 * sectie in de browser onthouden (alleen een gemak, dus fouten met opslag worden genegeerd).
 */
export default function Section({
  id,
  title,
  aside,
  tip,
  defaultOpen = true,
  wide = false,
  children,
}: {
  id: string;
  title: React.ReactNode;
  /** Klein element rechts in de kop, bijv. een aantal */
  aside?: React.ReactNode;
  /** Uitleg-icoon achter de titel */
  tip?: GlossaryKey;
  defaultOpen?: boolean;
  /** Over de volle breedte van het raster */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const key = `gs-section:${id}`;

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v != null && ref.current) ref.current.open = v === "1";
    } catch {}
  }, [key]);

  return (
    <details
      ref={ref}
      className="card section"
      open={defaultOpen}
      style={wide ? { gridColumn: "1 / -1" } : undefined}
      onToggle={(e) => {
        try {
          localStorage.setItem(key, (e.currentTarget as HTMLDetailsElement).open ? "1" : "0");
        } catch {}
      }}
    >
      <summary className="section-head">
        <h2>
          {title}
          {tip && (
            <>
              {" "}
              <Tip k={tip} label={typeof title === "string" ? title : undefined} />
            </>
          )}
        </h2>
        {aside != null && <span className="section-aside">{aside}</span>}
        <svg className="chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
