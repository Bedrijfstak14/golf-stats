"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, icons, navKey, type NavKey } from "@/components/icons";

type Props = { canAdd: boolean; addOpen: boolean; onAdd: () => void };

const Tab = ({ href, label, icon, on }: { href: string; label: string; icon: string; on: boolean }) => (
  <Link href={href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
    <span className="pill">
      <Icon d={icon} />
    </span>
    {label}
  </Link>
);

function Bar({ canAdd, addOpen, onAdd, active }: Props & { active: NavKey }) {
  return (
    <nav className="bottom-nav" aria-label="Hoofdmenu">
      <Tab href="/" label="Home" icon={icons.home} on={active === "home"} />
      <Tab href="/rounds" label="Rondes" icon={icons.rounds} on={active === "rounds"} />
      {canAdd ? (
        <div className="plus-slot">
          <button type="button" className="plus" aria-label="Ronde toevoegen" aria-haspopup="dialog" aria-expanded={addOpen} aria-controls="add-sheet" onClick={onAdd}>
            <Icon d={icons.plus} />
          </button>
        </div>
      ) : (
        <span />
      )}
      <Tab href="/stats" label="Stats" icon={icons.stats} on={active === "stats"} />
      <Tab href="/stats?tab=handicap" label="Handicap" icon={icons.handicap} on={active === "handicap"} />
    </nav>
  );
}

function WithTab(props: Props) {
  const tab = useSearchParams().get("tab");
  return <Bar {...props} active={navKey(usePathname(), tab)} />;
}

function Fallback(props: Props) {
  return <Bar {...props} active={navKey(usePathname(), null)} />;
}

export default function BottomNav(props: Props) {
  return (
    <Suspense fallback={<Fallback {...props} />}>
      <WithTab {...props} />
    </Suspense>
  );
}
