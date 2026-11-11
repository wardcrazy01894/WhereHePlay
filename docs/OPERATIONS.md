# Operations

## What runs where, and what it costs

| Piece          | Where                              | Cost |
| -------------- | ---------------------------------- | ---- |
| Site           | GitHub Pages (public repo)         | $0   |
| CI / deploy    | GitHub Actions (public repo)       | $0   |
| API + database | Cloudflare Workers Free + D1 Free  | $0   |
| Photos         | hotlinked (league CDNs, Wikimedia) | $0   |
| Domain         | optional, ~$10–15/yr for a .com    | —    |

Free-tier headroom: Workers Free allows 100,000 requests/day and D1 Free 5 GB
and 5 million row reads/day; a finished daily is two or three requests.

## Live site

https://wardcrazy01894.github.io/WhereHePlay/ — `.github/workflows/deploy.yml`
builds and publishes on every push to `main`.

If the first deploy fails at "Configure Pages" with _Resource not accessible
by integration_, enable Pages once and re-run the job:

```bash
gh api -X POST repos/wardcrazy01894/WhereHePlay/pages -f build_type=workflow
```

Repo **Variables** (Settings → Secrets and variables → Actions → Variables),
baked into the bundle at build time:

- `VITE_API_ENDPOINT` — the worker URL. Unset → no leaderboard or accounts.
- `VITE_CF_BEACON_TOKEN` — optional Cloudflare Web Analytics.

After changing a Variable, re-run the deploy workflow (Actions → deploy → Run
workflow).

Open tabs pick up a new deploy by themselves within about five minutes, or
the next time the tab is focused (docs/PLAN.md §Auto-update). To confirm what
is live: `curl https://wardcrazy01894.github.io/WhereHePlay/version.json`
should print the short hash of `main`.

## API worker

Deployed **by hand** with wrangler; it never deploys from CI.

The D1 database `whp-api` already exists (created 2026-11-11; its id is in
`worker/wrangler.toml`). To bring the worker up the first time:

```bash
npx wrangler login                      # if not already logged in
npm run worker:migrate                  # create the tables (remote)
npm run worker:deploy                   # prints the workers.dev URL
gh variable set VITE_API_ENDPOINT -b "https://whp-api.<account>.workers.dev"
gh workflow run deploy
```

Afterwards: `npm run worker:deploy` for code changes; `npm run worker:migrate`
**before** deploying code that needs a new migration.

- `ALLOWED_ORIGIN` in `worker/wrangler.toml` must list every origin the site
  is served from (add a custom domain here before cutting over).
- The two `[[ratelimits]]` bindings need no account resource. The worker
  refuses to run without `RATE_LIMITER`.
- There is no cron trigger (the account's free slots are used by other
  projects); old scores are pruned lazily from `/score`.
- Logs: `npx wrangler tail -c worker/wrangler.toml`.

### Bug reports (the `GH_TOKEN` secret)

In-app bug reports become GitHub issues through the worker's `/bug` route.
It needs one secret; until it is set the route answers 503 and the site
offers a prefilled issue link instead.

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate:
   resource owner `wardcrazy01894`, **only** the `WhereHePlay` repository,
   repository permission **Issues: Read and write** (nothing else).
2. `npx wrangler secret put GH_TOKEN -c worker/wrangler.toml` and paste it.
   No redeploy needed.
3. Send a test report from the site; it should appear under Issues with the
   labels `bug` and `from-app`. (Player requests from "Is he in the game?"
   use the same route and arrive labelled `player-request`.)

When the token expires reports quietly fall back to the prefilled link;
`npx wrangler tail -c worker/wrangler.toml` shows `bug: github issue create
failed` with GitHub's reason. Rotate by repeating step 1–2.

By-hand admin (there is no admin UI):

```bash
# Rename an offensive display name
npx wrangler d1 execute whp-api --remote -c worker/wrangler.toml \
  --command "UPDATE players SET name = '' WHERE name = 'the bad name'"
# Forgotten password: free the username (their scores stay on the old player)
npx wrangler d1 execute whp-api --remote -c worker/wrangler.toml \
  --command "UPDATE players SET username = NULL, pass_salt = NULL, pass_hash = NULL WHERE username = 'someone'"
```

## Custom domain

1. Buy the domain, point DNS at GitHub Pages, set it in the repo's Pages
   settings, add `public/CNAME`.
2. `vite.config.ts`: default `base` → `'/'`.
3. Add the new origins to the worker's `ALLOWED_ORIGIN` and redeploy it
   **first**, or the leaderboard breaks at cutover.
4. Update the README, this file and the profile README link.

## Repo settings

`bash scripts/protect-main.sh` applies branch protection: PR-only, three
required checks (strict), admins included, conversation resolution, no
force-push or deletion, squash merge, delete branch on merge. Also enabled:
Dependabot alerts and security updates, secret scanning with push protection.

## Dependency updates

`.github/dependabot.yml`: weekly, npm and GitHub Actions; minor and patch
updates arrive as one grouped PR per ecosystem, majors individually.
TypeScript majors are ignored until typescript-eslint supports them. Actions
are pinned by commit SHA. Dependency PRs get the same review as any other.

## Refreshing the data

See docs/DATA.md §Rebuilding. Do it in a PR; the dataset guard tests run in CI.
