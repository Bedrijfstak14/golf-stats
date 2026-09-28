"use client";
import Link from "next/link";
import { Suspense, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { logout } from "@/app/actions";
import { Icon, icons, navKey, type NavKey } from "@/components/icons";
import { useModal } from "@/components/useModal";

const ROLE_LABEL: Record<string, string> = { owner: "Eigenaar", player: "Speler", viewer: "Meekijker" };

type Item = { key: NavKey | "import" | "export"; href: string; label: string; sub?: string; icon: string };

const MAIN: Item[] = [
  { key: "home", href: "/", label: "Home", icon: icons.home },
  { key: "rounds", href: "/rounds", label: "Rondes", icon: icons.rounds },
  { key: "stats", href: "/stats", label: "Statistieken", icon: icons.stats },
  { key: "handicap", href: "/stats?tab=handicap", label: "Handicapverloop", icon: icons.handicap },
];

const DATA: Item[] = [
  { key: "import", href: "/more/settings#csv", label: "Importeren (CSV)", icon: icons.import },
  { key: "export", href: "/more/settings#export", label: "Exporteren", sub: "CSV of JSON", icon: icons.export },
];

function manageItems(isOwner: boolean): Item[] {
  return [
    { key: "courses", href: "/more/courses", label: "Banen", sub: "lussen, tees, slope", icon: icons.courses },
    { key: "bag", href: "/more/bag", label: "Clubs in de tas", icon: icons.bag },
    ...(isOwner ? [{ key: "users" as const, href: "/more/users", label: "Spelers en uitnodigingen", icon: icons.users }] : []),
    { key: "settings", href: "/more/settings", label: "Instellingen", icon: icons.settings },
  ];
}

function Links({ items, active, onNavigate }: { items: Item[]; active: NavKey; onNavigate: () => void }) {
  return (
    <ul className="drawer-list">
      {items.map((it) => {
        const on = it.key === active;
        return (
          <li key={it.href}>
            <Link href={it.href} className={`drawer-item${on ? " on" : ""}`} aria-current={on ? "page" : undefined} onClick={onNavigate}>
              <Icon d={it.icon} />
              <span className="drawer-label">
                {it.label}
                {it.sub && <span className="drawer-sub">{it.sub}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Nav({ active, isOwner, onNavigate }: { active: NavKey; isOwner: boolean; onNavigate: () => void }) {
  return (
    <nav aria-label="Menu" className="drawer-nav">
      <Links items={MAIN} active={active} onNavigate={onNavigate} />
      <div className="drawer-heading">BEHEER</div>
      <Links items={manageItems(isOwner)} active={active} onNavigate={onNavigate} />
      <div className="drawer-heading">GEGEVENS</div>
      <Links items={DATA} active={active} onNavigate={onNavigate} />
    </nav>
  );
}

function NavWithTab(props: { isOwner: boolean; onNavigate: () => void }) {
  const path = usePathname();
  const tab = useSearchParams().get("tab");
  return <Nav active={navKey(path, tab)} {...props} />;
}

function NavFallback(props: { isOwner: boolean; onNavigate: () => void }) {
  return <Nav active={navKey(usePathname(), null)} {...props} />;
}

/** Hamburgermenu: schuift van links in over een gedimde achtergrond. */
export default function Drawer({
  open,
  onClose,
  name,
  role,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  role: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useModal(open, onClose, panel);
  const firstName = name.trim().split(/\s+/)[0] || name;
  const isOwner = role === "owner";

  return (
    <div className={`overlay drawer-overlay${open ? " open" : ""}`} inert={!open} aria-hidden={!open}>
      <div className="backdrop" onClick={onClose} />
      <div ref={panel} id="app-drawer" className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-head">
          <span id="drawer-title" className="wordmark">
            Golf Stats
          </span>
          <button type="button" className="icon-btn" aria-label="Menu sluiten" onClick={onClose}>
            <Icon d={icons.close} />
          </button>
        </div>

        <div className="drawer-scroll">
          <div className="profile-card">
            <span className="avatar lg" aria-hidden>
              {firstName.charAt(0).toUpperCase()}
            </span>
            <div>
              <div className="profile-name">{firstName}</div>
              <div className="small muted">{ROLE_LABEL[role] ?? role}</div>
            </div>
          </div>

          <Suspense fallback={<NavFallback isOwner={isOwner} onNavigate={onClose} />}>
            <NavWithTab isOwner={isOwner} onNavigate={onClose} />
          </Suspense>

          <form action={logout} className="drawer-foot">
            <button type="submit" className="drawer-item danger">
              <Icon d={icons.logout} />
              <span className="drawer-label">Uitloggen</span>
            </button>
          </form>
          <p className="drawer-note">Handicap is indicatief · NGF blijft leidend</p>
        </div>
      </div>
    </div>
  );
}
