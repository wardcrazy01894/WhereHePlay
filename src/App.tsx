import { useEffect, useRef, useState } from 'react'
import type { Mode, Player, School, Variant } from './types'
import { MODES, MODE_LABEL, boardId } from './types'
import { getDateKey, puzzleNumber } from './lib/daily'
import { resolveDay } from './lib/day'
import { totalPoints } from './lib/game'
import { apiEnabled, fetchMe } from './lib/api'
import {
  type Identity,
  type PhotoStyle,
  liveStreak,
  loadDaily,
  loadIdentity,
  loadPhotoStyle,
  loadStats,
  saveIdentity,
  savePhotoStyle,
} from './lib/storage'
import { log } from './lib/log'
import { syncProgress } from './lib/sync'
import {
  VERSION_CHECK_MS,
  fetchDeployedHash,
  readAttempt,
  recordAttempt,
  shouldReload,
} from './lib/version'
import { DailyGame } from './components/DailyGame'
import { FreePlay } from './components/FreePlay'
import { Leaderboard } from './components/Leaderboard'
import { AccountDialog } from './components/AccountDialog'
import { BugReport } from './components/BugReport'
import { PlayerSearch } from './components/PlayerSearch'

type View =
  | { screen: 'home' }
  | { screen: 'daily'; mode: Mode; variant: Variant }
  | { screen: 'free'; mode: Mode }
  | { screen: 'board'; mode: Mode; variant: Variant }

const MODE_BLURB: Record<Mode, string> = {
  mixed: 'NFL and NBA players, shuffled together',
  nfl: 'Football only',
  nba: 'Basketball only',
}

export function App() {
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [schools, setSchools] = useState<School[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [view, setView] = useState<View>({ screen: 'home' })
  const [identity, setIdentity] = useState<Identity>(loadIdentity)
  const [photoStyle, setPhotoStyle] = useState<PhotoStyle>(loadPhotoStyle)
  const [accountOpen, setAccountOpen] = useState(false)
  const [bugOpen, setBugOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // Any dialog over the page (they may hold half-typed text).
  const dialogOpen = accountOpen || bugOpen || searchOpen
  const [{ dateKey, official }, setDay] = useState(() =>
    resolveDay(window.location.search, new Date()),
  )

  const changeIdentity = (next: Identity) => {
    setIdentity(next)
    saveIdentity(next)
  }

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    const get = (file: string) =>
      // Tied to the build: a new deploy never reuses an older cached dataset.
      fetch(
        `${base}${file}?v=${import.meta.env.VITE_BUILD_HASH ?? 'dev'}`,
      ).then((r) => {
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
        return r.json()
      })
    Promise.all([get('players.json'), get('schools.json')])
      .then(([p, s]) => {
        setPlayers(p)
        setSchools(s)
      })
      .catch((e) => {
        log.error('data', 'dataset load failed', { error: String(e) })
        setLoadError(true)
      })
  }, [])

  const onHome = view.screen === 'home'
  // Cross-device sync (src/lib/sync.ts): ask the server who this is and what
  // they have done — a name changed, a daily finished or a streak extended
  // on another device — and fold it into this one. On load, on every return
  // to the home screen and when the tab comes back; only ever from the home
  // screen, so a game on screen is never swapped out from under the player.
  const [syncAsk, setSyncAsk] = useState(0)
  const [, setSynced] = useState(0)
  // Hand-overs the server refused this session (not retried every visit).
  const refused = useRef(new Set<string>())
  useEffect(() => {
    if (!apiEnabled || !players || !onHome) return
    let live = true
    const { token } = identity
    fetchMe(token).then(async (r) => {
      if (!live || !r.ok) return
      const next = {
        ...identity,
        name: r.name || identity.name,
        username: r.username ?? undefined,
      }
      if (next.name !== identity.name || next.username !== identity.username)
        changeIdentity(next)
      // The real local day, never a ?date= practice day.
      const changed = await syncProgress(
        players,
        r,
        token,
        getDateKey(),
        refused.current,
      )
      if (live && changed) setSynced((n) => n + 1)
    })
    return () => {
      live = false
    }
    // Per token, per visit to the home screen — not per identity edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.token, players, onHome, syncAsk])

  // Roll over to the new day when the tab comes back after midnight — but
  // only on the home screen, never under a game in progress.
  useEffect(() => {
    if (!onHome) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setDay(resolveDay(window.location.search, new Date()))
      setSyncAsk((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [onHome])

  // Auto-update: learn when a newer build is live (on load, on returning to
  // the tab, every few minutes) and reload onto it — but only from the home
  // screen, never under a question. See src/lib/version.ts.
  const [deployed, setDeployed] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    const check = () => {
      if (document.visibilityState !== 'visible') return
      fetchDeployedHash(import.meta.env.BASE_URL).then((hash) => {
        if (live && hash) setDeployed(hash)
      })
    }
    check()
    const timer = setInterval(check, VERSION_CHECK_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      live = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  const current = import.meta.env.VITE_BUILD_HASH ?? 'dev'
  const stale = !!deployed && current !== 'dev' && deployed !== current
  useEffect(() => {
    if (!deployed) return
    if (
      !shouldReload({
        current,
        deployed,
        attempted: readAttempt(),
        // The bare home screen only. The profile and bug-report dialogs open
        // over it and may hold half-typed text, so they count as busy.
        safe: onHome && !dialogOpen,
      })
    )
      return
    recordAttempt(deployed)
    // Only reload if the guard was really stored (no storage → no loop guard).
    if (readAttempt() === deployed) {
      log.info('App', 'new build deployed, reloading', {
        from: current,
        to: deployed,
      })
      window.location.reload()
    }
  }, [deployed, onHome, dialogOpen, current])

  const choosePhoto = (next: PhotoStyle) => {
    setPhotoStyle(next)
    savePhotoStyle(next)
  }
  const goHome = () => {
    setDay(resolveDay(window.location.search, new Date()))
    setView({ screen: 'home' })
  }

  const ready = players && schools

  return (
    <div className="app">
      <header className="top">
        <button type="button" className="brand" onClick={goHome}>
          Where<span>He</span>Play
        </button>
        <div className="top-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Report a bug"
            title="Report a bug"
            onClick={() => setBugOpen(true)}
          >
            🐛
          </button>
          <button
            type="button"
            className="me"
            onClick={() => setAccountOpen(true)}
          >
            👤 {identity.name || 'Set name'}
          </button>
        </div>
      </header>

      <main>
        {loadError && (
          <p className="error">
            Couldn’t load the players. Check your connection and reload.
          </p>
        )}
        {!ready && !loadError && <p className="muted">Loading players…</p>}

        {ready && view.screen === 'home' && (
          <div className="home">
            <div className="home-intro">
              <p className="tagline">
                Where did he play in college? Five players a day. Fewer hints,
                more points.
              </p>
              {!official && (
                <p className="muted">
                  Practice day {dateKey} (puzzle #{puzzleNumber(dateKey)}) — not
                  recorded.
                </p>
              )}
            </div>
            <div className="modes">
              {MODES.map((mode) => {
                const saved = official ? loadDaily(mode, dateKey) : undefined
                const done = saved?.questions.every((q) => q.done)
                const started = saved?.questions.some((q) => q.done)
                const streak = liveStreak(loadStats(mode), dateKey)
                const beginner = official
                  ? loadDaily(mode, dateKey, 'beginner')
                  : undefined
                const beginnerDone = beginner?.questions.every((q) => q.done)
                const beginnerStarted = beginner?.questions.some((q) => q.done)
                return (
                  <section key={mode} className={`mode mode-${mode}`}>
                    <h2>{MODE_LABEL[mode]}</h2>
                    <p className="muted">{MODE_BLURB[mode]}</p>
                    <p className="mode-streak">
                      {streak > 0 ? `🔥 ${streak}-day streak` : ' '}
                    </p>
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        setView({ screen: 'daily', mode, variant: 'standard' })
                      }
                    >
                      {done
                        ? `Daily done · ${totalPoints(saved!.questions)}`
                        : started
                          ? 'Continue daily'
                          : 'Play daily'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setView({ screen: 'daily', mode, variant: 'beginner' })
                      }
                    >
                      {beginnerDone
                        ? `Beginner done · ${totalPoints(beginner!.questions)}`
                        : beginnerStarted
                          ? 'Continue beginner'
                          : 'Beginner daily'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setView({ screen: 'free', mode })}
                    >
                      Free play
                    </button>
                  </section>
                )
              })}
            </div>
            <div className="row center home-links">
              {apiEnabled && (
                <button
                  type="button"
                  onClick={() =>
                    setView({
                      screen: 'board',
                      mode: 'mixed',
                      variant: 'standard',
                    })
                  }
                >
                  🏆 Leaderboards
                </button>
              )}
              <button type="button" onClick={() => setSearchOpen(true)}>
                🔎 Is he in the game?
              </button>
            </div>
            {/* One block, after the games in the document (and on phones);
                index.css lifts it above them on wide screens. */}
            <div className="home-setup">
              <fieldset className="photo-choice">
                <legend>First photo you see</legend>
                {(['headshot', 'action'] as const).map((style) => (
                  <label key={style}>
                    <input
                      type="radio"
                      name="photo-style"
                      checked={photoStyle === style}
                      onChange={() => choosePhoto(style)}
                    />
                    <span>
                      {style === 'headshot' ? 'Headshot' : 'In action'}
                      <small>
                        {style === 'headshot'
                          ? 'official portrait'
                          : 'playing, in a pro uniform'}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <details className="how">
                <summary>How it works</summary>
                <ul>
                  <li>
                    You start with just a photo: 100 points if you name the
                    college.
                  </li>
                  <li>
                    Hint 1 shows his name (75). Hint 2 his conference (50).
                  </li>
                  <li>Hint 3 is four colleges to pick from (25).</li>
                  <li>
                    A wrong typed guess uses up a hint. “I don’t know” ends it
                    for 0.
                  </li>
                  <li>Transfers count: any college he played for is right.</li>
                  <li>
                    New here? The beginner daily is five household names a day,
                    scored the same way.
                  </li>
                </ul>
              </details>
            </div>
          </div>
        )}

        {ready && view.screen === 'daily' && (
          <DailyGame
            key={`${boardId(view.mode, view.variant)}:${dateKey}`}
            players={players}
            schools={schools}
            mode={view.mode}
            variant={view.variant}
            dateKey={dateKey}
            official={official}
            identity={identity}
            photoStyle={photoStyle}
            onNeedName={() => setAccountOpen(true)}
          />
        )}
        {ready && view.screen === 'free' && (
          <FreePlay
            key={view.mode}
            players={players}
            schools={schools}
            mode={view.mode}
            photoStyle={photoStyle}
          />
        )}
        {view.screen === 'board' && (
          <Leaderboard
            mode={view.mode}
            variant={view.variant}
            dateKey={dateKey}
            token={identity.token}
            refreshKey={identity.name.length}
            onModeChange={(mode, variant) =>
              setView({ screen: 'board', mode, variant })
            }
          />
        )}

        {view.screen !== 'home' && (
          <button type="button" className="quiet back" onClick={goHome}>
            ← All games
          </button>
        )}
        {stale && view.screen !== 'home' && (
          <p className="update-note" role="status">
            A new version is ready — it loads when you go back to All games.
          </p>
        )}
        {stale && onHome && dialogOpen && (
          <p className="update-note" role="status">
            A new version is ready — it loads when you close this dialog.
          </p>
        )}
      </main>

      {accountOpen && (
        <AccountDialog
          identity={identity}
          onChange={changeIdentity}
          onClose={() => setAccountOpen(false)}
        />
      )}

      {bugOpen && (
        <BugReport
          context={{
            screen:
              view.screen === 'home'
                ? 'home'
                : view.screen === 'free'
                  ? `free ${view.mode}`
                  : `${view.screen} ${boardId(view.mode, view.variant)}`,
            date: dateKey,
          }}
          onClose={() => setBugOpen(false)}
        />
      )}

      {searchOpen && players && (
        <PlayerSearch
          players={players}
          context={{ screen: 'player search', date: dateKey }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <footer className="site-footer">
        <div>
          <button
            type="button"
            className="link"
            onClick={() => setBugOpen(true)}
          >
            🐛 Report a bug
          </button>
        </div>
        <div>
          Not affiliated with the NFL, the NBA or any school. Player data from{' '}
          <a
            href="https://github.com/nflverse/nflverse-data"
            target="_blank"
            rel="noreferrer"
          >
            nflverse
          </a>{' '}
          and{' '}
          <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer">
            Wikidata
          </a>
          .
        </div>
        <div>A Spicy Al Software Solution</div>
      </footer>
    </div>
  )
}
