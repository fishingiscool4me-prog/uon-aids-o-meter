// src/App.jsx
import React, { useMemo, useState, useEffect, useRef } from 'react'
import Gauge from './components/Gauge.jsx'
import DisclaimerModal from './components/DisclaimerModal.jsx'
import { DEGREES, prefixesForDegree } from './data/degrees.js'

const FN_URL = '/.netlify/functions/votes'

// stable per-browser id to prevent double-count from "Update vote"
function getClientId() {
  try {
    let id = localStorage.getItem('client:id')
    if (!id) {
      id =
        (window?.crypto?.randomUUID?.() ||
         (Math.random().toString(36).slice(2) + Date.now().toString(36)))
      localStorage.setItem('client:id', id)
    }
    return id
  } catch {
    // fallback if storage not available
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}
const CLIENT_ID = getClientId()

export default function App(){
  // Always show disclaimer on fresh load (no persistence)
  const [accepted, setAccepted] = useState(false)

  const [degree, setDegree] = useState(null)
  const [prefix, setPrefix] = useState(null)
  const [selected, setSelected] = useState(null)
  const [avg, setAvg] = useState(null)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [vote, setVote] = useState(50)
  const [msg, setMsg] = useState(null)

  const [cooldown, setCooldown] = useState(0)          // seconds remaining until next allowed update
  const [serverCooldown, setServerCooldown] = useState(60) // discovered from server (fallback 60s)
  const inFlight = useRef(false)                       // instant, synchronous click lock

  // Discover server-configured cooldown once (optional, improves label accuracy)
  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const r = await fetch(`${FN_URL}?diag=1`)
        const d = await r.json().catch(() => ({}))
        if (!ignore) {
          const s = Number(d?.cooldown_s)
          if (Number.isFinite(s) && s >= 0) setServerCooldown(s)
        }
      } catch {}
    })()
    return () => { ignore = true }
  }, [])

  const degreeList = useMemo(() => (degree ? (DEGREES[degree] || []) : []), [degree])
  const prefixes = useMemo(() => (degree ? prefixesForDegree(degree) : []), [degree])
  const courses = useMemo(() => {
    if (!degree) return []
    if (!prefix) return degreeList
    return degreeList.filter(c => c.code.startsWith(prefix))
  }, [degree, prefix, degreeList])

  // Fetch current avg when selection changes (POST read => robust)
  useEffect(() => {
    let ignore = false
    async function fetchAvg() {
      if (!selected?.code) return
      setLoading(true); setMsg(null)
      try {
        const res = await fetch(FN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // server reads by code; degree included only for one-time legacy merge
          body: JSON.stringify({ degree, code: selected.code })
        })
        const data = await res.json().catch(() => ({}))
        if (!ignore) {
          if (!res.ok) {
            setMsg(data?.error || 'Could not load score.')
          } else {
            setAvg(data.avg)
            setCount(data.count || 0)
          }
        }
      } catch {
        if (!ignore) setMsg('Could not load score.')
      } finally {
        if (!ignore) setLoading(false)
      }
    }
    fetchAvg()
    return () => { ignore = true }
  }, [degree, selected])

  // cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown(s => (s > 1 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  // clear UI hints when switching course
  useEffect(() => { setCooldown(0); setMsg(null) }, [selected?.code])

  // Disclaimer actions (no persistence so it shows every new visit)
  function accept() {
    setAccepted(true)
  }
  function decline() {
    setAccepted(false)
    document.body.innerHTML =
      '<div style="display:grid;place-items:center;height:100vh;color:white;font-family:Inter,sans-serif;">' +
      '<div class="card" style="padding:24px;border-radius:14px;text-align:center;background:#0e1530;border:1px solid rgba(255,255,255,0.12)">' +
      '<h2>Access declined</h2><p>Totally fair. You can close this tab any time.</p></div></div>'
  }

  // one vote per course code per device (local UI hint only; server enforces with clientId)
  const votedKey = useMemo(
    () => (selected?.code ? `voted:${selected.code}` : null),
    [selected]
  )
  const alreadyVoted = votedKey ? !!localStorage.getItem(votedKey) : false

  async function submitVote() {
    if (!selected?.code) return
    if (cooldown > 0) return          // client-side throttle (server also enforces)
    if (inFlight.current) return       // instant lock against double-click burst
    inFlight.current = true            // lock immediately (synchronous)
    const wasVoted = alreadyVoted

    setLoading(true); setMsg(null)
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          degree,                 // optional; legacy merge only
          code: selected.code,    // single source of truth
          score: Number(vote),
          clientId: CLIENT_ID     // prevents “update” from adding extra count
        })
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 429 && Number(data?.retry_after_s)) {
          // server returned safe avg/count; keep UI in sync
          if (typeof data.avg !== 'undefined') setAvg(data.avg)
          if (typeof data.count !== 'undefined') setCount(data.count)
          setCooldown(Number(data.retry_after_s))
          setMsg(`Too fast — try again in ${Number(data.retry_after_s)}s.`)
        } else {
          setMsg(data?.error || 'Vote failed.')
        }
        return
      }

      setAvg(data.avg)
      setCount(data.count)
      if (votedKey) localStorage.setItem(votedKey, String(Date.now()))
      setMsg(wasVoted ? 'Updated your vote!' : 'Thanks for voting!')

      // start cooldown immediately after a successful vote
      const s = Number(data?.cooldown_s)
      setCooldown(Number.isFinite(s) && s >= 0 ? s : serverCooldown)
    } catch {
      setMsg('Vote failed.')
    } finally {
      setLoading(false)
      inFlight.current = false        // release lock after response
    }
  }

  return (
    <div className="container">
      <DisclaimerModal open={!accepted} onAccept={accept} onDecline={decline} />
      <div className="header">
        <div className="logo">🔥</div>
        <div className="h1">UON Aids-O-Meter</div>
      </div>

      <div className="row">
        <div className="panel card">
          <h3 style={{ marginTop: 0 }}>1) Choose your degree</h3>
          <div className="degree-grid">
            {Object.keys(DEGREES).map(name => (
              <div
                key={name}
                className={'degree ' + (degree === name ? 'active' : '')}
                onClick={() => { setDegree(name); setPrefix(null); setSelected(null); setAvg(null); setCount(0); setMsg(null) }}
              >
                <div style={{ fontWeight: 800, fontSize: 18 }}>{name}</div>
                <small style={{ color: 'var(--muted)' }}>{DEGREES[name].length} courses</small>
              </div>
            ))}
          </div>

          {degree && (
            <>
              <h3>2) Filter by course code prefix</h3>
              <div className="tabs">
                <div className={'tab ' + (!prefix ? 'active' : '')} onClick={() => setPrefix(null)}>All</div>
                {prefixes.map(p => (
                  <div key={p} className={'tab ' + (prefix === p ? 'active' : '')} onClick={() => setPrefix(p)}>{p}</div>
                ))}
              </div>

              <h3 style={{ marginBottom: 8 }}>3) Pick a course</h3>
              <div className="course-list">
                {courses.map(c => (
                  <div key={c.code} className="course" onClick={() => setSelected(c)}>
                    <div style={{ display: 'grid' }}>
                      <div style={{ fontWeight: 700 }}>{c.code}</div>
                      <small>{c.name}</small>
                    </div>
                    <small>View</small>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="right">
          <div className="panel card">
            <h3 style={{ marginTop: 0 }}>Aids-O-Meter</h3>
            {!selected && <p>Pick a course to see the fun little meter. 🎯</p>}
            {selected && (
              <>
                <div className="meta">
                  <div className="tag">{degree || 'Course'}</div>
                  <div className="tag">{selected.code}</div>
                  <span style={{ flex: 1 }} />
                  <small>{count} vote{count === 1 ? '' : 's'}</small>
                </div>

                <Gauge value={avg ?? 0} />
                {loading && <small style={{ color: 'var(--muted)' }}>Loading…</small>}
                {avg === null && <p>No score yet. Be the first to vote!</p>}

                <div className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <label htmlFor="vote"><b>Your vote: {vote}</b> (0 best → 100 worst)</label>
                    <input
                      id="vote"
                      className="slider"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={vote}
                      onChange={e => setVote(Number(e.target.value))}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn"
                        onClick={submitVote}
                        disabled={loading || cooldown > 0}
                      >
                        {cooldown > 0 ? `Wait ${cooldown}s` : (alreadyVoted ? 'Update vote' : 'Submit vote')}
                      </button>
                      <button className="btn secondary" onClick={() => setVote(50)} disabled={loading}>
                        Reset
                      </button>
                    </div>
                    <small className="muted">
                      One vote per course per device (updates allowed, throttled).
                    </small>
                    {msg && <small style={{ color: '#c7f' }}>{msg}</small>}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="panel card">
            <h3 style={{ marginTop: 0 }}>About</h3>
            <p>Built with React + Netlify Functions. Data is anonymous and stored as totals only (sum + count).</p>
            <p><small>Open-source on GitHub.</small></p>
          </div>
        </div>
      </div>
    </div>
  )
}
