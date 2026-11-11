# Data

Two committed artifacts drive the game:

- `public/players.json` — 1,959 players (1,046 NFL, 913 NBA)
- `public/schools.json` — 375 colleges plus the "High School (no college)"
  answer (id, name, search aliases)

They are generated; never edit them by hand. The hand-maintained inputs are
`data/schools.psv`, `data/overrides.json` and `data/preps-to-pros.json`.

## Rebuilding

```bash
npm run fetch-raw        # → data/raw/ (gitignored): nflverse + Wikidata tables
npm run build-players    # → public/players.json, public/schools.json
npm run scan-headshots   # → data/nfl-placeholder-heads.json (see Photos)
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

NBA players who never played college ball have no college stint.
Internationals and G League Ignite players drop out naturally; players who
went straight from a US high school to the NBA are kept — see Preps to pros.

`MIN_FAME`, `LEGEND_FAME`, `PRO_FOCUS_YEAR` and `FIRST_COLLEGE_YEAR` are
constants at the top of that file. Lower `MIN_FAME` for a bigger, more
obscure pool.

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

- **NFL headshots:** the `static.www.nfl.com` URL from nflverse. For roughly
  380 retired players that URL serves the league's generic helmet
  placeholder; `scan-headshots` detects it by ETag and records the keys in
  `data/nfl-placeholder-heads.json` (committed, cumulative). Those players use
  their Wikimedia photo instead, or are dropped if they have none.
- **NBA headshots:** `cdn.nba.com/headshots/…/<NBA.com id>.png`.
- **In-uniform photos:** the Wikidata image (P18). The build stores the
  file's storage path on Commons (`<md5 prefix>/<File_name>`, raster files
  only) so the client can request it directly from `upload.wikimedia.org` —
  a 500px thumbnail, then the original for small files. That host sends CORS
  headers, which lets the client show the photo from a `blob:` URL before the
  name hint (the file name is usually the player's name — docs/PLAN.md §Game
  rules). Once the name is out, the photo links to its Commons page for
  author and licence.

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
4. `build-players` drops every listed photo. The player keeps his league
   headshot; a player whose only photo was a college one is dropped.

To act on a "this photo shows him in college" bug report: add the Commons
file name (the part of `a` after the slash) to `manual`, rebuild, and close
the issue.

League headshots are the leagues' copyrighted images, hotlinked. That is a
deliberate, accepted risk for a free hobby website and a blocker for an app
store build — see docs/APP.md §Photos.

## File formats

`players.json` row (short keys keep it ~575 KB raw):
`id`, `n` name, `l` league, `s` accepted school ids (finishing school first),
`c` conference hint, `y` final college fall year, `t` tier, `d` three decoy
ids, optional `h` headshot key, `p` position (NFL), `a` Commons storage path,
`hs` high school (preps to pros only).
