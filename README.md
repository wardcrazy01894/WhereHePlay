<div align="center">

# 🏈 WhereHePlay 🏀

**The daily "where did he play in college?" game for NFL and NBA players.**

### ▶ [Play now → whereheplay.com](https://whereheplay.com/)

[![CI](https://github.com/wardcrazy01894/WhereHePlay/actions/workflows/ci.yml/badge.svg)](https://github.com/wardcrazy01894/WhereHePlay/actions/workflows/ci.yml)
[![deploy](https://github.com/wardcrazy01894/WhereHePlay/actions/workflows/deploy.yml/badge.svg)](https://github.com/wardcrazy01894/WhereHePlay/actions/workflows/deploy.yml)

React · TypeScript · Vite · Cloudflare Workers + D1 &nbsp;·&nbsp; 3,165 players &nbsp;·&nbsp; $0 hosting

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
right. For a player who went straight from high school to the NBA, the answer
is simply "High School" — the reveal tells you which one. For a star who
went pro overseas instead of college (Dirk, Giannis, Luka…), it's
"International".

```
WhereHePlay #1 · NFL (headshot)
🟩🟨🟧🟥⬛ 250/500
```

## ✨ Features

|     |                               |                                                                                                                                                                                            |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 📅  | **Daily five**                | Five household names. Same five for everyone, new at your local midnight, one shot. Nobody repeats within 30 days.                                                                         |
| 🌶️  | **Sicko Mode**                | Want it harder? Three easy, one medium, one hard in each mode, with its own streak and leaderboard. Nobody repeats within 45 days.                                                         |
| ♾️  | **Free play**                 | Keep going as long as you like, with a running streak of correct answers.                                                                                                                  |
| 🏈  | **Three modes**               | **NFL**, **NBA**, or the **Grab Bag** of both — each with its own daily, streak and leaderboard.                                                                                           |
| 🕰️  | **Conference at the time**    | The conference hint is the one he actually played in: Carmelo Anthony's Syracuse is Big East, a 2023 Oregon Duck is Pac-12, a 2025 one is Big Ten.                                         |
| 📸  | **Headshot or in action**     | Pick which photo you see first: the official headshot, or him playing in a pro uniform. Your pick shows on the share card. Photos in college gear are screened out.                        |
| 🏆  | **Daily leaderboard**         | See where your score lands today, with everyone's squares and streaks.                                                                                                                     |
| 👤  | **Names, accounts optional**  | Play instantly and pick a display name. A username + password account (no email) carries your name, scores and streaks across devices: finish on the computer and the phone shows it done. |
| 🔥  | **Streaks & share card**      | Wordle-style squares with the puzzle number.                                                                                                                                               |
| 🐛  | **Bug reports, one tap away** | A 🐛 button on every screen: type what went wrong and send; it lands as a GitHub issue without leaving the site.                                                                           |
| 🔎  | **"Is he in the game?"**      | Search the player list by name. Missing someone? One tap files a request to add him.                                                                                                       |
| 📱  | **Phone-first**               | Built to be wrapped as an iPhone / Android app later — see [docs/APP.md](docs/APP.md).                                                                                                     |
| 💸  | **$0 hosting**                | GitHub Pages + Cloudflare free tiers; photos are hotlinked, not stored.                                                                                                                    |

## 🧑‍🤝‍🧑 The players

1,974 NFL and 1,191 NBA players who were in college from 1994 on (plus the 34
who skipped it — LeBron, Kobe, KG: for them just answer **High School** — and
52 international stars who turned pro abroad: answer **International**), weighted
toward careers that ran into 2008 or later and filtered for fame, plus the
last ten years' players who really played. 2,575 can be drawn from 2026-11-14; the
rest join as their photos are checked — see
[docs/DATA.md](docs/DATA.md) for the sources and the exact rules.

## 🧱 Stack

React + TypeScript + Vite, a static site on GitHub Pages. The leaderboard and
accounts are one Cloudflare Worker + D1 database
(`https://whp-api.wardcrazy01894.workers.dev`). Everything runs on free
tiers: **$0/month**. Photos are hotlinked, not stored.

## 🛠️ Develop

```bash
npm install
npm run dev            # http://localhost:5173/
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

Data pipeline (rarely needed):

```bash
npm run fetch-raw       # download source tables into data/raw/ (gitignored)
npm run fetch-nba-infobox  # recent NBA players' colleges, from Wikipedia infoboxes
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
