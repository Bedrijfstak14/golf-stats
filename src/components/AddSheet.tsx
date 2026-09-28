"use client";
import Link from "next/link";
import { useRef } from "react";
import { Icon, icons } from "@/components/icons";
import { useModal } from "@/components/useModal";

const OPTIONS = [
  { href: "/add", label: "Uit fotobibliotheek", sub: "Ook via Delen vanuit Hole19", icon: icons.image },
  { href: "/add/manual", label: "Handmatig invoeren", sub: "Werkt ook zonder verbinding", icon: icons.pencil },
  { href: "/more/settings#csv", label: "Historische rondes (CSV)", sub: "Bijvoorbeeld uit een export", icon: icons.file },
];

/** Bottom sheet achter de +-knop: kies hoe je een ronde toevoegt. */
export default function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useModal(open, onClose, panel);

  return (
    <div className={`overlay sheet-overlay${open ? " open" : ""}`} inert={!open} aria-hidden={!open}>
      <div className="backdrop" onClick={onClose} />
      <div ref={panel} id="add-sheet" className="sheet" role="dialog" aria-modal="true" aria-labelledby="add-sheet-title">
        <div className="grab" aria-hidden />
        <div className="sheet-head">
          <h2 id="add-sheet-title">Ronde toevoegen</h2>
          <button type="button" className="icon-btn" aria-label="Sluiten" onClick={onClose}>
            <Icon d={icons.close} />
          </button>
        </div>

        <Link href="/add" className="sheet-primary" onClick={onClose}>
          <span className="sheet-icon">
            <Icon d={icons.camera} />
          </span>
          <span>
            <strong>Scorekaart fotograferen</strong>
            <span className="sheet-sub">Of kies een Hole19-screenshot</span>
            <span className="sheet-body">AI leest de kaart uit, de app controleert alles en jij kijkt het na voordat de ronde meetelt.</span>
          </span>
        </Link>

        <ul className="sheet-list">
          {OPTIONS.map((o) => (
            <li key={o.label}>
              <Link href={o.href} className="sheet-item" onClick={onClose}>
                <span className="sheet-icon">
                  <Icon d={o.icon} />
                </span>
                <span className="sheet-text">
                  <strong>{o.label}</strong>
                  <span className="sheet-sub">{o.sub}</span>
                </span>
                <Icon d={icons.chevron} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
