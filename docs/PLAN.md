# WhereHePlay — plan and architecture

## Game rules

One question = one player. The player climbs a hint ladder; an answer is
worth the stage it was given at (`src/lib/game.ts`):

| Stage | Shown                               | Answer by | Points |
| ----- | ----------------------------------- | --------- | ------ |
| 0     | Photo only                          | typing    | 100    |
| 1     | + name (and position, NFL)          | typing    | 75     |
| 2     | + conference and final college year | typing    | 50     |
| 3     | four colleges                       | tapping   | 25     |

- **Typed answers** use autocomplete over every school in the table
  (`src/lib/search.ts`). Picking a suggestion only fills the box; the Guess
  button (or Enter) submits, so a stray tap can't cost a stage.
- A **wrong typed guess** advances one stage (and is removed from the
  suggestions). A **wrong multiple-choice pick** ends the question with 0.
- **"I don't know"** is available at every stage: 0 points, answer revealed.
- The player can also take the next hint without guessing.
- **Any college he played for is correct** (transfers). The reveal, the
  conference hint and the multiple choice use the school he finished at.
- The **four choices** are the finishing school plus three decoys from the
  same conference that season (chosen at build time — docs/DATA.md), in an
  order fixed per player. The buttons ignore taps for 400 ms after appearing,
  because they replace the hint button under the player's finger.
- **Photos.** The first photo is the league headshot; the name hint adds an
  in-uniform Wikimedia photo when one exists. A setting on the home screen
  ("First photo") flips that to show the in-uniform photo first — an
  experiment requested at kickoff. Players the league only has a placeholder
  for always use the Wikimedia photo.

## Modes and storage

Three modes — `nfl`, `nba`, `mixed` (Grab Bag) — each with:

- a **daily**: 5 questions (easy, easy, medium, medium, hard), max 500, one
  shot, same for everyone, rolling over at the player's local midnight;
- **free play**: endless random players from that mode's pool, no repeat
  within the last 150, with a running correct-answer streak (best is kept).

`?date=YYYY-MM-DD` plays another day as practice: nothing is saved or sent.

Everything client-side is in `localStorage` under `whp:v1:`
(`src/lib/storage.ts`): `daily:<mode>:<date>` (the game, including the lineup
it was started on, so a dataset update can't change a game in progress),
`stats:<mode>` (streak, best, played, points), `free:<mode>`, `identity`
(API token, display name, username), `photo`.

**Streaks** count consecutive days a daily was finished in that mode. The
shown streak is the larger of the device's and the server's.

**Share card:** `WhereHePlay #N · NFL`, five squares (🟩 photo, 🟨 name,
🟧 conference, 🟥 multiple choice, ⬛ missed), the score and the link.

## Daily selection

`src/lib/daily.ts`. Each player gets a per-day rank
`hash("<mode>:<date>|<id>")`; each slot takes the best-ranked unused player of
its tier, preferring a school not already used that day. In the Grab Bag the
slots alternate leagues (which league starts depends on the day), so a day is
always a 3/2 split. Ranks are per player, so adding players to the dataset
does not reshuffle everyone else.

**Cooldown:** a player who appeared in that mode's previous 45 lineups is
skipped. Lineups are computed by walking forward from puzzle #1
(2026-11-11), so the result needs no storage and is identical everywhere. A
dataset guard test simulates a year of all three modes and checks the tier
plan and the no-repeat window on the real data.

## Architecture

```
GitHub Pages (static)                 Cloudflare (free tier)
┌──────────────────────────┐          ┌────────────────────────┐
│ React + Vite SPA         │  POST    │ Worker  whp-api        │
│ public/players.json      │ ───────▶ │  /score /board /me     │
│ public/schools.json      │  JSON    │  /name /register       │
└──────────────────────────┘          │  /login /logout        │
   photos hotlinked from the          │ D1 (SQLite)            │
   league CDNs + Wikimedia            └────────────────────────┘
```

The game is fully playable with the API unset or down: the leaderboard and
account UI simply hide.

## API (leaderboard, names, accounts)

Code: `worker/api.mjs` (routes), `worker/api-lib.mjs` (everything else),
`worker/migrations/`. All routes are POST with a JSON body, so a token never
appears in a URL.

**Identity.** Each browser generates a random 192-bit token. The server
stores only its SHA-256 and maps it to a `players` row, created on first
write. That is the whole anonymous identity: no cookie, no email, no IP
stored.

**Display names** (`/name`): 2–20 letters, digits, spaces and `_ . - '`, with
a short blocklist. Names are not unique. Empty shows as "Anonymous".

**Accounts** (`/register`, `/login`, `/logout`): optional username (3–20 of
`a-z 0-9 _`, unique) + password. Registering upgrades the current anonymous
player in place, so existing scores and streaks are kept. Signing in on
another device issues a new token for the same player (newest 10 kept).
Signing out returns the device to a fresh anonymous identity. Scores made
anonymously on a second device before signing in are not merged.

Passwords use a **split KDF**: the browser runs PBKDF2-SHA256 (150,000
iterations, salted with the username) and sends only the derived key; the
worker stretches it again (PBKDF2, 1,000 iterations, random per-account
salt). The plaintext never leaves the device and the expensive half runs
client-side, which is what makes this fit in Workers Free's CPU budget.
There is **no password reset** (no email on file) — an operator can clear an
account by hand (docs/OPERATIONS.md).

**Scores** (`/score`): `{board, date, marks, score}` where `marks` is five
characters `0`–`4` and `score` must equal what the marks add up to. The date
must be within UTC today −2…+1 (the puzzle day is the player's local day).
One row per (board, date, player); the **first result stands**. The response
is the rank (ties share), the field size and the updated streak.

**Board** (`/board`): top 50 by score, earlier finisher first on ties, with
name, squares, score and that day's streak; the caller's own row is appended
if outside the top. No ids, usernames or tokens are ever returned.

**Abuse controls:** fails closed without the rate-limit binding; 60
requests/min per IP; 5 login attempts/min per IP + username; server-side
Origin allowlist; 2 KB body cap; identical error and work for unknown
username vs wrong password. **Anti-cheat is a non-goal:** scores are computed
in the browser and the answers ship in `players.json`, so a determined cheat
can post 500. It is a game among friends.

**Retention:** daily scores older than 400 days are pruned lazily (at most
once per UTC day, from a `/score` request — the Cloudflare account has no
free cron slots). Streaks and players are kept.

## Not built yet

See BACKLOG.md.
