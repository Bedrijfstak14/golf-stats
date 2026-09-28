"use client";
import { Icon, icons } from "@/components/icons";

/** Bovenbalk: menu-knop, woordmerk en avatar. De pagina's houden hun eigen grote titel. */
export default function AppBar({ initial, menuOpen, onMenu }: { initial: string; menuOpen: boolean; onMenu: () => void }) {
  return (
    <header className="app-bar">
      <div className="app-bar-inner">
        <button type="button" className="icon-btn" aria-label="Menu openen" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="app-drawer" onClick={onMenu}>
          <Icon d={icons.menu} />
        </button>
        <span className="wordmark">Golf Stats</span>
        <button type="button" className="icon-btn" aria-label="Profiel en menu" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="app-drawer" onClick={onMenu}>
          <span className="avatar" aria-hidden>
            {initial}
          </span>
        </button>
      </div>
    </header>
  );
}
