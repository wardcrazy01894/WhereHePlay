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
- **Straight from high school?** For an NBA player who skipped college the
  answer is just "High School" (it is in the autocomplete); the reveal names
  the actual school, and the conference hint just says "Wouldn't you like to
  know weather boy".
- **Went pro abroad instead?** For an easy-tier international with no
  college (Dirk, Giannis, Luka…) the answer is "International (no college)";
  same conference hint, and the reveal says he went pro overseas.
- **Any college he played for is correct** (transfers). The reveal, the
  conference hint and the multiple choice use the school he finished at.
- The **four choices** are the finishing school plus three decoys from the
  same conference that season (chosen at build time — docs/DATA.md), in an
  order fixed per player. The buttons ignore taps for 400 ms after appearing,
  because they replace the hint button under the player's finger.
- **Photos.** The first photo is the league headshot; the name hint adds an
  in-uniform Wikimedia photo when one exists. A two-option picker on the home
  screen ("First photo you see": Headshot / In action) flips that to show
  the in-action photo first. The choice is stamped on a daily when it starts
  (changing it later affects the next one) and printed on the share card. Players the league only has a placeholder
  for always use the Wikimedia photo.
- **No leaks before the hint.** A Wikimedia URL contains the file name, which
  is usually the player's name. Until the name hint is taken such a photo is
  fetched and shown from an opaque `blob:` URL, with neutral alt text and no
  credit link, so the name is not in the page, on long-press or in "open
  image". League headshot URLs are opaque ids. (The browser's network panel
  still shows the request — out of scope, like the answers in
  `players.json`.)

## Modes and storage

Three modes — `nfl`, `nba`, `mixed` (Grab Bag) — each with:

- a **daily**: 5 questions, all from the easy tier, max 500, one shot, same
  for everyone, rolling over at the player's local midnight;
- **Sicko Mode** (`variant: 'sicko'`): 5 questions (easy, easy, easy,
  medium, hard), scored the same way (max 500). It is its own game — own
  save, streak, share-card label ("NFL Sicko Mode") and leaderboard —
  identified everywhere by `boardId(mode, variant)`: `nfl-sicko`,
  `nba-sicko`, `mixed-sicko` (the daily keeps the bare mode). There is
  no Sicko Mode free play;
- **free play**: endless random players from that mode's pool, no repeat
  within the last 150, with a running correct-answer streak (best is kept).

**The swap of 2026-11-14.** Through 2026-11-13 it was the other way round:
the daily was the 3-1-1 and the second daily was the "beginner daily", five
easy players. On 2026-11-14 (each player's local day, `SWAP_DATE_KEY`) the two
swapped how their players are picked. The daily kept its id, saves, streak
and leaderboard, so a daily streak carried straight on. The beginner daily
(`variant: 'beginner'`, boards `<mode>-beginner`) ended with 2026-11-13 and
Sicko Mode began the next day as a new game with a fresh streak (the owner's
call: only the daily's streak had to survive). Which second daily a day has
is `secondVariant(date)`; the beginner ids remain valid for the days it was
played.

A player's tier is internal: it shapes the lineup but is never shown in the
UI (no tier label on a question, no tier mix in the tagline) — pinned by
`src/App.render.test.tsx`.

`?date=YYYY-MM-DD` plays another day as practice: nothing is saved or sent.
Only puzzle #1 through a week ahead is accepted (`src/lib/day.ts`) — a day's
lineup is computed by walking forward from the epoch, so an arbitrary
far-future date in a shared link would otherwise freeze the tab.

Everything client-side is in `localStorage` under `whp:v2:` (`v1` was the
launch-day data, abandoned on the restart of 2026-11-11)
(`src/lib/storage.ts`; `<board>` is the mode, `<mode>-sicko`, or
`<mode>-beginner` for a day before the swap):
`daily:<board>:<date>` (the game, including the lineup
it was started on, so a dataset update can't change a game in progress),
`stats:<board>` (streak, best, played, points), `free:<mode>`, `identity`
(API token, display name, username), `photo`.

**Streaks** count consecutive days that daily was finished (Sicko Mode
keeps its own; the home screen shows the daily's). The
shown streak is the larger of the device's and the server's.

**Share card:** `WhereHePlay #N · NFL (headshot)` — or `(in action)`, and
`NFL Sicko Mode` for Sicko Mode — five squares (🟩 photo, 🟨 name,
🟧 conference, 🟥 multiple choice, ⬛ missed), the score and the link.

## Daily selection

`src/lib/daily.ts`. There are two **draws**, each one unbroken walk from
puzzle #1: `classic` (easy, easy, easy, medium, hard) and `easy` (five easy).
`drawFor(variant, date)` says which one a daily shows that day — the daily
shows classic through 2026-11-13 and easy from 2026-11-14; the beginner daily
was the easy draw and Sicko Mode is the classic one (`tierPlanFor` gives the
matching plan). Only that
mapping changed on the swap; neither walk did, so no day re-rolled and no
player comes back early across it. A future change goes the same way: a new
rule with a start date in the future.

Each player gets a per-day rank `hash("<seed>|<id>")` (classic seed
`<mode>:<date>`); each slot takes the best-ranked unused player of
its tier, preferring a school not already used that day. In the Grab Bag the
slots alternate leagues (which league starts depends on the day), so a day is
always a 3/2 split. Ranks are per player, so adding players to the dataset
does not reshuffle everyone else.

**Who can be drawn:** only a player with **both a real headshot and a real
playing photo** — the `e` field in `players.json` ("eligible since", in days
after puzzle #1; `eligibleOn`). Everyone else stays in the dataset, is found
by the player search, and joins the draw automatically once his photos land.
The build never moves an `e` into the past (a newly eligible player starts
the day after the build, as seen from the last time zone on Earth), and each
day is drawn only from the players eligible that day — so new photos add
players to later days and can never change a lineup already being played.
Free play deals from the same pool.

**Tiers by day:** a player moved to another tier by a hand-kept list carries
his old tier and the day of the move (`tw` in `players.json`); `tiersOn`
draws every earlier day with the old tier, so a move never changes a lineup
already being played (docs/DATA.md §Top draft picks).

**Cooldown:** a player who appeared in that draw's previous 45 lineups is
skipped — or fewer while the pool is small: `cooldownFor` shrinks the window
to what each league and tier can sustain that day (at launch: 45 days for NFL
and Grab Bag, 38 for NBA; the easy draw 30, and 22 for NBA), and it grows back as players get photos. Lineups are computed by walking forward from puzzle #1
(2026-11-11), so the result needs no storage and is identical everywhere. The
walk costs one hash per player per day (no sorting); if it ever becomes
noticeable years out, checkpoint it — without changing its output. A
dataset guard test simulates a year of all three modes and checks the tier
plan and the no-repeat window on the real data — per draw, and per daily
across the swap.

**The easy draw** (the daily; the beginner daily before the swap): the same
algorithm with the seed `<mode>-beginner:<date>` (its launch name, kept), a
plan of five easy slots and a pool of the easy tier only — so even the
fallbacks can only ever pick an easy player. It skips its own previous 30
lineups (`EASY_COOLDOWN_DAYS`; shorter than 45 because five a day from the
easy tier alone would run dry — and shorter still while few easy players
have both photos, by the same `cooldownFor` rule) and that day's classic lineup of the
same mode, so playing both dailies never shows a player twice in a day. The
classic draw does not depend on it: its seed and walk are exactly what they
were at launch.
The dataset guard simulates a year of it too.

## Auto-update (no stale tabs)

Every build bakes a build id into the bundle — the commit hash plus, in CI,
the workflow run number, so re-deploying the same commit counts as a new
build — and publishes the same id as `version.json` (`vite.config.ts`; the
deploy workflow fails if the id is ever `dev`). The running app re-reads `version.json` —
with a cache-busting query and `cache: 'no-store'` — on load, whenever the
tab becomes visible, and every five minutes while it is visible
(`src/lib/version.ts`, wired in `App.tsx`). A different hash means the tab is
stale, and it reloads onto the new build:

- **Only from the bare home screen.** An open dialog (profile, bug report,
  player search — they may hold half-typed text) and any question on screen
  are never interrupted;
  a small note says a new version is ready, and the reload happens when the
  player returns to "All games" or closes the dialog. Daily progress is saved after every action,
  so nothing is lost either way.
- **Once per build.** The hash a tab reloaded for is kept in
  `sessionStorage`; if the reloaded page is still the old build (a CDN edge
  lagging behind) it does not reload again for that hash.
- **The dataset follows the build**: `players.json` and `schools.json` are
  requested with `?v=<build id>`, so a NEW bundle never reads an older cached
  dataset. (The reverse can still happen briefly: a stale tab that has not
  reloaded yet starts a game and fetches today's dataset. Keep dataset format
  changes backward compatible for one release, or accept a broken minute.)
- Off in local development (no `version.json`), and a failed check (offline,
  mid-deploy) does nothing.

GitHub Pages serves `index.html` with a ten-minute cache; this check is what
closes that window, and what updates a tab left open for days.

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

**Display names** (`/name`): 2–20 Latin letters (accents allowed), digits,
spaces and `_ . - '`, NFKC-normalised, with a short blocklist that also folds
accents and leetspeak. Latin-only on purpose: lookalike letters from other
scripts can't impersonate a player or dodge the filter. Names are not
unique. Empty shows as "Anonymous".

**Accounts** (`/register`, `/login`, `/logout`): optional username (3–20 of
`a-z 0-9 _`, unique) + password. The create-account form says in so many
words that the username is not an email and that no email is ever asked for. Registering upgrades the current anonymous
player in place, so existing scores and streaks are kept. Signing in on
another device issues a new token for the same player (newest 10 kept).
Signing out returns the device to a fresh anonymous identity. What the device
did anonymously before signing in is folded into the account (below).

**Cross-device sync** (`src/lib/sync.ts`, `/me`). `/me` returns, besides the
name, the caller's own streaks (every board) and results inside the
submission window. On load, on each return to the home screen and when the
tab comes back, the client folds that into `localStorage`:

- a daily finished on another device is stored as finished here (rebuilt
  from its marks: real score and squares, flagged `synced`, shown with
  "Played on another device."). The server keeps the first result, so it
  also replaces a game only in progress here;
- each streak takes the newer last-played day's count (same day: the larger);
  best only grows — so a streak continues whichever device plays. A streak
  built on this device is not lowered: if the server's day is the day after
  the device's, the count is at least the device's plus one;
- when signed in, today's dailies finished on this device that the account
  has no result for are submitted (played before signing in). Never for an
  anonymous device: signing out must not repost the day as a second player.
  A finished day records its `owner` (the account signed in when it ended,
  or the one it was handed to) and is never handed to a different account.
  The results screen follows the same rule when the identity changes under
  it. A hand-over the server refuses (4xx) is not retried until the next
  page load; one that failed in transit is retried on the next visit.

Signing in sends the device's current token with `/login`; when it belongs to
an anonymous player the server folds that player into the account
(`adoptAnonymous`): results move over (the account's own result for a board
and day stands), streaks merge, and the anonymous player is deleted — so a
day played before signing in is on the board once, under the account.
Accounts are never merged into each other.

Known limits: streaks in
`localStorage` belong to the device, so after switching accounts on one
device the larger of the two can show.

It only runs from the home screen, never under a question (and a game open
in a second tab yields to a result synced in meanwhile rather than overwrite
it). Not synced: a
daily still in progress (only finished results reach the server), free play,
and the first-photo setting. A worker that predates this simply returns no
`streaks`/`scores` and the client does nothing.

Passwords use a **split KDF**: the browser runs PBKDF2-SHA256 (150,000
iterations, salted with the username) and sends only the derived key; the
worker stretches it again (PBKDF2, 1,000 iterations, random per-account
salt). The plaintext never leaves the device and the expensive half runs
client-side, which is what makes this fit in Workers Free's CPU budget.
There is **no password reset** (no email on file) — an operator can clear an
account by hand (docs/OPERATIONS.md).

**Boards:** one per daily game — `nfl`, `nba`, `mixed` and their
`-sicko` twins, plus the `-beginner` boards of the days before 2026-11-14
(`BOARDS` in `worker/api-lib.mjs`, `boardId` in the client). The worker knows
nothing of tiers; a new board only has to be listed.

**Scores** (`/score`): `{board, date, marks, score}` where `marks` is five
characters `0`–`4` and `score` must equal what the marks add up to. The date
must be within UTC today −2…+1 (the puzzle day is the player's local day).
One row per (board, date, player); the **first result stands**. The response
is the rank (ties share), the field size and the updated streak.

**Board** (`/board`): top 50 by score, earlier finisher first on ties, with
name, squares, score and the player's current streak (only on the latest day
they played; streak history is not kept); the caller's own row is appended
if outside the top. No ids, usernames or tokens are ever returned.

**Abuse controls:** fails closed without the rate-limit binding; 60
requests/min per IP; 5 login attempts/min per IP + username; 5 bug reports/min
per IP; server-side
Origin allowlist; 2 KB body cap; identical error and work for unknown
username vs wrong password. The Origin check stops other websites from using
the API from a browser; it is advisory against scripts (a request with no
Origin header, e.g. curl, is let through), and a score can be posted up to a
day ahead of UTC (time zones), so tomorrow's board can be seeded early. **Anti-cheat is a non-goal:** scores are computed
in the browser and the answers ship in `players.json`, so a determined cheat
can post 500. It is a game among friends.

**Retention:** daily scores older than 400 days are pruned lazily (at most
once per UTC day, from a `/score` request — the Cloudflare account has no
free cron slots). The same pass removes anonymous players older than 30 days
that never finished a daily. Streaks, accounts and anyone with a score are
kept.

## Bug reports and player requests

**Report a bug** is always one tap away: a 🐛 button in the header on every
screen, plus a link in the footer. It opens a dialog: a text box, a checkbox
to include the session's app log, and Send (`src/components/BugReport.tsx`,
`src/lib/report.ts`).

**"Is he in the game?"** (home screen) searches the player list by name
(`src/lib/playerSearch.ts`, `src/components/PlayerSearch.tsx`). It shows
names and leagues only — never the college, which would answer a question.
If the name typed is not in the dataset, one button — _Request "Kurt
Warner"_ — files a request to add him.

Both go through the same pipeline:

- **Automatic path:** the worker's `/bug` route turns the report into a
  GitHub issue in this repo using a token only the worker holds
  (`worker/bug-lib.mjs`). Bugs are titled `[bug] …` and labelled `bug` +
  `from-app`; player requests are `[player request] Please add "…" to the
game.` with `player-request` + `from-app`. The player needs no GitHub
  account and gets a link to the issue.
- **Fallback:** if that can't happen — token not configured (503), a limit
  hit (429), offline, API unset — the dialog keeps what was typed and offers
  a prefilled GitHub "new issue" link (kept under 6,000 characters so it
  opens). Nothing is silently dropped.
- The issue carries the message, the screen, the puzzle day, the build id,
  the page URL (only if it is from our own site) and the browser, plus the
  optional log (errors and app events; no names, tokens or passwords are
  ever logged).
- **Issues are public and the text is untrusted**, so everything is
  defanged first: @mentions, code fences, Markdown links/images and
  reference definitions, raw HTML and `#123` / `GH-123` references are
  neutralised — in the title too; lengths are capped (2,000 chars of
  message, 6,000 of logs, 20 KB body).
- **Abuse:** 100 reports per UTC day across everyone (counted in D1), 5 per
  minute per IP (its own limiter; the route refuses to run without it), the
  general rate limit and the Origin allowlist. The token is a fine-grained
  PAT limited to Issues on this one repo.
- An open dialog (profile, bug report, player search) holds off the
  auto-update reload.

## Not built yet

See BACKLOG.md.
