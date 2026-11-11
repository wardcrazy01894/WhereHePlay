# WhereHePlay

**The daily "where did he play in college?" game.** You get a photo of an NFL
or NBA player. Name his college. The fewer hints you need, the more it's worth.

**Play:** https://wardcrazy01894.github.io/WhereHePlay/

## How it works

Each question climbs a hint ladder:

| You have                        | Worth |
| ------------------------------- | ----- |
| Just the photo                  | 100   |
| + his name                      | 75    |
| + the conference he played in   | 50    |
| Four colleges to tap (pick one) | 25    |
| Wrong pick, or "I don't know"   | 0     |

Answers are typed, with autocomplete over about 375 colleges. A wrong typed
guess uses up a hint. Transfers count: any college he played for is right.

- **Daily** — five players a day: two easy, two medium, one hard. Same five for
  everyone, new at your local midnight. One shot, a streak, a share card and a
  daily leaderboard.
- **Free play** — keep going as long as you like, with a running streak.
- **Three modes**, each with its own daily, streak and leaderboard: **NFL**,
  **NBA**, and the **Grab Bag** of both.
- **Names and accounts** — play instantly as an anonymous device and pick a
  display name for the leaderboard. Optionally create a username + password
  account (no email) so your name, scores and streaks follow you across
  devices.

## The players

1,085 NFL and 879 NBA players who were in college from 1994 on, weighted
toward careers that ran into 2008 or later and filtered for fame — see
[docs/DATA.md](docs/DATA.md) for the sources and the exact rules.

## Stack

React + TypeScript + Vite, a static site on GitHub Pages. The leaderboard and
accounts are one Cloudflare Worker + D1 database. Everything runs on free
tiers: **$0/month**. Photos are hotlinked, not stored.

## Develop

```bash
npm install
npm run dev            # http://localhost:5173/WhereHePlay/
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

Data pipeline (rarely needed):

```bash
npm run fetch-raw       # download source tables into data/raw/ (gitignored)
npm run build-players   # → public/players.json + public/schools.json
npm run scan-headshots  # flag NFL placeholder photos, then build-players again
```

Leaderboard worker, locally: `npm run worker:migrate:local && npm run worker:dev`
with `VITE_API_ENDPOINT=http://localhost:8787` in `.env.local`.

## Docs

- [docs/PLAN.md](docs/PLAN.md) — game rules, architecture, the API
- [docs/DATA.md](docs/DATA.md) — data sources, fame filter, tiers, the schools table
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — deploy, worker, repo settings, costs
- [docs/APP.md](docs/APP.md) — what it takes to ship this as an iPhone / Android app
- [BACKLOG.md](BACKLOG.md) — known gaps and ideas

## Credits and disclaimers

Not affiliated with the NFL, the NBA or any school. Player data from
[nflverse](https://github.com/nflverse/nflverse-data) (CC BY 4.0) and
[Wikidata](https://www.wikidata.org/) (CC0). In-uniform photos are from
Wikimedia Commons under their individual licences (each links to its file
page). Headshots are loaded from the leagues' own public image servers and
remain their property.

A Spicy Al Software Solution.
