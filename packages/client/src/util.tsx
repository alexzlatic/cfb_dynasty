import type { Team } from "./api.ts";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (d: string, year = false) => {
  const x = new Date(d + "T12:00:00Z");
  return `${DAYS[x.getUTCDay()]}, ${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}${year ? ", " + x.getUTCFullYear() : ""}`;
};
export const shortDate = (d: string) => { const x = new Date(d + "T12:00:00Z"); return `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}`; };
export const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const fmtClock = (s: number, q: number) => (q > 4 ? "OT" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
export const fmtKick = (k: string | null) => {
  if (!k) return "TBA";
  const [h, m] = k.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} ET`;
};

export function Logo({ team, size = 24 }: { team: Team | undefined; size?: number }) {
  if (!team) return <span style={{ width: size, display: "inline-block" }} />;
  return <img className="logo" src={`/logos/${team.id}.png`} width={size} height={size} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />;
}

export function TeamName({ team, rank, link = true, league }: { team: Team | undefined; rank?: number | null; link?: boolean; league?: string }) {
  if (!team) return <span>?</span>;
  const label = <>{rank ? <span className="rank">{rank}</span> : null}{team.school}</>;
  return link && league ? <a href={`#/l/${league}/team/${team.id}`} className="teamname">{label}</a> : <span className="teamname">{label}</span>;
}

/** Text color that reads on a team color. */
export function onColor(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#111" : "#fff";
}

export const heightStr = (inches: number | null) => (inches ? `${Math.floor(inches / 12)}-${inches % 12}` : "");
