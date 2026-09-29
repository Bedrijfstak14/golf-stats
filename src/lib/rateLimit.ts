/**
 * Eenvoudige rate limiting in het geheugen (vast venster per sleutel).
 *
 * De app draait als één container, dus een Map volstaat; na een herstart beginnen de tellers opnieuw.
 * Limieten staan bij elkaar in LIMITS zodat ze op één plek te zien en aan te passen zijn.
 */

export interface Limit {
  /** Maximaal aantal pogingen per venster */
  max: number;
  /** Lengte van het venster in ms */
  windowMs: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const LIMITS = {
  /** Inlogpogingen per IP (ook geslaagde; bcrypt kost CPU) */
  loginIp: { max: 20, windowMs: 15 * MIN },
  /** Mislukte inlogpogingen per e-mailadres, ongeacht IP (tegen raden van één wachtwoord) */
  loginFail: { max: 5, windowMs: 15 * MIN },
  /** Setup en uitnodiging accepteren per IP */
  signup: { max: 10, windowMs: HOUR },
  /** Uitnodigingen aanmaken per gebruiker */
  invite: { max: 20, windowMs: HOUR },
  /** Uploads (schijfruimte) per gebruiker */
  upload: { max: 40, windowMs: HOUR },
  /** AI-uitlezingen per gebruiker in korte tijd (tegen dubbelklikken en scripts). Het echte budget,
   *  per dag en per maand en ook na een herstart, staat in src/lib/aiBudget.ts. */
  aiBurst: { max: 10, windowMs: 10 * MIN },
  /** CSV-import per gebruiker */
  csv: { max: 10, windowMs: HOUR },
  /** Export per gebruiker */
  export: { max: 30, windowMs: HOUR },
  /** Handicap herberekenen per gebruiker */
  recalc: { max: 6, windowMs: 10 * MIN },
  /** Rondes en slagen opslaan per gebruiker (ruim, want de offline wachtrij verstuurt in één keer) */
  write: { max: 120, windowMs: MIN },
  /** Afbeeldingen ophalen per gebruiker */
  read: { max: 600, windowMs: MIN },
} satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  constructor(private now: () => number = Date.now) {}

  /** Telt een poging mee. Geeft `ok: false` en het aantal seconden tot het volgende venster als de limiet op is. */
  hit(key: string, limit: Limit): { ok: boolean; retryAfter: number; remaining: number } {
    const t = this.now();
    this.sweep(t);
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= t) {
      b = { count: 0, resetAt: t + limit.windowMs };
      this.buckets.set(key, b);
    }
    const retryAfter = Math.ceil((b.resetAt - t) / 1000);
    if (b.count >= limit.max) return { ok: false, retryAfter, remaining: 0 };
    b.count++;
    return { ok: true, retryAfter, remaining: limit.max - b.count };
  }

  /** Controleert zonder mee te tellen (voor "alleen mislukte pogingen tellen"). Geeft seconden tot vrijgave, of 0. */
  blocked(key: string, limit: Limit): number {
    const b = this.buckets.get(key);
    const t = this.now();
    return b && b.resetAt > t && b.count >= limit.max ? Math.ceil((b.resetAt - t) / 1000) : 0;
  }

  reset(key: string) {
    this.buckets.delete(key);
  }

  /** Verlopen vensters opruimen, hooguit eens per minuut */
  private sweep(t: number) {
    if (t - this.lastSweep < MIN) return;
    this.lastSweep = t;
    for (const [k, b] of this.buckets) if (b.resetAt <= t) this.buckets.delete(k);
  }
}

// Eén gedeelde instantie per proces; via globalThis zodat hot reload in dev geen nieuwe maakt.
const g = globalThis as unknown as { __gsRateLimiter?: RateLimiter };
export const limiter = (g.__gsRateLimiter ??= new RateLimiter());

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super(`Te veel pogingen. Probeer het over ${waitText(retryAfter)} opnieuw.`);
  }
}

export function waitText(sec: number) {
  if (sec < 60) return `${sec} seconden`;
  const m = Math.ceil(sec / 60);
  if (m < 60) return `${m} ${m === 1 ? "minuut" : "minuten"}`;
  return `${Math.ceil(m / 60)} uur`;
}

/** Telt mee onder `name:key` en gooit RateLimitError als de limiet op is. */
export function enforce(name: LimitName, key: string | number) {
  const r = limiter.hit(`${name}:${key}`, LIMITS[name]);
  if (!r.ok) throw new RateLimitError(r.retryAfter);
}

/**
 * IP van de bezoeker. Via de Cloudflare-tunnel zet Cloudflare `CF-Connecting-IP`; op het LAN
 * ontbreken die headers en delen alle LAN-bezoekers één sleutel. Headers zijn te vervalsen door wie
 * de poort direct bereikt, daarom zijn gevoelige limieten (inloggen) óók per account.
 */
export function clientIp(h: Headers): string {
  return (
    h.get("cf-connecting-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip")?.trim() ||
    "local"
  );
}
