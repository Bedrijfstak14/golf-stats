"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppBar from "@/components/AppBar";
import BottomNav from "@/components/BottomNav";
import Drawer from "@/components/Drawer";
import AddSheet from "@/components/AddSheet";

/** App-schil voor ingelogde gebruikers: bovenbalk, hamburgermenu, onderbalk en toevoeg-sheet. */
export default function NavShell({ name, role, children }: { name: string; role: string; children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const path = usePathname();
  const canAdd = role !== "viewer";

  // Bij een routewissel alles sluiten (ook bij terug/vooruit in de browser).
  useEffect(() => {
    setDrawer(false);
    setSheet(false);
  }, [path]);

  const closeDrawer = useCallback(() => setDrawer(false), []);
  const closeSheet = useCallback(() => setSheet(false), []);
  const initial = (name.trim().charAt(0) || "?").toUpperCase();

  return (
    <>
      <AppBar initial={initial} menuOpen={drawer} onMenu={() => setDrawer(true)} />
      <main className="app">{children}</main>
      <BottomNav canAdd={canAdd} addOpen={sheet} onAdd={() => setSheet(true)} />
      <Drawer open={drawer} onClose={closeDrawer} name={name} role={role} />
      {canAdd && <AddSheet open={sheet} onClose={closeSheet} />}
    </>
  );
}
