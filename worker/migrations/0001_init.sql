-- WhereHePlay API schema (D1 / SQLite).

-- A player is anyone who has touched the API: anonymous (username NULL, known
-- only by a device token) or an account (username + password hash).
CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT '',  -- display name ('' → shown as Anonymous)
  username   TEXT UNIQUE,               -- lowercased login; NULL = anonymous
  pass_salt  TEXT,                      -- hex, per-account
  pass_hash  TEXT,                      -- hex, PBKDF2 of the client-derived key
  created_at INTEGER NOT NULL           -- epoch ms
);

-- Bearer tokens. Only the SHA-256 of a token is stored, so a database leak
-- does not hand out sessions. An account can have several (one per device).
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  player_id  INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_player ON tokens (player_id);

-- One daily result per (board, date, player). The daily is one-shot, so the
-- FIRST result stands (INSERT OR IGNORE) — a replay can never improve it.
CREATE TABLE IF NOT EXISTS scores (
  board      TEXT NOT NULL,             -- 'nfl' | 'nba' | 'mixed'
  date       TEXT NOT NULL,             -- YYYY-MM-DD (the player's local day)
  player_id  INTEGER NOT NULL,
  score      INTEGER NOT NULL,          -- 0..500
  marks      TEXT NOT NULL,             -- five chars '0'..'4', one per question
  created_at INTEGER NOT NULL,
  PRIMARY KEY (board, date, player_id)
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (board, date, score DESC, created_at);

CREATE TABLE IF NOT EXISTS streaks (
  board            TEXT NOT NULL,
  player_id        INTEGER NOT NULL,
  current          INTEGER NOT NULL,
  best             INTEGER NOT NULL,
  last_played_date TEXT NOT NULL,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (board, player_id)
);

-- Worker bookkeeping (`last_prune`: the retention prune runs lazily from a
-- request at most once per UTC day — the account has no free cron slots).
CREATE TABLE IF NOT EXISTS meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
