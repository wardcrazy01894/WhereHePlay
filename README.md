<div align="center">

# 🏈 WhereHePlay 🏀

**The daily "where did he play in college?" game for NFL and NBA players.**

### ▶ [Play now → wardcrazy01894.github.io/WhereHePlay](https://wardcrazy01894.github.io/WhereHePlay/)

[![CI](https://github.com/wardcrazy01894/WhereHePlay/actions/workflows/ci.yml/badge.svg)](https://github.com/wardcrazy01894/WhereHePlay/actions/workflows/ci.yml)
[![deploy](https://github.com/wardcrazy01894/WhereHePlay/actions/workflows/deploy.yml/badge.svg)](https://github.com/wardcrazy01894/WhereHePlay/actions/workflows/deploy.yml)

React · TypeScript · Vite · Cloudflare Workers + D1 &nbsp;·&nbsp; 1,964 players &nbsp;·&nbsp; $0 hosting

</div>

---

You get a photo of a pro. **Name the college he played for.** Tom Brady is a
gimme; a rotation guy from a one-bid league is not. The fewer hints you need,
the more it's worth — then share your squares and defend your streak.

## 🎮 How to play

Each question climbs a hint ladder:

|     | You have                        | Worth   |
| --- | ------------------------------- | ------- |
| 🟩  | Just the photo                  | **100** |
| 🟨  | + his name                      | **75**  |
| 🟧  | + the conference he played in   | **50**  |
| 🟥  | Four colleges to tap (pick one) | **25**  |
| ⬛  | Wrong pick, or "I don't know"   | 0       |

Type your answer — autocomplete suggests from about 375 colleges. A wrong
typed guess uses up a hint. Transfers count: any college he played for is
right.

```
WhereHePlay #1 · NFL
🟩🟨🟧🟥⬛ 250/500
```

## ✨ Features

|     |                              |                                                                                                                                                    |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📅  | **Daily five**               | Two easy, two medium, one hard. Same five for everyone, new at your local midnight, one shot. Nobody repeats within 45 days.                       |
| ♾️  | **Free play**                | Keep going as long as you like, with a running streak of correct answers.                                                                          |
| 🏈  | **Three modes**              | **NFL**, **NBA**, or the **Grab Bag** of both — each with its own daily, streak and leaderboard.                                                   |
| 🕰️  | **Conference at the time**   | The conference hint is the one he actually played in: Carmelo Anthony's Syracuse is Big East, a 2023 Oregon Duck is Pac-12, a 2025 one is Big Ten. |
| 📸  | **Two kinds of photo**       | League headshot first, an in-uniform shot with the name hint — or flip the "First photo" switch and start from the action shot.                    |
| 🏆  | **Daily leaderboard**        | See where your score lands today, with everyone's squares and streaks.                                                                             |
| 👤  | **Names, accounts optional** | Play instantly and pick a display name. A username + password account (no email) carries your name, scores and streaks across devices.             |
| 🔥  | **Streaks & share card**     | Wordle-style squares with the puzzle number.                                                                                                       |
| 🐛  | **In-app bug reports**       | Type what went wrong and send; it lands as a GitHub issue without leaving the site.                                                                |
| 📱  | **Phone-first**              | Built to be wrapped as an iPhone / Android app later — see [docs/APP.md](docs/APP.md).                                                             |
| 💸  | **$0 hosting**               | GitHub Pages + Cloudflare free tiers; photos are hotlinked, not stored.                                                                            |

## 🧑‍🤝‍🧑 The players

1,085 NFL and 879 NBA players who were in college from 1994 on, weighted
toward careers that ran into 2008 or later and filtered for fame — see
[docs/DATA.md](docs/DATA.md) for the sources and the exact rules.

## 🧱 Stack

React + TypeScript + Vite, a static site on GitHub Pages. The leaderboard and
accounts are one Cloudflare Worker + D1 database
(`https://whp-api.wardcrazy01894.workers.dev`). Everything runs on free
tiers: **$0/month**. Photos are hotlinked, not stored.

## 🛠️ Develop

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

## 📚 Docs

- [docs/PLAN.md](docs/PLAN.md) — game rules, architecture, the API
- [docs/DATA.md](docs/DATA.md) — data sources, fame filter, tiers, the schools table
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — deploy, worker, repo settings, costs
- [docs/APP.md](docs/APP.md) — what it takes to ship this as an iPhone / Android app
- [BACKLOG.md](BACKLOG.md) — known gaps and ideas

## 🙏 Credits and disclaimers

Not affiliated with the NFL, the NBA or any school. Player data from
[nflverse](https://github.com/nflverse/nflverse-data) (CC BY 4.0) and
[Wikidata](https://www.wikidata.org/) (CC0). In-uniform photos are from
Wikimedia Commons under their individual licences (each links to its file
page). Headshots are loaded from the leagues' own public image servers and
remain their property.

A Spicy Al Software Solution.
