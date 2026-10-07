import { useState } from "react";
import { useLeague, useData } from "../App.tsx";
import { api } from "../api.ts";
import { NewsList } from "./common.tsx";

export function News() {
  const { id, state } = useLeague();
  const [tab, setTab] = useState<"headlines" | "stories" | "mine">("headlines");
  const q: Record<string, string> = tab === "headlines" ? { stories: "0" } : tab === "stories" ? { kind: "story" } : { team: String(state.user_team_id ?? -1) };
  const items = useData(() => api.news(id, q), [tab]);
  return (
    <div className="narrowish">
      <div className="calhead"><div className="seg">
        <button className={tab === "headlines" ? "on" : ""} onClick={() => setTab("headlines")}>Headlines</button>
        <button className={tab === "stories" ? "on" : ""} onClick={() => setTab("stories")}>Beat writers</button>
        {state.user_team_id != null && <button className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")}>My team</button>}
      </div></div>
      {items && <NewsList items={items} />}
    </div>
  );
}
