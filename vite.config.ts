import { execSync } from 'child_process'
import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// `base` is the repo name because the site is served as a GitHub Pages PROJECT
// page (https://wardcrazy01894.github.io/WhereHePlay/). Flip it to '/' when a
// custom domain is attached (docs/OPERATIONS.md §Custom domain). A native app
// build (Capacitor, docs/APP.md) sets VITE_BASE=./ so assets load from the
// bundled files.

// The build id open tabs compare against version.json (src/lib/version.ts).
// In CI it is "<commit>.<run number>": the run number makes a re-deploy of
// the SAME commit (e.g. after changing a repo Variable, which changes the
// bundle) a new build too. 'dev' disables auto-update — the deploy workflow
// fails if a production build ever ends up with it.
function getBuildHash(): string {
  try {
    const commit = execSync('git rev-parse --short HEAD').toString().trim()
    const run = process.env.GITHUB_RUN_NUMBER
    return run ? `${commit}.${run}` : commit
  } catch {
    return 'dev'
  }
}

const BUILD_HASH = getBuildHash()

export default defineConfig({
  base: process.env.VITE_BASE ?? '/WhereHePlay/',
  plugins: [
    react(),
    {
      // Emit version.json so the client can detect a new deploy on tab focus.
      name: 'version-json',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ hash: BUILD_HASH }),
        })
      },
    },
  ],
  define: {
    // Replaced at build time; lets the client compare against version.json.
    'import.meta.env.VITE_BUILD_HASH': JSON.stringify(BUILD_HASH),
  },
  test: {
    // Don't collect tests from isolated subagent/reviewer worktrees.
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
  },
})
