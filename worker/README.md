# whp-api — WhereHePlay's API worker

Leaderboard, display names and optional accounts. Design and trust model:
[docs/PLAN.md §API](../docs/PLAN.md). Deploy and admin:
[docs/OPERATIONS.md §API worker](../docs/OPERATIONS.md).

| File            | What                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `api.mjs`       | Entry: routing, rate limits, origin check. Exports only `default`.                                              |
| `api-lib.mjs`   | Validation, crypto, all SQL. Unit-tested.                                                                       |
| `bug-lib.mjs`   | Bug report → GitHub issue: defanging, caps, the GitHub call.                                                    |
| `api.test.mjs`  | Tests against real SQLite (`node:sqlite`) with the real migrations.                                             |
| `bug.test.mjs`  | Tests for `/bug` (GitHub is stubbed).                                                                           |
| `migrations/`   | D1 schema. Numbered; never edit one that has been applied remotely.                                             |
| `wrangler.toml` | Bindings: `DB`, `RATE_LIMITER`, `LOGIN_LIMITER`, `BUG_LIMITER`, `ALLOWED_ORIGIN`, `GH_REPO`; secret `GH_TOKEN`. |

Local:

```bash
npm run worker:migrate:local
npm run worker:dev        # http://localhost:8787
```

All routes are `POST` with JSON:

| Route       | Body                               | Returns                               |
| ----------- | ---------------------------------- | ------------------------------------- |
| `/score`    | `token, board, date, score, marks` | `rank, total, score, streak`          |
| `/board`    | `board, date, token?`              | `total, entries[]`                    |
| `/me`       | `token`                            | `name, username, streaks[], scores[]` |
| `/name`     | `token, name`                      | `name, username`                      |
| `/register` | `token, username, pass`            | `name, username`                      |
| `/login`    | `username, pass`                   | `token, name, username`               |
| `/logout`   | `token`                            | —                                     |
| `/bug`      | `message, context, logs`           | `url` of the GitHub issue             |

`board` is one of `nfl`, `nba`, `mixed`, `nfl-beginner`, `nba-beginner`,
`mixed-beginner` (`BOARDS` in `api-lib.mjs`); anything else is a 400.

`board` is one of `nfl`, `nba`, `mixed`, `nfl-beginner`, `nba-beginner`,
`mixed-beginner` (`BOARDS` in `api-lib.mjs`); anything else is a 400.

`pass` is the client-derived key (64 hex chars), never the password.
