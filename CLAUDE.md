# WhereHePlay — working agreement

A daily "where did he play in college?" trivia game for NFL and NBA players.
See `docs/PLAN.md` for rules and architecture, `docs/DATA.md` for the dataset,
`docs/OPERATIONS.md` for deploy. This file is the contract for how changes get
made.

## Branch & PR workflow

- **All changes land via a Pull Request — never push directly to `main`.**
- Every PR runs these CI checks (required, strict, enforced for admins):
  - **build / typecheck / lint** — `npm ci`, `tsc` (app + worker), `eslint`,
    `prettier --check`, `vite build`.
  - **test** — `vitest run` (unit, render, worker SQL, dataset guards).
  - **secret scan** — gitleaks over the branch history.
- Squash merge; branches delete on merge. Conversation resolution required.
  0 required approvals (solo repo — CI is the gate). Re-apply or audit with
  `bash scripts/protect-main.sh`.
- Every PR gets an adversarial review before merge (the `adversarial-reviewer`
  agent, in an isolated worktree) — including dependency bumps. Green CI is
  necessary, not sufficient.

## How we write code — TDD is mandatory

Every behavior change starts with a failing test (`.claude/skills/tdd-cycle`).
Keep logic in pure, DOM-free functions under `src/lib/` (`*.test.ts`, Node
env); React components stay thin (`*.render.test.tsx`, jsdom). Worker logic
lives in `worker/api-lib.mjs` and is tested against real SQLite with the real
migrations. Never mock the unit under test.

## Docs stay current in the same PR

| Change touches…                                                                       | Update / verify                                                 |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/lib/game.ts` (ladder, points)                                                    | PLAN §Game rules, README table, worker MARK_POINTS              |
| `src/lib/daily.ts`                                                                    | PLAN §Daily selection                                           |
| `src/lib/storage.ts`, `share.ts`, `freeplay.ts`                                       | PLAN §Modes and storage                                         |
| `src/lib/version.ts`, the version-json plugin in `vite.config.ts`                     | PLAN §Auto-update                                               |
| `worker/*`, `src/lib/api.ts`, Leaderboard, AccountDialog                              | PLAN §API + `worker/README.md` + OPERATIONS                     |
| `worker/bug-lib.mjs`, `src/lib/report.ts`, `playerSearch.ts`, BugReport, PlayerSearch | PLAN §Bug reports and player requests + OPERATIONS §Bug reports |
| `worker/migrations/*`                                                                 | OPERATIONS §API worker (run the migration!)                     |
| `scripts/*`, `data/*.json`, `data/schools.psv`, `public/*.json`                       | `docs/DATA.md`; player counts in README                         |
| `src/lib/images.ts`, photo sources                                                    | DATA §Photos + `docs/APP.md` §Photos                            |
| `.github/workflows/*`, `scripts/protect-main.sh`                                      | OPERATIONS + this file's CI list                                |
| `vite.config.ts` (`base`), `index.html`, `public/manifest.*`                          | OPERATIONS §Custom domain + `docs/APP.md`                       |
| `.github/dependabot.yml`                                                              | OPERATIONS §Dependency updates                                  |
| `eslint.config.js`                                                                    | A comment in the config saying why                              |
| `package.json` scripts / engines                                                      | README + this file's command list                               |

The footer's last line is **"A Spicy Al Software Solution"** — a hard
requirement, pinned by `src/App.render.test.tsx`.

## Rules that are easy to break

- **Never change `hashString`, `dateSeed`, `TIER_PLAN` or `EPOCH_DATE_KEY`
  casually** — they decide every day's puzzle; changing them re-rolls today's
  game under people mid-play. Golden-value tests pin them. A plan change goes
  through `tierPlanFor`: a new plan with a start date in the future, never an
  edit to a plan already played. (The one exception was launch day,
  2026-11-11, before the link was shared: the plan went from 2-2-1 to 3-1-1
  and the test scores were wiped; that evening the game was restarted once
  more onto players with both photos — `localStorage` prefix `whp:v2:`, the
  leaderboard database emptied.)
- **Rebuilding the dataset can change upcoming lineups.** Fine for future
  days; avoid merging a rebuild in the middle of a US evening.
- **Photos never decide who is in the dataset, only who is drawn.** A player
  is drawn only with both a real headshot and a real playing photo (`e` in
  `players.json`, dated by `data/eligible-since.json`). Never drop a player
  over photos, and never edit an eligible-since date into the past — that
  re-rolls days already played. New photos take effect the next day by
  design. (docs/DATA.md §Photos — The rules.)
- **Points live in two places**: `STAGE_POINTS` (client) and `MARK_POINTS`
  (worker). The worker rejects a score that doesn't match its marks.
- Never set a lint rule to `off` to make an upgrade land; a downgrade needs a
  comment and a follow-up.

## Local commands

```bash
npm install
npm run dev            # http://localhost:5173/
npm run typecheck      # tsc --noEmit (app) + tsconfig.worker.json (worker)
npm run lint
npm test
npm run format         # prettier --write (format:check in CI)
npm run build
npm run fetch-raw / build-players / scan-headshots   # data pipeline (docs/DATA.md)
npm run worker:dev / worker:migrate:local            # API worker on :8787, local D1
npm run worker:migrate / worker:deploy               # production — by hand, never CI
```

Run `npm run typecheck && npm run lint && npm run format:check && npm test &&
npm run build` before opening a PR, and judge each by its exit code. The
PostToolUse hook formats/lints TS files on edit, but not Markdown, JSON or
`.mjs` — run `npm run format` after editing those.

## Secrets

None in the repo. `VITE_API_ENDPOINT` and `VITE_CF_BEACON_TOKEN` are public by
design (repo Variables in CI, `.env.local` locally). The worker's one secret, `GH_TOKEN` (fine-grained PAT, Issues read/write, this
repo only), lives in Cloudflare via `wrangler secret put` — never here, nor in
`worker/.dev.vars` (gitignored).

## Git identity

Everything Claude does here is attributed to the `wardcrazy01894` account via
the local Claude Code config (env vars, the `github-wardcrazy` SSH alias, and
`GH_CONFIG_DIR`). Don't run `git config --global user.*` or `gh auth switch`.
