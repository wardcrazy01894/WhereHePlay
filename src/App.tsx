import { useEffect, useState } from 'react'
import type { Mode, Player, School } from './types'
import { MODES, MODE_LABEL } from './types'
import { puzzleNumber } from './lib/daily'
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
  | { screen: 'daily'; mode: Mode }
  | { screen: 'free'; mode: Mode }
  | { screen: 'board'; mode: Mode }

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

  // Pick up a name changed on another device (accounts only matter here).
  useEffect(() => {
    if (!apiEnabled) return
    fetchMe(identity.token).then((r) => {
      if (!r.ok) return
      const next = {
        ...identity,
        name: r.name || identity.name,
        username: r.username ?? undefined,
      }
      if (next.name !== identity.name || next.username !== identity.username)
        changeIdentity(next)
    })
    // Once per token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.token])

  // Roll over to the new day when the tab comes back after midnight — but
  // only on the home screen, never under a game in progress.
  const onHome = view.screen === 'home'
  useEffect(() => {
    if (!onHome) return
    const onVisible = () => {
      if (document.visibilityState === 'visible')
        setDay(resolveDay(window.location.search, new Date()))
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
          <>
            <p className="tagline">
              Where did he play in college? Five players a day — three easy, one
              medium, one hard. Fewer hints, more points.
            </p>
            {!official && (
              <p className="muted">
                Practice day {dateKey} (puzzle #{puzzleNumber(dateKey)}) — not
                recorded.
              </p>
            )}
            <div className="modes">
              {MODES.map((mode) => {
                const saved = official ? loadDaily(mode, dateKey) : undefined
                const done = saved?.questions.every((q) => q.done)
                const started = saved?.questions.some((q) => q.done)
                const streak = liveStreak(loadStats(mode), dateKey)
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
                      onClick={() => setView({ screen: 'daily', mode })}
                    >
                      {done
                        ? `Daily done · ${totalPoints(saved!.questions)}`
                        : started
                          ? 'Continue daily'
                          : 'Play daily'}
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
                  onClick={() => setView({ screen: 'board', mode: 'mixed' })}
                >
                  🏆 Leaderboards
                </button>
              )}
              <button type="button" onClick={() => setSearchOpen(true)}>
                🔎 Is he in the game?
              </button>
            </div>
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
                <li>Hint 1 shows his name (75). Hint 2 his conference (50).</li>
                <li>Hint 3 is four colleges to pick from (25).</li>
                <li>
                  A wrong typed guess uses up a hint. “I don’t know” ends it for
                  0.
                </li>
                <li>Transfers count: any college he played for is right.</li>
              </ul>
            </details>
          </>
        )}

        {ready && view.screen === 'daily' && (
          <DailyGame
            key={`${view.mode}:${dateKey}`}
            players={players}
            schools={schools}
            mode={view.mode}
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
            dateKey={dateKey}
            token={identity.token}
            refreshKey={identity.name.length}
            onModeChange={(mode) => setView({ screen: 'board', mode })}
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
              view.screen === 'home' ? 'home' : `${view.screen} ${view.mode}`,
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
