import { createRequire } from "node:module";
import type { DatabaseSync as DB } from "node:sqlite";

// Loaded through require so bundlers and the test runner leave the built-in alone.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = DB;

/**
 * One SQLite file per league. Migrations are append-only: a league started in M0 upgrades in place
 * as later milestones add tables.
 */
const MIGRATIONS: string[] = [
  // 1: M0 foundation
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE conferences (name TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE teams (id INTEGER PRIMARY KEY, level TEXT NOT NULL, conference TEXT, data TEXT NOT NULL);
  CREATE TABLE players (id TEXT PRIMARY KEY, team_id INTEGER NOT NULL, pos TEXT, status TEXT NOT NULL DEFAULT 'active', data TEXT NOT NULL);
  CREATE INDEX players_team ON players(team_id);
  CREATE TABLE coaches (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, role TEXT NOT NULL, data TEXT NOT NULL);
  CREATE INDEX coaches_team ON coaches(team_id);
  CREATE TABLE team_strength (team_id INTEGER NOT NULL, as_of TEXT NOT NULL, source TEXT, data TEXT NOT NULL, PRIMARY KEY (team_id, as_of));
  CREATE TABLE games (id INTEGER PRIMARY KEY, date TEXT NOT NULL, kind TEXT NOT NULL, home_id INTEGER NOT NULL, away_id INTEGER NOT NULL,
                      status TEXT NOT NULL, data TEXT NOT NULL);
  CREATE INDEX games_date ON games(date);
  CREATE INDEX games_home ON games(home_id);
  CREATE INDEX games_away ON games(away_id);
  CREATE TABLE game_details (game_id INTEGER PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE events (id TEXT PRIMARY KEY, date TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
  CREATE INDEX events_date ON events(date);
  CREATE TABLE polls (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE news (id TEXT PRIMARY KEY, date TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL);
  CREATE INDEX news_date ON news(date);
  CREATE TABLE actions (seq INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, user TEXT, team_id INTEGER, type TEXT NOT NULL,
                        payload TEXT NOT NULL, created_at TEXT NOT NULL);
  `,
  // 2: AP voters are beat writers with ballots and stories
  `
  CREATE TABLE writers (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE ballots (date TEXT NOT NULL, poll TEXT NOT NULL, writer_id INTEGER NOT NULL, team_ids TEXT NOT NULL, PRIMARY KEY (date, poll, writer_id));
  CREATE INDEX ballots_writer ON ballots(writer_id);
  ALTER TABLE news ADD COLUMN author INTEGER;
  CREATE INDEX news_author ON news(author);
  `,
  // 3: M1 rated players (compact form, by team: scheme, kicking, opening depth chart, ratings)
  `
  CREATE TABLE rated_teams (team_id INTEGER PRIMARY KEY, data TEXT NOT NULL);
  `,
];

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT version FROM schema_version").get() as { version: number } | undefined;
  let v = row?.version ?? 0;
  if (!row) db.prepare("INSERT INTO schema_version (version) VALUES (0)").run();
  for (; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.prepare("UPDATE schema_version SET version = ?").run(v + 1);
    });
  }
  return db;
}

export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export const SCHEMA_VERSION = MIGRATIONS.length;
