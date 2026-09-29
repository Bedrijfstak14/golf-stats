"use client";
/**
 * Offline wachtrij: opslaan dat mislukt door geen netwerk komt in IndexedDB
 * en wordt verstuurd zodra er weer verbinding is.
 */
const DB = "golf-stats";
const STORE = "queue";

interface QueuedRequest {
  id?: number;
  url: string;
  method: string;
  body: string;
  createdAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function queueSize(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    return await tx("readonly", (s) => s.count());
  } catch {
    return 0;
  }
}

export async function enqueue(url: string, method: string, body: unknown) {
  await tx("readwrite", (s) => s.add({ url, method, body: JSON.stringify(body), createdAt: Date.now() }));
  window.dispatchEvent(new Event("gs-queue"));
}

let flushing = false;
export async function flushQueue() {
  if (flushing || typeof indexedDB === "undefined") return;
  flushing = true;
  try {
    const items = await tx<QueuedRequest[]>("readonly", (s) => s.getAll());
    for (const item of items) {
      try {
        const res = await fetch(item.url, { method: item.method, headers: { "content-type": "application/json" }, body: item.body });
        // Te veel verzoeken of niet (meer) ingelogd: bewaren en later opnieuw proberen
        if (res.status === 429 || res.status === 401) break;
        if (res.ok || (res.status >= 400 && res.status < 500)) await tx("readwrite", (s) => s.delete(item.id!));
      } catch {
        break; // nog steeds offline
      }
    }
  } finally {
    flushing = false;
    window.dispatchEvent(new Event("gs-queue"));
  }
}

/** JSON versturen; bij geen netwerk in de wachtrij. */
export async function sendJson(url: string, method: string, body: unknown): Promise<{ ok: true; data: any } | { ok: false; queued: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? `Fout ${res.status}` };
    return { ok: true, data };
  } catch {
    await enqueue(url, method, body);
    return { ok: false, queued: true };
  }
}
