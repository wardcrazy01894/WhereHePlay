# Backlog

Ideas and known gaps, roughly in priority order. Nothing here is promised.

## Data quality

- **Tier tuning.** Tiers come from a fame formula (docs/DATA.md §Tiers), not a
  human. Known misses: first-round busts at famous schools land in "hard"
  (Brady Quinn, Notre Dame); deep-bench NBA players at blue bloods land in
  "easy". `data/overrides.json` fixes them one at a time; a systematic pass
  over the top few hundred names per league has not been done.
- **Conference timelines** in `data/schools.psv` were written by hand and have
  not been audited school by school — small-conference and football-only
  affiliations before 2005 are the likeliest to be wrong.
- **Photo screening.** About 300 Wikimedia photos are withheld because they
  show (or probably show) the player in college (docs/DATA.md §No college
  gear). The contact-sheet review used small thumbnails, so a tiny college
  logo could still have slipped through; bug reports feed the manual list.
  Gaines Adams is the one player out for lack of any usable photo.
- **NBA transfers.** Wikidata does not always list every college stint (or
  their order), so a correct "he started at X" guess can be marked wrong, and
  the finishing school can be the wrong one (Ronnie Price was). Fix each in
  `data/overrides.json`.
- NBA positions and pro teams (Wikidata has them patchily) for the name hint.

## Game

- Share image (Open Graph card) and an app icon — the favicon is a placeholder.
- Weekly / all-time leaderboards; friends-only boards.
- Free-play filters (decade, conference, tier).
- More leagues (WNBA, MLB) — `League` is already a union type.
- Checkpoint the daily-lineup walk (it grows by a day's work per day since
  launch) — only if cold start ever gets slow; the output must not change.

## Phone apps

See docs/APP.md. Blockers before a store submission: licensed or free photos
only, a real icon set, and a privacy policy page.
