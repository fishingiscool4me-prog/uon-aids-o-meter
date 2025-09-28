import React, { useMemo, useState, useEffect } from 'react'
import Gauge from './components/Gauge.jsx'
import DisclaimerModal from './components/DisclaimerModal.jsx'
import { DEGREES, prefixesForDegree } from './data/degrees.js'

const FN_URL = '/.netlify/functions/votes'

function uniqPrefixes(list){
  const set = new Set(list.map(c => c.code.match(/^[A-Z]+/)[0]))
  return Array.from(set).sort()
}

function byPrefix(list, pref){
  return list.filter(c => c.code.startsWith(pref))
}

export default function App(){
  const [accepted, setAccepted] = useState(() => localStorage.getItem('terms:v1') === 'ok')
  const [degree, setDegree] = useState(null)
  const [prefix, setPrefix] = useState(null)
  const [selected, setSelected] = useState(null)
  const [avg, setAvg] = useState(null)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [vote, setVote] = useState(50)
  const [msg, setMsg] = useState(null)

  const degreeList = useMemo(() => degree ? (DEGREES[degree] || []) : [], [degree])
  const prefixes = useMemo(() => degree ? prefixesForDegree(degree) : [], [degree])
  const courses = useMemo(() => {
    if(!degree) return []
    if(!prefix) return degreeList
    return degreeList.filter(c => c.code.startsWith(prefix))
  }, [degree, prefix, degreeList])

// fetch current avg when selection changes
useEffect(() => {
  let ignore = false
  async function fetchAvg(){
    if(!degree || !selected?.code) return
    setLoading(true); setMsg(null)

    try{
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ degree, code: selected.code }) // POST read
      })
      const data = await res.json()
      if(!ignore){
        setAvg(data.avg)
        setCount(data.count || 0)
      }
    }catch(e){
      if(!ignore) setMsg('Could not load score.')
    }finally{
      if(!ignore) setLoading(false)
    }
  }
  fetchAvg()
  return () => { ignore = true }
}, [degree, selected])


  function accept(){
    localStorage.setItem('terms:v1','ok')
    setAccepted(true)
  }
  function decline(){
    localStorage.removeItem('terms:v1')
    setAccepted(false)
    document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;color:white;font-family:Inter,sans-serif;"><div class="card" style="padding:24px;border-radius:14px;text-align:center;background:#0e1530;border:1px solid rgba(255,255,255,0.12)"><h2>Access declined</h2><p>Totally fair. You can close this tab any time.</p></div></div>'
  }

  const votedKey = useMemo(() => (degree && selected?.code) ? `voted:${degree}:${selected.code}` : null, [degree, selected])
  const alreadyVoted = votedKey ? !!localStorage.getItem(votedKey) : false

  async function submitVote(){
    if(!degree || !selected?.code) return   // ✅ guard
    setLoading(true); setMsg(null)

    console.log("Submitting vote:", { degree, code: selected.code, score: vote }) // ✅ debug log

    try{
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({ degree, code: selected.code, score: Number(vote) })
      })
      const data = await res.json()
      if(!res.ok){
        setMsg(data?.error || 'Vote failed.')
      }else{
        setAvg(data.avg)
        setCount(data.count)
        localStorage.setItem(votedKey, String(Date.now()))
        setMsg('Thanks for voting!')
      }
    }catch(e){
      setMsg('Vote failed.')
    }finally{
      setLoading(false)
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
          <h3 style={{marginTop:0}}>1) Choose your degree</h3>
          <div className="degree-grid">
            {Object.keys(DEGREES).map(name => (
              <div
                key={name}
                className={"degree " + (degree===name ? "active" : "")}
                onClick={() => { setDegree(name); setPrefix(null); setSelected(null); setAvg(null); setCount(0); setMsg(null); }}
              >
                <div style={{fontWeight:800, fontSize:18}}>{name}</div>
                <small style={{color:'var(--muted)'}}>{DEGREES[name].length} courses</small>
              </div>
            ))}
          </div>

          {degree && (
            <>
              <h3>2) Filter by course code prefix</h3>
              <div className="tabs">
                <div className={"tab " + (!prefix ? "active" : "")} onClick={() => setPrefix(null)}>All</div>
                {prefixes.map(p => (
                  <div key={p} className={"tab " + (prefix===p ? "active" : "")} onClick={() => setPrefix(p)}>{p}</div>
                ))}
              </div>

              <h3 style={{marginBottom:8}}>3) Pick a course</h3>
              <div className="course-list">
                {courses.map(c => (
                  <div
                    key={c.code}
                    className="course"
                    onClick={() => setSelected(c)}
                  >
                    <div style={{display:'grid'}}>
                      <div style={{fontWeight:700}}>{c.code}</div>
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
            <h3 style={{marginTop:0}}>Aids-O-Meter</h3>
            {!selected && <p>Pick a course to see the fun little meter. 🎯</p>}
            {selected && (
              <>
                <div className="meta">
                  <div className="tag">{degree}</div>
                  <div className="tag">{selected.code}</div>
                  <span style={{flex:1}}></span>
                  <small>{count} vote{count===1?"":"s"}</small>
                </div>
                <Gauge value={avg ?? 0} />

                {loading && <small style={{color:'var(--muted)'}}>Loading…</small>}
                {avg === null && <p>No score yet. Be the first to vote!</p>}

                <div className="card" style={{padding:12}}>
                  <div style={{display:'grid', gap:8}}>
                    <label htmlFor="vote"><b>Your vote: {vote}</b> (0 best → 100 worst)</label>
                    <input id="vote" className="slider" type="range" min="0" max="100" step="1" value={vote} onChange={e => setVote(Number(e.target.value))} />
                    <div style={{display:'flex', gap:8}}>
                      <button className="btn" onClick={submitVote} disabled={loading}>{alreadyVoted ? "Update vote" : "Submit vote"}</button>
                      <button className="btn secondary" onClick={() => setVote(50)} disabled={loading}>Reset</button>
                    </div>
                    <small className="muted">Anti-spam: one vote per course per device + IP window.</small>
                    {msg && <small style={{color:'#c7f'}}>{msg}</small>}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="panel card">
            <h3 style={{marginTop:0}}>About</h3>
            <p>
              Built with React + Netlify Functions. Data is anonymous and stored as totals only (sum + count).
            </p>
            <p><small>Open-source on GitHub.</small></p>
          </div>
        </div>
      </div>
    </div>
  )
}
