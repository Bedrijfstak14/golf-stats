"use client";
import { useEffect, useState } from "react";
import { flushQueue, queueSize } from "./offline";

/** Registreert de service worker en synchroniseert de offline wachtrij zodra er netwerk is. */
export default function SwRegister() {
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const update = async () => {
      setOffline(!navigator.onLine);
      setPending(await queueSize());
    };
    const online = async () => {
      await flushQueue();
      update();
    };
    update();
    if (navigator.onLine) online();
    window.addEventListener("online", online);
    window.addEventListener("offline", update);
    window.addEventListener("gs-queue", update);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", update);
      window.removeEventListener("gs-queue", update);
    };
  }, []);

  if (!offline && !pending) return null;
  return (
    <div className="offline-banner" role="status">
      {offline ? "Offline" : "Synchroniseren…"}
      {pending ? ` · ${pending} in de wachtrij` : ""}
    </div>
  );
}
