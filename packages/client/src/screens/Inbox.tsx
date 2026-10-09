import { useEffect, useMemo, useState } from "react";
import { useLeague, useData } from "../App.tsx";
import { api, type InboxCategory, type InboxMessage } from "../api.ts";
import { shortDate } from "../util.tsx";

/** The folders down the side, in the order a coach checks them. */
const FOLDERS: { id: InboxCategory; label: string }[] = [
  { id: "contracts", label: "Contracts" }, { id: "injuries", label: "Injuries" }, { id: "opponent", label: "Opponent scouting" },
  { id: "scouting", label: "Scout reports" }, { id: "games", label: "Games" }, { id: "recruiting", label: "Recruiting" }, { id: "portal", label: "Transfer portal" },
  { id: "polls", label: "Polls" }, { id: "awards", label: "Awards" }, { id: "staff", label: "Staff" }, { id: "career", label: "Career" },
  { id: "draft", label: "NFL draft" }, { id: "league", label: "Around the league" },
];
const LABEL = Object.fromEntries(FOLDERS.map((f) => [f.id, f.label])) as Record<InboxCategory, string>;
type Folder = "all" | "unread" | "urgent" | InboxCategory;

/** Every message to your team in one place: pick a folder, read a message, jump to the screen it's about. */
export function Inbox() {
  const { id, state } = useLeague();
  const data = useData(() => api.inbox(id), []);
  const [folder, setFolder] = useState<Folder>("all");
  const [open, setOpen] = useState<string | null>(null);
  // Reads mark locally at once; the server catches up through the action log.
  const [readNow, setReadNow] = useState<Record<string, boolean>>({});
  const msgs = useMemo(() => (data?.messages ?? []).map((m) => (m.id in readNow ? { ...m, read: readNow[m.id] } : m)), [data, readNow]);

  const inFolder = (m: InboxMessage, f: Folder) => f === "all" || (f === "unread" ? !m.read : f === "urgent" ? !!m.urgent : m.category === f);
  const shown = msgs.filter((m) => inFolder(m, folder));
  const cur = msgs.find((m) => m.id === open) ?? null;
  const unread = (f: Folder) => msgs.filter((m) => !m.read && inFolder(m, f)).length;

  const mark = (ids: string[] | null, read: boolean) => {
    setReadNow((r) => ({ ...r, ...Object.fromEntries((ids ?? msgs.map((m) => m.id)).map((x) => [x, read])) }));
    api.act(id, "inbox_read", { ids, read }).catch(() => {});
  };
  const pick = (m: InboxMessage) => { setOpen(m.id); if (!m.read) mark([m.id], true); };
  // Keep a message open when it's still in the folder; otherwise open the folder's newest.
  useEffect(() => { if (!shown.some((m) => m.id === open)) setOpen(shown[0]?.id ?? null); }, [folder, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.user_team_id == null) return <p className="muted">The inbox is for the team you coach. Pick a team in Settings.</p>;
  if (!data) return <p className="muted">Loading...</p>;
  const folderBtn = (f: Folder, label: string) => {
    const n = unread(f), total = msgs.filter((m) => inFolder(m, f)).length;
    if (!total && f !== "all" && f !== "unread") return null;
    return <button key={f} className={"folder" + (folder === f ? " on" : "") + (n ? " has" : "")} onClick={() => setFolder(f)}>
      <span>{label}</span>{n > 0 && <span className="count">{n}</span>}
    </button>;
  };
  return (
    <div className="inbox">
      <aside className="folders">
        {folderBtn("all", "All messages")}
        {folderBtn("unread", "Unread")}
        {folderBtn("urgent", "Needs you")}
        <div className="sep" />
        {FOLDERS.map((f) => folderBtn(f.id, f.label))}
      </aside>
      <section className="msglist">
        <div className="listhead">
          <b>{folder === "all" ? "All messages" : folder === "unread" ? "Unread" : folder === "urgent" ? "Needs you" : LABEL[folder]}</b>
          <span className="small muted"> {shown.length}</span>
          <button className="link small right" disabled={!unread("all")} onClick={() => mark(null, true)}>Mark all read</button>
        </div>
        {shown.length === 0 && <p className="muted pad">Nothing here.</p>}
        <ul>
          {shown.map((m) => (
            <li key={m.id} className={(m.read ? "" : "unread ") + (m.id === open ? "on " : "") + (m.urgent ? "urgent" : "")} onClick={() => pick(m)}>
              <div className="row1"><span className="from">{m.from}</span><span className="date">{shortDate(m.date)}</span></div>
              <div className="subj">{m.urgent && <span className="flag" title="Needs you">!</span>}{m.subject}</div>
              <div className="cat small muted">{LABEL[m.category]}</div>
            </li>
          ))}
        </ul>
      </section>
      <article className="reader">
        {cur ? <>
          <div className="small muted">{LABEL[cur.category]} · {shortDate(cur.date)}</div>
          <h2>{cur.subject}</h2>
          <div className="small">From <b>{cur.from}</b></div>
          {cur.body && <div className="msgbody">{cur.body}</div>}
          <div className="actions">
            {(cur.links ?? []).map((l) => <a key={l.to} className="btn" href={`#/l/${id}/${l.to}`}>{l.label}</a>)}
            <button className="link small" onClick={() => mark([cur.id], !cur.read)}>Mark {cur.read ? "unread" : "read"}</button>
          </div>
        </> : <p className="muted">No message selected.</p>}
      </article>
    </div>
  );
}
