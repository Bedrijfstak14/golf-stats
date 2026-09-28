import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/actions";

export default async function MorePage() {
  const user = await requireUser();
  const items: [string, string, string][] = [
    ["/more/courses", "Banen", "Clubs, lussen, tees, rating en slope"],
    ["/more/bag", "Clubs in de tas", "Clubs met afstanden"],
    ["/more/settings", "Instellingen", "Profiel, officiële index, allowance, eenheden, export"],
  ];
  if (user.role === "owner") items.push(["/more/users", "Spelers en uitnodigingen", "Vrienden uitnodigen, rollen"]);
  return (
    <>
      <div className="page-head">
        <h1>Meer</h1>
      </div>
      <div className="card tight">
        <ul className="list">
          {items.map(([href, title, sub]) => (
            <li key={href}>
              <Link className="item" href={href}>
                <div>
                  <div>
                    <strong>{title}</strong>
                  </div>
                  <div className="small muted">{sub}</div>
                </div>
                <span aria-hidden>›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <form action={logout}>
        <button className="btn block">Uitloggen ({user.email})</button>
      </form>
    </>
  );
}
