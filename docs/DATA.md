# Data

Two committed artifacts drive the game:

- `public/players.json` — 1,964 players (1,085 NFL, 879 NBA)
- `public/schools.json` — 375 colleges (id, name, search aliases)

They are generated; never edit them by hand. The one hand-maintained input is
`data/schools.psv`.

## Rebuilding

```bash
npm run fetch-raw        # → data/raw/ (gitignored): nflverse + Wikidata tables
npm run build-players    # → public/players.json, public/schools.json
npm run scan-headshots   # → data/nfl-placeholder-heads.json (see Photos)
npm run build-players    # again, now that placeholders are known
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

NBA players who never played college ball (preps-to-pros, internationals,
G League Ignite) have no college stint and drop out naturally.

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
- **In-uniform photos:** the Wikidata image (P18), served by Wikimedia
  Commons at a thumbnail width, with a link to the file page for author and
  licence.

League headshots are the leagues' copyrighted images, hotlinked. That is a
deliberate, accepted risk for a free hobby website and a blocker for an app
store build — see docs/APP.md §Photos.

## File formats

`players.json` row (short keys keep it ~575 KB raw):
`id`, `n` name, `l` league, `s` accepted school ids (finishing school first),
`c` conference hint, `y` final college fall year, `t` tier, `d` three decoy
ids, optional `h` headshot key, `p` position (NFL), `a` Commons file name.
