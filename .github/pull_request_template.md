## What & why

<!-- Briefly: what does this change and why. Link any related discussion. -->

## How it was verified

<!-- Tests added/updated, manual steps run (`npm run dev`), screenshots if UI. -->

## Docs updated (required)

Confirm every doc affected by this change is current in the same PR:

- [ ] `README.md` — if setup, commands, or features changed
- [ ] `docs/PLAN.md` — if architecture, game rules, or scoring changed
- [ ] `docs/DATA.md` — if the player or school data / schema / build scripts changed
- [ ] `docs/OPERATIONS.md` — if deploy, hosting, the worker, or repo config changed
- [ ] `docs/APP.md` — if anything the phone-app plan depends on changed
- [ ] Code comments / `.env.example` — if config or contracts changed
- [ ] N/A — this change touches no documented behavior

## Checklist

- [ ] **TDD**: tests were written first (red → green) for any behavior change
      — or N/A (pure data/docs)
- [ ] `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build` pass locally
- [ ] No secrets committed
- [ ] Branch will be deleted on merge
