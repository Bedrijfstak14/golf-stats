"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Tip from "@/components/Tip";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterField {
  name: string;
  label: string;
  options: FilterOption[];
  /** Waarde die "geen filter" betekent (standaard "") */
  defaultValue?: string;
}

/**
 * Compacte filterbalk voor mobiel: een knop met het aantal actieve filters en de actieve
 * filters als verwijderbare chips; uitklappen toont de velden onder elkaar. Wijzigingen
 * worden direct toegepast via de URL, zonder aparte knop.
 */
export default function FilterBar({
  fields,
  search,
  toggle,
}: {
  fields: FilterField[];
  search?: { name: string; placeholder: string };
  toggle?: { name: string; options: FilterOption[]; defaultValue: string; /** Uitleg achter de schakelaar */ tip?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(search ? (params.get(search.name) ?? "") : "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const valueOf = (f: FilterField) => params.get(f.name) ?? f.defaultValue ?? "";
  const active = fields.filter((f) => valueOf(f) !== (f.defaultValue ?? ""));
  const activeCount = active.length + (search && q ? 1 : 0);
  const toggleValue = toggle ? (params.get(toggle.name) ?? toggle.defaultValue) : null;

  const clearAll = () => {
    setQ("");
    apply(Object.fromEntries([...fields.map((f) => [f.name, null]), ...(search ? [[search.name, null]] : [])]));
  };

  return (
    <div className={`card tight filterbar ${pending ? "is-pending" : ""}`}>
      <div className="filterbar-row">
        <button type="button" className={`btn sm filter-toggle ${open ? "on" : ""}`} aria-expanded={open} aria-controls="filter-panel" onClick={() => setOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filters
          {activeCount > 0 && <span className="badge">{activeCount}</span>}
        </button>

        {toggle && (
          <div className="seg filter-seg" role="group" aria-label="Weergave">
            {toggle.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={toggleValue === o.value ? "on" : ""}
                aria-pressed={toggleValue === o.value}
                onClick={() => apply({ [toggle.name]: o.value === toggle.defaultValue ? null : o.value })}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        {toggle?.tip && <Tip text={toggle.tip} label="Weergave" />}
      </div>

      {activeCount > 0 && (
        <div className="filter-chips">
          {search && q && (
            <button type="button" className="chip removable" onClick={() => (setQ(""), apply({ [search.name]: null }))} aria-label={`Zoekterm ${q} wissen`}>
              “{q}” <span aria-hidden>×</span>
            </button>
          )}
          {active.map((f) => (
            <button
              key={f.name}
              type="button"
              className="chip removable"
              onClick={() => apply({ [f.name]: null })}
              aria-label={`Filter ${f.label} wissen`}
            >
              {f.options.find((o) => o.value === valueOf(f))?.label ?? valueOf(f)} <span aria-hidden>×</span>
            </button>
          ))}
          <button type="button" className="chip-link" onClick={clearAll}>
            Wis alles
          </button>
        </div>
      )}

      {open && (
        <div id="filter-panel" className="filter-panel">
          {search && (
            <label className="field">
              <span>Zoeken</span>
              <input
                type="search"
                value={q}
                placeholder={search.placeholder}
                enterKeyHint="search"
                onChange={(e) => {
                  const v = e.target.value;
                  setQ(v);
                  if (timer.current) clearTimeout(timer.current);
                  timer.current = setTimeout(() => apply({ [search.name]: v.trim() || null }), 350);
                }}
              />
            </label>
          )}
          {fields.map((f) => (
            <label key={f.name} className="field">
              <span>{f.label}</span>
              <select value={valueOf(f)} onChange={(e) => apply({ [f.name]: e.target.value === (f.defaultValue ?? "") ? null : e.target.value })}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button type="button" className="btn block" onClick={() => setOpen(false)}>
            Klaar
          </button>
        </div>
      )}
    </div>
  );
}
