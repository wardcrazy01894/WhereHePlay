# Data

Two committed artifacts drive the game:

- `public/players.json` — 2,069 players (1,105 NFL, 964 NBA); 1,000 of them
  can be drawn today (see "Who can be drawn")
- `public/schools.json` — 375 colleges plus the "High School (no college)"
  answer (id, name, search aliases)

They are generated; never edit them by hand. The hand-maintained inputs are
`data/schools.psv`, `data/overrides.json` and `data/preps-to-pros.json`.

## Rebuilding

```bash
npm run fetch-raw        # → data/raw/ (gitignored): nflverse + Wikidata tables
npm run build-players    # → public/players.json, public/schools.json
npm run scan-headshots   # → data/{nfl,nba}-placeholder-heads.json (see Photos)
npm run scan-espn-heads  # → data/{nfl,nba}-espn-heads.json (real headshots for those)
npm run fetch-photo-meta # → data/raw/commons-meta.json (Commons API)
npm run audit-photos     # → data/photo-blocklist.json "auto" (college-era photos)
npm run build-players    # again, now that placeholders and bad photos are known
npm run build-players -- --report   # also lists college names with no school row
npm test                 # dataset guards (src/lib/dataset.test.ts)
```

## Sources

| What                                                                      | Source                                                               | Licence   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------- |
| NFL players, colleges, positions, headshot URLs                           | [nflverse-data](https://github.com/nflverse/nflverse-data) `players` | CC BY 4.0 |
| NFL honours and career value (Pro Bowls, All-Pro, AV)                     | nflverse-data `draft_picks`                                          | CC BY 4.0 |
| NFL fame signal + in-uniform photo                                        | Wikidata, joined on the Pro-Football-Reference id (P3561)            | CC0       |
| NBA players, college and NBA team history, NBA.com id, photo, fame signal | Wikidata, players with a Basketball-Reference id (P2685)             | CC0       |

The NBA side comes from Wikidata because the NBA's own stats site blocks
scripted access, and working around that is not something this project does.
Wikidata is queried through its public SPARQL endpoint with a descriptive
User-Agent. Labels fall back to Wikidata's language-neutral `mul` label —
without that, Stephen Curry and Kevin Durant silently vanish.

## Who gets in

"In college from 1994 to today, famous enough to be fair, mostly pros from
2008 onward" becomes (`scripts/lib/players.mjs`):

1. **College era:** final college season in fall 1994 or later (NFL: rookie
   season − 1; NBA: last college stint's end year − 1).
2. **Fame score** at or above the league minimum (12):
   - NFL: `Wikipedia language count + 4 × Pro Bowls + 6 × first-team All-Pro
     - career AV ÷ 8 (÷ 16 for non-skill positions) + first-round bonus (4,
       or 8 for a top-10 pick)`. The language count is position-neutral
       popularity; halving AV for linemen keeps long, solid, anonymous careers
       out.
   - NBA: `Wikipedia language count`.
3. **Pro era:** last pro season 2008 or later — unless the fame score is 35+
   (legends such as Tim Duncan's contemporaries who retired earlier).
4. **Answerable:** the college he finished at is in the schools table (junior
   colleges are not), and there is a photo to show.

5. **Or a recent player who really played** — admitted whatever his fame
   score (see Recent players).

NBA players who never played college ball have no college stint, so they
drop out — except two hand-kept lists: players who went straight from a US
high school to the NBA (see Preps to pros) and easy-tier internationals who
turned pro abroad instead (see International (no college)). G League Ignite
players and everyone else with no college stay out.

`MIN_FAME`, `LEGEND_FAME`, `PRO_FOCUS_YEAR` and `FIRST_COLLEGE_YEAR` are
constants at the top of that file. Lower `MIN_FAME` for a bigger, more
obscure pool.

## Recent players (`extended`)

The owner's bar (2026-11-13): anyone from about the last ten years you would
ask "where did he go to school?" about while watching a game must be in.
The fame score missed many of them, and Wikidata — the NBA source — has no
team history for most players since ~2019. So, on top of the launch rule:

- **NFL** (`recentNfl`): a rookie of 2016 or later (`RECENT_ROOKIE_YEAR`) who
  has played a game and was a first- or second-round pick, or made a Pro
  Bowl, or started for two seasons, or has career AV 8+ at QB/RB/WR/TE or 20+
  anywhere. His tier comes from the same career, not from the fame ranking
  (which would call every one of them hard): `recentNflTier` — easy for a
  star (two Pro Bowls, All-Pro, AV 45+ at a skill position, a first-round QB
  who has started), medium for a name a fan knows (a Pro Bowl, round 1, a
  skill player with AV 15+ or from round 2, AV 35+), else hard; one step
  harder at a school with fewer than four pros in the ranking.
- **NFL, undrafted** (`data/nfl-added.json`): the draft table is the only
  career data we hold and has no row for them, so notable undrafted players
  are listed by hand (id → name and tier): Taysom Hill, Kendrick Bourne,
  Jakobi Meyers, Rico Dowdle… A player whose college is not in the schools
  table cannot be listed (Austin Ekeler, Western Colorado).
- **NBA** (`recentNba`): an NBA.com id from the 2015 class on, the usual fame
  floor, and a college. Where he played and until when comes from his
  **English Wikipedia infobox** (`npm run fetch-nba-infobox` →
  `data/raw/nba-infobox.json`, `parseInfobox`): every college with its years,
  far better kept than Wikidata for recent players — so the school order of a
  transfer and the final season (the conference hint depends on it) are
  right, and a player Wikidata lists no school for is still placed. Without
  an infobox college: a Wikidata college stint, else the schools he attended
  (`wd_nba_edu.csv`, `match.edu`), with the year before his NBA class as read
  off his NBA.com id (`nbaClassOf`) — a guess; a class newer than that
  table (2026 on) reads as 2025, so hand-list those players.
- **By hand** (`data/nba-added.json`): players the pass cannot place — no
  college on Wikidata, fame under the floor, or not on Wikidata at all. Keyed
  by id, with school ids and year.

These players are **extended**, and three rules keep them from disturbing the
game already being played:

1. **They move nobody's tier.** `assignTiers` ranks the launch (core) pool
   exactly as before and places each extended player against that ranking.
2. **They change nobody's wrong answers.** Decoys are drawn from the core
   pool's schools.
3. **They are not drawn until someone has looked.** An extended player never
   takes an automatic Wikimedia photo; his playing photo is only ever
   hand-picked (`data/photo-overrides.json`), so he waits in the dataset —
   found by the search — until then.

So a build that adds them leaves every existing row of `players.json`
byte-for-byte the same. Before giving an extended player his photo, check him:
he played a real game (else `data/excluded.json`), his school and final
season are right, and his league headshot is a real one.

To fetch the two NBA tables without refreshing the rows the dataset was built
from (a refresh moves fame, and tiers with it):
`npm run fetch-raw -- --only=wd_nba_edu.csv,wd_nba_draft.csv,wd_nba_enwiki.csv`,
then `npm run fetch-nba-infobox`.

## Tiers

Per league, players are ranked by fame; a difficulty number combines that
rank with how many pool players share his school:

```
difficulty = fame percentile (0 best … 100) + school penalty
school penalty = 0 (15+ players) | 10 (8–14) | 22 (4–7) | 35 (1–3)
easy   = top 6% by fame (any school), or difficulty < 32
hard   = difficulty ≥ 82
medium = everything else
```

So Tom Brady (Michigan) and Stephen Curry (Davidson, top of the fame list)
are easy; a mid-career player from a one-pro school is hard. It is a
heuristic — BACKLOG.md lists known misses. A guard test requires every
league × tier to be deep enough for the 45-day no-repeat window.

## Never played a game (`data/excluded.json`)

The owner's rule (2026-11-12): a player who never played a regular-season or
playoff NFL/NBA game is not in the game — he has no game photo and is not a
real pro for this purpose (Michael Sam is the owner's one exception). Such
players are listed in `data/excluded.json` (id → reason) and removed by
`build-players` after tiers and decoys are set (`applyExclusions`), so no
one else moves. The build refuses to exclude a player who has ever been
drawn (he is in `data/eligible-since.json`): removing him would re-roll days
already played. Who qualifies is checked by hand (the draft table's career
games, Pro-Football-Reference); no script decides it.

## International (no college) (`data/international.json`)

Easy-tier NBA players who never played college basketball because they
turned pro outside the US — Dirk, Giannis, Luka, Jokić, Yao, Parker, the
Gasols… (and Brandon Jennings, who went to Italy instead of college). Their
answer is the pseudo-school `international`, **"International (no college)"**
in the autocomplete (aliases: International, Overseas, Abroad, Europe, Pro
overseas…); the conference hint says "Wouldn't you like to know weather boy",
like Preps to pros, and the reveal says he went pro overseas. Their wrong
answers are top programs, as for preps.

The list is hand-picked by the owner (2026-11-12): only famous players, so
they are all **easy**. Their tier is fixed (`fixedTier` in
`scripts/lib/players.mjs`) and they take no part in the tier ranking, so
adding or removing one never moves anyone else's tier or a day's lineup.
They are matched to the Wikidata rows by name; the build prints any listed
name it cannot find. Their automatic Wikimedia photos were screened like
everyone's — most show a EuroLeague or national-team uniform, so they are on
`notPlaying` until an NBA photo is found. No NFL player qualifies: the most
famous no-college NFL players (International Pathway) are far below easy.

## Preps to pros (`data/preps-to-pros.json`)

NBA players who went straight from high school to the NBA (Garnett in 1995
through the 2005 draft, plus Thon Maker and Anfernee Simons later) have no
college to guess, so they get their own answer: the pseudo-school
`high-school`, shown as **"High School (no college)"** in the autocomplete
(aliases: High School, HS, Prep, No college, None…). Nobody has to know
_which_ high school — but the reveal names it.

They are admitted by a hand-kept list, because nothing in the source data
separates "no college" from "college not recorded" or from an international
player:

```json
{
  "name": "LeBron James",
  "hs": "St. Vincent–St. Mary High School (Akron)",
  "draft": 2003
}
```

- Matched to the Wikidata row by name (case, spacing and punctuation ignored).
  The build prints any listed name it could not find.
- Listed players skip the fame and era filter (the list is the filter).
- `y` is the fall before the draft (his senior year); the conference hint
  reads "None — he never played in college".
- Their multiple-choice decoys are three of the twelve programs with the most
  NBA players in the pool (where you would guess a star went), never random
  schools.
- A player who signed overseas or with the G League out of high school
  (Brandon Jennings, Emmanuel Mudiay) is **not** on the list.

To add one: add a line and rebuild. A dataset guard test checks that the
famous ones are present and that every one carries a high school.

## Overrides (`data/overrides.json`)

Hand corrections applied after the automatic pass, keyed by player id:

```json
{
  "nba-pricero01": { "s": ["utah-valley", "nicholls"], "y": 2004 },
  "nfl-AlleJo02": { "t": "easy" }
}
```

`s` replaces the accepted schools (finishing school first — use it when the
source misses a transfer or has the order wrong). `y` replaces the fall year
of his final college season, which the conference hint and the decoys are
looked up for — set it whenever `s` changes where he finished. `t` sets the
tier (use it when the fame formula is plainly off: Josh Allen is not a
"medium"). The build fails on an unknown player, school, year or tier.

## Top draft picks (`data/nba-top-picks.json`)

The owner's rule (2026-11-13): an NBA **top-10 pick of the last ten drafts**
(2017–2026) is **easy**, bust or not, as long as he played a game. The file
lists the ones who are in the dataset — player id → name, draft, pick and
`was`, the tier he had before (absent if he was already easy, or joined the
dataset after the rule): 83 players, 21 of them moved. `build-players` applies it
after tiers and overrides (`applyTierMoves`), so nobody else's tier moves.

The move is **dated** (`from`: 2026-11-14, the day the dailies swapped). A
moved player's row carries `tw: [day, old tier]` and every earlier day is
still drawn with the old tier (`tiersOn` in `src/lib/daily.ts`), so the
lineups of days already played are exactly what they were. Never change
`from`, or a `was`, once that day has started. To add a player later, give
the list a second dated group rather than back-dating this one.

It is a snapshot, not a rolling rule: next year's class is added by hand.
The 17 picks not listed never played college basketball (LaMelo Ball, Jalen
Green, Josh Giddey, Scoot Henderson, the Thompsons, the internationals not on
the international list…).

## The schools table (`data/schools.psv`)

One line per school, pipe-separated (the header comment in the file is the
reference):

```
id | display name | nflverse names | Wikidata team prefixes | search aliases | conference timeline | basketball timeline
```

- **nflverse names** — exact `college_name` values that mean this school
  ("N.C. State", "Mississippi", "Texas-El Paso").
- **Wikidata team prefixes** — the start of the team label ("Miami RedHawks"
  vs "Miami Hurricanes"); the longest matching prefix wins.
- **Search aliases** — extra things a player might type ("Bama", "UNC").
- **Conference timeline** — `SEC`, or `1994:Big Eight,1996:Big 12,2012:SEC`
  where each year is the **fall** of the first season in that conference. The
  basketball column is filled only when it differs (Notre Dame, UConn, BYU…).
  Division II/III and NAIA schools use the level as the "conference".

The conference hint is the conference **at the time** — Carmelo Anthony's
Syracuse is Big East, not ACC.

To add a school: add a line, run `npm run build-players -- --report`, and
check it disappears from the unmapped list. Every school in the table is a
valid typed answer whether or not a player in the pool went there.

## Multiple-choice decoys

Chosen at build time (`pickDecoys`): three schools in the same conference in
that season (anything else would be a giveaway once the conference hint is
shown), preferring schools that have players in that league's pool, never one
of his own schools, deterministic per player. Independents and tiny
conferences are topped up from other pool schools.

## Photos

Nothing is stored in the repo; `src/lib/images.ts` builds URLs.

### The rules

1. **A headshot is a headshot** — ideally his official one, in uniform. A
   league placeholder or an action cut-out is not one: such a player has no
   `h` until a real headshot is found.
2. **A playing photo is a playing photo** — him, playing, for an NBA/NFL
   team. A suit, a warm-up, a national-team shirt is not one: such a player
   has no `a` until a real one is found.
3. **Nobody is ever dropped because of photos.** Membership of the dataset
   does not depend on photos at all (`nflCandidates` / `nbaCandidates`).
4. **Who can be drawn:** only a player with both. `build-players` writes `e`
   ("eligible since", days after puzzle #1) for them, from
   `data/eligible-since.json`: nothing already written ever changes. A newly
   eligible player's window opens the day after the build (`firstNewDay`);
   one who loses a photo (a bug report blocklists it) has his window closed
   from the next day and keeps the days he had (`e` becomes
   `[from, until, …]`); a new photo opens another window. The game draws a
   day only from players eligible that day (docs/PLAN.md §Daily selection),
   so shipping or pulling photos takes effect the next day and never changes
   a day already played. (A player whose photo is pulled is therefore still
   in today's lineup if he was drawn — with the other photo, or a silhouette —
   until midnight. That is the price of not re-rolling a day in progress.) **Never edit or delete that file** — it is the
   history of every lineup; `build-players` refuses to run without it.
   (`npm run build-players -- --first-day=<n>` lets the owner start new
   players one day earlier than the safe day — used once, on 2026-11-11,
   before the site was public; it refuses anything earlier.) The build
   prints, per league, how many can be drawn and how many still need each
   kind of photo.

- **NFL headshots:** the `static.www.nfl.com` URL from nflverse (or ESPN's,
  see "Nobody drops out" below). For roughly
  380 retired players that URL serves the league's generic helmet
  placeholder; `scan-headshots` detects it by ETag and records the keys in
  `data/nfl-placeholder-heads.json` (committed, cumulative). Those players use
  ESPN's headshot where it has one. For 9 more, a hand-checked portrait on
  Pro-Football-Reference is used (`data/head-overrides.json`, key
  `pfr:<file>`, e.g. `pfr:DaviTe00_USAT_1996` — found by opening each
  player's page in a browser, since the site refuses scripted requests; it
  has a photo for only 9 of the players who needed one). For 3 more, a posed
  team portrait from the club's own site (`clubs:<path>` in the same file, so
  the player can also have a hand-picked playing photo). The other 61 have no
  headshot yet.
- **NBA headshots:** `cdn.nba.com/headshots/…/<NBA.com id>.png` — which for
  227 retired players is a generic grey silhouette. `scan-headshots` detects
  it the same way (`data/nba-placeholder-heads.json`, NBA.com ids) and
  `scan-espn-heads` finds ESPN's headshot for 169 of them
  (`data/nba-espn-heads.json`; the ESPN id comes from Wikidata P3685,
  `data/raw/wd_nba_espn.csv`). The headshot key is then `espn:<id>`, as for
  the NFL. For 13 more, a hand-checked headshot on Basketball-Reference is
  used (`data/head-overrides.json`, key `bbr:<id>` — the owner's choice of
  source, knowing Sports-Reference discourages hotlinking; only posed
  headshots, each viewed). The other 45 have no headshot yet.
- **A headshot shows the team he last played for.** Each league (and ESPN)
  publishes one headshot per player, and it is the latest: Tom Brady is a
  Buccaneer, Carmelo Anthony a Laker. There is no source of "the headshot
  from his best years", so this is not something the build can choose.
- **League images that are not headshots** (`data/nfl-not-headshots.json`,
  hand-kept): for Hall of Famers the NFL serves an action cut-out under the
  headshot URL, and for Kellen Winslow II a photo of his father. Found in a
  by-eye review of every headshot (2026-11-11): 25 players. ESPN's headshot
  is used where it has one (15); the other ten legends have no headshot yet.
- **In-uniform photos:** the Wikidata image (P18). The build stores the
  file's storage path on Commons (`<md5 prefix>/<File_name>`, raster files
  only) so the client can request it directly from `upload.wikimedia.org` —
  a 500px thumbnail, then the original for small files. That host sends CORS
  headers, which lets the client show the photo from a `blob:` URL before the
  name hint (the file name is usually the player's name — docs/PLAN.md §Game
  rules). Once the name is out, the photo links to its Commons page for
  author and licence.

### Actually playing (`notPlaying` and `weak` in `data/photo-blocklist.json`)

The "in action" photo starts as whatever image Wikidata lists for the player,
and for more than a third of them that is not a photo of him playing in the
NBA or NFL. In a by-eye review of all 1,648 photos on 2026-11-11:

- **413** are not him playing for a pro team at all — a suit, a press
  conference, a national-team shirt, a EuroLeague club → `notPlaying`;
- **200** are pro gear but not a game photo (warm-ups, a media-day pose), or
  plainly not the team he is known for → `weak`.

Both lists hold Commons file names and `build-players` uses none of them
(`applyBlocklist` in `scripts/lib/photos.mjs`), even when it is the only
photo of him: he waits for a real one (rule 2).

`data/photo-overrides.json` gives a player a hand-picked photo instead
(player id → a Commons file name): in a pro uniform, playing, for the team he
is best known for. Where Commons has nothing, the value can be a
TheSportsDB image key, `tsdb:<thumb|cutout|render|fanart>/<file>` — a
copyrighted game photo, hotlinked, the owner's accepted risk as for league
headshots. TheSportsDB names its files with opaque ids, so the client shows
those straight from their URL (`actionDirectUrl`); a Commons file name
usually names the player, so those are still fetched into a blob first.
The value can also be `web:<host>/<path>` — an image hotlinked from any https
host (ESPN, NFL.com, team sites, news photos, card images…), shown straight
from its URL like TheSportsDB's — or `local:<file>`, our own resized copy in
`public/photos/` for an image that cannot be hotlinked (the build and a dataset
test check the file is there). The owner's rules (2026-11-12): the URL may
contain the player's name (a player who opens the image in a new tab can
learn it; that is accepted), hotlinking is preferred, and a copy is kept only
when hotlinking is not possible. `data/head-overrides.json` takes the same two
forms for headshots. Keep each image light (well under 1 MB): on the NFL
image servers ask for a resized copy (`…/image/upload/f_auto,q_auto,w_900/…`),
and on Commons use a standard thumbnail (`…/thumb/…/960px-<file>`). These were found by hand, one player at a time, for
players Commons and TheSportsDB do not cover; each was viewed. To drop a bad `web:`, `local:` or `tsdb:` photo,
remove its line from `data/photo-overrides.json` — `notPlaying` only applies to
Commons file names. To act on a "that's not him playing" report: add the file
name to `notPlaying`, find a good photo in his Commons category and add it to
the overrides; rebuild; close the issue.

### No college gear (`data/photo-blocklist.json`)

A photo of the player in college would answer the question, so Wikimedia
photos are screened and the bad ones are never used:

1. `npm run fetch-photo-meta` pulls each photo's capture date, description
   and categories from the Commons API (cached in `data/raw/`).
2. `npm run audit-photos` flags a photo when it was taken in or before the
   fall of his final college season, or when its file name, description or
   categories name his school's team or use college-only words (NCAA, a bowl
   game, a conference media day…). Deliberately trigger-happy. The result is
   the `auto` list in `data/photo-blocklist.json`.
3. The `manual` list in the same file is hand-kept: photos caught by eye (a
   full contact-sheet review on 2026-11-11) and from player bug reports. It
   is never overwritten.
4. The `allow` list clears photos the audit flagged only for biography text
   ("formerly with the University of Miami") after a look by eye.
5. `build-players` drops every blocked photo. The player keeps his headshot.
6. `data/photo-overrides.json` gives a player a hand-picked Commons photo
   (player id → file name), for instance when his only listed one is a
   college photo.

The audit reads `data/raw/photo-candidates.json`, which `build-players`
writes before applying the blocklist — so the order is build-players →
fetch-photo-meta → audit-photos → build-players.

To act on a "this photo shows him in college" bug report: add the Commons
file name (the part of `a` after the slash) to `manual`, rebuild, and close
the issue.

### Nobody drops out for lack of a photo

The NFL site serves a placeholder for about 380 retired players. For 315 of
them ESPN has a real headshot (`npm run scan-espn-heads` checks ESPN's image
server by the ESPN id nflverse carries and records hits in
`data/nfl-espn-heads.json`; the headshot key is then `espn:<id>`). The rest
use a hand-picked one from
`data/photo-overrides.json` — which can also name an image on the NFL clubs'
image server (`clubs:<path>`) as a last resort: Gaines Adams, whose only free
photos are in a Clemson uniform, uses a Buccaneers team-site photo.

Since the restart of 2026-11-11 nobody is dropped over photos at all (rule
3): the twelve NFL players this section used to lose (Tony Boselli, Simeon
Rice, Willie Anderson…) are back in the dataset, waiting for photos like
everyone else who lacks one.

League headshots are the leagues' copyrighted images, hotlinked. That is a
deliberate, accepted risk for a free hobby website and a blocker for an app
store build — see docs/APP.md §Photos.

## File formats

`players.json` row (short keys keep it ~575 KB raw):
`id`, `n` name, `l` league, `s` accepted school ids (finishing school first),
`c` conference hint, `y` final college fall year, `t` tier, `d` three decoy
ids, optional `h` headshot key, `p` position (NFL), `a` Commons storage path,
(or a `tsdb:` image key),
`hs` high school (preps to pros only), `e` eligible since (days after puzzle
#1; present only with both photos), `tw` tier was (`[day, tier]`: his tier
before that day — only for a player moved by `data/nba-top-picks.json`).
