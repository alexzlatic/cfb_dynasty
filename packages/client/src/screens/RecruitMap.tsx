import { useMemo, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import us from "us-atlas/states-albers-10m.json";
import { useLeague } from "../App.tsx";
import type { MapPoint } from "../api.ts";
import { Logo } from "../util.tsx";

/** us-atlas's pre-projected states use this projection (975 x 610); prospects are placed with the same one. */
const projection = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const path = geoPath();
const topo = us as unknown as Topology<{ states: GeometryCollection<{ name: string }>; nation: GeometryCollection }>;
const STATES = feature(topo, topo.objects.states).features;
const BORDERS = path(mesh(topo, topo.objects.states, (a, b) => a !== b)) ?? "";
const ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME",
  Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

/**
 * The prospects your staff knows in a class on a map of the country: colored by stars, ringed when on your
 * board, faded once committed elsewhere; your school and the regions you scout are marked.
 */
export function RecruitMap({ points, home, regions, regionDefs, league, me }: {
  points: MapPoint[]; home: { lat: number | null; lon: number | null; state: string | null } | null; regions: string[];
  regionDefs: Record<string, { name: string; states: string[] }>; league: string; me: number | null;
}) {
  const { team } = useLeague();
  const [hover, setHover] = useState<MapPoint | null>(null);
  const scouted = useMemo(() => new Set(regions.flatMap((r) => regionDefs[r]?.states ?? []).map((s) => (s.startsWith("CA-") ? "CA" : s))), [regions, regionDefs]);
  const placed = useMemo(() => points.map((p) => ({ p, xy: projection([p[2], p[1]]) })).filter((x) => x.xy)
    // Better prospects on top.
    .sort((a, b) => a.p[3] - b.p[3] || a.p[4] - b.p[4]), [points]);
  const homeXY = home?.lat != null && home.lon != null ? projection([home.lon, home.lat]) : null;
  const myTeam = me != null ? team(me) : undefined;
  return (
    <div className="usmap">
      <svg viewBox="0 0 975 610">
        <g className="states">{STATES.map((f) => {
          const ab = ABBR[f.properties.name];
          return <path key={String(f.id)} d={path(f) ?? ""} className={(ab === home?.state ? "home " : "") + (scouted.has(ab) ? "scouted" : "")} />;
        })}</g>
        <path d={BORDERS} className="borders" />
        {homeXY && <circle cx={homeXY[0]} cy={homeXY[1]} r={98} className="radius" />}
        <g>{placed.map(({ p, xy }) => (
          <circle key={p[0]} cx={xy![0]} cy={xy![1]} r={p[3] >= 5 ? 5.5 : p[3] === 4 ? 4.2 : 3}
            className={`dot s${p[3] >= 3 ? p[3] : 0}${p[6] ? " board" : ""}${p[5] != null && p[5] !== me ? " gone" : ""}${p[5] === me && me != null ? " mine" : ""}`}
            onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => (location.hash = `#/l/${league}/prospect/${p[0]}`)} />
        ))}</g>
        {homeXY && <g transform={`translate(${homeXY[0]},${homeXY[1]})`} className="homepin"><circle r="9" /><text y="4" textAnchor="middle">★</text></g>}
      </svg>
      {hover && (
        <div className="maptip">
          <b>{hover[8]}</b> {hover[7]} {hover[3] ? "★".repeat(hover[3]) : ""}
          <div className="small">Your estimate {hover[4]}{hover[5] != null ? <> · committed <Logo team={team(hover[5])} size={14} /> {team(hover[5])?.school}</> : " · uncommitted"}</div>
        </div>
      )}
      {myTeam && <div className="maplegend small muted">The ring is 300 miles around {myTeam.school}, where your staff sees prospects best.</div>}
    </div>
  );
}
